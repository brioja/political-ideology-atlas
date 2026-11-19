#!/usr/bin/env node
// Remove every audit's (and AI model's) answers to statements no longer in the bank (dropped, or renamed to a new id),
// history included, and lower the "nulling" reviews by the nullings that went with them, so they still add up
// (validate.js). Run it after dropping or renaming a statement. Nothing reads these answers: the matching, quiz
// and pages use only the bank, and git keeps the old versions (Brandon, 2026-11-18). An audit keeps no trace of a
// dropped statement (2026-11-19): the script then lists every remaining mention (notes, rationales, sources'
// usedFor, missing statements), to remove by hand; validate.js fails while any is left.
//
//   node scripts/drop-answers.js [--dry-run]
const fs = require("fs");
const path = require("path");
const { ROOT, allStatements, retiredRe } = require("./lib");

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const dry = process.argv.includes("--dry-run");
const bank = new Set(allStatements().map((s) => s.id));

// The nullings in an answer's history, each as the entry that nulled it (signed by its pass).
const nullings = (x) => {
  const h = x && Array.isArray(x.reviewHistory) ? x.reviewHistory : [];
  const out = [];
  for (let i = 1; i < h.length; i++) if (h[i - 1] && h[i] && h[i - 1].value !== null && h[i].value === null) out.push(h[i]);
  return out;
};
// Lower the nulling review that counted each removed nulling: the one signed by the same reviewer on the same day,
// else the latest with a count left. A review at 0 goes.
const lower = (a, removed) => {
  const revs = (Array.isArray(a.reviews) ? a.reviews : []).filter((r) => r && r.kind === "nulling");
  for (const e of removed) {
    const r = revs.find((r) => r.reviewer === e.author && r.reviewedAt === e.date && r.nulled > 0) || [...revs].reverse().find((r) => r.nulled > 0);
    if (r) r.nulled--;
  }
  if (Array.isArray(a.reviews)) {
    a.reviews = a.reviews.filter((r) => !(r && r.kind === "nulling" && r.nulled === 0));
    if (!a.reviews.length) delete a.reviews;
  }
};
// Keep the file's own indent (most audits use one space) and its \uXXXX escapes, so the diff is only the removed answers.
const indentOf = (text) => { const m = text.match(/^\{\n([ \t]+)"/); return m ? m[1] : 2; };
const escaped = (t) => t.replace(/[\u007f-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const formatter = (text, a) => {
  const ind = indentOf(text), end = text.endsWith("\n") ? "\n" : "";
  for (const f of [(o) => JSON.stringify(o, null, ind) + end, (o) => escaped(JSON.stringify(o, null, ind)) + end]) if (f(a) === text) return f;
  return null;
};

let files = 0, answers = 0, skipped = [];
for (const dir of ["profiles", "people", "controls"]) {
  const d = path.join(ROOT, "audits", dir);
  for (const f of fs.readdirSync(d).filter((f) => f.endsWith(".json")).sort()) {
    const file = path.join(d, f), text = fs.readFileSync(file, "utf8"), a = JSON.parse(text);
    if (!a.answers) continue;
    const format = formatter(text, a);
    if (!format) { skipped.push(`${dir}/${f}`); continue; }
    const gone = Object.keys(a.answers).filter((k) => !bank.has(k));
    if (!gone.length) continue;
    const removed = gone.flatMap((k) => nullings(a.answers[k]));
    for (const k of gone) delete a.answers[k];
    lower(a, removed);
    files++; answers += gone.length;
    if (!dry) fs.writeFileSync(file, format(a));
  }
}
// AI models (audits/models/<id>.json) took the quiz themselves: their answers have no reviews, so they're just removed.
let models = 0;
const modelsDir = path.join(ROOT, "audits", "models");
for (const f of fs.readdirSync(modelsDir).filter((f) => f.endsWith(".json")).sort()) {
  const file = path.join(modelsDir, f), text = fs.readFileSync(file, "utf8"), a = JSON.parse(text);
  const gone = Object.keys(a.answers || {}).filter((k) => !bank.has(k));
  if (!gone.length) continue;
  const format = formatter(text, a);
  if (!format) { skipped.push(`models/${f}`); continue; }
  for (const k of gone) delete a.answers[k];
  models++; answers += gone.length;
  if (!dry) fs.writeFileSync(file, format(a));
}
// Their raw answers (audits/models/<id>/answers.json, merged by model-merge.js) go too.
for (const d of fs.readdirSync(modelsDir).sort()) {
  const file = path.join(modelsDir, d, "answers.json");
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8"), a = JSON.parse(text);
  const gone = Object.keys(a).filter((k) => !bank.has(k));
  if (!gone.length) continue;
  const format = formatter(text, a);
  if (!format) { skipped.push(`models/${d}/answers.json`); continue; }
  for (const k of gone) delete a[k];
  answers += gone.length;
  if (!dry) fs.writeFileSync(file, format(a));
}
console.log(`${dry ? "would remove" : "removed"} ${answers} answers to statements not in the bank from ${files} audits and ${models} AI models`);
if (skipped.length) console.log(`not rewritten (formatting doesn't round-trip; fix by hand): ${skipped.join(", ")}`);
// What's left to remove by hand.
const re = retiredRe();
if (re) for (const dir of ["profiles", "people", "controls", "models"]) {
  const d = path.join(ROOT, "audits", dir);
  for (const f of fs.readdirSync(d).filter((f) => f.endsWith(".json")).sort()) {
    const text = fs.readFileSync(path.join(d, f), "utf8"), ids = [...new Set(text.match(re) || [])];
    if (ids.length) console.log(`still names ${ids.join(", ")}: audits/${dir}/${f}`);
  }
}
