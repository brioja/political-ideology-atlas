// Shared helpers for the audit scripts.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PROFILES_DIR = path.join(ROOT, "audits", "profiles");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const allStatements = () => readJson(path.join(ROOT, "statements.json")).statements;
const catalog = () => readJson(path.join(ROOT, "audits", "catalog.json")).ideologies;

// Changes whenever a statement is added, removed or reworded, which marks
// every older audit as stale.
function statementsVersion() {
  const basis = JSON.stringify(allStatements().map((s) => [s.id, s.text]));
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 12);
}

const profilePath = (id) => path.join(PROFILES_DIR, `${id}.json`);

// People are audited the same way, with their own catalog and folder.
const PEOPLE_DIR = path.join(ROOT, "audits", "people");
const peopleCatalog = () => readJson(path.join(ROOT, "audits", "people-catalog.json")).people;
const personPath = (id) => path.join(PEOPLE_DIR, `${id}.json`);
// Negative controls: apolitical celebrities audited the same way, expected to fail salience.
const CONTROLS_DIR = path.join(ROOT, "audits", "controls");
const controlsCatalog = () => readJson(path.join(ROOT, "audits", "controls-catalog.json")).people;
const controlPath = (id) => path.join(CONTROLS_DIR, `${id}.json`);

// Salience (see pca.js): computed against the ideology model currently in data.js.
let salienceCache = null;
function personSalience(answers) {
  if (!salienceCache) {
    const { QUESTIONS, IDEOLOGIES } = require(path.join(ROOT, "data.js"));
    const pca = require(path.join(ROOT, "pca.js"));
    salienceCache = { pca, ids: QUESTIONS.map((q) => q.id), ctx: pca.salienceContext(pca.buildModel(IDEOLOGIES), IDEOLOGIES) };
  }
  const { pca, ids, ctx } = salienceCache;
  return pca.salience(ctx, ids.map((id) => (answers[id] ? answers[id].value : null)));
}

// Ideologies must answer every statement, inferring where the ideology never took a position
// (marked low confidence). For salience, only stated positions count: an inferred answer is the
// ideology equivalent of a person's "no known position".
const statedOnly = (answers) => Object.fromEntries(Object.entries(answers)
  .map(([id, a]) => [id, { ...a, value: a.confidence === "low" ? null : a.value }]));
const ideologySalience = (answers) => personSalience(statedOnly(answers));

module.exports = { ROOT, PROFILES_DIR, readJson, allStatements, catalog, statementsVersion, profilePath,
  PEOPLE_DIR, peopleCatalog, personPath, CONTROLS_DIR, controlsCatalog, controlPath, personSalience, ideologySalience };
