// Sanity checks: node test.js
//   node test.js --people   skips the ideology simulation, for builds that only changed people.js
const assert = require("assert");
const { QUESTIONS, IDEOLOGIES, MEANINGFUL_LINES, MODEL, PLACEMENT } = require("./data.js");
const PEOPLE_ONLY = process.argv.includes("--people");
const { symmetricEigen, buildModel, modelFromParts, match, matchPeople, topMatch, place, locate, fitTo, fitScale, placementProgress, nextQuestion, meaningfulAxes, describeAxis } = require("./pca.js");

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
if (!PEOPLE_ONLY) {
  // One landscape (build.js): the real-line count is counted on every complete audit and committed in
  // audits/lines.json, current and the one data.js ships; and uncertainty is judged one way everywhere
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
  const misjudged = complete.filter(({ id }) => lib.ideologyUncertainty(readJson(profilePath(id))).placed && !awaiting.has(id)
    ? !shown.has(id) && !related.has(id) : shown.has(id)).map(({ id }) => id);
  assert(!misjudged.length, `the shown ideologies don't match the uncertainty judge (run a full build): ${misjudged.join(", ")}`);
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
// An ideology's "no known position" (null) is low confidence (audits/PROMPT.md; validate.js checks one
// audit, this checks them all), so a bulk edit that nulls answers can't leave their old confidence:
// the 10-30 inference pass did, and 601 audits failed validation until 2026-10-31.
{
  const lib = require("./scripts/lib");
  const fs = require("fs");
  const bad = fs.readdirSync(lib.PROFILES_DIR).filter((f) => f.endsWith(".json")).flatMap((f) => {
    const a = lib.readJson(require("path").join(lib.PROFILES_DIR, f));
    return Object.entries(a.answers || {}).filter(([, x]) => x && x.value === null && x.confidence !== "low").map(([id]) => `${f.slice(0, -5)}/${id}`);
  });
  assert(!bad.length, `${bad.length} "no known position" answers aren't low confidence: ${bad.slice(0, 5).join(", ")}`);
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
// (posterior in pca.js), so a statement with no known position (null) is neither "Neither" nor
// disagreement (a decision; see audits/AUDIT_RULES.md). With nothing answered there is no basis: no
// position, no ranking. And the model reads an ideology's null as null.
{
  const lib = require("./scripts/lib");
  const none = Array(QUESTIONS.length).fill(null);
  assert.strictEqual(place(shipped, none), null, "place() gives a position to no answers");
  assert.strictEqual(fitTo(shipped, none, shipped.ideologies), null, "fitTo() measures no answers");
  assert(match(shipped, none).ranked.every((r) => r.distance === 0 && r.similarity === 0), "match() ranks no answers");
  assert.strictEqual(matchPeople(shipped, none, [{ id: "x", profile: IDEOLOGIES[0].profile }]).length, 0, "matchPeople() ranks no answers");
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
  const fresh = modelFromParts(IDEOLOGIES, { ...MODEL, span: undefined }, PLACEMENT);
  assert(Math.abs(fitScale(fresh) - MODEL.span) < 1e-5, "data.js's similarity scale (MODEL.span) is stale: run a full build");
}
const shareSum = model.components.reduce((s, c) => s + c.share, 0);
assert(Math.abs(shareSum - 1) < 1e-9, "variance shares do not sum to 1");
// (Ties are fine: two variants can legitimately share every answer.)
const twins = [];
// Each ideology's full profile ranks itself first (distance 0, 100%).
for (const ideo of IDEOLOGIES) {
  const { ranked } = match(shipped, ideo.profile);
  const self = ranked.find((r) => r.id === ideo.id);
  assert(ranked[0].distance < 1e-5 && self.distance < 1e-5, `${ideo.name} matched ${ranked[0].name} instead of itself`);
  assert(Math.abs(self.similarity - 1) < 1e-5, `${ideo.name} isn't a 100% match for itself`);
  const tied = ranked.filter((r) => r.distance < 1e-5 && r.id !== ideo.id).map((r) => r.name);
  if (tied.length) twins.push(`${ideo.name} = ${tied.join(", ")}`);
  else assert.strictEqual(topMatch(shipped, ideo.profile), ideo.id, `topMatch() disagrees with match() for ${ideo.name}`);
}
// Frozen (Brandon, 2026-10-30): matching is distance on the 14 real lines only. Statement-by-statement
// matching (averaging gaps over the statements two records share) is sparse for ideologies, people and
// takers alike and must not come back, under any name: pca.js exports no such function, the build
// ships no per-ideology statement spread, and match() ranks by line distance alone.
{
  const pca = require("./pca.js");
  for (const name of ["fit", "miss", "gap", "spreadOn", "matchOnStatements", "fullSpread", "lineSpan"]) {
    assert(!(name in pca), `pca.js exports ${name}: statement-based matching is frozen out (backlog/decided-against.md)`);
  }
  assert(!require("fs").existsSync(require("path").join(__dirname, "audits", "spreads.json")), "audits/spreads.json is back: statement-based matching is frozen out");
  assert(!("fullSpread" in MODEL) && !IDEOLOGIES.some((i) => "spread" in i), "data.js ships a statement spread: statement-based matching is frozen out");
  // Two takers who share no statement still get a line distance (statement overlap plays no part).
  const n = QUESTIONS.length, a = Array(n).fill(null), b = Array(n).fill(null);
  a[0] = 2; b[1] = -2;
  assert(fitTo(shipped, a, [locate(shipped, b)]) != null, "match needs shared statements: statement-based matching is back");
}
// The uncertainty rule (Brandon, 2026-10-31): a record is placed only when every real line is mostly
// known. Precision on one line never makes up for another left unknown; which statements are answered
// decides it, never the answers, so a "Neither" (0) narrows a line like any answer while silence
// (null) leaves it as unknown as before; and a line a record says nothing about adds nothing to a
// distance.
{
  const pca = require("./pca.js");
  const ctx = shipped.placement, n = QUESTIONS.length, k = ctx.k;
  const lineOf = Array.from({ length: n }, (_, j) => {
    let best = 0;
    for (let i = 1; i < k; i++) if (Math.abs(shipped.components[i].vector[j]) > Math.abs(shipped.components[best].vector[j])) best = i;
    return best;
  });
  const oneLine = Array.from({ length: n }, (_, j) => (lineOf[j] === 0 ? 2 : null));
  const u = pca.uncertainty(ctx, oneLine);
  assert(u.lines[0] <= u.max && !u.placed, "answering one line's statements alone passes the uncertainty rule");
  const j = lineOf.indexOf(1), none = Array(n).fill(null);
  const stats = (x) => pca.lineStats(ctx, pca.answeredIndexes(none.map((_, q) => (q === j ? x : null))));
  assert(stats(0)[1].variance < stats(null)[1].variance, "a 'Neither' answer doesn't narrow its line");
  assert.deepStrictEqual(stats(0), stats(2), "line precision depends on the answer, not only on which statements are answered");
  assert.deepStrictEqual(stats(null), pca.lineStats(ctx, []), "silence narrows a line");
  const at = Array(k).fill(0), far = at.map((_, i) => (i === k - 1 ? 9 : 0)), sure = at.map((_, i) => (i === k - 1 ? 0 : 1));
  assert.strictEqual(pca.distance({ at, reliability: sure }, { at: far, reliability: at.map(() => 1) }), 0, "a line a record says nothing about adds to the distance");
}
// Each shown ideology ships its place on the lines and its reliability on each (build.js), so the page
// doesn't work them out. (Rounded, so an ideology sits within 1e-5 of itself, not exactly on it.)
{
  const pca = require("./pca.js");
  const fresh = modelFromParts(IDEOLOGIES.map(({ at, reliability, ...i }) => i), MODEL, PLACEMENT).ideologies;
  const stale = IDEOLOGIES.filter((i, n) => !i.at || !i.reliability
    || fresh[n].at.some((x, k) => Math.abs(x - i.at[k]) > 1e-5)
    || fresh[n].reliability.some((x, k) => Math.abs(x - i.reliability[k]) > 1e-4)).map((i) => i.id);
  assert(!stale.length, `data.js's ideology places or reliabilities are stale (run a full build): ${stale.slice(0, 5).join(", ")}`);
}
// The quiz's progress (placementProgress) only grows as answers come in.
{
  const own = IDEOLOGIES[0].profile;
  const half = own.map((x, j) => (j % 2 ? null : x));
  assert(placementProgress(shipped, own) >= placementProgress(shipped, half), "more answers lower the quiz's progress");
}
if (twins.length) console.log(`Same place on the dividing lines (need distinguishing statements):\n  ${[...new Set(twins)].join("\n  ")}`);

// 3. Quiz run: simulated takers answer until the quiz says Done (placementProgress), as on the page,
// with the page's next-question selector. Each taker sits where an ideology is placed (every 4th) and
// answers every statement as the model predicts there, plus the model's own noise, rounded to -2..2
// (copying audits instead would answer "No opinion" wherever an audit is blank, which favours one
// selector over another). Measured 2026-10-31: done after 60 statements, own ideology first for 111 of 143.
let seed = 11;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
const solve = (A, b) => { // Gaussian elimination with partial pivoting: A x = b
  const n = b.length, a = A.map((r, i) => [...r, b[i]]);
  for (let col = 0; col < n; col++) {
    let p = col; for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[p][col])) p = r;
    [a[col], a[p]] = [a[p], a[col]];
    for (let r = col + 1; r < n; r++) { const f = a[r][col] / a[col][col]; for (let q = col; q <= n; q++) a[r][q] -= f * a[col][q]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = a[r][n]; for (let q = r + 1; q < n; q++) s -= a[r][q] * x[q]; x[r] = s / a[r][r]; }
  return x;
};
let hits = 0, top3 = 0, totalAsked = 0, takers = 0;
if (!PEOPLE_ONLY) {
  const ctx = shipped.placement, comps = ctx.model.components.slice(0, ctx.k);
  for (const ideo of shipped.ideologies.filter((_, i) => i % 4 === 0)) {
    const z = solve(ctx.lines, ideo.at);
    const truth = QUESTIONS.map((_, j) => Math.max(-2, Math.min(2, Math.round(shipped.mean[j] + comps.reduce((s, c, a) => s + z[a] * c.vector[j], 0) + Math.sqrt(ctx.noise) * gauss()))));
    const answers = Array(QUESTIONS.length).fill(null), asked = new Set();
    for (;;) {
      const next = nextQuestion(shipped, answers, asked);
      if (!next) break;
      asked.add(next.q);
      answers[next.q] = truth[next.q];
      if (placementProgress(shipped, answers) >= 1) break;
    }
    takers++; totalAsked += asked.size;
    const { ranked } = match(shipped, answers);
    const own = ranked.find((r) => r.id === ideo.id).distance;
    if (own === ranked[0].distance) hits++;
    if (own <= ranked[Math.min(2, ranked.length - 1)].distance) top3++;
  }
  console.log(`Quiz run: at Done, ${hits}/${takers} simulated takers had their ideology first and ${top3} in their top 3, ` +
    `averaging ${(totalAsked / takers).toFixed(1)} of ${QUESTIONS.length} statements.`);
  if (top3 < takers * 0.75) console.log("WARNING: under 75% of simulated takers had their ideology in their top 3 at Done.");
}

// 4. Uncertainty controls: apolitical celebrities, audited with the same instructions as everyone
// else, must not pass; report how the audited people fare.
const fs = require("fs");
const lib = require("./scripts/lib.js");
const judged = (dir, list) => list.filter((p) => fs.existsSync(require("path").join(dir, `${p.id}.json`)))
  .map((p) => ({ p, r: lib.personUncertainty(lib.readJson(require("path").join(dir, `${p.id}.json`)).answers) }));
const controls = judged(lib.CONTROLS_DIR, lib.controlsCatalog());
for (const { p, r } of controls) {
  const line = `${p.name}: ${r.known} positions, worst line ${Math.round(r.uncertainty * 100)}% unknown (at most ${Math.round(r.max * 100)}%)`;
  if (p.borderline) console.log(`Borderline control ${line} -> ${r.placed ? "included" : "excluded"}`);
  else assert(!r.placed, `control passed the uncertainty rule: ${line}`);
}
const people = judged(lib.PEOPLE_DIR, lib.peopleCatalog());
// people.js holds exactly the people placed on every line, less those listed on a closer match's page.
{
  const { PEOPLE } = require("./people.js");
  const listed = new Set(PEOPLE.flatMap((p) => [p.id, ...(p.related || []).map((r) => r.id)]));
  const misjudged = people.filter(({ p, r }) => r.placed !== listed.has(p.id)).map(({ p }) => p.id);
  assert(!misjudged.length, `people.js doesn't match the uncertainty judge (run node scripts/build.js --people): ${misjudged.join(", ")}`);
}
// Each person ships their place on the lines and reliability on each, as ideologies do.
{
  const pca = require("./pca.js");
  const { PEOPLE } = require("./people.js");
  const stale = PEOPLE.filter((p) => {
    const l = pca.locate(shipped, p.profile.slice(0, QUESTIONS.length));
    return !p.at || !p.reliability || l.at.some((x, k) => Math.abs(x - p.at[k]) > 1e-5)
      || l.reliability.some((x, k) => Math.abs(x - p.reliability[k]) > 1e-4);
  }).map((p) => p.id);
  assert(!stale.length, `people.js's places or reliabilities are stale (run node scripts/build.js --people): ${stale.slice(0, 5).join(", ")}`);
}
console.log(`Uncertainty: ${people.filter((x) => x.r.placed).length}/${people.length} audited people are placed on every line; ` +
  `${controls.filter((x) => !x.p.borderline && !x.r.placed).length}/${controls.filter((x) => !x.p.borderline).length} controls correctly excluded.`);

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
