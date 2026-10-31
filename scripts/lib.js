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
// Negative controls: apolitical celebrities audited the same way, expected to fail the uncertainty rule.
const CONTROLS_DIR = path.join(ROOT, "audits", "controls");
const controlsCatalog = () => readJson(path.join(ROOT, "audits", "controls-catalog.json")).people;
const controlPath = (id) => path.join(CONTROLS_DIR, `${id}.json`);

// Uncertainty (see pca.js) is judged against one context for ideologies and people alike: the lines of
// the landscape (every complete ideology audit, build.js) and their noise, as data.js ships them
// (PLACEMENT). It is judged from the rounded parts that are written out, so build.js,
// validate.js and test.js get the same verdicts. build.js passes the judge it has just made;
// everyone else gets the last build's.
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const judgeParts = (ctx) => ({
  k: ctx.k,
  noise: r6(ctx.noise),
  components: ctx.model.components.slice(0, ctx.k).map((c) => ({ eigenvalue: r6(c.eigenvalue), vector: c.vector.map((x) => Math.round(x * 1e4) / 1e4) })),
  // Each matched line in terms of the components (placementContext in pca.js), in the shipped order.
  lines: ctx.lines.map((row) => row.map(r6)),
});
// `ids`: the statement ids, in the order of the parts' vectors.
const judgeFrom = (parts, ids) => ({ ctx: require(path.join(ROOT, "pca.js")).placementFromParts(parts), ids });
// Silence in ideology audits written before "no known position" existed for them, when it was recorded
// as 0 (audits/AUDIT_RULES.md: silence is null): a low zero whose rationale the audit repeats 3+ times
// (a stock "no doctrine" line), or that says in words there is no position and mentions no split,
// difference or balance. Checked by hand on samples: about 95% of what it finds is silence; about a
// third of what it leaves (silence with a "but" clause) is too, for re-audits to pick up.
const SILENT = /\b(no (position|stance|view|doctrine|line|record|programme|program|documented|stated|known|clear|specific|explicit|common|shared|source (takes|decides|addresses|records|documents|covers|states|says))|not (address|discuss|mention|take|cover|state|applicable|part of|relevant|an? (issue|question|theme|concern|topic|matter|feature))\w*|(does|do|did)n.t (address|discuss|take|mention)|never (address|discuss|took|take)\w*|silent|nothing in|outside (its|the)|takes no|left neutral|offers? no|anachronis\w*|post-?dates?|pre-?dates?|irrelevant|beside the point|n\/a|undocumented|no counterpart|no \w+ (stance|position|view) (is )?(stated|recorded|documented)|not in (its|the) (documented )?(program|programme|platform|sources))\b/i;
const SPLIT = /\b(split|divided|mixed|balanc\w*|varie[ds]|vary|differ\w*|both (sides|ways)|compromise|tension|while|but\b|yet\b)\b/i;
function silentZeros(audit) {
  const uses = new Map();
  for (const a of Object.values(audit.answers || {})) uses.set(a.rationale, (uses.get(a.rationale) || 0) + 1);
  return new Set(Object.entries(audit.answers || {})
    .filter(([, a]) => a.value === 0 && a.confidence === "low"
      && (uses.get(a.rationale) >= 3 || (SILENT.test(a.rationale || "") && !SPLIT.test(a.rationale || ""))))
    .map(([id]) => id));
}
// An ideology audit's answers as the model takes them. "No known position" stays null: matching leaves
// it out, like a person's or a taker's (pca.js).
const ideologyProfile = (audit, statements = activeStatements()) => statements.map((s) => audit.answers[s.id].value);
// Every ideology audit that answers all active statements: the landscape the lines come from.
const completeIdeologies = (statements = activeStatements()) => catalog()
  .filter((e) => fs.existsSync(profilePath(e.id)))
  .map((e) => ({ id: e.id, audit: readJson(profilePath(e.id)) }))
  .filter(({ audit }) => !audit.notAnIdeology && !unanswered(audit.answers, statements).length)
  .map(({ id, audit }) => ({ id, name: audit.name, profile: ideologyProfile(audit, statements) }));
let lastJudge = null;
const shippedJudge = () => {
  if (!lastJudge) {
    const { QUESTIONS, PLACEMENT } = require(path.join(ROOT, "data.js"));
    lastJudge = judgeFrom(PLACEMENT, QUESTIONS.map((q) => q.id));
  }
  return lastJudge;
};
// The uncertainty rule (pca.js), from audit answers.
const judged = (answers, judge) =>
  require(path.join(ROOT, "pca.js")).uncertainty(judge.ctx, judge.ids.map((id) => (answers[id] ? answers[id].value : null)));
// Uncertainty counts every answer resting on evidence, whatever its confidence (audits/AUDIT_RULES.md,
// section 5): inferences, which begin "Inferred:", and "no known position" (null) don't count. They
// still count for matching, so nobody is shown on the strength of inferences.
const RULES = 2;
const evidenceOnly = (answers) => Object.fromEntries(Object.entries(answers)
  .map(([id, a]) => [id, /^Inferred:/.test((a && a.rationale) || "") ? { ...a, value: null } : a]));
const personUncertainty = (answers, judge = shippedJudge()) => judged(evidenceOnly(answers), judge);

// Ideology audits written before the shared rules (no "rules": 2) recorded silence as 0 and inferences
// unmarked, so only their medium and high answers count until they are re-audited.
const mediumOrHigh = (answers) => Object.fromEntries(Object.entries(answers)
  .map(([id, a]) => [id, { ...a, value: a.confidence === "low" ? null : a.value }]));
// The statements an ideology audit has a stated position on, as its uncertainty counts them: evidence,
// not "Inferred:" (or, in audits from before the shared rules, medium or high only); never null.
const statedPositions = (audit) => new Set(Object.entries((audit.rules >= RULES ? evidenceOnly : mediumOrHigh)(audit.answers))
  .filter(([, a]) => a.value != null).map(([id]) => id));
const ideologyUncertainty = (audit, judge = shippedJudge()) =>
  judged((audit.rules >= RULES ? evidenceOnly : mediumOrHigh)(audit.answers), judge);

// The inputs of the real-line count (build.js, audits/lines.json): pca.js and the answers of the
// ideologies it is counted on (`id` and `profile`, in catalog order).
const linesKey = (ideologies) => require("crypto").createHash("sha1")
  .update(fs.readFileSync(path.join(ROOT, "pca.js"), "utf8"))
  .update(JSON.stringify(ideologies.map((i) => [i.id, i.profile])))
  .digest("hex");
// The inputs of the quiz's progress calibration, hashed (see build.js and test.js): pca.js, the
// shown ideologies' answers and the placement context it measures fit with (PLACEMENT, as shipped).
const calibrationKey = (ideologies, placement) => require("crypto").createHash("sha1")
  .update(fs.readFileSync(path.join(ROOT, "pca.js"), "utf8"))
  .update(JSON.stringify(ideologies.map((i) => [i.id, i.profile])))
  .update(JSON.stringify(placement))
  .digest("hex");

// Ideologies held off the site until re-audited (audits/awaiting-reaudit.json). Their old audits still
// shape the dividing lines, like audits that fail the uncertainty rule.
const awaitingReaudit = () => {
  const f = path.join(ROOT, "audits", "awaiting-reaudit.json");
  return new Set(fs.existsSync(f) ? readJson(f).ids : []);
};

module.exports = { awaitingReaudit, linesKey, calibrationKey, ROOT, PROFILES_DIR, readJson, allStatements, activeStatements, isCandidate, TEXTS, unanswered, catalog, profilePath,
  PEOPLE_DIR, peopleCatalog, personPath, CONTROLS_DIR, controlsCatalog, controlPath, personUncertainty, ideologyUncertainty,
  RULES, statedPositions, silentZeros, ideologyProfile, judgeParts, judgeFrom, completeIdeologies };
