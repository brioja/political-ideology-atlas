// Sanity checks: node test.js
//   node test.js --people   skips the ideology simulation, for builds that only changed people.js
const assert = require("assert");
const { QUESTIONS, IDEOLOGIES, MEANINGFUL_LINES, CALIBRATION } = require("./data.js");
const PEOPLE_ONLY = process.argv.includes("--people");
const { symmetricEigen, buildModel, match, nextQuestion, certainty, meaningfulAxes, describeAxis, calibrateCertainty, isSettled } = require("./pca.js");

// 1. Eigensolver: A v = lambda v, and eigenvectors are orthonormal.
const A = [[4, 1, 2], [1, 3, 0], [2, 0, 5]];
const eig = symmetricEigen(A);
for (const { value, vector } of eig) {
  const Av = A.map((row) => row.reduce((s, x, j) => s + x * vector[j], 0));
  Av.forEach((x, i) => assert(Math.abs(x - value * vector[i]) < 1e-9, "A v != lambda v"));
}
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  const d = eig[i].vector.reduce((s, x, k) => s + x * eig[j].vector[k], 0);
  assert(Math.abs(d - (i === j ? 1 : 0)) < 1e-9, "eigenvectors not orthonormal");
}

// 1b. Statements keep their wording: audits answered the recorded text, so a reworded statement
// needs a new id (see scripts/lib.js).
const { allStatements, TEXTS, readJson } = require("./scripts/lib");
const texts = require("fs").existsSync(TEXTS) ? readJson(TEXTS) : {};
for (const s of allStatements()) {
  assert(!(s.id in texts) || texts[s.id] === s.text, `statement '${s.id}' was reworded; give the new wording a new id`);
}

// 1c. A statement is promoted only once every audit answers it: build.js leaves out any audit that
// misses an active statement, so an early promotion empties the site.
const { catalog, profilePath, activeStatements, unanswered } = require("./scripts/lib");
const active = activeStatements();
const behind = catalog().filter((e) => require("fs").existsSync(profilePath(e.id)))
  .map((e) => ({ id: e.id, audit: readJson(profilePath(e.id)) }))
  .filter(({ audit }) => !audit.notAnIdeology && unanswered(audit.answers, active).length);
assert(!behind.length, `${behind.length} audits miss active statements (backfill before promoting): ${behind.slice(0, 5).map((b) => b.id).join(", ")}`);

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
// The build ships the calibration; recompute it only for an older data.js without one.
const calibration = PEOPLE_ONLY ? null : CALIBRATION || calibrateCertainty(model);
for (const ideo of PEOPLE_ONLY ? [] : IDEOLOGIES) {
  const truth = ideo.profile.map((x) => (rand() < 0.2 ? Math.max(-2, Math.min(2, x + (rand() < 0.5 ? -1 : 1))) : x));
  const answers = Array(QUESTIONS.length).fill(null);
  const asked = new Set();
  for (;;) {
    const next = nextQuestion(model, answers, asked);
    if (!next) break;
    asked.add(next.q);
    answers[next.q] = truth[next.q];
    if (isSettled(model, calibration, answers, asked)) break;
  }
  totalAsked += asked.size;
  const { ranked } = match(model, answers);
  if (ranked.find((r) => r.name === ideo.name).distance === ranked[0].distance) hits++;
}
if (!PEOPLE_ONLY) console.log(`Adaptive: ${hits}/${IDEOLOGIES.length} noisy takers matched their source, ` +
  `averaging ${(totalAsked / IDEOLOGIES.length).toFixed(1)} of ${QUESTIONS.length} statements.`);
if (!PEOPLE_ONLY && hits < IDEOLOGIES.length * 0.8) console.log("WARNING: under 80% of simulated takers matched their source.");

// 4. Salience controls: apolitical celebrities, audited with the same instructions as everyone
// else, must not pass; report how the audited people fare.
const fs = require("fs");
const lib = require("./scripts/lib.js");
const sal = (dir, list) => list.filter((p) => fs.existsSync(require("path").join(dir, `${p.id}.json`)))
  .map((p) => ({ p, r: lib.personSalience(lib.readJson(require("path").join(dir, `${p.id}.json`)).answers) }));
const controls = sal(lib.CONTROLS_DIR, lib.controlsCatalog());
for (const { p, r } of controls) {
  const line = `${p.name}: ${r.known} positions, uncertainty ${r.uncertainty.toFixed(2)} vs bar ${r.bar.toFixed(2)}`;
  if (p.borderline) console.log(`Borderline control ${line} -> ${r.salient ? "included" : "excluded"}`);
  else assert(!r.salient, `control passed salience: ${line}`);
}
const people = sal(lib.PEOPLE_DIR, lib.peopleCatalog());
console.log(`Salience: ${people.filter((x) => x.r.salient).length}/${people.length} audited people pass; ` +
  `${controls.filter((x) => !x.p.borderline && !x.r.salient).length}/${controls.filter((x) => !x.p.borderline).length} controls correctly excluded.`);

// 4b. Ideology colors: never only neutral shades (grey, black, white); a neutral is fine next to a
// real color. Saturation is HSL saturation; below 0.15 reads as neutral.
const saturation = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mx = Math.max(...v), mn = Math.min(...v);
  return mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
};
const colorFile = lib.readJson(require("path").join(__dirname, "audits", "ideology-colors.json"));
const dull = Object.entries(colorFile).filter(([, v]) => v.colors.length && !v.colors.some((c) => saturation(c.hex) >= 0.15)).map(([id]) => id);
assert(!dull.length, `ideology colors are only grey, black or white (add a real color): ${dull.join(", ")}`);

// 5. people.js (people and AI models) lines up with the statements.
const { PEOPLE } = require("./people.js");
for (const p of PEOPLE) assert.strictEqual(p.profile.length, QUESTIONS.length, `${p.name}: profile doesn't match the statements; rebuild people.js`);
console.log(`people.js: ${PEOPLE.length} entries (${PEOPLE.filter((p) => p.kind === "model").length} AI models).`);

// 6. Share links: every statement has a slot, and links decode after statements are added.
{
  const { encodeShare, decodeShare } = require("./pca.js");
  const { SHARE_SLOTS } = require("./data.js");
  const fileSlots = lib.readJson(require("path").join(__dirname, "audits", "share-slots.json")).slots;
  assert.deepStrictEqual(SHARE_SLOTS, fileSlots, "data.js share slots differ from audits/share-slots.json; run a full build");
  assert.strictEqual(new Set(fileSlots).size, fileSlots.length, "audits/share-slots.json has a duplicate");
  const ids = QUESTIONS.map((q) => q.id);
  const noSlot = ids.filter((id) => !fileSlots.includes(id));
  assert(!noSlot.length, `statements without a share slot (run a full build): ${noSlot.join(", ")}`);
  const given = ids.map((_, j) => (j % 7 === 3 ? null : (j % 5) - 2));
  assert.deepStrictEqual(decodeShare(encodeShare(given, ids, fileSlots), ids, fileSlots), given, "share link round-trip");
  // A link made before the newest statement was added still decodes, with that one unanswered.
  const newest = ids.indexOf(fileSlots[fileSlots.length - 1]);
  const before = ids.filter((_, j) => j !== newest);
  const old = encodeShare(given.filter((_, j) => j !== newest), before, fileSlots.slice(0, -1));
  assert.deepStrictEqual(decodeShare(old, ids, fileSlots), given.map((a, j) => (j === newest ? null : a)), "older share link");
  // "2." links from before v1.0: one character per v1.0 statement.
  const v2 = "2." + fileSlots.slice(0, 490).map((_, k) => (k === 0 ? "4" : "-")).join("");
  assert.strictEqual(decodeShare(v2, ids, fileSlots)[ids.indexOf(fileSlots[0])], 2, "v2 share link");
  assert.strictEqual(decodeShare("2.4", ids, fileSlots), null, "a short v2 link is rejected");
}

// Report what the data found.
let cum = 0;
console.log(`${model.components.length} axes carry variance; ${MEANINGFUL_LINES ?? meaningfulAxes(model, IDEOLOGIES)} beat shuffled noise (parallel analysis).\n`);
model.components.slice(0, 6).forEach((c, i) => {
  cum += c.share;
  const ax = describeAxis(model, i, QUESTIONS, 2);
  console.log(`Axis ${i + 1}: ${(c.share * 100).toFixed(1)}% (cum ${(cum * 100).toFixed(1)}%)  ${ax.lowEnd.join(", ")}  <->  ${ax.highEnd.join(", ")}`);
  console.log(`   + ${ax.positive.map((p) => p.text).join(" / ")}`);
  console.log(`   - ${ax.negative.map((p) => p.text).join(" / ")}`);
});
console.log("\nAll checks passed.");
