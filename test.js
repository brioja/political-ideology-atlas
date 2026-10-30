// Sanity checks: node test.js
//   node test.js --people   skips the ideology simulation, for builds that only changed people.js
const assert = require("assert");
const { QUESTIONS, IDEOLOGIES, MEANINGFUL_LINES, CALIBRATION, MODEL, PLACEMENT } = require("./data.js");
const PEOPLE_ONLY = process.argv.includes("--people");
const { symmetricEigen, buildModel, modelFromParts, match, matchPeople, topMatch, weights, place, fitTo, fitScale, placementSpread, nextQuestion, meaningfulAxes, describeAxis, calibrateCertainty, isSettled } = require("./pca.js");

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
const model = buildModel(IDEOLOGIES, { realLines: MEANINGFUL_LINES });
// The model the page matches with: the shipped lines and placement context (app.js).
const shipped = modelFromParts(IDEOLOGIES, MODEL, PLACEMENT);
// The shipped calibration must come from these ideologies and this pca.js (see build.js).
if (!PEOPLE_ONLY) {
  const cal = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "audits", "calibration.json"), "utf8"));
  assert.strictEqual(cal.key, require("./scripts/lib").calibrationKey(IDEOLOGIES, PLACEMENT), "audits/calibration.json is stale: run a full build");
  assert.deepStrictEqual(cal.values, CALIBRATION, "data.js's CALIBRATION differs from audits/calibration.json: run a full build");
  // One landscape (build.js): the real-line count is counted on every complete audit and committed in
  // audits/lines.json, current and the one data.js ships; and salience is judged one way everywhere
  // (scripts/lib.js), so the shown set is exactly the audits the shipped judge passes, less
  // indistinguishable ones (listed as related on the one kept).
  const lib = require("./scripts/lib");
  const complete = lib.completeIdeologies(active);
  const lines = readJson(require("path").join(__dirname, "audits", "lines.json"));
  assert.strictEqual(lines.key, lib.linesKey(complete), "audits/lines.json is stale: run a full build");
  assert.strictEqual(lines.realLines, MEANINGFUL_LINES, "data.js's MEANINGFUL_LINES differs from audits/lines.json: run a full build");
  const shown = new Set(IDEOLOGIES.map((i) => i.id));
  const related = new Set(IDEOLOGIES.flatMap((i) => (i.related || []).map((r) => r.id)));
  const awaiting = lib.awaitingReaudit();
  const misjudged = complete.filter(({ id }) => lib.ideologySalience(readJson(profilePath(id))).salient && !awaiting.has(id)
    ? !shown.has(id) && !related.has(id) : shown.has(id)).map(({ id }) => id);
  assert(!misjudged.length, `the shown ideologies don't match the salience judge (run a full build): ${misjudged.join(", ")}`);
}
// Every dividing line the page draws has a name from audits/line-labels.json. A line whose anchor
// statements are no longer among its strongest loses its name (build.js warns); that must be renamed
// deliberately, not shipped with its ends named by ideologies.
{
  const { MODEL } = require("./data.js");
  const { MAX_SHOWN_LINES, matchLines, modelFromParts } = require("./pca.js");
  const drawn = Math.min(MAX_SHOWN_LINES, MODEL.components.length, Math.max(2, matchLines(modelFromParts([], MODEL))));
  const unnamed = Array.from({ length: drawn }, (_, i) => i).filter((i) => !(MODEL.labels || [])[i]).map((i) => i + 1);
  assert(!unnamed.length, `drawn dividing line${unnamed.length > 1 ? "s" : ""} ${unnamed.join(", ")} ha${unnamed.length > 1 ? "ve" : "s"} no name: add or update its anchors in audits/line-labels.json`);
}
// "What it stands for" comes from strongly held stated positions only: no inference, silence or leaning.
{
  const lib = require("./scripts/lib");
  const bad = [];
  for (const i of IDEOLOGIES) {
    const stated = lib.statedPositions(lib.readJson(lib.profilePath(i.id)));
    if (!i.beliefs || !i.beliefs.length || i.beliefs.some((q) => !stated.has(QUESTIONS[q].id) || Math.abs(i.profile[q]) !== 2)) bad.push(i.id);
  }
  assert(!bad.length, `"What it stands for" is missing or not from stated positions (run a full build): ${bad.slice(0, 5).join(", ")}`);
}
// Silence is never scored: fit is distance on the real lines, placed from the answered statements only
// (project in pca.js), so a statement with no known position (null) is neither "Neither" nor
// disagreement (a decision; see audits/AUDIT_RULES.md). With nothing answered there is no basis: no
// position, no ranking, every ideology equally plausible. And the model reads an ideology's null as null.
{
  const lib = require("./scripts/lib");
  const none = Array(QUESTIONS.length).fill(null);
  assert.strictEqual(place(shipped, none), null, "place() gives a position to no answers");
  assert.strictEqual(fitTo(shipped, none, shipped.ideologies.map((i) => i.at)), null, "fitTo() measures no answers");
  assert(match(shipped, none).ranked.every((r) => r.distance === 0 && r.similarity === 0), "match() ranks no answers");
  assert.strictEqual(matchPeople(shipped, none, [{ id: "x", profile: IDEOLOGIES[0].profile }]).length, 0, "matchPeople() ranks no answers");
  assert(weights(shipped, none).every((w) => w === 1 / IDEOLOGIES.length), "ideologies don't weigh the same before any answer");
  const silent = IDEOLOGIES.find((i) => i.profile.includes(null));
  assert(silent, "no ideology in data.js has a 'no known position' answer: is null being turned into a value?");
  const asNeither = place(shipped, silent.profile.map((x) => x ?? 0));
  assert(place(shipped, silent.profile).some((x, k) => Math.abs(x - asNeither[k]) > 1e-9), `${silent.id}: its silences are placed as "Neither"`);
  const audit = lib.readJson(lib.profilePath(silent.id));
  assert(lib.activeStatements().every((s, j) => (audit.answers[s.id].value === null) === (silent.profile[j] === null)), `${silent.id}: data.js doesn't keep its 'no known position' answers as null`);
}
// The similarity scale (fitScale, the widest distance between two shown ideologies) ships with the
// model (build.js), so the page doesn't compare every pair; it must be current.
if (!PEOPLE_ONLY) {
  const fresh = modelFromParts(IDEOLOGIES, { ...MODEL, span: undefined });
  assert(Math.abs(fitScale(fresh) - MODEL.span) < 1e-5, "data.js's similarity scale (MODEL.span) is stale: run a full build");
}
const shareSum = model.components.reduce((s, c) => s + c.share, 0);
assert(Math.abs(shareSum - 1) < 1e-9, "variance shares do not sum to 1");
// (Ties are fine: two variants can legitimately share every answer.)
const twins = [];
// Each ideology's full profile ranks itself first (distance 0, 100%), and is its most plausible.
for (const ideo of IDEOLOGIES) {
  const { ranked } = match(shipped, ideo.profile);
  const self = ranked.find((r) => r.id === ideo.id);
  assert(ranked[0].distance < 1e-9 && self.distance < 1e-9, `${ideo.name} matched ${ranked[0].name} instead of itself`);
  assert(Math.abs(self.similarity - 1) < 1e-9, `${ideo.name} isn't a 100% match for itself`);
  const tied = ranked.filter((r) => r.distance < 1e-9 && r.id !== ideo.id).map((r) => r.name);
  if (tied.length) twins.push(`${ideo.name} = ${tied.join(", ")}`);
  else assert.strictEqual(topMatch(shipped, ideo.profile), ideo.id, `topMatch() disagrees with match() for ${ideo.name}`);
}
// s (placementSpread) comes from the taker's own noise: the same statements answered inconsistently
// (every other answer flipped) place them less precisely than answered as the ideology does.
{
  const own = IDEOLOGIES[0].profile;
  let k = 0;
  const flipped = own.map((x) => (x == null ? null : k++ % 2 ? -x : x));
  assert(placementSpread(shipped, flipped) > placementSpread(shipped, own), "contradictory answers don't widen s");
}
{
  const w = weights(shipped, IDEOLOGIES[0].profile);
  assert.strictEqual(w.indexOf(Math.max(...w)), shipped.ideologies.findIndex((i) => i.id === topMatch(shipped, IDEOLOGIES[0].profile)), "the most plausible ideology isn't the top match");
}
if (twins.length) console.log(`Same place on the dividing lines (need distinguishing statements):\n  ${[...new Set(twins)].join("\n  ")}`);

// 3. Adaptive run: simulated takers (an ideology's answers, with ~20% of them nudged by one
// point) answer until the result settles. Most should land on their source ideology.
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
let hits = 0, totalAsked = 0;
// The build ships the calibration; recompute it only for an older data.js without one.
const calibration = PEOPLE_ONLY ? null : CALIBRATION || calibrateCertainty(shipped);
for (const ideo of PEOPLE_ONLY ? [] : IDEOLOGIES) {
  const truth = ideo.profile.map((x) => (rand() < 0.2 && x != null ? Math.max(-2, Math.min(2, x + (rand() < 0.5 ? -1 : 1))) : x));
  const answers = Array(QUESTIONS.length).fill(null);
  const asked = new Set();
  for (;;) {
    const next = nextQuestion(shipped, answers, asked);
    if (!next) break;
    asked.add(next.q);
    answers[next.q] = truth[next.q];
    if (isSettled(shipped, calibration, answers, asked)) break;
  }
  totalAsked += asked.size;
  const { ranked } = match(shipped, answers);
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
  .map((p) => ({ p, r: lib.personSalience(lib.readJson(require("path").join(dir, `${p.id}.json`)).answers, dir === lib.PEOPLE_DIR ? p.id : null) }));
const controls = sal(lib.CONTROLS_DIR, lib.controlsCatalog());
for (const { p, r } of controls) {
  const line = `${p.name}: ${r.known} positions, uncertainty ${r.uncertainty.toFixed(2)} vs bar ${r.bar.toFixed(2)}`;
  if (p.borderline) console.log(`Borderline control ${line} -> ${r.salient ? "included" : "excluded"}`);
  else assert(!r.salient, `control passed salience: ${line}`);
}
const people = sal(lib.PEOPLE_DIR, lib.peopleCatalog());
// people.js holds exactly the salient people, less those listed on a closer match's page.
{
  const { PEOPLE } = require("./people.js");
  const listed = new Set(PEOPLE.flatMap((p) => [p.id, ...(p.related || []).map((r) => r.id)]));
  const misjudged = people.filter(({ p, r }) => r.salient !== listed.has(p.id)).map(({ p }) => p.id);
  assert(!misjudged.length, `people.js doesn't match the people salience judge (run node scripts/build.js --people): ${misjudged.join(", ")}`);
}
// The legacy-bar list only shrinks: a listed person who meets the current bar, or has no audit, comes off it.
const legacy = lib.readJson(lib.LEGACY_PATH).ids;
for (const id of legacy) {
  const x = people.find((y) => y.p.id === id);
  assert(x, `${id} is in audits/people-legacy-bar.json but has no audit; remove it`);
  assert(x.r.legacy, `${id} now meets the current people bar (or fails the old one); remove it from audits/people-legacy-bar.json`);
  // One more pass to reach the new bar: a second pass that still falls short ends the exception.
  const passes = (lib.readJson(lib.personPath(id)).passes || []).length;
  assert(passes < 2, `${id} has ${passes} audit passes and still misses the current people bar; remove it from audits/people-legacy-bar.json`);
}
console.log(`Salience: ${people.filter((x) => x.r.salient).length}/${people.length} audited people pass ` +
  `(${people.filter((x) => x.r.legacy).length} on the legacy bar); ` +
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
