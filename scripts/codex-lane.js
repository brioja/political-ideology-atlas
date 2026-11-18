// Drives a Codex lane (audits/PROMPT_LANE.md) one subject at a time with `codex exec`, so the loop lives here and not
// in Codex's judgment: Codex ends its turn at natural report points (Brandon, 2026-11-18), so a prompt that says "go
// back to step 1" isn't enough. For each subject: start a Codex session on it; when that session ends, the subject
// is done once its id has a line in DONE.txt; otherwise resume the same session. The lane's own unfinished drafts
// come first, then `next.js --lane`.
//   node scripts/codex-lane.js --until 18:45 [--lane codex] [--kind people|ideologies] [--resumes 6]
// --until: no new subject or resume starts after this local time (a running session finishes its turn).
// Log: scratchpad/lane-out/<lane>/driver.log.
const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const LANE = arg("--lane", "codex"), KIND = arg("--kind", "people"), RESUMES = +arg("--resumes", 6);
const UNTIL = arg("--until");
if (!/^\d\d:\d\d$/.test(UNTIL || "")) { console.error("usage: node scripts/codex-lane.js --until HH:MM [--lane codex] [--kind people|ideologies]"); process.exit(1); }
const deadline = new Date(); deadline.setHours(+UNTIL.slice(0, 2), +UNTIL.slice(3), 0, 0);
const OUT = path.join(ROOT, "scratchpad", "lane-out", LANE), DONE = path.join(OUT, "DONE.txt"), LOG = path.join(OUT, "driver.log");
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => { const l = `${new Date().toTimeString().slice(0, 8)} ${m}`; console.log(l); fs.appendFileSync(LOG, l + "\n"); };
const timeLeft = () => Date.now() < deadline.getTime();
const doneIds = () => new Set((fs.existsSync(DONE) ? fs.readFileSync(DONE, "utf8") : "").split("\n").map((l) => l.split("|")[0].trim()).filter(Boolean));
const flag = KIND === "people" ? "--people" : "";

// The lane's own drafts without a DONE line, of this kind, then the next subject from next.js.
function nextSubject() {
  const done = doneIds(), lib = require("./lib");
  const people = new Set(lib.peopleCatalog().map((p) => p.id));
  for (const f of fs.readdirSync(OUT)) {
    const id = f.endsWith(".json") ? f.slice(0, -5) : null;
    if (id && !done.has(id) && (KIND === "people") === people.has(id)) return id;
  }
  // The serial run (AGENTS.md) works on next.js's first subject and leaves no lane draft, so the lane passes over that
  // subject and any audit with uncommitted changes (the serial run's subject once its agent has started writing).
  // Greta Thunberg and Annie Besant were audited twice on 2026-11-18 before this.
  const next = (skip) => {
    const args = [path.join(__dirname, "next.js"), `--${KIND}`, "--lane", ...(skip.length ? ["--skip", skip.join(",")] : [])];
    const j = JSON.parse(execFileSync("node", args, { cwd: ROOT, maxBuffer: 1 << 26 }).toString() || "null");
    return j && j.id;
  };
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "audits/people", "audits/profiles"], { cwd: ROOT }).toString()
    .split("\n").map((l) => (l.slice(3).match(/([^/]+)\.json$/) || [])[1]).filter(Boolean);
  const serial = next(dirty);
  return serial ? next([...dirty, serial]) : null;
}

const START = (id) => `Follow audits/PROMPT_LANE.md as lane \`${LANE}\`. Your subject is \`${id}\`. Audit it into scratchpad/lane-out/${LANE}/${id}.json, saving after every statement you answer; if that draft exists, carry on from it. When every statement has an answer, validate with \`node scripts/validate.js ${flag} --dir scratchpad/lane-out/${LANE} ${id}\` and fix every error the uncertainty rule aside. Then add one line to scratchpad/lane-out/${LANE}/DONE.txt: \`${id} | <known answers> | <uncertainty result>\`.`;
const RESUME = (id) => `Go on with \`${id}\` where you left off, through to its line in scratchpad/lane-out/${LANE}/DONE.txt.`;

// Runs codex exec (new session, or resume of `thread`); returns the session id.
function codex(prompt, thread) {
  const common = ["--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox"];
  const args = thread ? ["exec", "resume", ...common, thread, prompt] : ["exec", ...common, "-C", ROOT, prompt];
  const r = spawnSync("codex", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
  let id = thread;
  for (const line of (r.stdout || "").split("\n")) {
    try { const e = JSON.parse(line); if (e.type === "thread.started") id = e.thread_id; } catch {}
  }
  if (r.status) log(`codex exited ${r.status}: ${(r.stderr || "").trim().split("\n").pop()}`);
  return id;
}

while (timeLeft()) {
  const id = nextSubject();
  if (!id) { log("queue empty"); break; }
  log(`start ${id}`);
  let thread = codex(START(id));
  for (let n = 1; !doneIds().has(id) && n <= RESUMES && timeLeft(); n++) {
    if (!thread) { log(`${id}: no session id to resume; starting a new session`); thread = codex(START(id)); continue; }
    log(`resume ${id} (${n})`);
    thread = codex(RESUME(id), thread);
  }
  if (!doneIds().has(id)) { log(`${id}: not done after ${RESUMES} resumes or at the deadline; left for the next run`); break; }
  log(`done ${id}: ${fs.readFileSync(DONE, "utf8").split("\n").find((l) => l.startsWith(id))}`);
}
log("driver finished");
