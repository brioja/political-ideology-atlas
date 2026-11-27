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
//  2. Audit, in one session (Brandon, 2026-11-27; sessions end their turns at natural report points, so the loop
//     lives here).
//     - A later pass starts from a draft the driver seeds from the committed audit, without Wikipedia citations
//       (seedLaterPass): answers resting on them alone are nulled and open.
//     - Before the session (prepare): sources validate.js can't tie to the subject (coatracks included) and Wikipedia
//       leave the answers (scripts/cleanup.js dropFailing), answers validate.js fails are nulled (nullFailing), and the
//       answers left are kept aside in .settled/<id>.json; the draft holds the open statements only, listed in
//       <id>.statements.txt with each statement's id and text alone.
//     - One session (START, resumed with RESUME) does an ideology's scope, sources, aliases, key figures and key works
//       (audits/PROMPT_IDEOLOGIES.md sections 1 and 2) and answers the open statements from local texts and the web, until it
//       creates <id>.done, which the driver turns into the subject's DONE.txt line. The answers kept aside go back,
//       and validate.js errors go back to the same session to fix (FIX).
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
// Every argument is checked, and --help prints this file's header (Brandon, 2026-11-27: a mistyped "--ideology" fell
// back to the default kind and started a people lane).
const HELP = () => { const l = fs.readFileSync(__filename, "utf8").split("\n"); return l.slice(0, l.findIndex((x) => x.startsWith("// Per subject:"))).map((x) => x.replace(/^\/\/ ?/, "")).join("\n"); };
{
  const VALUED = ["--engine", "--kind", "--lane", "--until", "--resumes", "--subjects", "--gap-exception"], a = process.argv.slice(2), bad = [];
  for (let i = 0; i < a.length; i++) {
    if (VALUED.includes(a[i])) { if (a[i + 1] === undefined || a[i + 1].startsWith("--")) bad.push(`${a[i]} needs a value`); else i++; }
    else if (!["--dry", "--help", "-h"].includes(a[i])) bad.push(`unknown argument "${a[i]}"`);
  }
  if (a.includes("--help") || a.includes("-h")) { console.log(HELP()); process.exit(0); }
  if (bad.length) { console.error(`${bad.join("\n")}\n\n${HELP()}`); process.exit(1); }
}
if (GAP_EXCEPTION && GAP_EXCEPTION.trim().length < 10) { console.error("--gap-exception: say why, and who approved it"); process.exit(1); }
if (!["codex", "claude"].includes(ENGINE) || !["people", "ideologies"].includes(KIND) || (UNTIL && !/^\d\d:\d\d$/.test(UNTIL))) {
  console.error(HELP());
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
// validate.js's re-audit gap error (scripts/validate.js "passes").
const GAP_ERROR = /"passes": a later pass comes at least \d+ days/;
const flag = PEOPLE ? "--people " : "";

// ---- picking ----
const tried = new Set(); // subjects this run already gave up on (not done after every resume)
const integrated = new Set(); // subjects this run integrated (--subjects)
function nextSubject() {
  const done = doneIds(), lib = require("./lib");
  if (SUBJECTS) {
    for (const id of SUBJECTS) {
      if (tried.has(id) || integrated.has(id)) continue;
      // The queue (pending.js) waits out the re-audit gap; --subjects did not, and three passes ran that weren't due
      // (Brandon, 2026-11-26). A subject not yet due needs --gap-exception; a draft already started is carried on.
      const committed = PEOPLE ? lib.personPath(id) : lib.profilePath(id), today = new Date().toISOString().slice(0, 10);
      if (!GAP_EXCEPTION && !fs.existsSync(draft(id)) && fs.existsSync(committed)) {
        const due = require("./validate").nextPassFrom(JSON.parse(fs.readFileSync(committed, "utf8")));
        if (due > today) { log(`${id}: not due for a later pass until ${due} (the re-audit gap); skipped. --gap-exception "<why> (<maintainer>, <date>)" runs it early`); tried.add(id); continue; }
      }
      return id;
    }
    return null;
  }
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
// A later pass starts from a draft the driver seeds from the committed audit, without its Wikipedia citations
// (scripts/cleanup.js dropWikipedia; Brandon, 2026-11-26), notes, scope or reasons for its nulls; prepare() below then
// takes out what fails today's rules and keeps the remaining answers from the session.
function seedLaterPass(id) {
  const committed = PEOPLE ? require("./lib").personPath(id) : require("./lib").profilePath(id);
  if (fs.existsSync(draft(id)) || !fs.existsSync(committed)) return;
  const a = JSON.parse(fs.readFileSync(committed, "utf8")), w = require("./cleanup").dropWikipedia(a);
  // The pass's own fields are the driver's, not the session's (Brandon, 2026-11-26: the first seeded pass, of
  // Anarcha-feminism, was carried on as earlier work and kept its old date, no "rules" and no "passes"): today's
  // rules, so every check judges the draft by them; today's date; the earlier passes listed (an audit with one pass
  // lists it from its "auditor" and "auditedAt"). Today's entry and the model in "auditor" go in once a session has run
  // (exceptGap), when the model is known.
  const today = new Date().toISOString().slice(0, 10);
  if (!Array.isArray(a.passes) || !a.passes.length) a.passes = [{ auditor: [].concat(a.auditor || [])[0], auditedAt: a.auditedAt }];
  a.rules = require("./validate").CURRENT_RULES;
  a.auditedAt = today;
  // The earlier pass's notes go (Brandon, 2026-11-26): Political moderate's session read "a positional and
  // methodological label, so most substantive policy answers are low-confidence" from them first, took it as settled
  // and searched nothing. Each pass writes its own. So does the scope (Brandon, 2026-11-26): its rerun carried the
  // October scope's "many answers are low-confidence" into the new one, and the sessions took it as leave to search
  // nothing; each pass writes it afresh from the defining sources.
  delete a.notes;
  delete a.scope;
  // A null carries no reason (Brandon, 2026-11-26; validate.js): one written before that rule goes here.
  for (const [sid, ans] of Object.entries(a.answers || {})) if (!ans || ans.value === null || ans.value === undefined) a.answers[sid] = { value: null, sources: [], rationale: "" };
  fs.writeFileSync(draft(id), require("./lib").formatAudit(a));
  log(`${id}: later pass seeded from the committed audit; Wikipedia citations dropped: ${w.nulled} answer(s) nulled, ${w.requests} missing statement(s) dropped`);
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
// books, and archive.org books named after it, wherever archive.org has the full text open. Re-audits had nulled what no defining source tied without opening
// the scholarship that would tie it (Libertarian socialism, Monarchism).
function fetchBooks(id) {
  if (PEOPLE) return null;
  const r = run("node", ["scripts/ideology-books.js", id], { timeout: 30 * 60000 });
  log(`${id}: books: ${r.status ? `failed: ${failure(r.stdout + r.stderr)}` : r.stdout.trim().split("\n").pop()}`);
  try { return JSON.parse(fs.readFileSync(path.join(require("./ideology-books").DIR, id, "index.json"), "utf8")); } catch { return null; }
}
const BOOKS_NOTE = (dir) => `They were found by title, not read: open each, and whether it is the subject's own text or scholarship defining it (audits/AUDIT_RULES.md) is your call, as for any source. Search each for the statements' topics (\`grep -i -n\` in ${dir}/, in the book's language), cite it by its archive.org page (the url given), and name the chapter or page in each rationale that rests on it. Books listed under its "lending" and "missing" in index.json are leads you may look for elsewhere.`;
function bookList(books, id, intro) {
  if (!books || !books.length) return "";
  const dir = `~/.cache/political-ideology-atlas/corpora/ideology-books/${id}`;
  return `\n\n${intro} (full text, local, in ${dir}/):\n${books.map((b) => `- ${b.file} (${b.url}; ${b.from})`).join("\n")}\n${BOOKS_NOTE(dir)}`;
}
const booksAtStart = (id) => bookList(startBooks.get(id), id, `Books on \`${id}\` are downloaded`);
const startBooks = new Map();
// An ideology's other names (the Wikipedia redirects to its article) go in the first message, so the session searches
// under them from the start instead of finding them late (Brandon, 2026-11-23). The coatrack check already accepts
// them as aliases. Plain other names (Brandon, 2026-11-26: the Wikipedia mechanics were clutter).
function otherNames(id) {
  if (PEOPLE) return "";
  const names = require("./lib").wikipediaOtherNames(id);
  if (!names.length) return "";
  return ` Other names for it: ${names.map((n) => `"${n}"`).join(", ")}; search under them too. They count as aliases already: don't list them in "aliases".`;
}
// Lane sessions run with AUDIT_LANE=1: .claude/hooks/statement-text-only.js then refuses statements.json, so a session
// sees each statement's text alone (writeStatements), never the site's agree/disagree explanations and notes.
const LANE_ENV = { AUDIT_LANE: "1" };
const doneMark = (id) => path.join(OUT, `${id}.done`);
// A session is told only its task: the statements to answer, the file, where to search and how it ends; never what
// another session did or will do, or that other answers exist (Brandon, 2026-11-26: "earlier phases have been
// searched" let sessions quit before the end, and "if it has been worked on already, carry on from it" had them repair
// answers instead of researching). Neither what a session can't search nor the special tools for particular sites are
// listed (Brandon, 2026-11-26: clutter that confuses the task): get.js and no-direct-fetch.js print the tool to use
// when a session reaches for such a site.
const SEARCH = (id) => `local texts (the local corpora, ~/.cache/political-ideology-atlas/corpora/, listed in its README.md; the maintainer's reference library; the books downloaded on the subject, scratchpad/sources/${id}/${PEOPLE ? "" : ` and ~/.cache/political-ideology-atlas/corpora/ideology-books/${id}/`}) and the web (web searches, \`node scripts/get.js ${id} <url>\`, scripts/wiki.js and scripts/yt.js).`;
// The statements a session answers are listed in <id>.statements.txt, and its file holds only their answers
// (prepare): the answers that pass today's rules are kept aside, so there is nothing to carry on from (Brandon,
// 2026-11-26). Each statement is searched for, and the end condition names that (Brandon, 2026-11-26: with "When the
// audit is done" the sessions answered what the main texts state outright and stopped).
const statementsFile = (id) => path.join(OUT, `${id}.statements.txt`);
const ANSWER_RULE = (id) => `Answer the statements listed in scratchpad/lane-out/${LANE}/${id}.statements.txt, in scratchpad/lane-out/${LANE}/${id}.json, from ${SEARCH(id)}${PEOPLE ? " A listed statement that already has an answer rests on the person's words alone: their record (acts) on that statement outweighs it (record over words, audits/AUDIT_RULES.md); look for one, and with no record leave the answer as it is." : ""} Number new sources on from the existing ones.${PEOPLE ? "" : " If a text gives another name for the ideology that \"aliases\" lacks, add it with its reason and evidence (audits/PROMPT_IDEOLOGIES.md, Aliases)."} Search for an answer to every statement in the statements file, one by one. When you have searched for every statement in the file, create the empty file scratchpad/lane-out/${LANE}/${id}.done and end your turn; don't run validate.js (the driver validates the file and sends back what to fix).`;
// An ideology's session first does what PROMPT_IDEOLOGIES.md section 2 settles (scope, sources, aliases, key figures, key works),
// then the answers, in the same session (Brandon, 2026-11-27).
const SCOPE = (id) => PEOPLE ? "" : `First do audits/PROMPT_IDEOLOGIES.md sections 1 and 2: find the defining sources and write the scope, sources, aliases, key figures and key works into scratchpad/lane-out/${LANE}/${id}.json (completing what the file already has).${otherNames(id)} Then: `;
const START = (id) => `Follow audits/PROMPT_LANE.md. Your subject is \`${id}\`. ${SCOPE(id)}${ANSWER_RULE(id)}${COLOR(id)}${namesakeBooks(id)}${booksAtStart(id)}${prepNote(id)}`;
const RESUME = (id) => `Go on with \`${id}\` where you left off, through to creating scratchpad/lane-out/${LANE}/${id}.done.`;
// The sources validate.js fails, out of the answers (scripts/cleanup.js dropFailing): logged, and returned as a note
// for the next session.
function dropFailing(id, when, keepUnused = false) {
  try {
    const f = require("./cleanup").dropFailing(OUT, id, PEOPLE, keepUnused), w = f.wikipedia.nulled + f.wikipedia.requests;
    if (f.untied.length || w) log(`${id}: ${when}, the driver took out of the answers${f.untied.length ? ` untied source(s) ${f.untied.join(", ")}` : ""}${w ? `${f.untied.length ? " and" : ""} Wikipedia citations (${f.wikipedia.nulled} answer(s) nulled)` : ""}`);
  } catch (e) { log(`${id}: ${when}, dropping failing sources failed: ${e.message.split("\n")[0]}`); }
}
// Answers validate.js fails under today's rules are nulled, to be answered afresh (scripts/cleanup.js nullFailing).
function nullFailing(id, when) {
  try {
    const n = require("./cleanup").nullFailing(OUT, id, PEOPLE);
    if (n.length) log(`${id}: ${when}, nulled ${n.length} failing answer(s):\n${[...new Set(n.map((s) => n.reasons[s]))].map((r) => `  ${r}`).join("\n")}`);
  } catch (e) { log(`${id}: ${when}, nulling failing answers failed: ${e.message.split("\n")[0]}`); }
}
// The answers a session doesn't work on are kept aside in OUT/.settled/<id>.json while it runs (Brandon, 2026-11-26:
// feed only the unanswered statements). restoreSettled puts them back (they win over the draft's) before anything
// validates, merges or drops unused sources: cleanup.js would otherwise drop the sources only they cite.
const settledFile = (id) => path.join(OUT, ".settled", `${id}.json`);
function restoreSettled(id) {
  if (!fs.existsSync(settledFile(id))) return;
  if (fs.existsSync(draft(id))) {
    const a = JSON.parse(fs.readFileSync(draft(id), "utf8"));
    a.answers = { ...(a.answers || {}), ...JSON.parse(fs.readFileSync(settledFile(id), "utf8")) };
    fs.writeFileSync(draft(id), require("./lib").formatAudit(a));
  }
  fs.unlinkSync(settledFile(id));
}
// The open statements: no answer yet, and for a person an answer that cites no action source (words only): a record
// found replaces their words (audits/AUDIT_RULES.md, "Record over words").
const known = (ans) => ans && ans.value !== null && ans.value !== undefined;
function openStatements(a) {
  const actions = new Set((a.sources || []).filter((s) => s.evidence === "action").map((s) => s.id)), answers = a.answers || {};
  return require("./lib").allStatements().map((s) => s.id)
    .filter((sid) => !known(answers[sid]) || (PEOPLE && !(answers[sid].sources || []).some((x) => actions.has(x))));
}
// Keeps every answer but the open ones aside, gives each open statement an empty entry, and lists them in
// <id>.statements.txt. Returns their ids.
function hideSettled(id) {
  restoreSettled(id);
  const a = JSON.parse(fs.readFileSync(draft(id), "utf8")), ids = openStatements(a), open = new Set(ids);
  const settled = {}, answers = {};
  for (const [sid, ans] of Object.entries(a.answers || {})) (open.has(sid) ? answers : settled)[sid] = ans;
  for (const sid of ids) if (!answers[sid]) answers[sid] = { value: null, sources: [], rationale: "" };
  a.answers = answers;
  fs.mkdirSync(path.dirname(settledFile(id)), { recursive: true });
  fs.writeFileSync(settledFile(id), JSON.stringify(settled, null, 2) + "\n");
  fs.writeFileSync(draft(id), require("./lib").formatAudit(a));
  writeStatements(id, ids);
  return ids;
}
// Only each statement's id and text (Brandon, 2026-11-26): the site's agree/disagree explanations and notes don't
// affect audits and confused Sonnet; statement-text-only.js keeps the session off statements.json. The model quiz stopped pointing at them during the Sonnet self-checks
// (855497488, 2026-11-19), the same retake that made "never", hedges and "always" wording errors.
function writeStatements(id, ids) {
  const set = new Set(ids);
  // Plain text, one "id: text" line per statement under its theme (Brandon, 2026-11-27): every session wrote a script to
  // turn the JSON into such a list and printed it, often twice, about 7k tokens carried on every later turn.
  const byTheme = new Map();
  for (const s of require("./lib").allStatements().filter((s) => set.has(s.id))) {
    if (!byTheme.has(s.theme)) byTheme.set(s.theme, []);
    byTheme.get(s.theme).push(`${s.id}: ${s.text}`);
  }
  fs.writeFileSync(statementsFile(id), `${set.size} statements, by theme.\n` + [...byTheme].map(([t, l]) => `\n## ${t || "Other"}\n${l.join("\n")}`).join("\n") + "\n");
  const old = statementsFile(id).replace(/\.txt$/, ".json");
  if (fs.existsSync(old)) fs.unlinkSync(old);
}
// Before the session: failing sources and answers out, the rest kept aside. What validate.js still reports that no
// script fixes goes in the first message (prepNote), as problems in the file to fix. Returns the re-audit gap's error
// lines, if any: a pass the gap doesn't allow has no fix a session can make.
const prepNotes = new Map();
function prepare(id, when) {
  restoreSettled(id);
  // A first audit starts from a draft with the catalog's id, name and article: the
  // session got no statements file and no draft, and said it couldn't start (neil-kinnock, 2026-11-26).
  if (!fs.existsSync(draft(id))) {
    const lib = require("./lib"), entry = (PEOPLE ? lib.peopleCatalog() : lib.catalog()).find((x) => x.id === id) || {};
    fs.mkdirSync(path.dirname(draft(id)), { recursive: true });
    // The pass's own fields are the driver's, as for a later pass (seedLaterPass); "auditor" gets the model once a
    // session has run.
    fs.writeFileSync(draft(id), lib.formatAudit({ id, name: entry.name || id, auditedAt: new Date().toISOString().slice(0, 10),
      auditor: MODEL || ENGINE, rules: require("./validate").CURRENT_RULES, wikipedia: entry.wikipedia || null, sources: [], answers: {} }));
  }
  dropFailing(id, when, true);
  nullFailing(id, when);
  const all = otherErrors(id).split("\n").filter(Boolean), gap = all.filter((l) => GAP_ERROR.test(l));
  if (gap.length) return gap.join("\n");
  const lines = all.map((l) => `- ${l.replace(/^error:\s*/, "")}`);
  const ids = hideSettled(id);
  prepNotes.set(id, lines.length ? `\n\n\`node scripts/validate.js ${flag}--dir scratchpad/lane-out/${LANE} ${id}\` reports these problems in the file; fix each:\n${lines.join("\n")}` : "");
  log(`${id}: ${when}, ${ids.length} statement(s) to answer${lines.length ? `, ${lines.length} other problem(s) handed over` : ""}`);
  return "";
}
function prepNote(id) {
  const note = prepNotes.get(id) || "";
  prepNotes.delete(id);
  return note;
}
// Validator errors but for statements without an answer (the session answers those).
const otherErrors = (id) => errorsIn(["--dir", path.relative(ROOT, OUT)], id).split("\n").filter((l) => l.trim() && !/no answer for '|statements? ha(s|ve) no answer yet/.test(l)).join("\n");
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
// Sessions are compartmentalized (Brandon, 2026-11-26): no memories and no AGENTS.md, only the driver's message and the
// files it points to. The maintainer's memory index and AGENTS.md (how to run lanes, costs, pilots) reached every
// session through the automatic context. Hooks still apply. Codex keeps its global ~/.codex/AGENTS.md.
// Nor do they inherit the maintainer's effort level (~/.claude/settings.json, "medium"), and Claude Code's "The user
// hasn't heard from you in a while" reminder is off: no one waits on a lane. Sessions at medium effort, nudged after
// about five tool calls, answered the statements a main text states outright and stopped (Brandon, 2026-11-26).
const ISOLATED = { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_SILENT_TURN_REMINDER: "0" };
// Claude sessions get scripts/lane-system-prompt.md in place of Claude Code's default system prompt, which is written for
// an interactive coding assistant: "When you have enough information to act, act", confirm before acting, searches as
// "quick and cheap" or "several times the cost". At high effort without the reminder, web sessions still stopped after a
// few searches (Brandon, 2026-11-26).
const SYSTEM_PROMPT = path.join(__dirname, "lane-system-prompt.md");
async function session(prompt, thread, env = {}) {
  let r, id = thread;
  env = { ...ISOLATED, ...env };
  if (ENGINE === "codex") {
    const common = ["--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "-c", "project_doc_max_bytes=0", "-c", "features.memories=false", ...(MODEL ? ["-m", MODEL] : [])];
    r = await runAsync("codex", thread ? ["exec", "resume", ...common, thread, prompt] : ["exec", ...common, "-C", ROOT, prompt], env);
    for (const line of (r.stdout || "").split("\n")) { try { const e = JSON.parse(line); if (e.type === "thread.started") id = e.thread_id; } catch {} }
  } else {
    r = await runAsync("claude", ["-p", prompt, "--model", "sonnet", "--effort", "high", "--system-prompt-file", SYSTEM_PROMPT, "--output-format", "json", "--dangerously-skip-permissions", ...(thread ? ["--resume", thread] : [])], env);
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
// The pass's date and the earlier passes are the driver's too: a fix session met the gap error by taking out today's
// entry and dating the draft back to the previous pass (Economic liberalism, 2026-11-26), so the earlier passes are
// put back from the committed audit and a draft dated on or before the last of them is dated today.
// Then --gap-exception: the newest entry gets the maintainer's exception (validate.js), unless it has one.
function exceptGap(id) {
  if (!fs.existsSync(draft(id))) return;
  try {
    const a = JSON.parse(fs.readFileSync(draft(id), "utf8")), today = new Date().toISOString().slice(0, 10);
    let changed = false;
    const committedFile = PEOPLE ? require("./lib").personPath(id) : require("./lib").profilePath(id);
    if (fs.existsSync(committedFile)) {
      const c = JSON.parse(fs.readFileSync(committedFile, "utf8"));
      const earlier = Array.isArray(c.passes) && c.passes.length ? c.passes : [{ auditor: [].concat(c.auditor || [])[0], auditedAt: c.auditedAt }];
      if (!Array.isArray(a.passes)) a.passes = [];
      const missing = earlier.filter((p) => p && p.auditedAt && !a.passes.some((q) => q && q.auditedAt === p.auditedAt));
      if (missing.length) { a.passes.unshift(...missing); changed = true; log(`${id}: driver put back the earlier pass(es) ${missing.map((p) => p.auditedAt).join(", ")} in "passes"`); }
      const prev = earlier.map((p) => p && p.auditedAt).filter(Boolean).sort().pop() || "";
      if (!a.auditedAt || a.auditedAt <= prev) { log(`${id}: draft dated ${a.auditedAt || "(none)"}, not after the last pass (${prev}); driver dated it ${today}`); a.auditedAt = today; changed = true; }
    }
    // A first audit's draft names the engine until a session has run (prepare); then the model.
    if (MODEL && a.auditor === ENGINE) { a.auditor = MODEL; changed = true; }
    const passes = Array.isArray(a.passes) ? a.passes : null;
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
    const claimsFile = require("./coatrack-check").CLAIMS_FILE;
    const before = new Map([target, path.join(ROOT, "audits", "ideology-colors.json"), claimsFile].map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]));
    // Fixes that need no judgment and sources the audit never uses go by script, not by a fix round (scripts/cleanup.js).
    try {
      const { tidied, dropped, kept } = require("./cleanup").clean(OUT, id, PEOPLE);
      if (tidied) log(`${id}: cleanup: ${tidied}`);
      if (dropped.length || kept.length) log(`${id}: cleanup dropped ${dropped.length} unused source(s)${dropped.length ? `: ${dropped.join(", ")}` : ""}${kept.length ? `; kept ${kept.join(", ")} (dropping adds a validate.js error)` : ""}`);
    } catch (e) { log(`${id}: cleanup failed, draft integrated as it is: ${e.message.split("\n")[0]}`); }
    // Key figure claims go from the draft into audits/key-figure-claims.json, and the claims this audit settles leave it
    // (scripts/key-figure-claims.js; Brandon, 2026-11-26).
    const audit = JSON.parse(fs.readFileSync(draft(id), "utf8"));
    const files = [target];
    let claimNotes = [];
    if (!PEOPLE) {
      try {
        const k = require("./key-figure-claims").integrate(id, audit);
        claimNotes = k.notes;
        if (k.changed) files.push(claimsFile);
        if (k.notes.length) log(`${id}: key figure claims: ${k.notes.join("; ")}`);
      } catch (e) { log(`${id}: key figure claims failed, left in the audit: ${e.message.split("\n")[0]}`); }
    }
    // Written in the audits' one format (lib.formatAudit): answers sorted, one per line, for git history.
    fs.writeFileSync(target, require("./lib").formatAudit(audit));
    const colorFile = path.join(OUT, `${id}.color.json`);
    if (!PEOPLE && fs.existsSync(colorFile)) {
      const colorsPath = path.join(ROOT, "audits", "ideology-colors.json"), colors = JSON.parse(fs.readFileSync(colorsPath, "utf8"));
      if (!colors[id]) { const c = JSON.parse(fs.readFileSync(colorFile, "utf8")); colors[id] = c[id] || c; fs.writeFileSync(colorsPath, JSON.stringify(colors, null, 2) + "\n"); files.push(colorsPath); }
    }
    const failed = commit(`Audit ${name}${claimNotes.length ? `\n\nKey figure claims: ${claimNotes.join("; ")}.` : ""}`, files);
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
    for (const f of [draft(id), colorFile, path.join(OUT, `${id}.claim`), doneMark(id)]) if (fs.existsSync(f)) fs.unlinkSync(f);
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
  const done = () => doneIds().has(id);
  if (!done()) {
    seedLaterPass(id);
    if (!PEOPLE) startBooks.set(id, (fetchBooks(id) || {}).books || []);
    exceptGap(id); // the gap check runs in prepare, so the maintainer's exception goes in first
    const gap = prepare(id, "before the session");
    if (gap) { restoreSettled(id); log(`${id}: the re-audit gap doesn't allow this pass yet; stopped, draft kept:\n${gap}`); tried.add(id); continue; }
    // The session marks its work done with <id>.done; the driver turns it into the subject's DONE.txt line.
    const marked = () => fs.existsSync(doneMark(id));
    if (!marked()) thread = await session(START(id), null, LANE_ENV);
    for (let n = 1; !marked() && n <= RESUMES && timeLeft(); n++) {
      if (!thread) { log(`${id}: no session id; starting a new session`); thread = await session(START(id), null, LANE_ENV); continue; }
      log(`resume ${id} (${n})`);
      thread = await session(RESUME(id), thread, LANE_ENV);
    }
    restoreSettled(id);
    if (marked()) { fs.appendFileSync(DONE, `${id}\n`); fs.unlinkSync(doneMark(id)); }
  }
  restoreSettled(id);
  if (!done() || !fs.existsSync(draft(id))) { log(`${id}: not done; left for the next start`); tried.add(id); continue; }
  if (fs.existsSync(statementsFile(id))) fs.unlinkSync(statementsFile(id));
  exceptGap(id);
  nullFailing(id, "after the session");
  let errors = errorsIn(["--dir", path.relative(ROOT, OUT)], id), rounds = 0;
  if (GAP_ERROR.test(errors)) { log(`${id}: the re-audit gap doesn't allow this pass yet; no fix rounds, draft left for review`); fs.renameSync(draft(id), path.join(OUT, `${id}.invalid.json`)); continue; }
  for (let n = 1; errors && n <= FIX_ROUNDS; n++) { log(`${id}: validator errors, fix round ${n}`); thread = await session(FIX(id, errors), thread, LANE_ENV); exceptGap(id); errors = errorsIn(["--dir", path.relative(ROOT, OUT)], id); rounds = n; }
  if (errors) { log(`${id}: still invalid after ${FIX_ROUNDS} rounds; draft left for review`); fs.renameSync(draft(id), path.join(OUT, `${id}.invalid.json`)); continue; }
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
