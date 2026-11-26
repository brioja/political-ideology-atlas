// Audit lane driver: runs Codex or Claude (Sonnet) headless, one subject per session, and integrates each finished
// audit itself, so tokens go to research only (Brandon, 2026-11-18: the Codex driver got through a lot with few tokens;
// the same for Sonnet). Several lanes can run at once in this checkout, e.g. one per engine or per kind.
//   node scripts/lane.js --engine codex|claude [--kind people|ideologies] [--lane <name>] [--until HH:MM] [--resumes 6] [--dry]
//                        [--subjects id,id --gap-exception "<why> (<maintainer>, <date>)"]
// --subjects audits only these, in this order, then stops (a test of a change); --gap-exception marks each pass it
// integrates as exempt from the re-audit gap (validate.js), for a maintainer-approved early pass.
// --lane defaults to the tmux window number when the driver runs in tmux (one tmux, one lane per window), else to
// <engine>-<kind> (Brandon, 2026-11-19 and 11-25); --until stops new subjects and resumes after that local time (default: run until
// the queue is empty or the driver is stopped; a stop mid-subject keeps the draft, which the next start carries on).
// Graceful stop: Ctrl-C or Ctrl-D in the driver's terminal, or `touch scratchpad/lane-out/<lane>/STOP` (or
// scratchpad/lane-out/STOP for all lanes), ends the run after the current subject, with the final signal step and push;
// the file needs no cleanup. A second Ctrl-C quits at once, stopping the session; its draft is kept for the next start.
// Children run in their own process groups, so the terminal's Ctrl-C reaches only the driver.
//
// Per subject:
//  1. Pick: the lane's own unfinished drafts first, then `next.js --lane`, passing over subjects other lanes have
//     claimed (scratchpad/lane-out/*/<id>.claim, checked and written under .claim.lock) and any audit with uncommitted changes. Greta Thunberg and Annie Besant were audited twice before this.
//  2. Audit, in phases; sessions end their turns at natural report points, so the loop lives here.
//     - A later pass starts from a draft the driver seeds from the committed audit, without Wikipedia citations
//       (seedLaterPass): answers resting on them alone are nulled and open.
//     - Ideologies only: a scope phase (SCOPE_START, until <id>.scope exists), checked with validate.js --stage scope
//       and sent back to fix (SCOPE_FIX). Sources it still can't tie to the ideology then leave the answers
//       (scripts/drop-source.js --none-fit), before any answer phase.
//     - Local: answers from local texts only (START for people, ANSWER in the scope session for ideologies), until
//       <id>.local exists, in a fresh session. Claude turns run with AUDIT_PHASE=local, so .claude/hooks/local-only.js
//       refuses the web. Then validate.js (all but the open statements): failing sources go by script
//       (scripts/cleanup.js dropFailing), the session fixes the rest (LOCAL_FIX), and a draft still invalid stops
//       there (<id>.invalid.json, no web phase).
//     - Web: scripts/phases.js strips the settled answers into <id>.web.json; a fresh session (WEB_START, resumed
//       with RESUME) answers the open ones there until the subject has its DONE.txt line; phases.js merges them back.
//  3. Integrate (under a lock shared by all lanes): validate (errors go back to the
//     session to fix), drop sources the audit never uses (scripts/cleanup.js), move the draft into audits/, merge an ideology's color, build, test, commit with no attribution
//     line. Pushes go out at most every PUSH_MINUTES across all lanes, and when a driver starts or stops.
// Between subjects: for people, prefetch-books.js and triage.js every
// BOOKS_EVERY people; for ideologies, statement-signal.js --apply once, when the lane stops (Brandon, 2026-11-20: it takes
// about 9 minutes inside the integrate lock, so running it every 5 ideologies slowed both lanes by about a fifth; since
// 2026-11-23 it takes about half a minute, refits in parallel), skipped when another lane's is already waiting or running.
// Log: scratchpad/lane-out/<lane>/driver.log, one line per step; integrated subjects in INTEGRATED.txt.
const { spawn, spawnSync, execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
// The window of the pane the driver runs in ($TMUX_PANE), not whichever window is active.
const tmuxWindow = () => {
  if (!process.env.TMUX || !process.env.TMUX_PANE) return null;
  const r = spawnSync("tmux", ["display-message", "-p", "-t", process.env.TMUX_PANE, "#I"], { encoding: "utf8" });
  return r.status === 0 && /^\d+$/.test(r.stdout.trim()) ? r.stdout.trim() : null;
};
// The model a pass ran on, recorded as its auditor by the driver (Brandon, 2026-11-26). Claude runs the latest Sonnet
// (the "sonnet" alias), and each session's output names the model it resolved to, kept here; Codex runs the model its
// config sets, read here and passed explicitly.
let MODEL = arg("--engine") === "codex"
  ? ((() => { try { return /^model\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(require("os").homedir(), ".codex", "config.toml"), "utf8"))[1]; } catch { return null; } })())
  : null;
const ENGINE = arg("--engine"), KIND = arg("--kind", "people"), LANE = arg("--lane") || tmuxWindow() || `${ENGINE}-${KIND}`, RESUMES = +arg("--resumes", 6);
const UNTIL = arg("--until"), DRY = process.argv.includes("--dry");
const SUBJECTS = arg("--subjects") ? arg("--subjects").split(",").filter(Boolean) : null, GAP_EXCEPTION = arg("--gap-exception");
if (GAP_EXCEPTION && GAP_EXCEPTION.trim().length < 10) { console.error("--gap-exception: say why, and who approved it"); process.exit(1); }
if (!["codex", "claude"].includes(ENGINE) || !["people", "ideologies"].includes(KIND) || (UNTIL && !/^\d\d:\d\d$/.test(UNTIL))) {
  console.error("usage: node scripts/lane.js --engine codex|claude [--kind people|ideologies] [--lane name] [--until HH:MM] [--resumes 6]");
  process.exit(1);
}
const PEOPLE = KIND === "people", PUSH_MINUTES = 60, BOOKS_EVERY = 5, FIX_ROUNDS = 3;
const deadline = UNTIL ? (() => { const d = new Date(); d.setHours(+UNTIL.slice(0, 2), +UNTIL.slice(3), 0, 0); return d.getTime(); })() : Infinity;
const timeLeft = () => Date.now() < deadline;
// Graceful stop: touch scratchpad/lane-out/<lane>/STOP (this lane) or scratchpad/lane-out/STOP (every lane). The
// driver finishes its current subject, runs the end-of-run steps and pushes. Only files touched after it started count.
const STARTED = Date.now();
let stopping = false, child = null;
const stopRequested = () => stopping || [path.join(OUT, "STOP"), path.join(LANES, "STOP")].some((f) => { try { return fs.statSync(f).mtimeMs >= STARTED; } catch { return false; } });
const LANES = path.join(ROOT, "scratchpad", "lane-out"), OUT = path.join(LANES, LANE);
const DONE = path.join(OUT, "DONE.txt"), LOG = path.join(OUT, "driver.log"), LOCK = path.join(LANES, ".integrate.lock"), CLAIM_LOCK = path.join(LANES, ".claim.lock");
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => { const l = `${new Date().toTimeString().slice(0, 8)} ${m}`; console.log(l); fs.appendFileSync(LOG, l + "\n"); };
const requestStop = (how) => { if (stopping) return; stopping = true; log(`stop requested (${how}): finishing the current subject; Ctrl-C again to quit now`); };
process.on("SIGINT", () => {
  if (!stopping) return requestStop("Ctrl-C");
  log("quit now; the current draft is kept for the next start");
  if (child) try { process.kill(-child.pid, "SIGTERM"); } catch {}
  process.exit(130);
});
if (process.stdin.isTTY) process.stdin.on("data", () => {}).on("end", () => requestStop("Ctrl-D"));
// A DONE line's subject is the last word before the first "|": agents copy INTEGRATED.txt's "<date> <line>" format and
// prefix the date (2026-11-19: undetected, every resume found its line and quit, and finished audits were dropped).
const lineId = (l) => l.split("|")[0].trim().split(/\s+/).pop();
const doneIds = () => new Set((fs.existsSync(DONE) ? fs.readFileSync(DONE, "utf8") : "").split("\n").map(lineId).filter(Boolean));
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, detached: true, ...opts });
// Sessions run async, so a Ctrl-C is handled at once rather than when the session ends.
const runAsync = (cmd, args, env = {}) => new Promise((resolve) => {
  let out = "", err = "";
  const c = child = spawn(cmd, args, { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
  c.stdout.setEncoding("utf8").on("data", (d) => { out += d; });
  c.stderr.setEncoding("utf8").on("data", (d) => { err += d; });
  c.on("error", (e) => { child = null; resolve({ status: 1, stdout: out, stderr: String(e) }); });
  c.on("close", (code) => { child = null; resolve({ status: code === null ? 1 : code, stdout: out, stderr: err }); });
});
const git = (...a) => run("git", a);
// Commits only these paths (git commit -- paths), so a file someone else staged can neither ride along nor fail the
// commit. Returns "" when committed or nothing changed, else why it failed (a hook's message). 2026-11-24: a people
// audit citing reference books whose filenames tripped the commit-msg hook stayed staged, and every later commit of
// both lanes failed with it, unchecked, for two hours (31 audits logged as integrated, none committed).
// Another git process's .git/index.lock (the maintainer committing in this checkout) is waited out for up to two
// minutes (2026-11-25: alt-lite's commit hit one and was left uncommitted).
function commit(message, paths) {
  const locked = (r) => r.status && /index\.lock/.test(r.stderr + r.stdout);
  const retry = (...a) => { let r; for (let i = 0; i < 24 && locked(r = git(...a)); i++) execFileSync("sleep", ["5"], { detached: true }); return r; };
  const add = retry("add", "--", ...paths);
  if (add.status) return `commit failed: ${(add.stderr || add.stdout).trim().split("\n").slice(0, 3).join(" / ")}`;
  if (!git("diff", "--cached", "--quiet", "HEAD", "--", ...paths).status) return "";
  const r = retry("commit", "-q", "-m", message, "--", ...paths);
  return r.status ? `commit failed: ${(r.stderr || r.stdout).trim().split("\n").slice(0, 3).join(" / ")}` : "";
}
const draft = (id) => path.join(OUT, `${id}.json`);
const phases = require("./phases");
const flag = PEOPLE ? "--people " : "";

// ---- picking ----
const tried = new Set(); // subjects this run already gave up on (not done after every resume)
const integrated = new Set(); // subjects this run integrated (--subjects)
function nextSubject() {
  const done = doneIds(), lib = require("./lib");
  if (SUBJECTS) return SUBJECTS.find((id) => !tried.has(id) && !integrated.has(id)) || null;
  const people = new Set(lib.peopleCatalog().map((p) => p.id));
  for (const f of fs.readdirSync(OUT)) {
    const id = f.endsWith(".claim") ? f.slice(0, -6) : null;
    if (id && !tried.has(id) && PEOPLE === people.has(id) && (!done.has(id) || fs.existsSync(draft(id)))) return id; // a done claim is still to integrate
  }
  const next = (skip) => {
    const a = [path.join(__dirname, "next.js"), `--${KIND}`, "--lane", ...(skip.length ? ["--skip", skip.join(",")] : [])];
    const j = JSON.parse(execFileSync("node", a, { cwd: ROOT, maxBuffer: 1 << 26, detached: true }).toString() || "null");
    return j && j.id;
  };
  const dirty = git("status", "--porcelain", "--", "audits/people", "audits/profiles").stdout
    .split("\n").map((l) => (l.slice(3).match(/([^/]+)\.json$/) || [])[1]).filter(Boolean);
  // next.js --lane passes over every lane's drafts and claims, but a people pick takes about a minute, and lanes
  // picking inside that window all chose the same subject (2026-11-24: Futurism taken by 5 lanes, Laozi by 3, Eva
  // Perón by 2 and committed twice). So the claim is checked and written under a lock, and a subject another lane
  // claimed meanwhile is skipped and the pick run again.
  const skip = [...dirty];
  for (;;) {
    const id = next(skip);
    if (!id) return null;
    const taken = locked(() => {
      const other = fs.readdirSync(LANES, { withFileTypes: true }).some((d) => d.isDirectory() && d.name !== LANE
        && [".claim", ".json"].some((x) => fs.existsSync(path.join(LANES, d.name, id + x))));
      if (!other && !DRY) fs.writeFileSync(path.join(OUT, `${id}.claim`), `${new Date().toISOString()}\n`);
      return other;
    }, CLAIM_LOCK);
    if (!taken) return id;
    log(`${id}: claimed by another lane during the pick; picking again`);
    skip.push(id);
  }
}

// ---- sessions ----
const COLOR = (id) => PEOPLE ? "" : ` If audits/ideology-colors.json has no entry for \`${id}\`, write one to scratchpad/lane-out/${LANE}/${id}.color.json following CONTRIBUTING.md "Ideology colors" (the format of that file's entries).`;
// A later pass with no draft yet starts from what the committed audit fails under today's rules (validate.js
// --as-current), so the session knows which answers and sources to fix before it researches (Brandon, 2026-11-21:
// "run validate at the start of an audit"; it learned them only when validating its finished draft).
// A later pass starts from a draft the driver seeds from the committed audit, without its Wikipedia citations
// (scripts/phases.js dropWikipedia; Brandon, 2026-11-26), notes, scope or reasons for its nulls. The session is handed the problems validate.js still finds
// under today's rules, once, in its first prompt.
const laterNotes = new Map();
function seedLaterPass(id) {
  const committed = PEOPLE ? require("./lib").personPath(id) : require("./lib").profilePath(id);
  if (fs.existsSync(draft(id)) || !fs.existsSync(committed)) return;
  const a = JSON.parse(fs.readFileSync(committed, "utf8")), w = phases.dropWikipedia(a);
  // The pass's own fields are the driver's, not the session's (Brandon, 2026-11-26: the first seeded pass, of
  // Anarcha-feminism, was carried on as earlier work and kept its old date, no "rules" and no "passes"): today's
  // rules, so every check judges the draft by them; today's date; the earlier passes listed (an audit with one pass
  // lists it from its "auditor" and "auditedAt"). Today's entry and the model in "auditor" go in once a session has run
  // (exceptGap), when the model is known.
  const today = new Date().toISOString().slice(0, 10);
  if (!Array.isArray(a.passes) || !a.passes.length) a.passes = [{ auditor: [].concat(a.auditor || [])[0], auditedAt: a.auditedAt }];
  a.rules = require("./validate").CURRENT_RULES;
  a.auditedAt = today;
  // The earlier pass's notes go (Brandon, 2026-11-26): Political moderate's web phase read "a positional and
  // methodological label, so most substantive policy answers are low-confidence" from them first, took it as settled
  // and searched nothing. Each pass writes its own. So does the scope (Brandon, 2026-11-26): its rerun carried the
  // October scope's "many answers are low-confidence" into the new one, and both answer phases took it as leave to
  // search nothing; the scope phase writes it afresh from the defining sources.
  delete a.notes;
  delete a.scope;
  // A null carries no reason (Brandon, 2026-11-26; validate.js): one written before that rule goes here.
  for (const [sid, ans] of Object.entries(a.answers || {})) if (!ans || ans.value === null || ans.value === undefined) a.answers[sid] = { value: null, sources: [], rationale: "" };
  fs.writeFileSync(draft(id), require("./lib").formatAudit(a));
  log(`${id}: later pass seeded from the committed audit; Wikipedia citations dropped: ${w.nulled} answer(s) nulled, ${w.kept} kept on other sources, ${w.requests} missing statement(s) dropped`);
  const r = run("node", ["scripts/validate.js", ...(PEOPLE ? ["--people"] : []), "--as-current", "--dir", path.relative(ROOT, OUT), id]);
  // Only errors and warnings: an "excluded:" line (not ideas of what society should be) is a
  // finished result, not a problem, and handing it over as one had sessions overturn the record (2026-11-24, Extremism).
  const lines = (r.stdout + r.stderr).split("\n").filter((l) => /^\s+(error|warning):/.test(l)).map((l) => `- ${l.trim()}`);
  if (lines.length) log(`${id}: later pass starts with ${lines.length} problem(s) from validate.js --as-current`);
  const fields = ` The driver sets "rules", "auditedAt", "auditor" and "passes" for this pass; leave them to it.`;
  const nulled = fields + (w.nulled ? ` The driver started the draft from the committed audit without its scope (write it afresh from the defining sources) and took out its Wikipedia citations (a tertiary source): ${w.nulled} answer(s) that rested on them alone are null now and open like any other.` : " The driver started the draft from the committed audit without its scope (write it afresh from the defining sources).");
  laterNotes.set(id, `\n\nThis is a later pass.${nulled}${lines.length ? ` Checked under today's rules (\`node scripts/validate.js ${flag}--as-current --dir scratchpad/lane-out/${LANE} ${id}\`), the draft has these problems; fix each:\n${lines.join("\n")}` : ""}`);
}
function laterPassProblems(id) {
  const note = laterNotes.get(id) || "";
  laterNotes.delete(id);
  return note;
}
// An eponymous ideology (audits/namesakes.json: Leninism, Stalinism, Trumpism) is handed the maintainer's reference
// books by its namesake and about them (biographies, named "<title> (about <Person>, by <author>).txt"): a biography
// counts for the ideology as scholarship defining it, though never as the person's own book (Brandon, 2026-11-21).
function namesakeBooks(id) {
  if (PEOPLE) return "";
  let person;
  try { person = JSON.parse(fs.readFileSync(path.join(ROOT, "audits", "namesakes.json"), "utf8")).namesakes[id]; } catch { return ""; }
  if (!person) return "";
  const { nameMatcher, CORPORA } = require("./prefetch-books");
  const dir = path.join(CORPORA, "reference", "text");
  if (!fs.existsSync(dir)) return "";
  const entry = require("./lib").peopleCatalog().find((p) => p.name === person) || { name: person };
  const by = nameMatcher(entry), about = nameMatcher({ name: person, wikipedia: entry.wikipedia });
  const files = fs.readdirSync(dir).filter((f) => by(f.split(" - ")[0]) || (/\(about [^)]*\bby\b/i.test(f) && about(f.replace(/^.*\(about ([^,)]*).*$/, "$1 - x"))));
  if (!files.length) return "";
  log(`${id}: ${files.length} reference book(s) by or about ${person}`);
  return `\n\nThe maintainer's reference library (~/.cache/political-ideology-atlas/corpora/reference/text/) holds these books by or about ${person}, whom \`${id}\` is named after. Search each for the statements' topics: the namesake's own books are primary sources, and books about them (biographies) are scholarship defining the ideology (audits/AUDIT_RULES.md on supplied texts):\n${files.map((f) => `- ${f}`).join("\n")}`;
}
// Books on the ideology (scripts/ideology-books.js, Brandon 2026-11-25): before the pass, the books its Wikipedia
// article lists (further reading, bibliography, notable works), the committed audit's key works and key figures' own
// books, and archive.org books named after it, wherever archive.org has the full text open; after the scope phase,
// again with the draft's key works and key figures. Re-audits had nulled what no defining source tied without opening
// the scholarship that would tie it (Libertarian socialism, Monarchism).
function fetchBooks(id, draftFile) {
  if (PEOPLE) return null;
  const r = run("node", ["scripts/ideology-books.js", id, ...(draftFile ? ["--draft", draftFile] : [])], { timeout: 30 * 60000 });
  log(`${id}: books${draftFile ? " (key figures and works from the scope phase)" : ""}: ${r.status ? `failed: ${failure(r.stdout + r.stderr)}` : r.stdout.trim().split("\n").pop()}`);
  try { return JSON.parse(fs.readFileSync(path.join(require("./ideology-books").DIR, id, "index.json"), "utf8")); } catch { return null; }
}
const BOOKS_NOTE = (dir) => `They were found by title, not read: open each, and whether it is the subject's own text or scholarship defining it (audits/AUDIT_RULES.md) is your call, as for any source. Search each for the statements' topics (\`grep -i -n\` in ${dir}/, in the book's language), cite it by its archive.org page (the url given), and name the chapter or page in each rationale that rests on it. Books listed under its "lending" and "missing" in index.json are leads you may look for elsewhere.`;
function bookList(books, id, intro) {
  if (!books || !books.length) return "";
  const dir = `~/.cache/political-ideology-atlas/corpora/ideology-books/${id}`;
  return `\n\n${intro} (full text, local, in ${dir}/):\n${books.map((b) => `- ${b.file} (${b.url}; ${b.from})`).join("\n")}\n${BOOKS_NOTE(dir)}`;
}
const booksAtStart = (id) => bookList(startBooks.get(id), id, `Books on \`${id}\` are downloaded for this pass`);
const startBooks = new Map();
// An ideology's other names (the Wikipedia redirects to its article) go in the first message, so the session searches
// under them from the start instead of finding them late (Brandon, 2026-11-23). The coatrack check already accepts
// them as aliases.
function otherNames(id) {
  if (PEOPLE) return "";
  const names = require("./lib").wikipediaOtherNames(id);
  if (!names.length) return "";
  return ` Wikipedia redirects these names to the subject's article: ${names.map((n) => `"${n}"`).join(", ")}. Search under them from the start, not only the subject's own name: a source naming the subject by one of them counts as naming it (the coatrack check takes them as aliases, unless another ideology claims the name).`;
}
// The answers come in two phases (Brandon, 2026-11-26): local texts only, then a fresh session on the web for what is
// still open (scripts/phases.js strips the settled answers and merges the web phase's back). The local phase's Claude
// turns run with AUDIT_PHASE=local, which .claude/hooks/local-only.js reads to refuse web searches and fetches.
const LOCAL_ENV = { AUDIT_PHASE: "local" };
// The web phase's turns run with AUDIT_PHASE=web, and .claude/hooks/web-only.js refuses reading local texts (the corpora,
// marxists.org and Gutenberg included, the library, downloaded books, the source library's files, the local draft): the
// local phase read them, and Political moderate's web phase re-read them instead of searching (Brandon, 2026-11-26).
const webEnv = (id) => ({ AUDIT_PHASE: "web", AUDIT_SUBJECT: id });
const localMark = (id) => path.join(OUT, `${id}.local`), webDraft = (id) => path.join(OUT, `${id}.web.json`);
// 2026-11-26: the first wording ("answer from local texts only; what they don't settle stays null") had later passes
// null every answer an earlier pass took from the web (Anarcha-feminism 158 known answers to 38).
const LOCAL_RULE = (id) => `This is the local phase of the answers. Every answer the draft already has (from an earlier pass, whatever its sources) stays as it is: change one only on evidence from a local text (audits/AUDIT_RULES.md section 4), and never null one because local texts are silent on it. Answer the open statements from local texts only, that is the local corpora (~/.cache/political-ideology-atlas/corpora/, listed in its README.md), the maintainer's reference library, Gutenberg books (\`node scripts/gutenberg.js\`), marxists.org (the corpus's \`tools/marxists.js\`; \`--fetch "<URL>"\` adds a page it lacks, so search the archive here: the web phase can't read it) and books already downloaded for this audit (scratchpad/sources/${id}/${PEOPLE ? "" : `, ~/.cache/political-ideology-atlas/corpora/ideology-books/${id}/`}). No web searches and no page fetches (scripts/get.js, wiki.js, yt.js)${ENGINE === "claude" ? "; a hook refuses them" : ""}. An open statement the local texts don't settle stays null for now: a web phase follows in a fresh session and searches the web for every open statement${PEOPLE ? ", and for a record (acts) on each statement you answer from the person's words" : ""}. Save the draft after every statement you answer.${PEOPLE ? "" : " If a text gives another name for the ideology that \"aliases\" lacks, add it with its reason and evidence (audits/PROMPT.md, Aliases)."}${COLOR(id)} When you have gone through every statement, create the empty file scratchpad/lane-out/${LANE}/${id}.local and end your turn; don't validate yet (the driver validates the draft when you're done and sends back what to fix).`;
const START = (id) => `Follow audits/PROMPT_LANE.md as lane \`${LANE}\`. Your subject is \`${id}\`. Audit it into scratchpad/lane-out/${LANE}/${id}.json; if that draft exists, carry on from it. ${LOCAL_RULE(id)}${otherNames(id)}${namesakeBooks(id)}${booksAtStart(id)}${laterPassProblems(id)}${GAP_NOTE}`;
const WEB_START = (id, n) => `Follow audits/PROMPT_LANE.md as lane \`${LANE}\`. Your subject is \`${id}\`. This is the web phase of its audit: earlier phases answered what local texts (the corpora, the maintainer's library, downloaded books) settle, and they have been searched. scratchpad/lane-out/${LANE}/${id}.web.json is the audit with only the ${n} statement(s) still open in its "answers"; if it has been worked on already, carry on from it. Search the web for each (web search, \`node scripts/get.js\`, scripts/wiki.js, scripts/yt.js) and answer it in that file, saving after every statement. Local texts are closed in this phase (the corpora, marxists.org, Gutenberg, the maintainer's library, downloaded books, the files in scratchpad/sources/): read a page, new or already saved, with \`node scripts/get.js ${id} <url> --grep "<keyword>"\` (or --print). A marxists.org page or Project Gutenberg book the local corpus lacks is added to it with \`node ~/.cache/political-ideology-atlas/corpora/tools/marxists.js --fetch-if-not-local "<URL>" "<keyword>"\` or \`node scripts/gutenberg.js <book id> --fetch-if-not-local --grep "<keyword>"\` (find ids with \`node scripts/gutenberg.js --search "<words>"\`); both refuse what the corpus already has.${PEOPLE ? " An open statement that has an answer rests on the person's words only: look for their record (acts) on it, and replace the answer only with one from that record (record over words, audits/AUDIT_RULES.md); with no record, leave it as it is." : ""} Add no answer for any other statement (they are settled, and the driver ignores them), and number new sources on from the existing ones.${PEOPLE ? "" : " If a text gives another name for the ideology that \"aliases\" lacks, add it with its reason and evidence (audits/PROMPT.md, Aliases)."} Don't run validate.js on this file (it lacks the settled answers): the driver merges it into the audit and validates that. When every open statement has an answer, add one line to scratchpad/lane-out/${LANE}/DONE.txt: \`${id}\`.${otherNames(id)}`;
const GAP_NOTE = GAP_EXCEPTION ? `\n\nThis pass is exempt from the re-audit gap (the maintainer approved it early): the driver adds "gapException" to its entry in "passes". Date the entry today as usual and leave that field to the driver.` : "";
// An ideology's audit runs in two phases (Brandon, 2026-11-23): first what PROMPT.md section 2 settles (scope, sources,
// aliases, key figures, key works), which the driver checks with validate.js --stage scope and sends back to fix, then
// the answers. Assadism had listed Hafez but not Bashar al-Assad as a key figure, which left Bashar's speeches untied;
// the final validate found it only after the answers were done, and a warning there sent nothing back. The session
// marks the first phase done by creating <id>.scope; a draft alone can't say so, since a later pass starts as a copy
// of the committed audit.
const scopeMark = (id) => path.join(OUT, `${id}.scope`);
const SCOPE_START = (id) => `Follow audits/PROMPT_LANE.md as lane \`${LANE}\`. Your subject is \`${id}\`. This first phase covers audits/PROMPT.md sections 1 and 2 only: find the defining sources and write scratchpad/lane-out/${LANE}/${id}.json with its scope, sources, aliases, key figures and key works (if that draft exists, carry on from it; a later pass keeps the committed answers as they are for now). Don't answer statements yet. When those parts are in the draft, create the empty file scratchpad/lane-out/${LANE}/${id}.scope and end your turn; the driver checks them and then asks for the answers.${otherNames(id)}${namesakeBooks(id)}${booksAtStart(id)}${laterPassProblems(id)}${GAP_NOTE}`;
const SCOPE_FIX = (id, problems) => `\`node scripts/validate.js --dir scratchpad/lane-out/${LANE} --stage scope ${id}\` reports these problems with the scope, sources, aliases, key figures and key works of scratchpad/lane-out/${LANE}/${id}.json:\n${problems}\nFix each error, and act on each warning (a person named in a key figure's quote: list them if the defining sources present the ideology as their thought or political legacy). Check again with that command, and end your turn.`;
const ANSWER = (id, added = "") => `The scope, sources, aliases, key figures and key works of \`${id}\` are checked.${added} Now answer the statements in scratchpad/lane-out/${LANE}/${id}.json. ${LOCAL_RULE(id)}`;
// validate.js --stage scope's errors and warnings for the draft, as "- " lines ("" when clean).
function scopeProblems(id) {
  exceptGap(id); // the gap check is part of the scope stage, so the maintainer's exception goes in first
  const r = run("node", ["scripts/validate.js", "--dir", path.relative(ROOT, OUT), "--stage", "scope", id]);
  return (r.stdout + r.stderr).split("\n").filter((l) => /^\s+(error|warning):/.test(l)).map((l) => `- ${l.trim()}`).join("\n");
}
const RESUME = (id) => `Go on with \`${id}\` where you left off, through to its line in scratchpad/lane-out/${LANE}/DONE.txt.`;
const RESUME_LOCAL = (id) => `Go on with the local phase of \`${id}\` where you left off (local texts only), through to creating scratchpad/lane-out/${LANE}/${id}.local.`;
// The sources validate.js fails, out of the answers (scripts/cleanup.js dropFailing): logged, and returned as a note
// for the next session.
function dropFailing(id, when) {
  try {
    const f = require("./cleanup").dropFailing(OUT, id, PEOPLE), w = f.wikipedia.kept + f.wikipedia.nulled;
    if (!f.untied.length && !w) return "";
    log(`${id}: ${when}, the driver took out of the answers${f.untied.length ? ` untied source(s) ${f.untied.join(", ")}` : ""}${w ? `${f.untied.length ? " and" : ""} Wikipedia citations (${f.wikipedia.nulled} answer(s) nulled)` : ""}`);
    return `\n\nThe driver took out of the answers ${[f.untied.length ? `${f.untied.join(", ")} (no tie to the subject was found; scripts/drop-source.js)` : "", w ? "Wikipedia citations (a tertiary source)" : ""].filter(Boolean).join(" and ")}. Answers that rested on them alone are null and open; rewrite any rationale that still repeats their claims from the sources the answer still cites.`;
  } catch (e) { log(`${id}: ${when}, dropping failing sources failed: ${e.message.split("\n")[0]}`); return ""; }
}
// Between phases the fixes that need no judgment are made (scripts/cleanup.js tidy; Brandon, 2026-11-26): nulls lose
// their reasons and sources, so the next phase never reads one as settled. Unused sources stay until integration: the
// scope phase's defining sources aren't cited by answers yet.
function cleanBetween(id, when) {
  try {
    const lib = require("./lib"), a = JSON.parse(fs.readFileSync(draft(id), "utf8"));
    const c = require("./cleanup"), tidied = c.describe(c.tidy(a, PEOPLE));
    if (tidied) { fs.writeFileSync(draft(id), lib.formatAudit(a)); log(`${id}: ${when}, cleanup: ${tidied}`); }
  } catch (e) { log(`${id}: ${when}, cleanup failed: ${e.message.split("\n")[0]}`); }
}
// The check after the local phase (Brandon, 2026-11-26): full validate.js but for the statements still without an
// answer, which the web phase takes; fixed in the local phase's session, still local-only.
const LOCAL_FIX = (id, errors) => `Follow audits/PROMPT_LANE.md as lane \`${LANE}\`; your subject is \`${id}\`. This is still the local phase (local texts only; no web searches or page fetches). validate.js reports these errors in scratchpad/lane-out/${LANE}/${id}.json:\n${errors}\nFix them, validate again with \`node scripts/validate.js ${flag}--dir scratchpad/lane-out/${LANE} ${id}\` (statements without an answer are left to the web phase that follows), and reply.`;
const localErrors = (id) => errorsIn(["--dir", path.relative(ROOT, OUT)], id).split("\n").filter((l) => l.trim() && !/no answer for '|statements? ha(s|ve) no answer yet/.test(l)).join("\n");
const FIX = (id, errors) => `validate.js reports these errors in scratchpad/lane-out/${LANE}/${id}.json:\n${errors}\nFix them, validate again with \`node scripts/validate.js ${flag}--dir scratchpad/lane-out/${LANE} ${id}\`, and reply.`;

// Why a child process failed, for the log: an uncaught error's message and where it was thrown, not the last lines of
// its stack trace (2026-11-22: six audits logged "tests failed: } /  / Node.js v24.14.0" for a test.js assertion);
// otherwise the output's last non-empty lines.
function failure(out, n = 3) {
  const lines = (out || "").split("\n").map((l) => l.trimEnd());
  const i = lines.findIndex((l) => /^([A-Z]\w*)?Error\b[^:]*: /.test(l));
  if (i > -1) {
    const at = lines.slice(i + 1).map((l) => /^\s+at .*?\(?([^\s()]+):(\d+):\d+\)?$/.exec(l)).find(Boolean);
    return lines[i] + (at ? ` (${path.relative(ROOT, at[1])}:${at[2]})` : "");
  }
  return lines.filter((l) => l.trim() && !/^Node\.js v\d/.test(l)).slice(-n).join(" / ");
}
// Runs one turn (new session, or resume of `thread`); returns the session id.
async function session(prompt, thread, env = {}) {
  let r, id = thread;
  if (ENGINE === "codex") {
    const common = ["--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", ...(MODEL ? ["-m", MODEL] : [])];
    r = await runAsync("codex", thread ? ["exec", "resume", ...common, thread, prompt] : ["exec", ...common, "-C", ROOT, prompt], env);
    for (const line of (r.stdout || "").split("\n")) { try { const e = JSON.parse(line); if (e.type === "thread.started") id = e.thread_id; } catch {} }
  } else {
    r = await runAsync("claude", ["-p", prompt, "--model", "sonnet", "--output-format", "json", "--dangerously-skip-permissions", ...(thread ? ["--resume", thread] : [])], env);
    try {
      const out = JSON.parse(r.stdout);
      id = out.session_id || id;
      MODEL = Object.keys(out.modelUsage || {}).find((m) => /sonnet/.test(m)) || MODEL;
    } catch {}
  }
  if (r.status) log(`${ENGINE} exited ${r.status}: ${failure(r.stderr, 1) || stdoutError(r.stdout)}`);
  return id;
}
// The error a session reported on stdout: `claude -p --output-format json` puts it in the result there, and stderr
// stays empty, so failures were logged as a bare "claude exited 1:" (2026-11-24); codex --json emits error events.
function stdoutError(out) {
  const errs = [];
  for (const l of (out || "").split("\n")) {
    try {
      const e = JSON.parse(l);
      if (e.is_error || e.subtype?.startsWith("error")) errs.push(e.result || (e.errors || []).join("; ") || e.subtype);
      else if (e.type === "error" || e.type === "turn.failed") errs.push(e.message || e.error?.message || JSON.stringify(e).slice(0, 300));
    } catch {}
  }
  return String(errs.pop() || failure(out, 1)).replace(/\s+/g, " ").slice(0, 300);
}

// A later pass's entry in "passes" (Brandon, 2026-11-26): a session that dates the draft today but doesn't list the pass
// (the phased run of 2026-11-26 left it out, so the re-audit gap counted from the pass before) gets it from the driver.
// Then --gap-exception: the newest entry gets the maintainer's exception (validate.js), unless it has one.
function exceptGap(id) {
  if (!fs.existsSync(draft(id))) return;
  try {
    const a = JSON.parse(fs.readFileSync(draft(id), "utf8")), today = new Date().toISOString().slice(0, 10);
    const passes = Array.isArray(a.passes) ? a.passes : null;
    let changed = false;
    if (passes && a.auditedAt === today && !passes.some((p) => p.auditedAt === today)) {
      const auditor = MODEL || [].concat(a.auditor || []).pop();
      if (auditor) {
        passes.push({ auditor, auditedAt: today });
        const auditors = [].concat(a.auditor || []);
        if (!auditors.includes(auditor)) { auditors.push(auditor); a.auditor = auditors.length === 1 ? auditors[0] : auditors; }
        changed = true; log(`${id}: driver added the ${today} pass by ${auditor} to "passes"`);
      }
    }
    const last = passes && [...passes].sort((x, y) => String(x.auditedAt).localeCompare(String(y.auditedAt))).pop();
    if (GAP_EXCEPTION && last && !last.gapException && last.auditedAt === today) {
      last.gapException = GAP_EXCEPTION; changed = true;
      log(`${id}: gap exception added to the ${last.auditedAt} pass`);
    }
    if (changed) fs.writeFileSync(draft(id), require("./lib").formatAudit(a));
  } catch (e) { log(`${id}: pass entry not checked (${e.message})`); }
}

// ---- integration ----
function locked(fn, lock = LOCK) {
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(lock); break; } catch {
      // A lock older than 30 minutes is left from a killed driver.
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 30 * 60000) { fs.rmdirSync(lock); continue; } } catch {}
      execFileSync("sleep", ["5"], { detached: true });
    }
  }
  try { return fn(); } finally { fs.rmdirSync(lock); }
}
// Validator errors, or "" when there are none: exit 0 (valid) or 2 (valid, excluded from the site
// as not ideas of what society should be).
function errorsIn(dirArgs, id) {
  const r = run("node", ["scripts/validate.js", ...(PEOPLE ? ["--people"] : []), ...dirArgs, id]);
  if (r.status === 0 || r.status === 2) return "";
  const out = r.stdout + r.stderr;
  return out.split("\n").filter((l) => /^\s*error:/.test(l)).join("\n") || out.trim();
}
// About one Pages deploy in seven fails (deploy-pages can't find the artifact it was just given, 2026-11-21..23), and
// each failure emails Brandon, so pushes are rare: every PUSH_MINUTES at most, timed across lanes by .last-push's
// mtime, plus one when a driver starts (commits a hard quit left unpushed) and one when it stops. Brandon, 2026-11-23.
// Unpushed = any local commit not on origin/main, whichever lane made it.
const LAST_PUSH = path.join(LANES, ".last-push");
const sinceLastPush = () => { try { return Date.now() - fs.statSync(LAST_PUSH).mtimeMs; } catch { return Infinity; } };
const unpushed = () => git("rev-list", "--count", "origin/main..HEAD").stdout.trim() !== "0";
function push(force) {
  if (!unpushed() || (!force && sinceLastPush() < PUSH_MINUTES * 60000)) return;
  git("fetch", "-q", "origin");
  // --autostash: someone else's uncommitted edits in this checkout (the integrator recording books, 2026-11-20) are
  // set aside for the rebase and put back, instead of failing every push. If putting them back conflicts, git keeps
  // them in the stash list and leaves the tree clean; the log says so.
  const rb = git("rebase", "-q", "--autostash", "origin/main");
  if (rb.status) { git("rebase", "--abort"); log(`push: rebase failed, left for the next push: ${rb.stderr.trim().split("\n").pop()}`); return; }
  if (/autostash resulted in conflicts/i.test(rb.stderr + rb.stdout)) log("push: uncommitted edits in the checkout conflicted with the rebase; they are in `git stash list`");
  const p = git("push", "-q", "origin", "HEAD:main");
  if (p.status) { log(`push failed: ${p.stderr.trim().split("\n").pop()}`); return; }
  fs.writeFileSync(LAST_PUSH, `${new Date().toISOString()}\n`); log("pushed");
}
const GENERATED = ["data.js", "people.js", "img", "audits/lines.json", "audits/statements/texts.json", "audits/share-slots.json", "audits/people-catalog.json", "audits/catalog.json"];
function buildAndCommit(message, extra = []) {
  const build = PEOPLE ? [["scripts/images.js"], ["scripts/build.js", "--people"]] : [["scripts/build.js"]];
  for (const b of build) { const r = run("node", b); if (r.status) return `build failed: ${failure(r.stderr || r.stdout)}`; }
  const t = run("node", ["test.js", ...(PEOPLE ? ["--people"] : [])]);
  if (t.status) { git("checkout", "--", ...GENERATED.filter((f) => fs.existsSync(path.join(ROOT, f)))); return `tests failed: ${failure(t.stdout + t.stderr)}`; }
  return commit(message, [...extra, ...GENERATED.filter((f) => fs.existsSync(path.join(ROOT, f)))]);
}
// Whether the site shows the integrated audit (the uncertainty rule), for the log only: sessions aren't told, they go as
// far as the record allows (Brandon, 2026-11-24). A child process, so it reads the data.js this integration just built.
function placement(id) {
  const code = `const lib = require("./scripts/lib"), id = ${JSON.stringify(id)};
    const a = lib.readJson(${PEOPLE} ? lib.personPath(id) : lib.profilePath(id));
    const u = a.notIdeasOfWhatSocietyShouldBe ? null : ${PEOPLE} ? lib.personUncertainty(a.answers || {}) : lib.ideologyUncertainty(a);
    console.log(!u ? "not ideas of what society should be" : u.placed ? "placed on every line (shown)" : "not placed on every line (not shown)");`;
  const r = run("node", ["-e", code]);
  return r.status ? "placement unknown" : r.stdout.trim();
}
// Answers with a value in the integrated audit, for the log.
function knownAnswers(id) {
  try {
    const lib = require("./lib"), a = lib.readJson(PEOPLE ? lib.personPath(id) : lib.profilePath(id));
    return Object.values(a.answers || {}).filter((v) => v && v.value !== null && v.value !== undefined).length;
  } catch { return "?"; }
}
function integrate(id) {
  return locked(() => {
    const target = path.join(ROOT, "audits", PEOPLE ? "people" : "profiles", `${id}.json`);
    const name = JSON.parse(fs.readFileSync(draft(id), "utf8")).name || id;
    const before = new Map([target, path.join(ROOT, "audits", "ideology-colors.json")].map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]));
    // Fixes that need no judgment and sources the audit never uses go by script, not by a fix round (scripts/cleanup.js).
    try {
      const { tidied, dropped, kept } = require("./cleanup").clean(OUT, id, PEOPLE);
      if (tidied) log(`${id}: cleanup: ${tidied}`);
      if (dropped.length || kept.length) log(`${id}: cleanup dropped ${dropped.length} unused source(s)${dropped.length ? `: ${dropped.join(", ")}` : ""}${kept.length ? `; kept ${kept.join(", ")} (dropping adds a validate.js error)` : ""}`);
    } catch (e) { log(`${id}: cleanup failed, draft integrated as it is: ${e.message.split("\n")[0]}`); }
    // Written in the audits' one format (lib.formatAudit): answers sorted, one per line, for git history.
    fs.writeFileSync(target, require("./lib").formatAudit(JSON.parse(fs.readFileSync(draft(id), "utf8"))));
    const colorFile = path.join(OUT, `${id}.color.json`);
    const files = [target];
    if (!PEOPLE && fs.existsSync(colorFile)) {
      const colorsPath = path.join(ROOT, "audits", "ideology-colors.json"), colors = JSON.parse(fs.readFileSync(colorsPath, "utf8"));
      if (!colors[id]) { const c = JSON.parse(fs.readFileSync(colorFile, "utf8")); colors[id] = c[id] || c; fs.writeFileSync(colorsPath, JSON.stringify(colors, null, 2) + "\n"); files.push(colorsPath); }
    }
    const failed = commit(`Audit ${name}`, files);
    // A failed audit commit is undone in audits/ and the draft, claim and DONE line kept, so the next start integrates
    // it again: the picker passes over audits with uncommitted changes, so one left in audits/ was never committed.
    if (failed) {
      // Written back from memory: git may still be locked out. The unstage is best effort.
      for (const f of files) { const b = before.get(f); if (b) fs.writeFileSync(f, b); else fs.unlinkSync(f); }
      git("reset", "-q", "--", ...files.map((f) => path.relative(ROOT, f)));
      log(`${id}: ${failed}; draft kept, integrated again at the next start`);
      return null;
    }
    const why = buildAndCommit(PEOPLE ? "Rebuild people data" : "Rebuild site data");
    if (why) log(`${id}: ${why}; audit committed, generated files left for the next build`);
    for (const f of [draft(id), colorFile, path.join(OUT, `${id}.claim`), scopeMark(id), localMark(id), webDraft(id)]) if (fs.existsSync(f)) fs.unlinkSync(f);
    return name;
  });
}

// ---- between subjects ----
function books() {
  const r = run("node", ["scripts/prefetch-books.js", "--next", String(BOOKS_EVERY * 3)]);
  log(`books: ${r.status ? `failed: ${failure(r.stdout + r.stderr)}` : (r.stdout || r.stderr).trim().split("\n").pop()}`);
  locked(() => {
    const t = run("node", ["scripts/triage.js"]);
    log(`triage: ${t.status ? `failed: ${failure(t.stdout + t.stderr)}` : (t.stdout || t.stderr).trim().split("\n").pop()}`);
    const failed = commit("Triage: refit on the latest people audits", ["audits/people-triage.json"]);
    if (failed) log(`triage: ${failed}`);
  });
}
// One signal step at a time across lanes: a lane whose step finds another lane's step already waiting for the lock or
// running skips its own. That step takes the lock after this lane's last integration, so it covers these audits too.
// Back-to-back runs on the same audits flip borderline statements back and forth (lanes stopped one after another,
// 2026-11-25: seven signal commits in 20 minutes). The marker holds the owner's pid; a dead owner's marker is taken over.
const SIGNAL_MARK = path.join(LANES, ".signal.pending");
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
function signal() {
  try { fs.writeFileSync(SIGNAL_MARK, String(process.pid), { flag: "wx" }); } catch {
    const owner = +fs.readFileSync(SIGNAL_MARK, "utf8").trim() || 0;
    if (owner && alive(owner)) { log(`signal: skipped; another lane's signal step (pid ${owner}) covers these audits`); return; }
    fs.writeFileSync(SIGNAL_MARK, String(process.pid));
  }
  try { signalStep(); } finally { try { if (+fs.readFileSync(SIGNAL_MARK, "utf8") === process.pid) fs.unlinkSync(SIGNAL_MARK); } catch {} }
}
function signalStep() {
  locked(() => {
    const r = run("node", ["scripts/statement-signal.js", "--apply"]);
    const tail = (r.stdout || "").trim().split("\n").filter((l) => /^(Promoted|Demoted)/.test(l));
    log(`signal: ${r.status ? `failed: ${failure(r.stdout + r.stderr)}` : tail.join("; ") || (r.stderr || "").trim().split("\n").pop()}`);
    if (git("diff", "--quiet", "--", "statements.json").status) {
      const why = buildAndCommit(`Statements: promote/demote by signal on the real lines\n\n${tail.join("\n")}`, ["statements.json"]);
      if (why) { git("checkout", "--", "statements.json"); log(`signal: ${why}; statements.json restored`); }
    }
  });
}

// ---- main loop ----
const settle = () => new Promise((r) => setTimeout(r, 100));
// --dry: print the subject this lane would take and exit.
if (DRY) { console.log(nextSubject()); process.exit(0); }
(async () => {
let count = 0;
log(`lane ${LANE} (${ENGINE}, ${KIND}) started${UNTIL ? `, until ${UNTIL}` : ""}`);
locked(() => push(true));
if (PEOPLE) books();
while (timeLeft()) {
  // The steps between subjects are synchronous, so a Ctrl-C waits in the event loop until something awaits: yield
  // before each stop check, or the stop shows only once the next subject has started (2026-11-20, naomi-klein).
  await settle();
  if (stopRequested()) { log("stopping before the next subject"); break; }
  const id = nextSubject();
  if (!id) { log("queue empty"); break; }
  await settle();
  if (stopRequested()) { log("stopping before the next subject"); break; }
  fs.writeFileSync(path.join(OUT, `${id}.claim`), `${new Date().toISOString()}\n`);
  log(`start ${id}`);
  let thread = null;
  const done = () => doneIds().has(id), local = () => fs.existsSync(localMark(id));
  if (!done() && !local()) seedLaterPass(id);
  // Phase 1, ideologies: scope, sources, aliases, key figures and key works (web and local).
  if (!PEOPLE && !done() && !local()) startBooks.set(id, (fetchBooks(id) || {}).books || []);
  if (!PEOPLE && !done() && !local() && !fs.existsSync(scopeMark(id))) {
    thread = await session(SCOPE_START(id));
    for (let n = 1; !fs.existsSync(scopeMark(id)) && n <= RESUMES && timeLeft(); n++) {
      if (!thread) { log(`${id}: no session id; starting a new session`); thread = await session(SCOPE_START(id)); continue; }
      log(`resume ${id} scope (${n})`);
      thread = await session(`Go on with the scope phase of \`${id}\` where you left off, through to creating scratchpad/lane-out/${LANE}/${id}.scope.`, thread);
    }
    if (!fs.existsSync(scopeMark(id))) { log(`${id}: scope phase not done; left for the next start`); tried.add(id); continue; }
  }
  // Phase 2: answers from local texts only, in the same session as the scope phase.
  const localStart = (added = "") => PEOPLE ? START(id) : `Follow audits/PROMPT_LANE.md as lane \`${LANE}\`; your subject is \`${id}\`, and its draft exists.${otherNames(id)}${namesakeBooks(id)}${booksAtStart(id)}${laterPassProblems(id)}${GAP_NOTE} ${ANSWER(id, added)}`;
  if (!done() && !local()) {
    let added = "";
    if (!PEOPLE) {
      let problems = fs.existsSync(draft(id)) ? scopeProblems(id) : "";
      for (let n = 1; problems && thread && n <= FIX_ROUNDS; n++) {
        log(`${id}: scope check, fix round ${n} (${problems.split("\n").length} problem(s))`);
        thread = await session(SCOPE_FIX(id, problems), thread);
        problems = scopeProblems(id);
      }
      if (problems) log(`${id}: scope check left ${problems.split("\n").length} problem(s); answering anyway (the final validate checks the errors again):\n${problems}`);
      // Sources the scope phase couldn't tie to the ideology leave the answers before the local phase (Brandon,
      // 2026-11-26): an answer resting on one alone is nulled and open to both answer phases.
      if (/doesn't name/.test(problems)) added += dropFailing(id, "after the scope phase");
      // The books by the key figures and key works the scope phase settled (Brandon, 2026-11-25).
      const before = new Set((startBooks.get(id) || []).map((b) => b.file));
      const after = fs.existsSync(draft(id)) ? (fetchBooks(id, draft(id)) || {}).books || [] : [];
      added = bookList(after.filter((b) => !before.has(b.file)), id, "Books by the key figures and key works your scope phase listed are now downloaded too") + added;
    }
    if (fs.existsSync(draft(id))) cleanBetween(id, "after the scope phase");
    // Each phase runs in a fresh session (Brandon, 2026-11-26): what the scope phase found is in the draft.
    log(`${id}: local phase`);
    thread = await session(localStart(added), null, LOCAL_ENV);
    for (let n = 1; !local() && n <= RESUMES && timeLeft(); n++) {
      if (!thread) { log(`${id}: no session id; starting a new session`); thread = await session(localStart(), null, LOCAL_ENV); continue; }
      log(`resume ${id} local (${n})`);
      thread = await session(RESUME_LOCAL(id), thread, LOCAL_ENV);
    }
    if (!local() || !fs.existsSync(draft(id))) { log(`${id}: local phase not done; left for the next start`); tried.add(id); continue; }
  }
  // The local phase's draft, checked in full but for the open statements (Brandon, 2026-11-26). Sources that fail
  // go by script first (cleanup.js), then the local session fixes the rest; the web phase starts only on a clean draft.
  if (!done() && !fs.existsSync(webDraft(id))) {
    let errors = localErrors(id), note = "";
    if (errors) { note = dropFailing(id, "after the local phase"); errors = localErrors(id); }
    for (let n = 1; errors && n <= FIX_ROUNDS; n++) {
      log(`${id}: local phase, validator errors, fix round ${n}`);
      thread = await session(LOCAL_FIX(id, errors) + (n === 1 ? note : ""), thread, LOCAL_ENV);
      errors = localErrors(id);
    }
    if (errors) {
      log(`${id}: still invalid after the local phase's ${FIX_ROUNDS} fix rounds; no web phase, draft left for review:\n${errors}`);
      fs.renameSync(draft(id), path.join(OUT, `${id}.invalid.json`));
      for (const f of [scopeMark(id), localMark(id)]) if (fs.existsSync(f)) fs.unlinkSync(f);
      tried.add(id); continue;
    }
  }
  // Phase 3: a fresh session searches the web for the statements still open (scripts/phases.js).
  if (!done()) {
    thread = null;
    if (!fs.existsSync(webDraft(id))) {
      cleanBetween(id, "after the local phase");
      const { web, ids } = phases.strip(JSON.parse(fs.readFileSync(draft(id), "utf8")), PEOPLE);
      if (ids.length) fs.writeFileSync(webDraft(id), require("./lib").formatAudit(web));
      else fs.appendFileSync(DONE, `${id}\n`);
      log(`${id}: web phase, ${ids.length} open statement(s)`);
    }
    if (!done()) {
      const n = Object.keys(JSON.parse(fs.readFileSync(webDraft(id), "utf8")).answers || {}).length;
      thread = await session(WEB_START(id, n), null, webEnv(id));
      for (let i = 1; !done() && i <= RESUMES && timeLeft(); i++) {
        if (!thread) { log(`${id}: no session id; starting a new session`); thread = await session(WEB_START(id, n), null, webEnv(id)); continue; }
        log(`resume ${id} web (${i})`);
        thread = await session(RESUME(id), thread, webEnv(id));
      }
    }
  }
  if (!done() || !fs.existsSync(draft(id))) { log(`${id}: not done; left for the next start`); tried.add(id); continue; }
  if (fs.existsSync(webDraft(id))) {
    const m = phases.merge(JSON.parse(fs.readFileSync(draft(id), "utf8")), JSON.parse(fs.readFileSync(webDraft(id), "utf8")), PEOPLE);
    fs.writeFileSync(draft(id), require("./lib").formatAudit(m.audit));
    fs.unlinkSync(webDraft(id));
    cleanBetween(id, "after the web phase");
    const answered = m.taken.filter((s) => m.audit.answers[s] && m.audit.answers[s].value !== null).length;
    log(`${id}: merged the web phase: ${answered} answer(s) found${m.taken.length > answered ? ` (${m.taken.length - answered} left null)` : ""}${PEOPLE ? `, ${m.kept.length} words-only answer(s) kept (no record)` : ""}${m.ignored.length ? `, ${m.ignored.length} answer(s) to settled statements ignored` : ""}`);
  }
  exceptGap(id);
  let errors = errorsIn(["--dir", path.relative(ROOT, OUT)], id), rounds = 0;
  for (let n = 1; errors && n <= FIX_ROUNDS; n++) { log(`${id}: validator errors, fix round ${n}`); thread = await session(FIX(id, errors), thread); exceptGap(id); errors = errorsIn(["--dir", path.relative(ROOT, OUT)], id); rounds = n; }
  if (errors) { log(`${id}: still invalid after ${FIX_ROUNDS} rounds; draft left for review`); fs.renameSync(draft(id), path.join(OUT, `${id}.invalid.json`)); for (const f of [scopeMark(id), localMark(id)]) if (fs.existsSync(f)) fs.unlinkSync(f); continue; }
  // The DONE line is only the session's "finished" mark: the driver counts the answers and the placement itself.
  const lines = fs.readFileSync(DONE, "utf8").split("\n"), line = lines.find((l) => lineId(l) === id);
  const name = integrate(id);
  if (!name) { tried.add(id); continue; }
  fs.writeFileSync(DONE, lines.filter((l) => l !== line).join("\n"));
  const result = `${knownAnswers(id)} known answers, ${placement(id)}`;
  fs.appendFileSync(path.join(OUT, "INTEGRATED.txt"), `${new Date().toISOString().slice(0, 10)} ${id} | ${result}\n`);
  integrated.add(id);
  log(`done ${id} (${name}): ${result}${rounds ? ` [${rounds} fix round${rounds > 1 ? "s" : ""}]` : ""}`);
  count++;
  if (PEOPLE && count % BOOKS_EVERY === 0) books();
  locked(() => push(false));
}
if (!PEOPLE && count) signal();
locked(() => push(true));
log("driver finished");
process.exit(0);
})();
