// Queue for the statement passes of new ideologies (audits/PROMPT_STATEMENTS.md), one at a time by
// page views. A writer (Codex) takes the next ideology, does the pass, and marks it done; a reviewer
// (Claude) reviews each done pass, adds the agreed statements to statements.json as candidates, and
// marks it reviewed. State lives in scratchpad/statement-pass/ (never committed):
//   <id>.claim     the writer is working on it      <id>.json      the pass (PROMPT_STATEMENTS.md)
//   <id>.done      the pass is finished             <id>.review.json  the reviewer's verdicts
// The queue is the catalog's new ideologies (entries with a "source") that have no audit yet.
//   node scripts/statement-pass.js next          the ideology to do now: an unfinished claim, else
//                                                claims the most-viewed one not started
//   node scripts/statement-pass.js done <id>     checks <id>.json and marks it done
//   node scripts/statement-pass.js status        done-but-unreviewed, reviewed, remaining
//   node scripts/statement-pass.js release <id>  drops a claim (to skip an ideology for now)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ROOT, readJson, catalog, profilePath, wordingMarks } = require("./lib");

const DIR = path.join(ROOT, "scratchpad", "statement-pass");
const f = (id, ext) => path.join(DIR, id + ext);
const has = (id, ext) => fs.existsSync(f(id, ext));
const queue = () => catalog().filter((e) => e.source && !fs.existsSync(profilePath(e.id)))
  .sort((a, b) => (b.views12m || 0) - (a.views12m || 0));
const show = (e) => `${e.id}\t${e.name}\t${e.wikipedia || ""}`;

const [cmd, id] = process.argv.slice(2);
fs.mkdirSync(DIR, { recursive: true });
if (cmd === "next") {
  const q = queue();
  const open = q.find((e) => has(e.id, ".claim") && !has(e.id, ".done"));
  const e = open || q.find((x) => !has(x.id, ".claim") && !has(x.id, ".done") && !has(x.id, ".json"));
  if (!e) { console.log("NONE: every new ideology has a statement pass."); process.exit(0); }
  if (!open) fs.writeFileSync(f(e.id, ".claim"), new Date().toISOString() + "\n");
  console.log(show(e));
  console.log(`${open ? "Resume" : "Claimed"}: do the pass in audits/PROMPT_STATEMENTS.md for ${e.id}, then ` +
    `node scripts/statement-pass.js done ${e.id}`);
} else if (cmd === "done") {
  if (!id) throw new Error("usage: done <id>");
  const j = readJson(f(id, ".json"));
  const problems = [];
  if (j.id !== id) problems.push(`id is "${j.id}", expected "${id}"`);
  if (!Array.isArray(j.definingPositions) || !j.definingPositions.length) problems.push("no definingPositions");
  if (!Array.isArray(j.proposals)) problems.push("no proposals array (use [] for none)");
  for (const p of j.proposals || []) {
    const s = p.statement || {};
    for (const k of ["id", "theme", "text", "agree", "disagree", "note", "icon"]) if (!s[k]) problems.push(`${s.id || "?"}: no ${k}`);
    if ((p.quotes || []).length < 2) problems.push(`${s.id}: fewer than two quotes (rule of two: at least two from separate places)`);
    const errs = s.text ? wordingMarks(s.text).errors : [];
    if (errs.includes("and")) problems.push(`${s.id}: wording error ("and"): reword; "and" can't be explained in "wordingOk" (Brandon, 2026-11-10)`);
    else if (errs.length && !p.wordingOk) problems.push(`${s.id}: wording error (${errs.join(", ")}): reword, or explain in the proposal's "wordingOk"`);
  }
  const lib = path.join(ROOT, "scratchpad", "sources", id, "index.json");
  if (!fs.existsSync(lib)) problems.push(`no library index ${path.relative(ROOT, lib)}`);
  if (problems.length) { console.log("Not marked done:\n  " + problems.join("\n  ")); process.exit(1); }
  console.log(execFileSync("node", [path.join(ROOT, "scripts", "statements-check.js"), "--wording", f(id, ".json")], { encoding: "utf8" }).trim());
  fs.writeFileSync(f(id, ".done"), new Date().toISOString() + "\n");
  console.log(`Done: ${id} (${j.proposals.length} proposals). Next: node scripts/statement-pass.js next`);
} else if (cmd === "release") {
  if (!id) throw new Error("usage: release <id>");
  fs.rmSync(f(id, ".claim"), { force: true });
  console.log(`Released ${id}.`);
} else if (cmd === "status") {
  const q = queue();
  const done = q.filter((e) => has(e.id, ".json") && (has(e.id, ".done") || !has(e.id, ".claim")));
  const unreviewed = done.filter((e) => !has(e.id, ".review.json"));
  const working = q.filter((e) => has(e.id, ".claim") && !has(e.id, ".done"));
  console.log(`${q.length} new ideologies: ${done.length} passes done (${unreviewed.length} awaiting review), ` +
    `${working.length} in progress, ${q.length - done.length - working.length} not started.`);
  for (const e of unreviewed) console.log(`  review: ${e.id}`);
  for (const e of working) console.log(`  working: ${e.id}`);
} else {
  console.log("usage: node scripts/statement-pass.js next | done <id> | status | release <id>");
}
