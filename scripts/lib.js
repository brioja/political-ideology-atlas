// Shared helpers for the audit scripts.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PROFILES_DIR = path.join(ROOT, "audits", "profiles");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const allStatements = () => readJson(path.join(ROOT, "statements.json")).statements;
// Candidates are answered by audits but not asked in the test until audits show they are
// contested (audits/statements/STANDARD.md).
const isCandidate = (s) => s.status === "candidate";
const activeStatements = () => allStatements().filter((s) => !isCandidate(s));
const catalog = () => readJson(path.join(ROOT, "audits", "catalog.json")).ideologies;

// Audits go stale per statement, not all at once: a new statement only needs answering, and a
// removed one is ignored. Rewording would silently change what was answered, so a reworded
// statement gets a new id; audits/statements/texts.json records each id's text and test.js
// fails if one changes.
const TEXTS = path.join(ROOT, "audits", "statements", "texts.json");
const unanswered = (answers, statements = allStatements()) => statements.filter((s) => !(answers && answers[s.id])).map((s) => s.id);

const profilePath = (id) => path.join(PROFILES_DIR, `${id}.json`);

// People are audited the same way, with their own catalog and folder.
const PEOPLE_DIR = path.join(ROOT, "audits", "people");
const peopleCatalog = () => readJson(path.join(ROOT, "audits", "people-catalog.json")).people;
const personPath = (id) => path.join(PEOPLE_DIR, `${id}.json`);
// Negative controls: apolitical celebrities audited the same way, expected to fail salience.
const CONTROLS_DIR = path.join(ROOT, "audits", "controls");
const controlsCatalog = () => readJson(path.join(ROOT, "audits", "controls-catalog.json")).people;
const controlPath = (id) => path.join(CONTROLS_DIR, `${id}.json`);

// Salience (see pca.js): computed against the ideology model currently in data.js, unless
// useSalienceModel has set another (build.js does, to judge against the set it is building).
let salienceCache = null;
function useSalienceModel(ideologies, statements, lines) {
  const pca = require(path.join(ROOT, "pca.js"));
  salienceCache = { pca, ids: statements.map((s) => s.id), ctx: pca.salienceContext(pca.buildModel(ideologies), ideologies, { lines }) };
}
// Placement precision against the bar (see pca.js), scaled by `factor`.
function placed(answers, factor) {
  if (!salienceCache) {
    // data.js records how many lines beat noise, so the slow parallel analysis isn't rerun here.
    const { QUESTIONS, IDEOLOGIES, MEANINGFUL_LINES } = require(path.join(ROOT, "data.js"));
    const pca = require(path.join(ROOT, "pca.js"));
    salienceCache = { pca, ids: QUESTIONS.map((q) => q.id), ctx: pca.salienceContext(pca.buildModel(IDEOLOGIES), IDEOLOGIES, { lines: MEANINGFUL_LINES }) };
  }
  const { pca, ids, ctx } = salienceCache;
  const r = pca.salience(ctx, ids.map((id) => (answers[id] ? answers[id].value : null)));
  return { ...r, bar: r.bar * factor, salient: r.uncertainty <= r.bar * factor };
}
// People are held to a looser bar than ideologies. An ideology must be told apart from its nearest
// neighbour; a person only has to be placed well enough to be compared at all, and the build's
// "uniquely reachable" check already keeps two people from being indistinguishable. At 1.5x a solid
// record of roughly 20-25 positions passes, while the apolitical controls (0-5 positions) sit at 2.3x
// or more and still fail.
const PEOPLE_BAR = 1.5;
const personSalience = (answers) => placed(answers, PEOPLE_BAR);

// Ideologies must answer every statement, inferring where the ideology never took a position
// (marked low confidence). For salience, only stated positions count: an inferred answer is the
// ideology equivalent of a person's "no known position".
const statedOnly = (answers) => Object.fromEntries(Object.entries(answers)
  .map(([id, a]) => [id, { ...a, value: a.confidence === "low" ? null : a.value }]));
const ideologySalience = (answers) => placed(statedOnly(answers), 1);
// The bar itself: the median distance between an ideology and its nearest neighbour (see pca.js).
const salienceBar = () => (placed({}, 1), salienceCache.ctx.bar);

module.exports = { ROOT, PROFILES_DIR, readJson, allStatements, activeStatements, isCandidate, TEXTS, unanswered, catalog, profilePath,
  PEOPLE_DIR, peopleCatalog, personPath, CONTROLS_DIR, controlsCatalog, controlPath, personSalience, ideologySalience,
  salienceBar, useSalienceModel };
