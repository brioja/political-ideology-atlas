// Lists ideologies the test can barely tell apart from their nearest neighbours, as candidates for
// new statements. A statement separates two ideologies when their answers are 2+ notches apart and
// at least one of them holds its position firmly (medium or high audit confidence), which is when it
// moves the confidence-weighted match. Pairs with fewer than --min separating statements are listed,
// those with none first. Reads the shipped data.js, so run a build first.
//   node scripts/separation.js [--min N] [--neighbours K] [--json]
//   --min N         flag pairs with fewer than N separating statements (default 3)
//   --neighbours K  check each ideology against its K nearest (default 3)
const path = require("path");
const { ROOT } = require("./lib");
const { QUESTIONS, IDEOLOGIES } = require(path.join(ROOT, "data.js"));

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > -1 ? Number(process.argv[i + 1]) : dflt; };
const MIN = arg("--min", 3), K = arg("--neighbours", 3);
const WEIGHT = { h: 4, m: 2, l: 0.5 };

// Nearness as matching sees it: the average gap, each statement weighted by the less firm side.
function distance(a, b) {
  let s = 0, n = 0;
  for (let q = 0; q < QUESTIONS.length; q++) {
    const w = Math.min(WEIGHT[a.confidence[q]], WEIGHT[b.confidence[q]]);
    s += w * Math.abs(a.profile[q] - b.profile[q]);
    n += w;
  }
  return s / n;
}
const separating = (a, b) => QUESTIONS.flatMap((s, q) =>
  Math.abs(a.profile[q] - b.profile[q]) >= 2 && (a.confidence[q] !== "l" || b.confidence[q] !== "l") ? [s.id] : []);

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
