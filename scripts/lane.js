// Audit lane driver: runs Codex or Claude (Sonnet) headless, one subject per session, and integrates each finished
// audit itself, so tokens go to research only (Brandon, 2026-11-18: the Codex driver got through a lot with few tokens;
// the same for Sonnet). Several lanes can run at once in this checkout, e.g. one per engine or per kind.
//   node scripts/lane.js --engine codex|claude [--kind people|ideologies] [--lane <name>] [--until HH:MM] [--resumes 6] [--dry]
// --lane defaults to <engine>-<kind>, so one lane per engine and kind runs with no --lane (Brandon, 2026-11-19); --until stops new subjects and resumes after that local time (default: run until
// the queue is empty or the driver is stopped; a stop mid-subject keeps the draft, which the next start carries on).
// Graceful stop: Ctrl-C or Ctrl-D in the driver's terminal, or `touch scratchpad/lane-out/<lane>/STOP` (or
// scratchpad/lane-out/STOP for all lanes), ends the run after the current subject, with the final signal step and push;
// the file needs no cleanup. A second Ctrl-C quits at once, stopping the session; its draft is kept for the next start.
// Children run in their own process groups, so the terminal's Ctrl-C reaches only the driver.
//
// Per subject:
//  1. Pick: the lane's own unfinished drafts first, then `next.js --lane`, passing over subjects other lanes have
//     claimed (scratchpad/lane-out/*/<id>.claim, written at once) and the serial-audits run's subject (next.js's first
//     pick, and any audit with uncommitted changes). Greta Thunberg and Annie Besant were audited twice before this.
//  2. Audit: a new session with START, resumed with RESUME until the subject has its DONE.txt line. The session
//     ends its turn at natural report points, so the loop lives here.
//  3. Integrate (under a lock shared by all lanes): validate (errors other than the uncertainty rule go back to the
//     session to fix), move the draft into audits/, merge an ideology's color, build, test, commit with no attribution
//     line. Pushes go out at most every PUSH_MINUTES (bursts cancel Pages deploys) and when the driver stops.
// Between subjects the scripts the serial-audits workflow ran: for people, prefetch-books.js and triage.js every
// BOOKS_EVERY people; for ideologies, statement-signal.js --apply every SIGNAL_EVERY ideologies and at the end.
// Log: scratchpad/lane-out/<lane>/driver.log, one line per step; integrated subjects in INTEGRATED.txt.
const { spawn, spawnSync, execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const ENGINE = arg("--engine"), KIND = arg("--kind", "people"), LANE = arg("--lane", `${ENGINE}-${KIND}`), RESUMES = +arg("--resumes", 6);
const UNTIL = arg("--until");
if (!["codex", "claude"].includes(ENGINE) || !["people", "ideologies"].includes(KIND) || (UNTIL && !/^\d\d:\d\d$/.test(UNTIL))) {
  console.error("usage: node scripts/lane.js --engine codex|claude [--kind people|ideologies] [--lane name] [--until HH:MM] [--resumes 6]");
  process.exit(1);
}
const PEOPLE = KIND === "people", PUSH_MINUTES = 10, BOOKS_EVERY = 5, SIGNAL_EVERY = 5, FIX_ROUNDS = 3;
const deadline = UNTIL ? (() => { const d = new Date(); d.setHours(+UNTIL.slice(0, 2), +UNTIL.slice(3), 0, 0); return d.getTime(); })() : Infinity;
const timeLeft = () => Date.now() < deadline;
// Graceful stop: touch scratchpad/lane-out/<lane>/STOP (this lane) or scratchpad/lane-out/STOP (every lane). The
// driver finishes its current subject, runs the end-of-run steps and pushes. Only files touched after it started count.
const STARTED = Date.now();
let stopping = false, child = null;
const stopRequested = () => stopping || [path.join(OUT, "STOP"), path.join(LANES, "STOP")].some((f) => { try { return fs.statSync(f).mtimeMs >= STARTED; } catch { return false; } });
const LANES = path.join(ROOT, "scratchpad", "lane-out"), OUT = path.join(LANES, LANE);
const DONE = path.join(OUT, "DONE.txt"), LOG = path.join(OUT, "driver.log"), LOCK = path.join(LANES, ".integrate.lock");
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
const draft = (id) => path.join(OUT, `${id}.json`);
const flag = PEOPLE ? "--people " : "";

// ---- picking ----
const tried = new Set(); // subjects this run already gave up on (not done after every resume)
function nextSubject() {
  const done = doneIds(), lib = require("./lib");
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
  // next.js --lane passes over every lane's drafts and claims.
  const serial = next(dirty);
  return serial ? next([...dirty, serial]) : null;
}

// ---- sessions ----
const COLOR = (id) => PEOPLE ? "" : ` If audits/ideology-colors.json has no entry for \`${id}\`, write one to scratchpad/lane-out/${LANE}/${id}.color.json following CONTRIBUTING.md "Ideology colors" (the format of that file's entries).`;
const START = (id) => `Follow audits/PROMPT_LANE.md as lane \`${LANE}\`. Your subject is \`${id}\`. Audit it into scratchpad/lane-out/${LANE}/${id}.json, saving after every statement you answer; if that draft exists, carry on from it. When every statement has an answer, validate with \`node scripts/validate.js ${flag}--dir scratchpad/lane-out/${LANE} ${id}\` and fix every error.${COLOR(id)} Then add one line to scratchpad/lane-out/${LANE}/DONE.txt: \`${id} | <known answers> | <uncertainty result>\`.`;
const RESUME = (id) => `Go on with \`${id}\` where you left off, through to its line in scratchpad/lane-out/${LANE}/DONE.txt.`;
const FIX = (id, errors) => `Integration found these validator errors in scratchpad/lane-out/${LANE}/${id}.json:\n${errors}\nFix them, validate again with \`node scripts/validate.js ${flag}--dir scratchpad/lane-out/${LANE} ${id}\`, and reply.`;

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
  if (r.status) log(`${ENGINE} exited ${r.status}: ${(r.stderr || "").trim().split("\n").pop()}`);
  return id;
}

// ---- integration ----
function locked(fn) {
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(LOCK); break; } catch {
      // A lock older than 30 minutes is left from a killed driver.
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 30 * 60000) { fs.rmdirSync(LOCK); continue; } } catch {}
      execFileSync("sleep", ["5"], { detached: true });
    }
  }
  try { return fn(); } finally { fs.rmdirSync(LOCK); }
}
// Validator errors other than the uncertainty rule, or "" when only that (or nothing) fails.
function errorsIn(dirArgs, id) {
  const r = run("node", ["scripts/validate.js", ...(PEOPLE ? ["--people"] : []), ...dirArgs, id]);
  if (r.status === 0 || r.status === 2) return "";
  return (r.stdout + r.stderr).split("\n").filter((l) => /error/.test(l)).join("\n") || (r.stdout + r.stderr).trim();
}
let lastPush = 0, unpushed = false;
function push(force) {
  if (!unpushed || (!force && Date.now() - lastPush < PUSH_MINUTES * 60000)) return;
  git("fetch", "-q", "origin");
  // --autostash: someone else's uncommitted edits in this checkout (the integrator recording books, 2026-11-20) are
  // set aside for the rebase and put back, instead of failing every push. If putting them back conflicts, git keeps
  // them in the stash list and leaves the tree clean; the log says so.
  const rb = git("rebase", "-q", "--autostash", "origin/main");
  if (rb.status) { git("rebase", "--abort"); log(`push: rebase failed, left for the next push: ${rb.stderr.trim().split("\n").pop()}`); return; }
  if (/autostash resulted in conflicts/i.test(rb.stderr + rb.stdout)) log("push: uncommitted edits in the checkout conflicted with the rebase; they are in `git stash list`");
  const p = git("push", "-q", "origin", "HEAD:main");
  if (p.status) { log(`push failed: ${p.stderr.trim().split("\n").pop()}`); return; }
  lastPush = Date.now(); unpushed = false; log("pushed");
}
const GENERATED = ["data.js", "people.js", "img", "audits/lines.json", "audits/statements/texts.json", "audits/share-slots.json", "audits/people-catalog.json", "audits/catalog.json"];
function buildAndCommit(message, extra = []) {
  const build = PEOPLE ? [["scripts/images.js"], ["scripts/build.js", "--people"]] : [["scripts/build.js"]];
  for (const b of build) { const r = run("node", b); if (r.status) return `build failed: ${(r.stderr || r.stdout).trim().split("\n").pop()}`; }
  const t = run("node", ["test.js", ...(PEOPLE ? ["--people"] : [])]);
  if (t.status) { git("checkout", "--", ...GENERATED.filter((f) => fs.existsSync(path.join(ROOT, f)))); return `tests failed: ${(t.stdout + t.stderr).trim().split("\n").slice(-3).join(" / ")}`; }
  git("add", "--", ...extra, ...GENERATED.filter((f) => fs.existsSync(path.join(ROOT, f))));
  if (git("diff", "--cached", "--quiet").status) { git("commit", "-q", "-m", message); unpushed = true; }
  return "";
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
    git("add", "--", ...files);
    git("commit", "-q", "-m", `Audit ${name}`);
    unpushed = true;
    const why = buildAndCommit(PEOPLE ? "Rebuild people data" : "Rebuild site data");
    if (why) log(`${id}: ${why}; audit committed, generated files left for the next build`);
    for (const f of [draft(id), colorFile, path.join(OUT, `${id}.claim`)]) if (fs.existsSync(f)) fs.unlinkSync(f);
    return name;
  });
}

// ---- between subjects (the serial-audits workflow's other phases) ----
function books() {
  const r = run("node", ["scripts/prefetch-books.js", "--next", String(BOOKS_EVERY * 3)]);
  log(`books: ${(r.stdout || r.stderr).trim().split("\n").pop()}`);
  locked(() => {
    const t = run("node", ["scripts/triage.js"]);
    log(`triage: ${(t.stdout || t.stderr).trim().split("\n").pop()}`);
    git("add", "audits/people-triage.json");
    if (git("diff", "--cached", "--quiet").status) { git("commit", "-q", "-m", "Triage: refit on the latest people audits"); unpushed = true; }
  });
}
function signal() {
  locked(() => {
    const r = run("node", ["scripts/statement-signal.js", "--apply"]);
    const tail = (r.stdout || "").trim().split("\n").filter((l) => /^(Promoted|Demoted)/.test(l));
    log(`signal: ${tail.join("; ") || (r.stderr || "").trim().split("\n").pop()}`);
    if (git("diff", "--quiet", "--", "statements.json").status) {
      const why = buildAndCommit(`Statements: promote/demote by signal on the real lines\n\n${tail.join("\n")}`, ["statements.json"]);
      if (why) { git("checkout", "--", "statements.json"); log(`signal: ${why}; statements.json restored`); }
    }
  });
}

// ---- main loop ----
// --dry: print the subject this lane would take and exit.
if (process.argv.includes("--dry")) { console.log(nextSubject()); process.exit(0); }
(async () => {
let count = 0;
if (PEOPLE) books();
while (timeLeft()) {
  if (stopRequested()) { log("stopping before the next subject"); break; }
  const id = nextSubject();
  if (!id) { log("queue empty"); break; }
  fs.writeFileSync(path.join(OUT, `${id}.claim`), `${new Date().toISOString()}\n`);
  log(`start ${id}`);
  let thread = doneIds().has(id) ? null : await session(START(id));
  for (let n = 1; !doneIds().has(id) && n <= RESUMES && timeLeft(); n++) {
    if (!thread) { log(`${id}: no session id; starting a new session`); thread = await session(START(id)); continue; }
    log(`resume ${id} (${n})`);
    thread = await session(RESUME(id), thread);
  }
  if (!doneIds().has(id) || !fs.existsSync(draft(id))) { log(`${id}: not done; left for the next start`); tried.add(id); continue; }
  let errors = errorsIn(["--dir", path.relative(ROOT, OUT)], id);
  for (let n = 1; errors && n <= FIX_ROUNDS; n++) { log(`${id}: validator errors, fix round ${n}`); thread = await session(FIX(id, errors), thread); errors = errorsIn(["--dir", path.relative(ROOT, OUT)], id); }
  if (errors) { log(`${id}: still invalid after ${FIX_ROUNDS} rounds; draft left for review`); fs.renameSync(draft(id), path.join(OUT, `${id}.invalid.json`)); continue; }
  // The DONE line moves to INTEGRATED.txt, so a later pass on the same subject starts clean.
  const lines = fs.readFileSync(DONE, "utf8").split("\n"), line = lines.find((l) => lineId(l) === id);
  const name = integrate(id);
  fs.writeFileSync(DONE, lines.filter((l) => l !== line).join("\n"));
  fs.appendFileSync(path.join(OUT, "INTEGRATED.txt"), `${new Date().toISOString().slice(0, 10)} ${line}\n`);
  log(`done ${id} (${name}): ${line.split("|").slice(1).join("|").trim()}`);
  count++;
  if (PEOPLE && count % BOOKS_EVERY === 0) books();
  if (!PEOPLE && count % SIGNAL_EVERY === 0) signal();
  locked(() => push(false));
}
if (!PEOPLE && count % SIGNAL_EVERY) signal();
locked(() => push(true));
log("driver finished");
process.exit(0);
})();
