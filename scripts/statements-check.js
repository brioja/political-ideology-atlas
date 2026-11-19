// Checks each statement against the question standard (audits/statements/STANDARD.md) using the
// ideology audits, and lists the audits' open missing statements.
//   Signal (test 2): the real lines predict a candidate's answers better than shuffled answers
//   (scripts/statement-signal.js). Candidates that pass are ready to be made active. Agree and
//   disagree counts are shown for reference only.
//   Missing statements: each audit's missingStatements not yet added to statements.json or declined.
//   node scripts/statements-check.js [--json]
//   node scripts/statements-check.js --wording [file.json ...]
//     Test 3: marks wording in candidate statements, or in the statements of proposal or review
//     files (statement-pass and Codex review JSON), at two levels (lists and reasons in lib.js WORDING).
//     Errors are absolute and always need rewording (Brandon, 2026-11-10): "can"/"may" (a permission is almost always trivially true:
//     "a monarch can be a good ruler"), "rather" ("X rather than Y" asks two things, so a disagree is
//     ambiguous), "so"/"because" (a reason: the bank asks positions), "as well as"/"not only" (a
//     comparison slips in a second claim), "and" (two claims joined, or a list a general word would replace),
//     "or" (options: an audit can't answer it; Brandon, 2026-11-11), hedges ("sometimes", "at times", "occasionally",
//     "in some cases": almost anyone agrees; Brandon, 2026-11-19).
//     Warnings are often fine: "like", "by"/"through" (a means attached to a goal is hard to
//     negate; a passive "chosen by voters" is fine), "in" (a vague scope: "in economic life"), "not" (state
//     the positive position instead, where one exists).
//     Report only; statement-pass.js done refuses unexplained errors.
//     --all also marks the active statements (reference only: a new meaning needs a new id; a reader fix keeps the id, see scripts/lib.js).
//   node scripts/statements-check.js --explanations [--all]
//     Lists agree and disagree sentences that only restate the statement (lib.js restateSimilarity at or above
//     RESTATE_LIMITS), active statements in quiz order, then candidates with --all. "What does this mean?" shows
//     them, so a restatement explains nothing (Brandon, 2026-11-15). Report only: the plain negation is an
//     allowed fallback for disagree (STANDARD.md "Explanations").
const fs = require("fs");
const path = require("path");
const { PROFILES_DIR, readJson, allStatements, isCandidate, quizOrder, restateSimilarity, RESTATE_LIMITS, restatedParts, WORDING, COMPARATIVES, wordingRe, wordingMarks, wordingReason } = require("./lib");

if (process.argv.includes("--explanations")) {
  const byId = new Map(allStatements().map((s) => [s.id, s]));
  const ordered = quizOrder();
  const list = [...ordered, ...[...byId.keys()].filter((id) => !ordered.includes(id))].map((id) => byId.get(id))
    .filter((s) => s && (process.argv.includes("--all") || !isCandidate(s)));
  const count = { agree: 0, disagree: 0, mirror: 0 };
  for (const s of list) {
    const hits = restatedParts(s);
    if (!hits.length) continue;
    hits.forEach(([k]) => count[k]++);
    console.log(`  ${s.id}${isCandidate(s) ? " (candidate)" : ""}: ${s.text}`);
    for (const [k, v] of hits) console.log(`      ${k} ${Math.round(v * 100)}%: ${k === "mirror" ? `disagree repeats agree: ${s.disagree}` : s[k]}`);
  }
  console.log(`\n${list.length} statements: ${count.agree} agree and ${count.disagree} disagree sentences restate the statement, ${count.mirror} disagree sentences repeat the agree ` +
    `(content words shared: agree ${Math.round(RESTATE_LIMITS.agree * 100)}%+, disagree ${Math.round(RESTATE_LIMITS.disagree * 100)}%+, disagree against agree ${Math.round(RESTATE_LIMITS.mirror * 100)}%+). ` +
    `An agree should help a reader see the position in other words; a disagree should be a clean positive opposite where one exists (STANDARD.md "Explanations").`);
  process.exit(0);
}

if (process.argv.includes("--wording")) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  // Statements in a proposal file ({proposals: [{statement}]}), a review file ([{statement}]) or an
  // audit file (its open missingStatements). Errors are absolute: a "wordingOk" field no longer excuses one.
  const fromFile = (f) => {
    const j = readJson(path.resolve(f));
    const items = Array.isArray(j) ? j : j.missingStatements
      ? j.missingStatements.filter((m) => !m.addedAs && !m.declined)
        .map((m, i) => ({ statement: { id: `missing[${i}]`, text: m.text }, wordingOk: m.wordingOk }))
      : j.proposals || [];
    return items.filter((x) => x.statement && x.statement.text)
      .map((x) => ({ ...x.statement, wordingOk: x.wordingOk, from: path.basename(f) }));
  };
  const list = files.length ? files.flatMap(fromFile)
    : allStatements().filter((s) => process.argv.includes("--all") || isCandidate(s));
  let errors = 0, warnings = 0;
  for (const s of list) {
    const m = wordingMarks(s.text);
    if (!m.errors.length && !m.warnings.length) continue;
    // Errors are absolute (Brandon, 2026-11-10): no explanation excuses one; reword.
    const level = m.errors.length ? "ERROR" : "warning";
    if (m.errors.length) errors++; else warnings++;
    const words = [...m.errors, ...m.warnings].filter((w) => /^[a-z ]+$/i.test(w) && w !== "second sentence");
    const marked = s.text.replace(wordingRe(words), (w) => `**${w.toUpperCase()}**`).replace(/;/g, "**;**")
      .replace(/([.!?])(\s+\S)/g, m.warnings.includes("second sentence") ? "$1**|**$2" : "$1$2");
    console.log(`  ${level}: ${s.from ? `[${s.from}] ` : ""}${s.id}: ${marked}`);
    for (const w of m.errors) console.log(`      error "${w}": ${wordingReason(w)}`);
    for (const w of m.warnings) console.log(`      warning "${w}": ${wordingReason(w)}`);
  }
  console.log(`\n${list.length} statements: ${errors} with errors (${WORDING.errors.map((w) => `"${w}"`).join(", ")}, ` +
    `";": always reword), ${warnings} with warnings (${WORDING.warnings.map((w) => `"${w}"`).join(", ")}, ${COMPARATIVES.map((w) => `"${w}"`).join("/")} with no later "than", a second sentence: ` +
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
  return { id: q.id, candidate: isCandidate(q), agree, disagree, answered };
});
const missing = audits.flatMap((a) => (a.missingStatements || []).map((m) => ({ from: a.id, ...m })));

if (process.argv.includes("--json")) {
  // Exit only once stdout is flushed: a piped output longer than 64 KB is cut off otherwise.
  process.stdout.write(JSON.stringify({ audited: audits.length, statements: rows, missing }, null, 1) + "\n", () => process.exit(0));
  return;
}
const line = (r) => `  ${r.id}  (${r.agree} agree, ${r.disagree} disagree, answered by ${r.answered}/${audits.length})`;
console.log(`${audits.length} audited ideologies.\n`);
const cands = rows.filter((r) => r.candidate);
if (cands.length) {
  // Test 2 (audits/statements/STANDARD.md): signal on the real lines, scripts/statement-signal.js.
  const sig = new Map(require("./statement-signal").signal({ candidatesOnly: true }).map((r) => [r.id, r]));
  const sline = (r) => { const g = sig.get(r.id); return `${line(r)}  R² ${g.r2.toFixed(2)} vs noise ${g.bar.toFixed(2)}`; };
  const ready = cands.filter((r) => sig.get(r.id).signal);
  console.log(`\nCandidates: ${ready.length}/${cands.length} carry signal on the real lines and are ready to make active.`);
  if (ready.length) console.log(`Ready:\n${ready.map(sline).join("\n")}`);
  const waiting = cands.filter((r) => !sig.get(r.id).signal);
  if (waiting.length) console.log(`Waiting:\n${waiting.map(sline).join("\n")}`);
}
console.log("\nActive statements are checked by `node scripts/statement-signal.js` (minutes): any without signal is demoted.");
// Each missing statement is marked once handled: "addedAs" (the statement id it became, or merged into) or
// "declined" (why not), so the record shows where every statement came from.
const open = missing.filter((c) => !c.addedAs && !c.declined);
console.log(`\nMissing statements in audits: ${missing.length}, ${open.length} not yet handled.`);
for (const c of open) console.log(`  [${c.from} ${c.value > 0 ? "+" : ""}${c.value}] ${c.text}`);
