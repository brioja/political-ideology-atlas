// Compiles statements.json and the audits into data.js, which the site loads.
//   node scripts/build.js            uses every audit that answers all active statements
//   node scripts/build.js --status   only reports which ideologies are audited, incomplete or missing
// Candidate statements (status "candidate") are left out of the test until promoted.
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, activeStatements, unanswered, TEXTS, catalog, profilePath,
  peopleCatalog, personPath, personSalience, ideologySalience } = require("./lib");
const { buildModel, meaningfulAxes, salienceContext, salience } = require("../pca.js");

const COLORS_FILE = path.join(ROOT, "audits", "ideology-colors.json");
const traditionalColors = fs.existsSync(COLORS_FILE) ? readJson(COLORS_FILE) : {};
const flagFor = (id) => {
  const c = traditionalColors[id];
  return c && c.colors && c.colors.length ? { colors: c.colors, note: c.note || "" } : null;
};
const statements = activeStatements();
let included = [];
const stale = [];
const missing = [];
const notSalient = [];
const notIdeology = [];

for (const entry of catalog()) {
  const p = profilePath(entry.id);
  if (!fs.existsSync(p)) { missing.push(entry.id); continue; }
  const a = readJson(p);
  if (a.notAnIdeology) { notIdeology.push(entry.id); continue; } // the audit's first check said so
  if (unanswered(a.answers, statements).length) { stale.push(entry.id); continue; }
  // Too few stated positions to tell it apart from its neighbours: leave it out, so it neither
  // appears in results nor shapes the dividing lines.
  if (!ideologySalience(a.answers).salient) { notSalient.push(entry.id); continue; }
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

// People: included when salient (see pca.js). A statement added after their audit counts as
// "no known position" until it is backfilled.
const people = [];
let excludedPeople = 0;
for (const entry of peopleCatalog()) {
  const p = personPath(entry.id);
  if (!fs.existsSync(p)) continue;
  const a = readJson(p);
  const answers = statements.map((s) => a.answers[s.id] || { value: null });
  if (!personSalience(a.answers).salient) { excludedPeople++; continue; }
  people.push({
    id: entry.id, name: entry.name, role: a.role, summary: a.summary, region: entry.region, born: entry.born,
    living: a.living ?? entry.living, wikipedia: a.wikipedia || entry.wikipedia, views12m: entry.views12m || 0,
    image: entry.image ? { url: entry.image.url, artist: entry.image.artist, license: entry.image.license, source: entry.image.source } : null,
    profile: answers.map((x) => x.value), // null = no known position
  });
}
console.log(`${people.length} people included, ${excludedPeople} excluded as not salient.`);

if (!process.argv.includes("--status")) {
  fs.writeFileSync(path.join(ROOT, "people.js"), `// Generated by scripts/build.js from audits/people. Do not edit by hand.
const PEOPLE = ${JSON.stringify(people)};

if (typeof module !== "undefined") module.exports = { PEOPLE };
`);
  console.log("Wrote people.js");
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

const calibration = require("../pca.js").calibrateCertainty(buildModel(included));

const out = `// Generated by scripts/build.js from statements.json and audits/profiles. Do not edit by hand.
const MEANINGFUL_LINES = ${meaningful};
const CALIBRATION = ${JSON.stringify(calibration.map((x) => (x == null ? null : Math.round(x * 1000) / 1000)))};
const QUESTIONS = ${JSON.stringify(statements.map((s) => ({ id: s.id, theme: s.theme, text: s.text, agree: s.agree, disagree: s.disagree, note: s.note, icon: s.icon })), null, 1)};

const IDEOLOGIES = ${JSON.stringify(included)};

if (typeof module !== "undefined") module.exports = { QUESTIONS, IDEOLOGIES };
`;
fs.writeFileSync(path.join(ROOT, "data.js"), out);
// Record each new statement's text, so a later rewording is caught (see lib.js).
const texts = fs.existsSync(TEXTS) ? readJson(TEXTS) : {};
for (const s of require("./lib").allStatements()) if (!(s.id in texts)) texts[s.id] = s.text;
fs.writeFileSync(TEXTS, JSON.stringify(texts, null, 1) + "\n");
console.log("Wrote data.js");
