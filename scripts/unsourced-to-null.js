// Records answers whose own rationale admits they have no source as "no known position" (null) in ideology
// audits: silence written as 0 ("no source addresses it; split") and guesses ("not in the sources",
// "presumably", "would likely support"). Silence is never a position and every answer is stated or null
// (audits/AUDIT_RULES.md, section 3); scripts/silence-to-null.js and the "Inferred:" pass caught only
// the standard wordings. Each answer keeps its rationale and "nulledFrom" (the old value), and the audit
// gets a { kind: "unsourced" } entry in "reviews". Brandon, 2026-11-01.
//   node scripts/unsourced-to-null.js [--dry-run] [id ...]
// An audit already converted is skipped.
const fs = require("fs");
const { profilePath, catalog } = require("./lib");

// Wordings found in the audits (checked by hand on samples): the rationale says the sources are silent
// on the statement, or that the value is inferred or presumed.
const UNSOURCED = /not in the sources|sources? (consulted |used |cited )?(do(es)? not|never|don.t) (address|mention|cover|discuss|state)|not addressed (in|by) the sources|no source|not stated in (the|any)|(is|are|was) inferred|inferred (from|that)|presumably|would likely|likely (supports?|opposes?|favou?rs?)/i;

const dry = process.argv.includes("--dry-run");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const today = new Date().toISOString().slice(0, 10);
let audits = 0, nulled = 0, zeros = 0;
for (const id of ids.length ? ids : catalog().map((e) => e.id)) {
  const file = profilePath(id);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  const a = JSON.parse(text);
  if (a.notAnIdeology || (Array.isArray(a.reviews) && a.reviews.some((r) => r.kind === "unsourced"))) continue;
  const hit = Object.values(a.answers).filter((x) => x && x.value != null && !/^Inferred:/.test(x.rationale || "") && UNSOURCED.test(x.rationale || ""));
  if (!hit.length) continue;
  for (const x of hit) { if (x.value === 0) zeros++; Object.assign(x, { nulledFrom: x.value, value: null, confidence: "low" }); }
  a.reviews = [...(Array.isArray(a.reviews) ? a.reviews : []), { kind: "unsourced", reviewer: "scripts/unsourced-to-null.js", reviewedAt: today, nulled: hit.length }];
  // Keep the file's own layout (audits are indented 1 or 2 spaces, a few are on one line).
  const indent = (/^\{\r?\n( +)"/.exec(text) || [, ""])[1].length;
  if (!dry) fs.writeFileSync(file, JSON.stringify(a, null, indent || undefined) + (text.endsWith("\n") ? "\n" : ""));
  audits++; nulled += hit.length;
}
console.log(`${dry ? "Would null" : "Nulled"} ${nulled} unsourced answers (${zeros} of them silent zeros) in ${audits} audits.`);
