// Measures each statement against the question standard (audits/statements/STANDARD.md) using the
// ideology audits at the current statements version, and lists the candidate statements the
// audits found missing.
//   Test 2, contested: at least one audited ideology agrees and one disagrees, both stated
//     (high or medium confidence).
//   Test 3, contributes: removing the statement brings at least one pair of audited ideologies
//     closer than the salience bar (a typical test-taker's settled placement uncertainty), so the
//     test could no longer tell them apart. Distances are over all answers, in the same units as
//     the bar. With few audited ideologies most pairs are far apart and few statements pass; the
//     test is only decisive once neighboring ideologies are audited.
//   node scripts/statements-check.js [--json]
const fs = require("fs");
const path = require("path");
const { PROFILES_DIR, readJson, allStatements, statementsVersion, salienceBar } = require("./lib");

const statements = allStatements();
const version = statementsVersion();
const audits = fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".json"))
  .map((f) => readJson(path.join(PROFILES_DIR, f)))
  .filter((a) => a.statementsVersion === version && a.answers);

const bar = salienceBar(); // against the model in data.js, like the validator

const value = (a, id) => (a.answers[id] ? a.answers[id].value : 0);
const stated = (a, id) => a.answers[id] && a.answers[id].confidence !== "low";
const dist2 = (a, b, skip) => statements.reduce((s, q) => (q.id === skip ? s : s + (value(a, q.id) - value(b, q.id)) ** 2), 0);

const pairs = [];
for (let i = 0; i < audits.length; i++) for (let j = i + 1; j < audits.length; j++) pairs.push([audits[i], audits[j], dist2(audits[i], audits[j])]);

const rows = statements.map((q) => {
  const agree = audits.filter((a) => stated(a, q.id) && value(a, q.id) > 0).map((a) => a.id);
  const disagree = audits.filter((a) => stated(a, q.id) && value(a, q.id) < 0).map((a) => a.id);
  const keepsApart = pairs.filter(([a, b, d]) => d > bar * bar && dist2(a, b, q.id) <= bar * bar).map(([a, b]) => `${a.id}/${b.id}`);
  return { id: q.id, agree: agree.length, disagree: disagree.length, contested: agree.length > 0 && disagree.length > 0, keepsApart };
});

const candidates = audits.flatMap((a) => (a.missingStatements || []).map((m) => ({ from: a.id, ...m })));
const tooClose = pairs.filter(([, , d]) => d <= bar * bar).map(([a, b, d]) => `${a.id}/${b.id} (${Math.sqrt(d).toFixed(2)})`);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ version, audited: audits.map((a) => a.id), bar, statements: rows, tooClose, candidates }, null, 1));
} else {
  console.log(`${audits.length} audited ideologies at ${version}; salience bar ${bar.toFixed(2)}.\n`);
  const fail2 = rows.filter((r) => !r.contested);
  console.log(`Test 2, contested: ${rows.length - fail2.length}/${rows.length} pass. Not contested:`);
  for (const r of fail2) console.log(`  ${r.id}  (${r.agree} agree, ${r.disagree} disagree)`);
  const pass3 = rows.filter((r) => r.keepsApart.length);
  console.log(`\nTest 3, contributes: ${pass3.length}/${rows.length} keep some pair apart.`);
  for (const r of pass3) console.log(`  ${r.id}: ${r.keepsApart.join(", ")}`);
  console.log(`\nPairs already indistinguishable: ${tooClose.length ? tooClose.join(", ") : "none"}`);
  console.log(`\nCandidate statements from audits (${candidates.length}):`);
  for (const c of candidates) console.log(`  [${c.from} ${c.value > 0 ? "+" : ""}${c.value}] ${c.text}`);
}
