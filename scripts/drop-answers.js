#!/usr/bin/env node
// Remove every audit's answers to statements no longer in the bank (dropped, or renamed to a new id), and
// record it in the audit's "reviews" as { "kind": "dropped", "reviewer", "reviewedAt", "statements", "nulled" }.
// "nulled" counts the nullings in the removed answers' reviewHistory, so the nulling reviews still add up
// (validate.js). Run it after dropping or renaming a statement. Nothing reads these answers: the matching, quiz
// and pages use only the bank, and git keeps the old versions (Brandon, 2026-11-18).
//
//   node scripts/drop-answers.js [--reviewer <id>] [--dry-run]
const fs = require("fs");
const path = require("path");
const { ROOT, allStatements } = require("./lib");

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const reviewer = arg("--reviewer", "claude-opus-5-5");
const dry = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);
const bank = new Set(allStatements().map((s) => s.id));

const nullings = (x) => {
  const h = x && Array.isArray(x.reviewHistory) ? x.reviewHistory : [];
  let n = 0;
  for (let i = 1; i < h.length; i++) if (h[i - 1] && h[i] && h[i - 1].value !== null && h[i].value === null) n++;
  return n;
};
// Keep the file's own indent (most audits use one space), so the diff is only the removed answers.
const indentOf = (text) => { const m = text.match(/^\{\n([ \t]+)"/); return m ? m[1] : 2; };

let files = 0, answers = 0, skipped = [];
for (const dir of ["profiles", "people"]) {
  const d = path.join(ROOT, "audits", dir);
  for (const f of fs.readdirSync(d).filter((f) => f.endsWith(".json")).sort()) {
    const file = path.join(d, f), text = fs.readFileSync(file, "utf8"), a = JSON.parse(text);
    if (!a.answers) continue;
    const ind = indentOf(text);
    if (JSON.stringify(a, null, ind) + "\n" !== text && JSON.stringify(a, null, ind) !== text) { skipped.push(`${dir}/${f}`); continue; }
    const gone = Object.keys(a.answers).filter((k) => !bank.has(k));
    if (!gone.length) continue;
    const nulled = gone.reduce((n, k) => n + nullings(a.answers[k]), 0);
    for (const k of gone) delete a.answers[k];
    a.reviews = [...(Array.isArray(a.reviews) ? a.reviews : []), { kind: "dropped", reviewer, reviewedAt: today, statements: gone, nulled }];
    files++; answers += gone.length;
    if (!dry) fs.writeFileSync(file, JSON.stringify(a, null, ind) + (text.endsWith("\n") ? "\n" : ""));
  }
}
console.log(`${dry ? "would remove" : "removed"} ${answers} answers to statements not in the bank from ${files} audits`);
if (skipped.length) console.log(`not rewritten (formatting doesn't round-trip; fix by hand): ${skipped.join(", ")}`);
