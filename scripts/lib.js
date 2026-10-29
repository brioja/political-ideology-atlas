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

// Salience (see pca.js) is judged against one of two contexts, each defined here once:
// - ideologies: the dividing lines of every complete ideology audit, not just the ones shown, so the
//   shown set doesn't depend on itself. build.js writes it to audits/salience-ideologies.json under a
//   hash of its inputs; test.js fails when it is stale.
// - people: the lines of the ideologies shown, as data.js ships them (PLACEMENT).
// Both are judged from the rounded parts that are written out, so build.js, validate.js and test.js
// get the same verdicts. build.js passes the judges it has just made; everyone else gets the last
// build's.
const IDEOLOGY_JUDGE_PATH = path.join(ROOT, "audits", "salience-ideologies.json");
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const judgeParts = (ctx) => ({
  k: ctx.k,
  noise: r6(ctx.noise),
  bar: r6(ctx.bar),
  components: ctx.model.components.slice(0, ctx.k).map((c) => ({ eigenvalue: r6(c.eigenvalue), vector: c.vector.map((x) => Math.round(x * 1e4) / 1e4) })),
});
// `ids`: the statement ids, in the order of the parts' vectors.
const judgeFrom = (parts, ids) => ({ ctx: require(path.join(ROOT, "pca.js")).placementFromParts(parts), ids });
// The ideology judge's inputs: pca.js, the statements and every complete audit's answers (as `id` and
// `profile`, in catalog order).
const ideologyJudgeKey = (ideologies, statements) => require("crypto").createHash("sha1")
  .update(fs.readFileSync(path.join(ROOT, "pca.js"), "utf8"))
  .update(JSON.stringify(statements.map((s) => s.id)))
  .update(JSON.stringify(ideologies.map((i) => [i.id, i.profile])))
  .digest("hex");
// An ideology audit's answers as the model takes them. "No known position" (null) counts as 0 for
// now, as it did when the audits recorded silence as 0: matching changes only once a regression set
// shows what treating it as unanswered does (it would then be left out, like a person's).
const ideologyProfile = (audit, statements = activeStatements()) => statements.map((s) => audit.answers[s.id].value ?? 0);
// Every ideology audit that answers all active statements, which is what the ideology judge is built from.
const completeIdeologies = (statements = activeStatements()) => catalog()
  .filter((e) => fs.existsSync(profilePath(e.id)))
  .map((e) => ({ id: e.id, audit: readJson(profilePath(e.id)) }))
  .filter(({ audit }) => !audit.notAnIdeology && !unanswered(audit.answers, statements).length)
  .map(({ id, audit }) => ({ id, name: audit.name, profile: ideologyProfile(audit, statements) }));
let lastIdeologyJudge = null, lastPeopleJudge = null;
const ideologyJudge = () => {
  if (!lastIdeologyJudge) {
    const file = readJson(IDEOLOGY_JUDGE_PATH);
    lastIdeologyJudge = judgeFrom(file.parts, file.ids);
  }
  return lastIdeologyJudge;
};
const peopleJudge = () => {
  if (!lastPeopleJudge) {
    const { QUESTIONS, PLACEMENT } = require(path.join(ROOT, "data.js"));
    lastPeopleJudge = judgeFrom(PLACEMENT, QUESTIONS.map((q) => q.id));
  }
  return lastPeopleJudge;
};
// Placement precision against the judge's bar, scaled by `factor`.
function placed(answers, factor, judge) {
  const r = require(path.join(ROOT, "pca.js")).salience(judge.ctx, judge.ids.map((id) => (answers[id] ? answers[id].value : null)));
  return { ...r, bar: r.bar * factor, salient: r.uncertainty <= r.bar * factor };
}
// People are held to a looser bar than ideologies. An ideology must be told apart from its nearest
// neighbour; a person only has to be placed well enough to be compared at all, and the build's
// "uniquely reachable" check already keeps two people from being indistinguishable. A person placed
// near a looser bar lands close to the middle of the lines and turns up in many takers' results, so at
// 1.125x a record needs roughly 40-60 positions, depending on how they spread over the themes.
const PEOPLE_BAR = 1.125;
// The bar was 1.5x until 2026-10-26. People shown under it who don't yet meet the new bar are listed in
// audits/people-legacy-bar.json and keep the old bar, so they stay on the site while their audits are
// deepened. An id leaves the list once its audit meets the new bar, or once a second pass still
// doesn't and the person leaves the site (test.js checks both); none are added.
const LEGACY_PEOPLE_BAR = 1.5;
const LEGACY_PATH = path.join(ROOT, "audits", "people-legacy-bar.json");
let legacyIds = null;
const onLegacyBar = (id) => (legacyIds ||= new Set(fs.existsSync(LEGACY_PATH) ? readJson(LEGACY_PATH).ids : [])).has(id);
// Salience counts every answer resting on evidence, whatever its confidence (audits/AUDIT_RULES.md,
// section 5): inferences, which begin "Inferred:", and "no known position" (null) don't count. They
// still count for matching, so nobody is shown on the strength of inferences.
const RULES = 2;
const evidenceOnly = (answers) => Object.fromEntries(Object.entries(answers)
  .map(([id, a]) => [id, /^Inferred:/.test((a && a.rationale) || "") ? { ...a, value: null } : a]));
// `id` is needed only for people who may be on the legacy bar; `legacy` says whether that bar applied.
const personSalience = (answers, id = null, judge = peopleJudge()) => {
  const r = placed(evidenceOnly(answers), PEOPLE_BAR, judge);
  if (r.salient || !id || !onLegacyBar(id)) return { ...r, legacy: false };
  const old = placed(evidenceOnly(answers), LEGACY_PEOPLE_BAR, judge);
  return { ...old, legacy: old.salient, strictBar: r.bar };
};

// Ideology audits written before the shared rules (no "rules": 2) recorded silence as 0 and inferences
// unmarked, so only their medium and high answers count until they are re-audited.
const mediumOrHigh = (answers) => Object.fromEntries(Object.entries(answers)
  .map(([id, a]) => [id, { ...a, value: a.confidence === "low" ? null : a.value }]));
const ideologySalience = (audit, judge = ideologyJudge()) =>
  placed((audit.rules >= RULES ? evidenceOnly : mediumOrHigh)(audit.answers), 1, judge);

// The inputs of the quiz's progress calibration, hashed (see build.js and test.js): pca.js, each
// ideology's answers, and the model calibrated on.
const calibrationKey = (ideologies, model) => require("crypto").createHash("sha1")
  .update(fs.readFileSync(path.join(ROOT, "pca.js"), "utf8"))
  .update(JSON.stringify(ideologies.map((i) => [i.id, i.profile])))
  .update(JSON.stringify([model.mean, model.components.map((c) => c.vector)]))
  .digest("hex");

module.exports = { calibrationKey, ROOT, PROFILES_DIR, readJson, allStatements, activeStatements, isCandidate, TEXTS, unanswered, catalog, profilePath,
  PEOPLE_DIR, peopleCatalog, personPath, CONTROLS_DIR, controlsCatalog, controlPath, personSalience, ideologySalience,
  RULES, ideologyProfile, IDEOLOGY_JUDGE_PATH, judgeParts, judgeFrom, ideologyJudgeKey, completeIdeologies, LEGACY_PATH, onLegacyBar };
