// Checks each statement against the question standard (audits/statements/STANDARD.md) using the
// ideology audits, and lists the candidate statements the audits have proposed.
//   Contested: at least one audited ideology agrees and one disagrees, both stated (high or
//   medium confidence, not inferred). Candidates that pass are ready to be made active.
//   Proposals: each audit's missingStatements not yet added to statements.json or declined.
//   node scripts/statements-check.js [--json]
const fs = require("fs");
const path = require("path");
const { PROFILES_DIR, readJson, allStatements, isCandidate } = require("./lib");

const statements = allStatements();
const audits = fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".json"))
  .map((f) => readJson(path.join(PROFILES_DIR, f))).filter((a) => a.answers);

const stated = (a, id) => a.answers[id] && a.answers[id].confidence !== "low";
const rows = statements.map((q) => {
  const agree = audits.filter((a) => stated(a, q.id) && a.answers[q.id].value > 0).length;
  const disagree = audits.filter((a) => stated(a, q.id) && a.answers[q.id].value < 0).length;
  const answered = audits.filter((a) => a.answers[q.id]).length;
  return { id: q.id, candidate: isCandidate(q), agree, disagree, answered, contested: agree > 0 && disagree > 0 };
});
const proposed = audits.flatMap((a) => (a.missingStatements || []).map((m) => ({ from: a.id, ...m })));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ audited: audits.length, statements: rows, proposed }, null, 1));
  process.exit(0);
}
const line = (r) => `  ${r.id}  (${r.agree} agree, ${r.disagree} disagree, answered by ${r.answered}/${audits.length})`;
console.log(`${audits.length} audited ideologies.\n`);
const active = rows.filter((r) => !r.candidate);
const notContested = active.filter((r) => !r.contested);
console.log(`Active statements: ${active.length - notContested.length}/${active.length} contested.`);
if (notContested.length) console.log(`Not yet contested:\n${notContested.map(line).join("\n")}`);
const cands = rows.filter((r) => r.candidate);
if (cands.length) {
  const ready = cands.filter((r) => r.contested);
  console.log(`\nCandidates: ${ready.length}/${cands.length} contested and ready to make active.`);
  if (ready.length) console.log(`Ready:\n${ready.map(line).join("\n")}`);
  const waiting = cands.filter((r) => !r.contested);
  if (waiting.length) console.log(`Waiting:\n${waiting.map(line).join("\n")}`);
}
// Each proposal is marked once handled: "addedAs" (the statement id it became, or merged into) or
// "declined" (why not), so the record shows where every statement came from.
const open = proposed.filter((c) => !c.addedAs && !c.declined);
console.log(`\nProposed by audits: ${proposed.length}, ${open.length} not yet handled.`);
for (const c of open) console.log(`  [${c.from} ${c.value > 0 ? "+" : ""}${c.value}] ${c.text}`);
