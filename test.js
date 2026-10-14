// Sanity checks: node test.js
const assert = require("assert");
const { QUESTIONS, IDEOLOGIES } = require("./data.js");
const { jacobiEigen, buildModel, match, describeAxis } = require("./pca.js");

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
for (const ideo of IDEOLOGIES) {
  const top = match(model, ideo.profile).ranked[0].name;
  assert.strictEqual(top, ideo.name, `${ideo.name} matched ${top}`);
}

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
