// Checks each statement against the question standard (audits/statements/STANDARD.md) using the
// ideology audits, and lists the candidate statements the audits have proposed.
//   Contested: at least one audited ideology agrees and one disagrees, both stated (high or
//   medium confidence, not inferred). Candidates that pass are ready to be made active.
//   Proposals: each audit's missingStatements not yet added to statements.json or declined.
//   node scripts/statements-check.js [--json]
//   node scripts/statements-check.js --wording [file.json ...]
//     Test 3: marks wording in candidate statements, or in the statements of proposal or review
//     files (statement-pass and Codex review JSON), at two levels (lists and reasons in lib.js WORDING).
//     Errors almost always mean a defect: "can"/"may" (a permission is almost always trivially true:
//     "a monarch can be a good ruler"), "rather" ("X rather than Y" asks two things, so a disagree is
//     ambiguous), "so"/"because" (a reason: the bank asks positions), "as well as"/"not only" (a
//     comparison slips in a second claim). Warnings are often fine: "and"/"or" (a list of things is
//     one claim; two claims joined fail), "like", "by"/"through" (a means attached to a goal is hard to
//     negate; a passive "chosen by voters" is fine), "in" (a vague scope: "in economic life").
//     Report only; statement-pass.js done refuses unexplained errors.
//     --all also marks the active statements (reference only: rewording them needs new ids).
const fs = require("fs");
const path = require("path");
const { PROFILES_DIR, readJson, allStatements, isCandidate, WORDING, wordingRe, wordingMarks } = require("./lib");

if (process.argv.includes("--wording")) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  // Statements in a proposal file ({proposals: [{statement}]}) or a review file ([{statement}]). A
  // proposal's "wordingOk" field explains why an error-level word is right there (e.g. "can" in "cannot").
  const fromFile = (f) => {
    const j = readJson(path.resolve(f));
    const items = Array.isArray(j) ? j : j.proposals || [];
    return items.filter((x) => x.statement && x.statement.text)
      .map((x) => ({ ...x.statement, wordingOk: x.wordingOk, from: path.basename(f) }));
  };
  const list = files.length ? files.flatMap(fromFile)
    : allStatements().filter((s) => process.argv.includes("--all") || isCandidate(s));
  let errors = 0, warnings = 0;
  for (const s of list) {
    const m = wordingMarks(s.text);
    if (!m.errors.length && !m.warnings.length) continue;
    const level = m.errors.length ? (s.wordingOk ? "error (explained)" : "ERROR") : "warning";
    if (m.errors.length && !s.wordingOk) errors++; else warnings++;
    const marked = s.text.replace(wordingRe([...m.errors, ...m.warnings]), (w) => `**${w.toUpperCase()}**`);
    console.log(`  ${level}: ${s.from ? `[${s.from}] ` : ""}${s.id}: ${marked}${s.wordingOk ? ` (${s.wordingOk})` : ""}`);
  }
  console.log(`\n${list.length} statements: ${errors} with errors (${WORDING.errors.map((w) => `"${w}"`).join(", ")}: ` +
    `reword, or explain in the proposal's "wordingOk"), ${warnings} with warnings (${WORDING.warnings.map((w) => `"${w}"`).join(", ")}: ` +
    `check against test 3 in audits/statements/STANDARD.md: two claims joined, a list where one general word would do, ` +
    `a means instead of a position, a vague scope).`);
  process.exit(0);
}

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
