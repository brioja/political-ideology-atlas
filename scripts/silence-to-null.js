// Records silence as "no known position" in ideology audits written before null existed for them:
// each low zero that scripts/lib.js silentZeros() reads as silence becomes null, keeping its rationale
// and "nulledFrom": 0, and the audit gets a { kind: "silence" } entry in "reviews".
//   node scripts/silence-to-null.js [--dry-run] [id ...]
// An audit already converted is skipped. Matching reads null as 0 until ideologyProfile() in
// scripts/lib.js changes, so this alone moves no result.
const fs = require("fs");
const { profilePath, catalog, silentZeros } = require("./lib");

const dry = process.argv.includes("--dry-run");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const today = new Date().toISOString().slice(0, 10);
let audits = 0, nulled = 0;
for (const id of ids.length ? ids : catalog().map((e) => e.id)) {
  const file = profilePath(id);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  const a = JSON.parse(text);
  if (a.notAnIdeology || (a.reviews || []).some((r) => r.kind === "silence")) continue;
  const silent = silentZeros(a);
  for (const q of silent) Object.assign(a.answers[q], { value: null, nulledFrom: 0 });
  a.reviews = [...(a.reviews || []), { kind: "silence", reviewer: "scripts/silence-to-null.js", reviewedAt: today, nulled: silent.size }];
  // Keep the file's own layout (audits are indented 1 or 2 spaces, a few are on one line).
  const indent = (/^\{\r?\n( +)"/.exec(text) || [, ""])[1].length;
  if (!dry) fs.writeFileSync(file, JSON.stringify(a, null, indent || undefined) + (text.endsWith("\n") ? "\n" : ""));
  audits++; nulled += silent.size;
}
console.log(`${dry ? "Would null" : "Nulled"} ${nulled} silent zeros in ${audits} audits.`);
