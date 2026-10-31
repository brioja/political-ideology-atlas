// Compiles statements.json and the audits into data.js, which the site loads.
//   node scripts/build.js            uses every audit that answers all active statements
//   node scripts/build.js --status   only reports which ideologies are audited, incomplete or missing
//   node scripts/build.js --people   only rewrites people.js against the model in data.js (seconds);
//                                    people never feed back into the ideologies, so nothing else changes
//   node scripts/build.js --resort-lines
//                                    puts the dividing lines back in order of size, once; later builds
//                                    keep that order (see keepLineOrder)
// Candidate statements (status "candidate") are left out of the test until promoted.
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, activeStatements, unanswered, TEXTS, catalog, profilePath,
  peopleCatalog, personPath, personUncertainty, ideologyUncertainty, ideologyProfile, judgeParts, judgeFrom } = require("./lib");
const { buildModel, modelFromParts, meaningfulAxes, placementContext, distanceSpread, varimax, matchPeople, fitScale, distance, locate, MAX_UNCERTAINTY, MAX_SHOWN_LINES } = require("../pca.js");

const COLORS_FILE = path.join(ROOT, "audits", "ideology-colors.json");
const traditionalColors = fs.existsSync(COLORS_FILE) ? readJson(COLORS_FILE) : {};
const flagFor = (id) => {
  const c = traditionalColors[id];
  return c && c.colors && c.colors.length ? { colors: c.colors, note: c.note || "" } : null;
};
const statements = activeStatements();
// Rounding for what data.js and people.js ship (defined first: the --people path uses them too).
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const r4 = (x) => Math.round(x * 1e4) / 1e4;
let included, stale, missing, notPlaced, notIdeology, awaiting;
const awaitingReaudit = require("./lib").awaitingReaudit();

if (process.argv.includes("--people")) {
  const { QUESTIONS } = require(path.join(ROOT, "data.js"));
  if (QUESTIONS.map((q) => q.id).join() !== statements.map((s) => s.id).join()) {
    console.error("The statements changed since data.js was built: run a full build.");
    process.exit(1);
  }
  const shipped = require(path.join(ROOT, "data.js"));
  writePeople(modelFromParts(shipped.IDEOLOGIES, shipped.MODEL, shipped.PLACEMENT));
  process.exit(0);
}

// `judge`: the uncertainty judge (pca.js); without one, every complete audit is included.
function classify(judge = null) {
  included = [];
  stale = [];
  missing = [];
  notPlaced = [];
  notIdeology = [];
  awaiting = [];
  for (const entry of catalog()) {
    const p = profilePath(entry.id);
    if (!fs.existsSync(p)) { missing.push(entry.id); continue; }
    const a = readJson(p);
    if (a.notAnIdeology) { notIdeology.push(entry.id); continue; } // the audit's first check said so
    if (unanswered(a.answers, statements).length) { stale.push(entry.id); continue; }
    // Stated positions on only some of the dividing lines: opinions, not a full ideology (the
    // uncertainty rule, pca.js). Left out of the results; it still shapes the lines (see below).
    if (judge && !ideologyUncertainty(a, judge).placed) { notPlaced.push(entry.id); continue; }
    if (judge && awaitingReaudit.has(entry.id)) { awaiting.push(entry.id); continue; }
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
      profile: ideologyProfile(a, statements),
    });
  }
}

// One model of the landscape: the dividing lines come from every complete ideology audit, including
// ones that fail the uncertainty rule (a thin record still belongs to the landscape; it just isn't
// placed on every line well enough to match against). Everything uses it: the real-line count, the
// uncertainty of ideologies and people, and placing takers, people and the shown ideologies. Judging
// against the shown set instead made the set depend on itself (each build shifted it).
classify();
const complete = included;
// How many lines are real: counted on the bare model (parallel analysis, too slow for a visitor's
// browser) and kept in audits/lines.json under a hash of pca.js and the answers, so a build reuses it
// until one of those changes (test.js fails if it is stale).
const LINES_FILE = path.join(ROOT, "audits", "lines.json");
const linesKey = require("./lib").linesKey(complete);
const cachedLines = fs.existsSync(LINES_FILE) ? readJson(LINES_FILE) : null;
let meaningful = cachedLines && cachedLines.key === linesKey ? cachedLines.realLines : null;
if (meaningful == null) {
  console.log("Counting the real dividing lines (their inputs changed)...");
  meaningful = complete.length >= 3 ? meaningfulAxes(buildModel(complete, { skipExtras: true }), complete) : 0;
  fs.writeFileSync(LINES_FILE, JSON.stringify({ note: "Generated by scripts/build.js: how many dividing lines beat shuffled noise (meaningfulAxes in pca.js) for every complete ideology audit, recomputed only when its key changes; test.js checks it.", key: linesKey, realLines: meaningful }, null, 1) + "\n");
}
const landscape = complete.length >= 3 ? buildModel(complete, { realLines: meaningful }) : null;
// The page needs only the leading components: the real lines (matchLines in pca.js, which partial
// answer sets are also fitted on) and the shown ones, if fewer lines are real than are shown.
const SHIPPED_COMPONENTS = Math.max(MAX_SHOWN_LINES, meaningful);
// Every line that beats noise is rotated so each is one cluster of statements (rotating only the
// shown ones blends the clusters left out into them); the shown lines (as app.js counts them) are
// named from audits/line-labels.json the way factors are named: by the statements that load most.
// A name holds only while its anchor statements are still among that end's strongest; otherwise the
// build warns and the page names that line's ends by ideologies, as before.
const SHOWN = Math.min(MAX_SHOWN_LINES, Math.max(2, meaningful));
const ROTATED = Math.max(SHOWN, meaningful);
const rotatedLines = landscape ? keepLineOrder(varimax(landscape, ROTATED), ROTATED) : [];
const lines = rotatedLines.slice(0, SHIPPED_COMPONENTS);
// The rotation sorts lines by variance, and mid-sized lines are close: one re-audit can swap their
// order, or move a line out of the shown ones, while the space they span stays the same. So each line
// keeps the slot of the previous build's line it matches best (the data.js being replaced); lines
// with no counterpart take the slots left, biggest first. A line that matches only loosely is reported.
// --resort-lines skips this once, so the order is by size again (Brandon re-sorted them on 2026-10-31).
function keepLineOrder(rotated, k) {
  const file = path.join(ROOT, "data.js");
  if (!fs.existsSync(file) || process.argv.includes("--resort-lines")) return rotated;
  const prev = require(file);
  if (!prev.MODEL || !prev.QUESTIONS) return rotated;
  const at = Object.fromEntries(prev.QUESTIONS.map((q, j) => [q.id, j]));
  const old = prev.MODEL.components.slice(0, Math.min(k, prev.MODEL.realLines || k))
    .map((c) => statements.map((s) => (at[s.id] === undefined ? 0 : c.vector[at[s.id]])));
  const cos = (a, b) => a.reduce((s, x, j) => s + x * b[j], 0) / Math.sqrt(a.reduce((s, x) => s + x * x, 0) * b.reduce((s, x) => s + x * x, 0));
  const pairs = [];
  rotated.slice(0, k).forEach((c, i) => old.forEach((o, slot) => pairs.push({ i, slot, c: cos(c.vector, o) })));
  pairs.sort((x, y) => Math.abs(y.c) - Math.abs(x.c));
  const bySlot = new Map(), taken = new Set();
  for (const p of pairs) if (!bySlot.has(p.slot) && !taken.has(p.i)) { bySlot.set(p.slot, p); taken.add(p.i); }
  const free = rotated.slice(0, k).map((_, i) => i).filter((i) => !taken.has(i));
  const order = [];
  for (let slot = 0; slot < k; slot++) {
    const p = bySlot.get(slot);
    if (p) {
      if (Math.abs(p.c) < 0.95) console.log(`Line ${slot + 1} changed since the last build (similarity ${Math.abs(p.c).toFixed(2)}); check its name.`);
      order.push(p.c < 0 ? { ...rotated[p.i], vector: rotated[p.i].vector.map((x) => -x) } : rotated[p.i]);
    } else order.push(rotated[free.shift()]);
  }
  return [...order, ...rotated.slice(k)];
}
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
// Any set of ideologies placed on the rotated lines, as the page does (modelFromParts), with the
// shipped placement context (below), which every distance measures with.
const onLandscape = (ideos) => modelFromParts(ideos, { mean: landscape.mean, components: rotatedLines, kept: landscape.kept, realLines: meaningful }, shippedPlacement);
// The one placement context (lines and noise), judged on the rotated lines matching uses: it judges
// the uncertainty of ideologies and people (scripts/lib.js), weighs each line in every distance and
// tells a taker how far they're placed, and data.js ships it as PLACEMENT.
const shippedPlacement = landscape && judgeParts(placementContext(landscape, { rotated: rotatedLines }));
const judge = shippedPlacement && judgeFrom(shippedPlacement, statements.map((s) => s.id));
classify(judge);

// Indistinguishable: two ideologies closer on the dividing lines than a distance can be off for
// someone who answered every statement (distanceSpread) can't be told apart by any set of answers. The one with
// more Wikipedia views stays in the test; the other is listed on its page as closely related.
const merged = [];
if (included.length >= 3) {
  const resolution = distanceSpread(judge.ctx, statements.map((_, j) => j));
  const at = Object.fromEntries(onLandscape(included).ideologies.map((i) => [i.id, i]));
  const dist = (a, b) => distance(at[a], at[b]);
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
// The shown ideologies on the landscape's lines (after indistinguishable ones are set aside).
const fullModel = included.length >= 3 ? onLandscape(included) : null;

// People: included when placed on every line (the uncertainty rule, pca.js), as ideologies are. A statement added
// after their audit counts as "no known position" until it is backfilled.
// `model`: the shipped dividing lines (modelFromParts), so people are ranked the way the page ranks them.
// `judge`: the uncertainty judge; by default the one data.js ships.
function writePeople(model, judge = undefined) {
  const people = [];
  let excludedPeople = 0;
  for (const entry of peopleCatalog()) {
    const p = personPath(entry.id);
    if (!fs.existsSync(p)) continue;
    const a = readJson(p);
    const answers = statements.map((s) => a.answers[s.id] || { value: null });
    if (!personUncertainty(a.answers, judge).placed) { excludedPeople++; continue; }
    people.push({
      id: entry.id, name: entry.name, role: a.role, summary: a.summary, region: entry.region, born: entry.born,
      living: a.living ?? entry.living, wikipedia: a.wikipedia || entry.wikipedia, views12m: entry.views12m || 0,
      image: entry.image ? { url: entry.image.url, artist: entry.image.artist, license: entry.image.license, source: entry.image.source } : null,
      profile: answers.map((x) => x.value), // null = no known position
    });
  }
  // AI models that took the quiz themselves (audits/PROMPT_MODEL.md) sit with the people, under the same
  // uncertainty rule. A declined statement counts as no known position.
  let models = 0, excludedModels = 0;
  for (const m of readJson(path.join(ROOT, "audits", "models-catalog.json")).models) {
    const p = path.join(ROOT, "audits", "models", `${m.id}.json`);
    if (m.hidden || !fs.existsSync(p)) continue; // hidden: kept on file, off the site

    const a = readJson(p);
    if (!personUncertainty(a.answers, judge).placed) { excludedModels++; continue; }
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
  // Each person's place on the lines and reliability on each, as ideologies ship theirs.
  for (const p of people) {
    const l = locate(model, p.profile);
    p.at = l.at.map(r6);
    p.reliability = l.reliability.map(r4);
  }
  models -= dropped.filter((p) => p.kind === "model").length;
  console.log(`${people.length - models} people included, ${excludedPeople} excluded as not placed on every line.`);
  if (twins.length) console.log(`Not uniquely reachable, listed on the closer match's page: ${twins.join(", ")}`);
  // Photos come from the catalog (scripts/images.js looks up only entries without one), so a person with
  // none usually means the lookup hasn't run since they were added, not that no free photo exists.
  const noPhoto = people.filter((p) => p.kind !== "model" && !p.image).map((p) => p.id);
  if (noPhoto.length) console.warn(`No photo stored for ${noPhoto.join(", ")}: run node scripts/images.js (some have no free photo at all).`);
  if (models || excludedModels) console.log(`${models} AI models included, ${excludedModels} excluded as not placed on every line.`);

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
if (notPlaced.length) console.log(`Excluded as not placed on every line (uncertainty over ${MAX_UNCERTAINTY * 100}% on one): ${notPlaced.join(", ")}`);
if (merged.length) console.log(`Indistinguishable, listed on the closer match's page: ${merged.join(", ")}`);
if (awaiting.length) console.log(`Off the site until re-audited: ${awaiting.length}`);
if (notIdeology.length) console.log(`Not an ideology the test can place: ${notIdeology.join(", ")}`);
if (process.argv.includes("--status")) process.exit(0);
if (included.length < 3) {
  console.error("Need at least 3 audited ideologies to build; data.js left unchanged.");
  process.exit(1);
}

console.log(`${meaningful} dividing lines stand out from noise.`);

const shippedModel = {
  mean: landscape.mean.map(r6),
  kept: landscape.kept,
  components: lines.map((c) => ({ eigenvalue: r6(c.eigenvalue), share: r6(c.share), vector: c.vector.map(r6) })),
  labels,
  realLines: meaningful,
};
// Each shown ideology's place on the shipped lines and its reliability on each (locate in pca.js), so
// the page doesn't work them out for every ideology at load; people.js ships people's the same way.
modelFromParts(included, shippedModel, shippedPlacement).ideologies.forEach((i, k) => {
  included[k].at = i.at.map(r6);
  included[k].reliability = i.reliability.map(r4);
});
// The similarity scale's 0% end (fitScale in pca.js): the widest distance between two shown ideologies.
shippedModel.span = r6(fitScale(modelFromParts(included, shippedModel, shippedPlacement)));

// "What it stands for": an ideology's strongly held stated positions (never an inference, a silence
// or a leaning), the ones furthest from the average ideology's answer first; fewer if it has fewer.
// Shipped as statement indexes so the page and the static pages show the same list.
const BELIEFS = 6;
for (const i of included) {
  const stated = require("./lib").statedPositions(readJson(profilePath(i.id)));
  i.beliefs = statements.map((s, j) => j).filter((j) => stated.has(statements[j].id) && Math.abs(i.profile[j]) === 2)
    .sort((x, y) => Math.abs(i.profile[y] - landscape.mean[y]) - Math.abs(i.profile[x] - landscape.mean[x]) || x - y)
    .slice(0, BELIEFS);
}

writePeople(modelFromParts(included, shippedModel, shippedPlacement), judge);

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
const QUESTIONS = ${JSON.stringify(statements.map((s) => ({ id: s.id, theme: s.theme, text: s.text, agree: s.agree, disagree: s.disagree, note: s.note, icon: s.icon })), null, 1)};

const SHARE_SLOTS = ${JSON.stringify(shareSlots.slots)};

const IDEOLOGIES = ${JSON.stringify(included)};

// The dividing lines, computed here so the page doesn't have to (see modelFromParts in pca.js).
const MODEL = ${JSON.stringify(shippedModel)};

// How precisely a set of answers places someone (see placementFromParts in pca.js).
const PLACEMENT = ${JSON.stringify(shippedPlacement)};

if (typeof module !== "undefined") module.exports = { QUESTIONS, SHARE_SLOTS, IDEOLOGIES, MEANINGFUL_LINES, MODEL, PLACEMENT };
`;
fs.writeFileSync(path.join(ROOT, "data.js"), out);
// Record each new statement's text, so a later rewording is caught (see lib.js).
const texts = fs.existsSync(TEXTS) ? readJson(TEXTS) : {};
for (const s of require("./lib").allStatements()) if (!(s.id in texts)) texts[s.id] = s.text;
fs.writeFileSync(TEXTS, JSON.stringify(texts, null, 1) + "\n");
console.log("Wrote data.js");
