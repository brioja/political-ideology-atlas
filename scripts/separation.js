// Lists ideologies the test can barely tell apart from their nearest neighbours, as candidates for
// new statements. Neighbours are nearest as matching sees it (distance on the real lines, pca.js's fit
// measure). A statement separates two ideologies when both have a position on it,
// 2+ notches apart, and at least one holds it firmly (medium or high confidence in its audit).
// Pairs with fewer than --min separating statements are listed, those with none first. Reads the
// shipped data.js, so run a build first.
//   node scripts/separation.js [--min N] [--neighbours K] [--json]
//   --min N         flag pairs with fewer than N separating statements (default 3)
//   --neighbours K  check each ideology against its K nearest (default 3)
const path = require("path");
const { ROOT, readJson, profilePath } = require("./lib");
const { QUESTIONS, IDEOLOGIES, MODEL, PLACEMENT } = require(path.join(ROOT, "data.js"));
const { modelFromParts, distance: apart } = require(path.join(ROOT, "pca.js"));
const at = Object.fromEntries(modelFromParts(IDEOLOGIES, MODEL, PLACEMENT).ideologies.map((i) => [i.id, i]));
const firm = Object.fromEntries(IDEOLOGIES.map((i) => {
  const answers = readJson(profilePath(i.id)).answers;
  return [i.id, QUESTIONS.map((q) => answers[q.id].confidence !== "low")];
}));

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? Number(process.argv[i + 1]) : dflt; };
const MIN = arg("--min", 3), K = arg("--neighbours", 3);
const distance = (a, b) => apart(at[a.id], at[b.id]);
const separating = (a, b) => QUESTIONS.flatMap((s, q) =>
  a.profile[q] != null && b.profile[q] != null && Math.abs(a.profile[q] - b.profile[q]) >= 2
  && (firm[a.id][q] || firm[b.id][q]) ? [s.id] : []);

const seen = new Set(), pairs = [];
for (const a of IDEOLOGIES) {
  const near = IDEOLOGIES.filter((b) => b !== a).map((b) => ({ b, d: distance(a, b) })).sort((x, y) => x.d - y.d).slice(0, K);
  for (const { b, d } of near) {
    const key = [a.id, b.id].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const sep = separating(a, b);
    if (sep.length < MIN) pairs.push({ a: a.name, b: b.name, distance: Math.round(d * 100) / 100, separating: sep });
  }
}
pairs.sort((x, y) => x.separating.length - y.separating.length || x.distance - y.distance);

if (process.argv.includes("--json")) console.log(JSON.stringify(pairs, null, 1));
else {
  console.log(`${pairs.length} neighbouring pairs with fewer than ${MIN} separating statements (${pairs.filter((p) => !p.separating.length).length} with none):`);
  for (const p of pairs) console.log(`  ${p.separating.length}  ${p.a} / ${p.b}${p.separating.length ? `  (${p.separating.join(", ")})` : ""}`);
}
