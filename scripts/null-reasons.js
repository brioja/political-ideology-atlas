// Lists the four-word null reasons ("nullReason", rules 4) used in audits so far, most used first, so a
// new audit reuses a label that fits before coining one (audits/AUDIT_RULES.md, "No data, no position").
//   node scripts/null-reasons.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const counts = new Map();
for (const dir of ["audits/profiles", "audits/people"]) {
  for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".json"))) {
    let a; try { a = JSON.parse(fs.readFileSync(path.join(ROOT, dir, f), "utf8")); } catch { continue; }
    for (const x of Object.values(a.answers || {})) if (x && x.value === null && x.nullReason) counts.set(x.nullReason, (counts.get(x.nullReason) || 0) + 1);
  }
}
for (const r of ["no-evidence-after-search", "borrowed-from-nearby-case"]) if (!counts.has(r)) counts.set(r, 0);
for (const [r, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(6)}  ${r}`);
