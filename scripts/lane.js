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
//  2. Audit: a new session with START, resumed with RESUME until the subject has its DONE.txt line. An ideology first
//     runs a scope phase (SCOPE_START, until <id>.scope exists), checked with validate.js --stage scope and sent back
//     to fix (SCOPE_FIX), then answers in the same session (ANSWER). The session
//     ends its turn at natural report points, so the loop lives here.
//  3. Integrate (under a lock shared by all lanes): validate (errors go back to the
//     session to fix), move the draft into audits/, merge an ideology's color, build, test, commit with no attribution
//     line. Pushes go out at most every PUSH_MINUTES across all lanes, and when a driver starts or stops.
// Between subjects: for people, prefetch-books.js and triage.js every
// BOOKS_EVERY people; for ideologies, statement-signal.js --apply once, when the lane stops (Brandon, 2026-11-20: it takes
// about 9 minutes inside the integrate lock, so running it every 5 ideologies slowed both lanes by about a fifth; since
// 2026-11-23 it takes about half a minute, refits in parallel).
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
const runAsync = (cmd, args) => new Promise((resolve) => {
  let out = "", err = "";
  const c = child = spawn(cmd, args, { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] });
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
function commit(message, paths) {
  git("add", "--", ...paths);
  if (!git("diff", "--cached", "--quiet", "HEAD", "--", ...paths).status) return "";
  const r = git("commit", "-q", "-m", message, "--", ...paths);
  return r.status ? `commit failed: ${(r.stderr || r.stdout).trim().split("\n").slice(0, 3).join(" / ")}` : "";
}
const draft = (id) => path.join(OUT, `${id}.json`);
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
function laterPassProblems(id) {
  const committed = PEOPLE ? require("./lib").personPath(id) : require("./lib").profilePath(id);
  if (fs.existsSync(draft(id)) || !fs.existsSync(committed)) return "";
  const r = run("node", ["scripts/validate.js", ...(PEOPLE ? ["--people"] : []), "--as-current", id]);
  // Only errors and warnings: an "excluded:" line (not ideas of what society should be) is a
  // finished result, not a problem, and handing it over as one had sessions overturn the record (2026-11-24, Extremism).
  const lines = (r.stdout + r.stderr).split("\n").filter((l) => /^\s+(error|warning):/.test(l)).map((l) => `- ${l.trim()}`);
  if (!lines.length) return "";
  log(`${id}: later pass starts with ${lines.length} problem(s) from validate.js --as-current`);
  return `\n\nThis is a later pass. The committed audit, checked under today's rules (\`node scripts/validate.js ${flag}--as-current ${id}\`), has these problems; fix each in your draft:\n${lines.join("\n")}`;
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
const START = (id) => `Follow audits/PROMPT_LANE.md as lane \`${LANE}\`. Your subject is \`${id}\`. Audit it into scratchpad/lane-out/${LANE}/${id}.json, saving after every statement you answer; if that draft exists, carry on from it. When every statement has an answer, validate with \`node scripts/validate.js ${flag}--dir scratchpad/lane-out/${LANE} ${id}\` and fix every error.${COLOR(id)} Once it reports no errors, add one line to scratchpad/lane-out/${LANE}/DONE.txt: \`${id} | <known answers>\`.${otherNames(id)}${namesakeBooks(id)}${booksAtStart(id)}${laterPassProblems(id)}${GAP_NOTE}`;
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
const ANSWER = (id, added = "") => `The scope, sources, aliases, key figures and key works of \`${id}\` are checked.${added} Now answer the statements. Audit it into scratchpad/lane-out/${LANE}/${id}.json, saving after every statement you answer. When every statement has an answer, validate with \`node scripts/validate.js --dir scratchpad/lane-out/${LANE} ${id}\` and fix every error.${COLOR(id)} Once it reports no errors, add one line to scratchpad/lane-out/${LANE}/DONE.txt: \`${id} | <known answers>\`.`;
// validate.js --stage scope's errors and warnings for the draft, as "- " lines ("" when clean).
function scopeProblems(id) {
  const r = run("node", ["scripts/validate.js", "--dir", path.relative(ROOT, OUT), "--stage", "scope", id]);
  return (r.stdout + r.stderr).split("\n").filter((l) => /^\s+(error|warning):/.test(l)).map((l) => `- ${l.trim()}`).join("\n");
}
const RESUME = (id) => `Go on with \`${id}\` where you left off, through to its line in scratchpad/lane-out/${LANE}/DONE.txt.`;
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
async function session(prompt, thread) {
  let r, id = thread;
  if (ENGINE === "codex") {
    const common = ["--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox"];
    r = await runAsync("codex", thread ? ["exec", "resume", ...common, thread, prompt] : ["exec", ...common, "-C", ROOT, prompt]);
    for (const line of (r.stdout || "").split("\n")) { try { const e = JSON.parse(line); if (e.type === "thread.started") id = e.thread_id; } catch {} }
  } else {
    r = await runAsync("claude", ["-p", prompt, "--model", "sonnet", "--output-format", "json", "--dangerously-skip-permissions", ...(thread ? ["--resume", thread] : [])]);
    try { id = JSON.parse(r.stdout).session_id || id; } catch {}
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

// --gap-exception: the newest entry in the draft's "passes" gets the maintainer's exception (validate.js), unless it has one.
function exceptGap(id) {
  if (!GAP_EXCEPTION || !fs.existsSync(draft(id))) return;
  try {
    const a = JSON.parse(fs.readFileSync(draft(id), "utf8")), passes = Array.isArray(a.passes) ? a.passes : [];
    const last = [...passes].sort((x, y) => String(x.auditedAt).localeCompare(String(y.auditedAt))).pop();
    if (!last || last.gapException || last.auditedAt !== new Date().toISOString().slice(0, 10)) return;
    last.gapException = GAP_EXCEPTION;
    fs.writeFileSync(draft(id), JSON.stringify(a, null, 2) + "\n");
    log(`${id}: gap exception added to the ${last.auditedAt} pass`);
  } catch (e) { log(`${id}: gap exception not added (${e.message})`); }
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
function integrate(id) {
  return locked(() => {
    const target = path.join(ROOT, "audits", PEOPLE ? "people" : "profiles", `${id}.json`);
    const name = JSON.parse(fs.readFileSync(draft(id), "utf8")).name || id;
    fs.copyFileSync(draft(id), target);
    const colorFile = path.join(OUT, `${id}.color.json`);
    const files = [target];
    if (!PEOPLE && fs.existsSync(colorFile)) {
      const colorsPath = path.join(ROOT, "audits", "ideology-colors.json"), colors = JSON.parse(fs.readFileSync(colorsPath, "utf8"));
      if (!colors[id]) { const c = JSON.parse(fs.readFileSync(colorFile, "utf8")); colors[id] = c[id] || c; fs.writeFileSync(colorsPath, JSON.stringify(colors, null, 2) + "\n"); files.push(colorsPath); }
    }
    const failed = commit(`Audit ${name}`, files);
    if (failed) log(`${id}: ${failed}; the audit is in audits/ but not committed`);
    const why = buildAndCommit(PEOPLE ? "Rebuild people data" : "Rebuild site data");
    if (why) log(`${id}: ${why}; ${failed ? "" : "audit committed, "}generated files left for the next build`);
    for (const f of [draft(id), colorFile, path.join(OUT, `${id}.claim`), path.join(OUT, `${id}.scope`)]) if (fs.existsSync(f)) fs.unlinkSync(f);
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
function signal() {
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
  if (!PEOPLE && !doneIds().has(id)) startBooks.set(id, (fetchBooks(id) || {}).books || []);
  if (!PEOPLE && !doneIds().has(id) && !fs.existsSync(scopeMark(id))) {
    thread = await session(SCOPE_START(id));
    for (let n = 1; !fs.existsSync(scopeMark(id)) && n <= RESUMES && timeLeft(); n++) {
      if (!thread) { log(`${id}: no session id; starting a new session`); thread = await session(SCOPE_START(id)); continue; }
      log(`resume ${id} scope (${n})`);
      thread = await session(`Go on with the scope phase of \`${id}\` where you left off, through to creating scratchpad/lane-out/${LANE}/${id}.scope.`, thread);
    }
    if (!fs.existsSync(scopeMark(id))) { log(`${id}: scope phase not done; left for the next start`); tried.add(id); continue; }
  }
  if (!PEOPLE && !doneIds().has(id)) {
    let problems = fs.existsSync(draft(id)) ? scopeProblems(id) : "";
    for (let n = 1; problems && thread && n <= FIX_ROUNDS; n++) {
      log(`${id}: scope check, fix round ${n} (${problems.split("\n").length} problem(s))`);
      thread = await session(SCOPE_FIX(id, problems), thread);
      problems = scopeProblems(id);
    }
    if (problems) log(`${id}: scope check left ${problems.split("\n").length} problem(s); answering anyway (the final validate checks the errors again)`);
    // The books by the key figures and key works the scope phase settled (Brandon, 2026-11-25).
    const before = new Set((startBooks.get(id) || []).map((b) => b.file));
    const after = fs.existsSync(draft(id)) ? (fetchBooks(id, draft(id)) || {}).books || [] : [];
    const added = bookList(after.filter((b) => !before.has(b.file)), id, "Books by the key figures and key works your scope phase listed are now downloaded too");
    thread = await session(thread ? ANSWER(id, added) : `Follow audits/PROMPT_LANE.md as lane \`${LANE}\`; your subject is \`${id}\`, and its draft exists.${booksAtStart(id)} ${ANSWER(id, added)}`, thread);
  }
  if (!thread && !doneIds().has(id)) thread = await session(START(id));
  for (let n = 1; !doneIds().has(id) && n <= RESUMES && timeLeft(); n++) {
    if (!thread) { log(`${id}: no session id; starting a new session`); thread = await session(START(id)); continue; }
    log(`resume ${id} (${n})`);
    thread = await session(RESUME(id), thread);
  }
  if (!doneIds().has(id) || !fs.existsSync(draft(id))) { log(`${id}: not done; left for the next start`); tried.add(id); continue; }
  exceptGap(id);
  let errors = errorsIn(["--dir", path.relative(ROOT, OUT)], id), rounds = 0;
  for (let n = 1; errors && n <= FIX_ROUNDS; n++) { log(`${id}: validator errors, fix round ${n}`); thread = await session(FIX(id, errors), thread); exceptGap(id); errors = errorsIn(["--dir", path.relative(ROOT, OUT)], id); rounds = n; }
  if (errors) { log(`${id}: still invalid after ${FIX_ROUNDS} rounds; draft left for review`); fs.renameSync(draft(id), path.join(OUT, `${id}.invalid.json`)); if (fs.existsSync(scopeMark(id))) fs.unlinkSync(scopeMark(id)); continue; }
  // The DONE line moves to INTEGRATED.txt, so a later pass on the same subject starts clean.
  const lines = fs.readFileSync(DONE, "utf8").split("\n"), line = lines.find((l) => lineId(l) === id);
  const name = integrate(id);
  fs.writeFileSync(DONE, lines.filter((l) => l !== line).join("\n"));
  fs.appendFileSync(path.join(OUT, "INTEGRATED.txt"), `${new Date().toISOString().slice(0, 10)} ${line}\n`);
  // The session writes its DONE line before any fix round, so after one its note on validate.js is out of date
  // (trotskyism, 2026-11-23: "still errors on one point ... left in" for an audit that passed in round 1).
  const fixed = rounds ? ` [validate.js passed after ${rounds} fix round${rounds > 1 ? "s" : ""}; the note below is from before]` : "";
  integrated.add(id);
  log(`done ${id} (${name})${fixed}: ${line.split("|").slice(1).join("|").trim()} | ${placement(id)}`);
  count++;
  if (PEOPLE && count % BOOKS_EVERY === 0) books();
  locked(() => push(false));
}
if (!PEOPLE && count) signal();
locked(() => push(true));
log("driver finished");
process.exit(0);
})();
