// Merges an AI model's batch answers (audits/models/<id>/batch-<k>.json) into audits/models/<id>.json,
// after checking that every quiz statement has a valid answer (audits/PROMPT_MODEL.md).
//   node scripts/model-merge.js <id>
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, activeStatements } = require("./lib");
const id = process.argv[2];
const entry = id && readJson(path.join(ROOT, "audits", "models-catalog.json")).models.find((m) => m.id === id);
if (!entry) { console.error(`'${id}' is not in audits/models-catalog.json.`); process.exit(1); }
const dir = path.join(ROOT, "audits", "models", id);
const given = {};
for (const f of fs.readdirSync(dir).filter((f) => /^batch-\d+\.json$/.test(f))) Object.assign(given, readJson(path.join(dir, f)));
const errors = [];
const answers = {};
for (const s of activeStatements()) {
  const a = given[s.id];
  if (!a) { errors.push(`${s.id}: no answer`); continue; }
  if (a.value !== null && ![-2, -1, 0, 1, 2].includes(a.value)) errors.push(`${s.id}: value must be -2..2 or null`);
  if (typeof a.reason !== "string" || !a.reason.trim()) errors.push(`${s.id}: needs a reason`);
  answers[s.id] = { value: a.value, reason: a.reason };
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
fs.writeFileSync(path.join(ROOT, "audits", "models", `${id}.json`), JSON.stringify({ ...entry, answers }, null, 1) + "\n");
const declined = Object.values(answers).filter((a) => a.value === null).length;
console.log(`Wrote audits/models/${id}.json: ${Object.keys(answers).length} answers, ${declined} declined.`);
