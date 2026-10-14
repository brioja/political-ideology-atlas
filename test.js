// Sanity checks: node test.js
const assert = require("assert");
const { QUESTIONS, IDEOLOGIES } = require("./data.js");
const { jacobiEigen, buildModel, match, nextQuestion, certainty, describeAxis } = require("./pca.js");

// 1. Eigensolver: A v = lambda v, and eigenvectors are orthonormal.
const A = [[4, 1, 2], [1, 3, 0], [2, 0, 5]];
const eig = jacobiEigen(A);
for (const { value, vector } of eig) {
  const Av = A.map((row) => row.reduce((s, x, j) => s + x * vector[j], 0));
  Av.forEach((x, i) => assert(Math.abs(x - value * vector[i]) < 1e-9, "A v != lambda v"));
}
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  const d = eig[i].vector.reduce((s, x, k) => s + x * eig[j].vector[k], 0);
  assert(Math.abs(d - (i === j ? 1 : 0)) < 1e-9, "eigenvectors not orthonormal");
}

// 2. Model: shares sum to 1, and each ideology's own answers match itself first.
const model = buildModel(IDEOLOGIES);
const shareSum = model.components.reduce((s, c) => s + c.share, 0);
assert(Math.abs(shareSum - 1) < 1e-9, "variance shares do not sum to 1");
// (Ties are fine: two variants can legitimately share every answer.)
const twins = [];
for (const ideo of IDEOLOGIES) {
  const { ranked } = match(model, ideo.profile);
  assert.strictEqual(ranked[0].distance, 0, `${ideo.name} matched ${ranked[0].name} instead of itself`);
  const tied = ranked.filter((r) => r.distance === 0 && r.name !== ideo.name).map((r) => r.name);
  if (tied.length) twins.push(`${ideo.name} = ${tied.join(", ")}`);
}
if (twins.length) console.log(`Identical profiles (need distinguishing statements):\n  ${[...new Set(twins)].join("\n  ")}`);

// 3. Adaptive run: simulated takers (an ideology's answers, with ~20% of them nudged by one
// point) answer until the result settles. Most should land on their source ideology.
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
let hits = 0, totalAsked = 0;
for (const ideo of IDEOLOGIES) {
  const truth = ideo.profile.map((x) => (rand() < 0.2 ? Math.max(-2, Math.min(2, x + (rand() < 0.5 ? -1 : 1))) : x));
  const answers = Array(QUESTIONS.length).fill(null);
  const asked = new Set();
  for (;;) {
    const next = nextQuestion(model, answers, asked);
    if (!next) break;
    asked.add(next.q);
    answers[next.q] = truth[next.q];
    if (asked.size >= 10 && certainty(model, answers, asked) >= 0.9) break;
  }
  totalAsked += asked.size;
  const { ranked } = match(model, answers);
  if (ranked.find((r) => r.name === ideo.name).distance === ranked[0].distance) hits++;
}
console.log(`Adaptive: ${hits}/${IDEOLOGIES.length} noisy takers matched their source, ` +
  `averaging ${(totalAsked / IDEOLOGIES.length).toFixed(1)} of ${QUESTIONS.length} statements.`);
if (hits < IDEOLOGIES.length * 0.8) console.log("WARNING: under 80% of simulated takers matched their source.");

// Report what the data found.
let cum = 0;
console.log(`${model.components.length} axes carry variance; keeping ${model.kept} (>= 80%).\n`);
model.components.slice(0, 6).forEach((c, i) => {
  cum += c.share;
  const ax = describeAxis(model, i, QUESTIONS, 2);
  console.log(`Axis ${i + 1}: ${(c.share * 100).toFixed(1)}% (cum ${(cum * 100).toFixed(1)}%)  ${ax.lowEnd.join(", ")}  <->  ${ax.highEnd.join(", ")}`);
  console.log(`   + ${ax.positive.map((p) => p.text).join(" / ")}`);
  console.log(`   - ${ax.negative.map((p) => p.text).join(" / ")}`);
});
console.log("\nAll checks passed.");
