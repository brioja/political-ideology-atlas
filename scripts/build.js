// Compiles statements.json and the audits into data.js, which the site loads.
//   node scripts/build.js            uses every audit that answers all active statements
//   node scripts/build.js --status   only reports which ideologies are audited, incomplete or missing
//   node scripts/build.js --people   only rewrites people.js against the model in data.js (seconds);
//                                    people never feed back into the ideologies, so nothing else changes
// Candidate statements (status "candidate") are left out of the test until promoted.
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, activeStatements, unanswered, TEXTS, catalog, profilePath,
  peopleCatalog, personPath, personSalience, ideologySalience, useSalienceModel } = require("./lib");
const { buildModel, modelFromParts, meaningfulAxes, salienceContext, salience, varimax, matchPeople, spreadOn } = require("../pca.js");

const COLORS_FILE = path.join(ROOT, "audits", "ideology-colors.json");
const traditionalColors = fs.existsSync(COLORS_FILE) ? readJson(COLORS_FILE) : {};
const flagFor = (id) => {
  const c = traditionalColors[id];
  return c && c.colors && c.colors.length ? { colors: c.colors, note: c.note || "" } : null;
};
const statements = activeStatements();
let included, stale, missing, notSalient, notIdeology;

if (process.argv.includes("--people")) {
  const { QUESTIONS } = require(path.join(ROOT, "data.js"));
  if (QUESTIONS.map((q) => q.id).join() !== statements.map((s) => s.id).join()) {
    console.error("The statements changed since data.js was built: run a full build.");
    process.exit(1);
  }
  const shipped = require(path.join(ROOT, "data.js"));
  writePeople(modelFromParts(shipped.IDEOLOGIES, shipped.MODEL));
  process.exit(0);
}

function classify(useSalience = true) {
  included = [];
  stale = [];
  missing = [];
  notSalient = [];
  notIdeology = [];
  for (const entry of catalog()) {
    const p = profilePath(entry.id);
    if (!fs.existsSync(p)) { missing.push(entry.id); continue; }
    const a = readJson(p);
    if (a.notAnIdeology) { notIdeology.push(entry.id); continue; } // the audit's first check said so
    if (unanswered(a.answers, statements).length) { stale.push(entry.id); continue; }
    // Too few stated positions to tell it apart from its neighbours: leave it out, so it neither
    // appears in results nor shapes the dividing lines.
    if (useSalience && !ideologySalience(a.answers).salient) { notSalient.push(entry.id); continue; }
    included.push({
      id: entry.id,
      name: entry.name,
      summary: a.summary,
      audited: true,
      // Traditional colors (flag, party or symbol), when the ideology has a documented tradition.
      flag: flagFor(entry.id),
      // The Wikipedia article's freely licensed lead image, with its credit (scripts/images.js).
      image: entry.image ? { url: entry.image.url, artist: entry.image.artist, license: entry.image.license, source: entry.image.source } : null,
      wikipedia: "wikipedia" in a ? a.wikipedia : ["exact", "redirect"].includes(entry.wikipediaMatch) ? entry.wikipedia : null,
      furtherReading: a.furtherReading || [],
      keyFigures: (a.keyFigures || []).map(({ name, role, wikipedia }) => ({ name, role, wikipedia })),
      profile: statements.map((s) => a.answers[s.id].value),
    });
  }
}

// Salience is judged against the dividing lines of every complete ideology audit, not just the ones
// shown: judging against the shown set made the set depend on itself (each build shifted it, and
// repeating to a fixed point oscillated). This way one pass decides it from the audits alone.
classify(false);
if (included.length >= 3) useSalienceModel(included, statements);
classify();

// Parallel analysis is too slow to run in every visitor's browser at this size, so do it here.
const meaningful = included.length >= 3 ? meaningfulAxes(buildModel(included), included) : 0;

// Indistinguishable: two ideologies closer on the dividing lines than the placement uncertainty of
// someone who answered every statement can't be told apart by any set of answers. The one with
// more Wikipedia views stays in the test; the other is listed on its page as closely related.
const merged = [];
if (included.length >= 3) {
  const ctx = salienceContext(buildModel(included), included, { lines: meaningful });
  const resolution = salience(ctx, statements.map(() => 0)).uncertainty;
  const scores = Object.fromEntries(ctx.model.ideologies.map((i) => [i.id, i.scores.slice(0, ctx.k)]));
  const dist = (a, b) => Math.sqrt(scores[a].reduce((s, x, i) => s + (x - scores[b][i]) ** 2, 0));
  const views = Object.fromEntries(catalog().map((e) => [e.id, e.views12m || 0]));
  const kept = new Set();
  for (const ideo of [...included].sort((a, b) => views[b.id] - views[a.id])) {
    const twin = included.find((k) => kept.has(k.id) && dist(k.id, ideo.id) < resolution);
    if (!twin) { kept.add(ideo.id); continue; }
    (twin.related = twin.related || []).push({ id: ideo.id, name: ideo.name, wikipedia: ideo.wikipedia });
    merged.push(`${ideo.id} (with ${twin.id})`);
  }
  included = included.filter((i) => kept.has(i.id));
}

if (included.length >= 3) useSalienceModel(included, statements, meaningful);

// What the page needs to say how precisely a taker is placed (placementFromParts in pca.js): the
// unrotated leading components and the noise level, which the rotated lines in MODEL don't carry.
const placementCtx = included.length >= 3 ? salienceContext(buildModel(included), included, { lines: meaningful }) : null;
const shippedPlacement = placementCtx && {
  k: placementCtx.k,
  noise: Math.round(placementCtx.noise * 1e6) / 1e6,
  bar: Math.round(placementCtx.bar * 1e6) / 1e6,
  components: placementCtx.model.components.slice(0, placementCtx.k).map((c) => ({ eigenvalue: Math.round(c.eigenvalue * 1e6) / 1e6, vector: c.vector.map((x) => Math.round(x * 1e4) / 1e4) })),
};

// People: included when salient (see pca.js), judged against the ideologies shown. A statement added
// after their audit counts as "no known position" until it is backfilled.
// `model`: the shipped dividing lines (modelFromParts), so people are ranked the way the page ranks them.
function writePeople(model) {
  const people = [];
  let excludedPeople = 0;
  for (const entry of peopleCatalog()) {
    const p = personPath(entry.id);
    if (!fs.existsSync(p)) continue;
    const a = readJson(p);
    const answers = statements.map((s) => a.answers[s.id] || { value: null });
    if (!personSalience(a.answers, entry.id).salient) { excludedPeople++; continue; }
    people.push({
      id: entry.id, name: entry.name, role: a.role, summary: a.summary, region: entry.region, born: entry.born,
      living: a.living ?? entry.living, wikipedia: a.wikipedia || entry.wikipedia, views12m: entry.views12m || 0,
      image: entry.image ? { url: entry.image.url, artist: entry.image.artist, license: entry.image.license, source: entry.image.source } : null,
      profile: answers.map((x) => x.value), // null = no known position
    });
  }
  // AI models that took the quiz themselves (audits/PROMPT_MODEL.md) sit with the people, under the same
  // salience rule. A declined statement counts as no known position.
  let models = 0, excludedModels = 0;
  for (const m of readJson(path.join(ROOT, "audits", "models-catalog.json")).models) {
    const p = path.join(ROOT, "audits", "models", `${m.id}.json`);
    if (m.hidden || !fs.existsSync(p)) continue; // hidden: kept on file, off the site

    const a = readJson(p);
    if (!personSalience(a.answers).salient) { excludedModels++; continue; }
    models++;
    people.push({
      id: m.id, name: m.name, kind: "model", role: `AI model by ${m.provider}`, summary: m.summary, region: m.region,
      born: m.released, living: true, takenAt: m.takenAt, wikipedia: null, views12m: 0, image: m.image || null,
      profile: statements.map((s) => (a.answers[s.id] ? a.answers[s.id].value : null)),
    });
  }
  // Uniquely reachable: someone whose own answers would rank another person first (the site ranks by
  // similarity, near-ties going to the more widely read) can't be reached by any set of answers, so
  // they're listed on that person's page instead, as indistinguishable ideologies are. The more widely
  // read of two is checked first and keeps its place.
  const reachable = [], twins = [];
  for (const p of [...people].sort((x, y) => y.views12m - x.views12m)) {
    const [top] = matchPeople(model, p.profile, [...reachable, p]);
    if (!top || top.id === p.id) { reachable.push(p); continue; }
    const twin = reachable.find((r) => r.id === top.id);
    (twin.related = twin.related || []).push({ id: p.id, name: p.name });
    twins.push(`${p.id} (with ${twin.id})`);
  }
  const kept = new Set(reachable.map((p) => p.id));
  const dropped = people.filter((p) => !kept.has(p.id));
  people.splice(0, people.length, ...people.filter((p) => kept.has(p.id)));
  models -= dropped.filter((p) => p.kind === "model").length;
  console.log(`${people.length - models} people included, ${excludedPeople} excluded as not salient.`);
  if (twins.length) console.log(`Not uniquely reachable, listed on the closer match's page: ${twins.join(", ")}`);
  // Photos come from the catalog (scripts/images.js looks up only entries without one), so a person with
  // none usually means the lookup hasn't run since they were added, not that no free photo exists.
  const noPhoto = people.filter((p) => p.kind !== "model" && !p.image).map((p) => p.id);
  if (noPhoto.length) console.warn(`No photo stored for ${noPhoto.join(", ")}: run node scripts/images.js (some have no free photo at all).`);
  if (models || excludedModels) console.log(`${models} AI models included, ${excludedModels} excluded as not salient.`);

  if (!process.argv.includes("--status")) {
    fs.writeFileSync(path.join(ROOT, "people.js"), `// Generated by scripts/build.js from audits/people and audits/models. Do not edit by hand.
const PEOPLE = ${JSON.stringify(people)};

if (typeof module !== "undefined") module.exports = { PEOPLE };
`);
    console.log("Wrote people.js");
  }
}

console.log(`${included.length} audited, ${stale.length} incomplete, ${missing.length} not yet audited (of ${catalog().length}).`);
if (stale.length) console.log(`Incomplete (answer the missing statements): ${stale.join(", ")}`);
if (notSalient.length) console.log(`Excluded as not salient (too few stated positions): ${notSalient.join(", ")}`);
if (merged.length) console.log(`Indistinguishable, listed on the closer match's page: ${merged.join(", ")}`);
if (notIdeology.length) console.log(`Not an ideology the test can place: ${notIdeology.join(", ")}`);
if (process.argv.includes("--status")) process.exit(0);
if (included.length < 3) {
  console.error("Need at least 3 audited ideologies to build; data.js left unchanged.");
  process.exit(1);
}

console.log(`${meaningful} dividing lines stand out from noise.`);

const fullModel = buildModel(included);
// The quiz's progress calibration replays the quiz for simulated takers, so it is slow; it depends only
// on pca.js and the ideologies' answers (and the model built from them), so it is kept in
// audits/calibration.json under a hash of those and recomputed only when one changes. test.js checks it.
const CALIBRATION_FILE = path.join(ROOT, "audits", "calibration.json");
const calibrationKey = require("./lib").calibrationKey(included, fullModel);
const cachedCalibration = fs.existsSync(CALIBRATION_FILE) ? readJson(CALIBRATION_FILE) : null;
let calibration;
if (cachedCalibration && cachedCalibration.key === calibrationKey) calibration = cachedCalibration.values;
else {
  console.log("Calibrating the quiz progress (its inputs changed)...");
  calibration = require("../pca.js").calibrateCertainty(fullModel).map((x) => (x == null ? null : Math.round(x * 1000) / 1000));
  fs.writeFileSync(CALIBRATION_FILE, JSON.stringify({ note: "Generated by scripts/build.js and recomputed when its key (a hash of pca.js, the ideologies' answers and the model) changes; test.js checks it.", key: calibrationKey, values: calibration }, null, 1) + "\n");
}
// The page needs only the leading components: the rotated lines (shown or not) and the 8 used to
// place a partial set of answers. SHIPPED_COMPONENTS keeps a margin over both.
const SHIPPED_COMPONENTS = 12;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
// Every line that beats noise is rotated so each is one cluster of statements (rotating only the
// shown ones blends the clusters left out into them); the shown lines (as app.js counts them) are
// named from audits/line-labels.json the way factors are named: by the statements that load most.
// A name holds only while its anchor statements are still among that end's strongest; otherwise the
// build warns and the page names that line's ends by ideologies, as before.
const SHOWN = Math.min(8, Math.max(2, meaningful));
const lines = varimax(fullModel, Math.max(SHOWN, meaningful)).slice(0, SHIPPED_COMPONENTS);
const labelSets = readJson(path.join(ROOT, "audits", "line-labels.json")).lines;
const qIndex = Object.fromEntries(statements.map((s, j) => [s.id, j]));
const used = new Set();
const labels = lines.slice(0, SHOWN).map((c, i) => {
  const order = c.vector.map((w, j) => [w, j]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const lowTop = new Set(order.slice(0, 10)), highTop = new Set(order.slice(-10));
  const holds = (end, top) => end.anchors.filter((id) => top.has(qIndex[id])).length >= Math.min(2, end.anchors.length);
  for (const [k, set] of labelSets.entries()) {
    if (used.has(k)) continue;
    const [a, b] = set.ends;
    if (holds(a, lowTop) && holds(b, highTop)) { used.add(k); return { low: a.name, high: b.name }; }
    if (holds(b, lowTop) && holds(a, highTop)) { used.add(k); c.vector = c.vector.map((x) => -x); return { low: a.name, high: b.name }; }
  }
  const top = (ids) => ids.slice(0, 3).map((j) => statements[j].id).join(", ");
  console.warn(`Line ${i + 1} matches no name in audits/line-labels.json (strongest statements: ${top(order)} | ${top(order.slice().reverse())}); its ends are named by ideologies.`);
  return null;
});
const shippedModel = {
  mean: fullModel.mean.map(r6),
  kept: fullModel.kept,
  components: lines.map((c) => ({ eigenvalue: r6(c.eigenvalue), share: r6(c.share), vector: c.vector.map(r6) })),
  labels,
};
// match()'s scale with every statement answered: every pair of ideologies compared on all of them,
// ~150 ms in a browser, the same on every visit.
shippedModel.fullSpread = spreadOn(modelFromParts(included, shippedModel), statements.map((_, j) => j));

writePeople(modelFromParts(included, shippedModel));

// Share links index answers by audits/share-slots.json, which only ever grows (see encodeShare in pca.js).
const SLOTS_FILE = path.join(ROOT, "audits", "share-slots.json");
const shareSlots = readJson(SLOTS_FILE);
const newSlots = statements.map((s) => s.id).filter((id) => !shareSlots.slots.includes(id));
if (newSlots.length) {
  shareSlots.slots.push(...newSlots);
  fs.writeFileSync(SLOTS_FILE, JSON.stringify(shareSlots, null, 1) + "\n");
  console.log(`Added ${newSlots.length} share-link slot(s): ${newSlots.join(", ")}`);
}

const out = `// Generated by scripts/build.js from statements.json and audits/profiles. Do not edit by hand.
const MEANINGFUL_LINES = ${meaningful};
const CALIBRATION = ${JSON.stringify(calibration)};
const QUESTIONS = ${JSON.stringify(statements.map((s) => ({ id: s.id, theme: s.theme, text: s.text, agree: s.agree, disagree: s.disagree, note: s.note, icon: s.icon })), null, 1)};

const SHARE_SLOTS = ${JSON.stringify(shareSlots.slots)};

const IDEOLOGIES = ${JSON.stringify(included)};

// The dividing lines, computed here so the page doesn't have to (see modelFromParts in pca.js).
const MODEL = ${JSON.stringify(shippedModel)};

// How precisely a set of answers places someone (see placementFromParts in pca.js).
const PLACEMENT = ${JSON.stringify(shippedPlacement)};

if (typeof module !== "undefined") module.exports = { QUESTIONS, SHARE_SLOTS, IDEOLOGIES, MEANINGFUL_LINES, CALIBRATION, MODEL, PLACEMENT };
`;
fs.writeFileSync(path.join(ROOT, "data.js"), out);
// Record each new statement's text, so a later rewording is caught (see lib.js).
const texts = fs.existsSync(TEXTS) ? readJson(TEXTS) : {};
for (const s of require("./lib").allStatements()) if (!(s.id in texts)) texts[s.id] = s.text;
fs.writeFileSync(TEXTS, JSON.stringify(texts, null, 1) + "\n");
console.log("Wrote data.js");
