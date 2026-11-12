// Validates ideology audits.
//   node scripts/validate.js             all audits present in audits/profiles
//   node scripts/validate.js <id> [...]  specific audits
//   add --links to also check that every source URL responds
//   add --people to validate person audits (audits/people) instead of ideologies
//   add --controls to validate the negative-control audits (audits/controls)
//   add --dir <folder> to read the audits from that folder instead (a lane's drafts, audits/PROMPT_LANE.md)
//   add --no-uncertainty to skip the uncertainty rule (whether the audit places them on every
//   dividing line; it loads the whole model: slow).
const fs = require("fs");
const lib = require("./lib");
const { readJson, allStatements, isCandidate, personUncertainty, ideologyUncertainty } = lib;
const CONTROLS = process.argv.includes("--controls");
const PEOPLE = CONTROLS || process.argv.includes("--people");
const UNCERTAINTY = !process.argv.includes("--no-uncertainty");
const PROFILES_DIR = CONTROLS ? lib.CONTROLS_DIR : PEOPLE ? lib.PEOPLE_DIR : lib.PROFILES_DIR;
const catalog = CONTROLS ? lib.controlsCatalog : PEOPLE ? lib.peopleCatalog : lib.catalog;
const DIR = process.argv.includes("--dir") ? process.argv[process.argv.indexOf("--dir") + 1] : null;
const profilePath = DIR ? (id) => require("path").resolve(DIR, `${id}.json`) : CONTROLS ? lib.controlPath : PEOPLE ? lib.personPath : lib.profilePath;

const KINDS = ["primary", "scholarly", "reference", "program"];
const EVIDENCE = ["action", "words"]; // rules 4: what a source records of the subject (AUDIT_RULES.md, "Record over words")
// Why an entry isn't audited (the first check, audits/PROMPT.md). The first six are things that HAVE ideas
// but aren't a set of ideas (Brandon, 2026-11-05); the last is content that holds no political ideas.
const NOT_AN_IDEOLOGY_REASONS = ["PERSON", "PARTY", "ORGANIZATION", "STATE", "GOVERNMENT_BODY", "EVENT", "DOES_NOT_INCLUDE_IDEAS"];
const CONFIDENCE = ["high", "medium", "low"];
// The rules version new audits and later passes write ("rules" in audits/AUDIT_RULES.md, PROMPT.md, PROMPT_PEOPLE.md).
const CURRENT_RULES = 7;
// Minimum gap between audit passes: half the project's age (days since PROJECT_START, the first commit) on the date
// of the later pass, so it grows by a day every two days. REAUDIT_FROM: the date the rule applies from.
const PROJECT_START = "2026-10-14", REAUDIT_FROM = "2026-11-08";
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const reauditGap = (date) => Math.ceil(days(PROJECT_START, date) / 2);
// The earliest date a later pass on this audit may carry ("" when there is no earlier pass).
const nextPassFrom = (a) => { const d = (Array.isArray(a.passes) && a.passes.length ? a.passes.map((p) => p.auditedAt) : [a.auditedAt]).filter(Boolean).sort().pop(); // gap >= (next - start) / 2  <=>  next >= d + (d - start): the earliest next pass waits as long as the project was old at d.
  return d ? new Date(Date.parse(d) + Math.max(0, days(PROJECT_START, d)) * 864e5).toISOString().slice(0, 10) : ""; };
const BANNED_HOSTS = ["12axes", "8values", "politicalcompass", "idrlabs", "polcompball", "sapplyvalues"];

let grandfatheredIds = null;
function grandfathered() {
  if (!grandfatheredIds) {
    try {
      grandfatheredIds = new Set(require("child_process").execSync("git ls-tree --name-only 480478e1 audits/profiles/", { cwd: lib.ROOT })
        .toString().split("\n").filter(Boolean).map((f) => f.replace(/^.*\//, "").replace(/\.json$/, "")));
    } catch { grandfatheredIds = new Set(); }
  }
  return grandfatheredIds;
}

// The committed copy of an audit, to check a later pass's edits against it (append-only history, no sourced
// answer changed without a talk-page record). Read only when the audit can differ from it: a draft checked from
// elsewhere, a file with uncommitted changes, or one with a committed history (one git call each per run).
let withHistory, modified, committedForTests = null;
function committedVersion(id, readFrom) {
  if (committedForTests) return committedForTests(id);
  const path = require("path"), cp = require("child_process");
  const canonical = path.join(PROFILES_DIR, `${id}.json`), rel = path.relative(lib.ROOT, canonical);
  const git = (args) => { try { return cp.execFileSync("git", args, { cwd: lib.ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { return ""; } };
  if (!withHistory) withHistory = new Set(git(["grep", "-l", '"reviewHistory"', "HEAD", "--", "audits/"]).split("\n").filter(Boolean).map((l) => l.replace(/^HEAD:/, "")));
  if (!modified) modified = new Set(git(["diff", "--name-only", "HEAD", "--", "audits/"]).split("\n").filter(Boolean));
  if (path.resolve(readFrom) === canonical && !modified.has(rel) && !withHistory.has(rel)) return null;
  const text = git(["show", `HEAD:${rel}`]);
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

// A person's own books in the local corpora (Brandon, 2026-11-07: audits missed books already on disk): files in
// the maintainer reference library whose name holds the person's full name, and Gutenberg books (selection.tsv)
// whose catalog author is the person (surname, plus birth year or first name). Local to this machine: where the
// corpora aren't present the check is skipped.
let libraryForTests = null, libraryCache;
function personBooks(name, born) {
  const fold = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let lib0 = libraryForTests;
  if (!lib0) {
    if (libraryCache === undefined) {
      const root = require("path").join(require("os").homedir(), ".cache", "political-ideology-atlas", "corpora");
      try {
        const reference = fs.readdirSync(require("path").join(root, "reference", "text"));
        const texts = fs.readdirSync(require("path").join(root, "gutenberg", "text"));
        const byId = new Map(texts.map((f) => [f.split(" ")[0], f]));
        const gutenberg = fs.readFileSync(require("path").join(root, "gutenberg", "selection.tsv"), "utf8").split("\n").filter(Boolean)
          .map((l) => l.split("\t")).filter((r) => byId.has(r[0])).map((r) => ({ file: byId.get(r[0]), authors: r[1] || "" }));
        libraryCache = { reference, gutenberg };
      } catch { libraryCache = null; }
    }
    lib0 = libraryCache;
  }
  if (!lib0) return null;
  const parts = fold(name).split(/\s+/).filter(Boolean), full = parts.join(" "), surname = parts[parts.length - 1], first = parts[0];
  // Either order: "Hannah Arendt - …" or a library's "Arendt, Hannah - …".
  const words = (x) => ` ${fold(x).replace(/[^a-z0-9]+/g, " ").trim()} `;
  const forms = [words(full), words(`${surname} ${parts.slice(0, -1).join(" ")}`)];
  const ref = lib0.reference.filter((f) => forms.some((n) => words(f).includes(n)));
  const gut = lib0.gutenberg.filter((b) => { const a = fold(b.authors); return a.startsWith(`${surname},`) && (born ? a.includes(String(born)) : a.includes(first)); }).map((b) => b.file);
  return [...ref, ...gut];
}

// Rules 6 (Brandon, 2026-11-12: audits stopped at "not in the local corpora"): texts by the person that are known
// to exist, each cited or declined. Project Gutenberg's whole catalog (English texts whose catalog author is the
// person: surname, plus birth year or first name; scripts/gutenberg.js fetches any of them), their Miller Center
// speeches, and whether Voteview has them as a member of Congress. Local to this machine: skipped where the corpora
// aren't present.
let textsForTests = null, textsCache;
function personTexts(name, born) {
  if (textsForTests) return textsForTests;
  const path = require("path"), root = path.join(require("os").homedir(), ".cache", "political-ideology-atlas", "corpora");
  if (textsCache === undefined) {
    try {
      const t = fs.readFileSync(path.join(root, "gutenberg", "raw", "pg_catalog.csv"), "utf8"), rows = []; let row = [], f = "", q = false;
      for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
        else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
        else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c;
      }
      const [head, ...rest] = rows, col = (k) => head.indexOf(k);
      const gutenberg = rest.filter((r) => r[col("Language")] === "en" && r[col("Type")] === "Text")
        .map((r) => ({ id: r[col("Text#")], title: r[col("Title")].replace(/\s+/g, " "), authors: r[col("Authors")] }));
      const miller = fs.readFileSync(path.join(root, "millercenter", "speeches.jsonl"), "utf8").split("\n").filter(Boolean)
        .map((l) => { const j = JSON.parse(l); return { speaker: j.speaker, url: j.url, title: j.title }; });
      const members = fs.readFileSync(path.join(root, "voteview", "HSall_members.csv"), "utf8");
      textsCache = { gutenberg, miller, members };
    } catch { textsCache = null; }
  }
  if (!textsCache) return null;
  const fold = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const parts = fold(name).split(/\s+/).filter(Boolean), surname = parts[parts.length - 1], first = parts[0];
  const gutenberg = textsCache.gutenberg.filter((b) => fold(b.authors).split(";").some((x) => { x = x.trim();
    return x.startsWith(`${surname},`) && (born ? x.includes(String(born)) : x.includes(first)); }));
  const miller = textsCache.miller.filter((m) => fold(m.speaker) === parts.join(" "));
  const voteview = born ? textsCache.members.includes(`"${surname.toUpperCase()}, ${first[0].toUpperCase()}${first.slice(1)}`) &&
    new RegExp(`"${surname.toUpperCase()}, [^"]*",[A-Z0-9]*,${born}\\.0,`, "i").test(textsCache.members) : false;
  return { gutenberg, miller, voteview };
}

// Rules 6: a source the audit reports it could not get. Notes that say a work was unavailable name it in "notFound",
// with at least two attempts in different places (Brandon, 2026-11-12: one look is not a search).
const UNFOUND = /\b(?:not (?:available|accessible|online|found|located|obtainable|digiti[sz]ed|in the local corpora)|unavailable|(?:could|was|were) not (?:be )?(?:found|obtained|accessed|located|read)|no (?:online|digital|accessible|full)[- ](?:copy|text|edition|transcript))\b/i;
const STOP = new Set(["the", "and", "his", "her", "their", "from", "with", "that", "this", "were", "which", "into", "over", "about", "speeches", "speech", "text", "texts", "local", "corpora"]);

function validate(id) {
  const errors = [];
  const warnings = [];
  const p = profilePath(id);
  if (!fs.existsSync(p)) return { errors: [`missing ${p}`], warnings };
  let a;
  try { a = readJson(p); } catch (e) { return { errors: [`invalid JSON: ${e.message}`], warnings }; }

  const entry = catalog().find((c) => c.id === id);
  if (!entry) errors.push(`id '${id}' is not in audits/catalog.json`);

  // The first check (audits/PROMPT.md): an entry that isn't an ideology the test can place gets a
  // short record instead of an audit. It's finished, and excluded like an uncertainty failure.
  if (!PEOPLE && a.notAnIdeology !== undefined) {
    // { "reason": one of NOT_AN_IDEOLOGY_REASONS, "explanation": "..." }.
    const n = a.notAnIdeology;
    if (!n || !NOT_AN_IDEOLOGY_REASONS.includes(n.reason)) errors.push(`"notAnIdeology.reason" must be one of ${NOT_AN_IDEOLOGY_REASONS.join(", ")}`);
    else if (typeof n.explanation !== "string" || n.explanation.trim().length < 20) errors.push('"notAnIdeology.explanation" needs at least a sentence');
    const src = Array.isArray(a.sources) ? a.sources : [];
    if (!src.length || src.some((x) => !/^https?:\/\/\S+$/.test(x.url || ""))) errors.push('"notAnIdeology" needs at least one source with an http(s) url');
    // An article that talks about the entry's "ideas" holds ideas (Brandon, 2026-11-06): no DOES_NOT_INCLUDE_IDEAS
    // then; audit it. Reads the cached page (validate.js main fetches it first).
    if (n && n.reason === "DOES_NOT_INCLUDE_IDEAS" && entry) {
      const text = lib.articleText(entry);
      const hits = text ? (text.match(/\bideas\b/gi) || []).length : 0;
      if (hits) errors.push(`DOES_NOT_INCLUDE_IDEAS not allowed: its Wikipedia article (${lib.articleTitle(entry)}) says "ideas" ${hits} time${hits > 1 ? "s" : ""}; audit it in full`);
    }
    if (!errors.length) errors.push(`not an ideology: ${n.reason}: ${n.explanation}`);
    return { errors, warnings };
  }
  if (a.id !== id) errors.push(`"id" is '${a.id}', expected '${id}'`);
  // An old audit passes the checks of the rules it was written under, not the current ones (a pass at "rules" 3
  // predates the coatrack rule and the source-tie check): say so first, so a pass isn't read as meeting today's rules.
  if ((a.rules || 0) < CURRENT_RULES) {
    let from = ""; try { from = nextPassFrom(a); } catch { /* an invalid date is reported by its own check */ }
    warnings.push(`old audit: written under ${a.rules ? `rules ${a.rules}` : "no rules version"} (current ${CURRENT_RULES}), so later rules aren't checked here; a later pass brings it up to rules ${CURRENT_RULES}${from ? ` (from ${from})` : ""}`);
  }
  for (const f of PEOPLE ? ["name", "auditedAt", "summary", "role"] : ["name", "auditedAt", "summary", "scope"]) {
    if (typeof a[f] !== "string" || !a[f].trim()) errors.push(`"${f}" must be a non-empty string`);
  }
  // A merged audit (two models researched independently) lists every model id.
  const isId = (s) => typeof s === "string" && !!s.trim();
  if (!(isId(a.auditor) || (Array.isArray(a.auditor) && a.auditor.length && a.auditor.every(isId)))) {
    errors.push('"auditor" must be a model id or a non-empty list of model ids');
  }
  // A merged audit also lists each independent pass, so a model that already audited someone isn't
  // sent to audit them again (one model can appear twice, e.g. a redo of a search-starved pass).
  if (Array.isArray(a.auditor) || a.passes !== undefined) {
    const passes = Array.isArray(a.passes) ? a.passes : [];
    if (!passes.length || passes.some((p) => !isId(p.auditor) || !/^\d{4}-\d{2}-\d{2}$/.test(p.auditedAt || ""))) {
      errors.push('"passes" must list every audit pass as { "auditor": model id, "auditedAt": "YYYY-MM-DD" }');
    } else {
      for (const m of [].concat(a.auditor)) if (!passes.some((p) => p.auditor === m)) errors.push(`"passes" has no pass by ${m}`);
      // A later pass comes at least half the project's age after the previous one (Brandon, 2026-11-07: the same audits
      // were re-audited several times within days; fixed 14 days, then half the project's age the same day).
      // Passes from REAUDIT_FROM on; earlier ones stand as they are.
      // The gap paces normal runs; it doesn't block development: a pass the maintainer merges early carries
      // "gapException": "<why> (<maintainer>, <date>)" and is exempt (Brandon, 2026-11-08, the Democratic socialism test).
      const sorted = [...passes].sort((x, y) => x.auditedAt.localeCompare(y.auditedAt));
      const dates = sorted.map((p) => p.auditedAt), last = dates[dates.length - 1], prev = dates[dates.length - 2];
      const excepted = typeof sorted[sorted.length - 1].gapException === "string" && sorted[sorted.length - 1].gapException.trim().length >= 10;
      if (prev && !excepted && last >= REAUDIT_FROM && days(prev, last) < days(PROJECT_START, last) / 2) {
        errors.push(`"passes": a later pass comes at least ${reauditGap(last)} days (half the project's age) after the previous one (${prev}); this one is dated ${last}`);
      }
    }
  }

  if (a.wikipedia !== null && !/^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/.test(a.wikipedia || "")) {
    errors.push('"wikipedia" must be an en.wikipedia.org article URL or null');
  }
  const reading = Array.isArray(a.furtherReading) ? a.furtherReading : [];
  if (!PEOPLE && (reading.length < 2 || reading.length > 4)) errors.push(`"furtherReading" needs 2 to 4 items, has ${reading.length}`);
  for (const r of reading) {
    if (!r.title || !/^https?:\/\/\S+$/.test(r.url || "")) errors.push(`furtherReading item needs a title and an http(s) url`);
  }

  const sources = Array.isArray(a.sources) ? a.sources : [];
  if (sources.length < 3) errors.push(`needs at least 3 sources, has ${sources.length}`);
  // The sources have to discuss the ideology (scripts/source-check.js). Strict for audits that list
  // "aliases" (required from 2026-11-06); a warning for older audits.
  if (!PEOPLE) {
    // Audits committed before the check (480478e1) only get warnings (adding aliases to one later
    // doesn't change that); every audit written after it, or dated 2026-11-06 on, is held to it.
    const strict = (a.auditedAt || "") >= "2026-11-06" || !grandfathered().has(id);
    if (a.aliases === undefined && strict) errors.push('"aliases" is required: other names the defining sources use for the ideology ([] for none)');
    // Evidence for aliases, authors and titles is required from 2026-11-06 on (older audits get it at their next pass).
    // A source cited only on talk pages (reviewHistory) or as the reason for a nulling documents a replaced version,
    // often the very source it was replaced for (Wikipedia, another subject's text): it isn't evidence of a current
    // position, so the tie check skips it.
    const citedNow = new Set([
      ...Object.values(a.answers || {}).flatMap((x) => (x && x.value !== null && Array.isArray(x.sources) ? x.sources : [])),
      ...(Array.isArray(a.keyFigures) ? a.keyFigures : []).flatMap((f) => f.sources || []),
      ...(Array.isArray(a.missingStatements) ? a.missingStatements : []).flatMap((m) => [...(m.sources || []), ...(m.quotes || []).map((q) => q.source)]),
      ...[...(Array.isArray(a.aliases) ? a.aliases : []), ...(Array.isArray(a.authors) ? a.authors : [])].map((x) => x && x.source),
      ...(Array.isArray(a.sources) ? a.sources : []).flatMap((s) => (s.titles || []).map((t) => t && t.source)),
    ].filter(Boolean));
    const historyOnly = new Set(Object.values(a.answers || {}).flatMap((x) => (x && Array.isArray(x.reviewHistory) ? x.reviewHistory : []))
      .flatMap((e) => (e && Array.isArray(e.sources) ? e.sources : [])).filter((sid) => !citedNow.has(sid)));
    const checked = historyOnly.size ? { ...a, sources: (a.sources || []).filter((s) => !historyOnly.has(s.id)) } : a;
    const { problems, unchecked } = require("./source-check").check(id, checked, { strict: (a.auditedAt || "") >= "2026-11-06" });
    const out = strict ? errors : warnings;
    for (const pr of problems) out.push(`sources: ${pr}`);
    if (unchecked.length) out.push(`sources: ${unchecked.join(", ")} have no saved copy in scratchpad/sources/${id}/ to check (save every source you cite)`);
  }
  const sourceIds = new Set();
  for (const s of sources) {
    if (sourceIds.has(s.id)) errors.push(`duplicate source id ${s.id}`);
    sourceIds.add(s.id);
    if (!KINDS.includes(s.kind)) errors.push(`source ${s.id}: kind must be one of ${KINDS.join(", ")}`);
    if (!/^https?:\/\/\S+$/.test(s.url || "")) errors.push(`source ${s.id}: url must be an http(s) URL`);
    else if (BANNED_HOSTS.some((h) => new URL(s.url).host.includes(h))) errors.push(`source ${s.id}: political-quiz sites are not allowed`);
    if (!s.title) errors.push(`source ${s.id}: missing title`);
  }
  // A Wikipedia article about a document is a reference, never the document itself.
  const wikiPrimary = sources.filter((s) => (s.kind === "primary" || s.kind === "program") && /wikipedia\.org/i.test(s.url || "")).map((s) => s.id);
  if (wikiPrimary.length) errors.push(`${wikiPrimary.join(", ")}: a Wikipedia article is a "reference" source, not "primary" or "program"`);
  if (!sources.some((s) => s.kind === "scholarly" || s.kind === "reference")) errors.push("needs at least one scholarly or reference source");
  if (sources.length && sources.every((s) => /wikipedia\.org/.test(s.url || ""))) errors.push("Wikipedia cannot be the only kind of source");

  const answers = a.answers || {};
  const statements = allStatements();
  const active = statements.filter((s) => !isCandidate(s));
  const notYet = [];
  for (const st of statements) {
    const ans = answers[st.id];
    // A new (candidate) statement only needs answering; the rest of the audit stays valid.
    if (!ans && isCandidate(st)) { notYet.push(st.id); continue; }
    if (!ans) { errors.push(`no answer for '${st.id}'`); continue; }
    // "No known position" (null) needs a reason; for an ideology, that its sources record none
    // (audits/PROMPT.md), at low confidence.
    if (ans.value === null) {
      if (!ans.rationale) errors.push(`${st.id}: say why there is no known position`);
      if (ans.confidence !== "low") errors.push(`${st.id}: a "no known position" answer is low confidence`);
      continue;
    }
    if (![-2, -1, 0, 1, 2].includes(ans.value)) errors.push(`${st.id}: value must be an integer from -2 to 2 or null`);
    if (!CONFIDENCE.includes(ans.confidence)) errors.push(`${st.id}: confidence must be high, medium or low`);
    if (!ans.rationale || ans.rationale.trim().length < 20) errors.push(`${st.id}: rationale missing or too short`);
    if (!Array.isArray(ans.sources) || ans.sources.length === 0) errors.push(`${st.id}: cite at least one source`);
    else for (const sid of ans.sources) if (!sourceIds.has(sid)) errors.push(`${st.id}: unknown source '${sid}'`);
  }
  if (notYet.length) warnings.push(`no answers yet for candidate statements (its next completing pass answers them): ${notYet.join(", ")}`);
  // A high-confidence answer rests on what a source says about that statement, so its rationale
  // can't be one stock phrase shared with other high answers (lower the confidence instead).
  const highs = new Map();
  for (const st of statements) {
    const ans = answers[st.id];
    if (ans?.confidence !== "high" || !ans.rationale) continue;
    const r = ans.rationale.trim().toLowerCase();
    highs.set(r, [...(highs.get(r) || []), st.id]);
  }
  for (const ids of highs.values()) if (ids.length > 1) errors.push(`${ids.join(", ")}: high-confidence answers share one rationale; say what the source states for each, or lower the confidence`);
  // A rationale that calls its own answer an inference, split or anachronistic is describing a low
  // answer, and one that says the sources don't address it can't be high (audits/PROMPT.md).
  const SELF_LOW = /\b(inferred|by inference|an inference|(adherents|supporters|members|followers|strands?) (are |were )?(split|divided)|(is|are|was|were|remains?) (split|divided|contested)|contested among|anachronis\w*|speculative)\b/i;
  const NOT_LOW = /\bnot (contested|speculative)\b/i;
  // Rules 3 has no inferences, so a rationale has no reason to mention one, not even to deny it: it states the evidence
  // (Brandon, 2026-11-08, after "rather than an inference" read as a confession).
  const INFERENCE = /\b(inferred|inferring|by inference|an inference|inferences?)\b/i;
  const mentionsInference = [];
  const UNADDRESSED = /\b(not addressed|never address\w*|not discussed|no documented position|sources? (do|does) not (discuss|address|mention))\b/i;
  const selfLow = [], unaddressedHigh = [];
  for (const st of statements) {
    const ans = answers[st.id];
    if (!ans?.rationale) continue;
    if (a.rules >= 3 && ans.value !== null && INFERENCE.test(ans.rationale)) mentionsInference.push(st.id);
    else if (ans.confidence === "medium" && SELF_LOW.test(ans.rationale) && !NOT_LOW.test(ans.rationale)) selfLow.push(st.id);
    if (ans.confidence === "high" && UNADDRESSED.test(ans.rationale)) unaddressedHigh.push(st.id);
  }
  if (mentionsInference.length) errors.push(`${mentionsInference.join(", ")}: rationale mentions inference; rules 3 has none: state the evidence that settles the statement, and don't say whether it is an inference (or answer null if there is none)`);
  if (selfLow.length) errors.push(`${selfLow.join(", ")}: rationale says inferred, split, contested or anachronistic, so the confidence is low`);
  // Every answer needs evidence (no inferences, for every subject since rules 3; Brandon 2026-11-08, after the check
  // had covered living people only): an answer whose rationale says it is inferred, or that nothing records the
  // position, is "no known position" instead.
  const NO_EVIDENCE = /\b(inferred|by inference|no record of|no source (states|says|addresses)|no known (statement|position))\b/i;
  {
    const guessed = statements.filter((st) => answers[st.id] && answers[st.id].value !== null && NO_EVIDENCE.test(answers[st.id].rationale || "")).map((st) => st.id);
    if (guessed.length) errors.push(`${guessed.join(", ")}: the rationale says there's no evidence of this position, so answer null (no known position)`);
  }
  if (unaddressedHigh.length) errors.push(`${unaddressedHigh.join(", ")}: rationale says the sources don't address it, so the confidence is at most medium`);
  // Audits under the shared rules (audits/AUDIT_RULES.md, "rules": 2): an inference is marked, so
  // the uncertainty rule can leave it out, and Wikipedia alone is no evidence.
  if (a.rules >= lib.RULES) {
    const INFERRED = /\b(inferred|by inference|an inference)\b/i;
    const unmarked = statements.filter((st) => answers[st.id] && answers[st.id].value !== null
      && INFERRED.test(answers[st.id].rationale || "") && !NOT_LOW.test(answers[st.id].rationale)
      && !/^Inferred:/.test(answers[st.id].rationale)).map((st) => st.id);
    if (unmarked.length) errors.push(`${unmarked.join(", ")}: an inferred answer's rationale begins "Inferred:"`);
    // Wikipedia, OnTheIssues and similar compilations are only a way to find evidence (AUDIT_RULES.md).
    const onlyFrom = (pattern) => {
      const ids = new Set(sources.filter((s) => pattern.test(s.url || "")).map((s) => s.id));
      return statements.filter((st) => answers[st.id] && answers[st.id].value !== null && !/^Inferred:/.test(answers[st.id].rationale || "")
        && (answers[st.id].sources || []).length && answers[st.id].sources.every((sid) => ids.has(sid))).map((st) => st.id);
    };
    const wikiOnly = onlyFrom(/wikipedia\.org/i);
    if (wikiOnly.length) errors.push(`${wikiOnly.join(", ")}: Wikipedia is only a way to find evidence; cite the source it cites`);
    const compiledOnly = onlyFrom(/ontheissues\.org|wikipedia\.org/i).filter((id) => !wikiOnly.includes(id));
    if (compiledOnly.length) errors.push(`${compiledOnly.join(", ")}: OnTheIssues is only a way to find evidence; cite the source it cites`);
  }
  // Rules 3 has no inferences: every answer is stated or null (audits/AUDIT_RULES.md, section 3).
  if (a.rules >= 3) {
    const inferred = statements.filter((st) => answers[st.id] && /^Inferred:/.test(answers[st.id].rationale || "")).map((st) => st.id);
    if (inferred.length) errors.push(`${inferred.join(", ")}: rules 3 has no inferences; answer from a stated position that settles the statement, or null`);
  }
  // Rules 4 (Brandon, 2026-11-07). AUDIT_RULES.md states only the principle ("Record over words": where the
  // subject has a record on a statement it answers alone, and words never set aside an action); the mechanics
  // live here, and each error message says how to fix it.
  // - Every source has "evidence": "action" when it records what the subject did (votes, laws, orders, acts,
  //   policies, or a report that they happened), "words" when it records what they said or wrote (speeches,
  //   interviews, books, posts, programmes, a summary of their views). A source holding both (a day of the
  //   Congressional Record with a speech and a roll call) is listed twice, once per kind.
  // - An answer (not null) never cites both kinds: the actions answer alone.
  // - A null found nothing and cites nothing ("sources": []). An audit never overturns its own answers: if its own
  //   evidence doesn't answer a statement, it doesn't cite it there. Only a nulling by a later pass (with a
  //   reviewHistory) cites the source behind its reason.
  // - "reviewHistory" is a statement's talk page (WP:BRD): every version of the answer, oldest first, each signed
  //   { "value", "confidence", "rationale", "sources", "author", "date" }. The first entry is the first sourced
  //   version; each later entry is a reply that changed it (bold or revert), signed by the pass that wrote it.
  //   An unsourced version, or a null before the first answer (nothing found), has nothing to review and is left out; a statement with fewer than 2 sourced versions
  //   has no history (the field is absent). The last entry is the current answer (what people see), word for word.
  // - Words never overturn an action: an answer resting on an action can be nulled only on an action (e.g. the
  //   vote itself shows it was on another question), and a nulled answer that rested on an action comes back
  //   only on an action.
  // - A nulled answer can come back (a revert included, no label needed) under the same rules as any change.
  // - The history is append-only (checked against the committed file).
  // - Each review that nulls adds { "kind": "nulling", "reviewer", "reviewedAt", "nulled": N } to "reviews"; their
  //   counts add up to the nullings in the history. A first audit (one pass, no nulling review) has no history.
  const ev = new Map(sources.map((s) => [s.id, s.evidence]));
  const kinds = (ids, k) => (Array.isArray(ids) ? ids : []).filter((sid) => ev.get(sid) === k);
  if (a.rules >= 4) {
    for (const s of sources) if (!EVIDENCE.includes(s.evidence)) errors.push(`source ${s.id}: "evidence" must be one of ${EVIDENCE.join(", ")}`);
    for (const st of statements) {
      const x = answers[st.id];
      if (!x) continue;
      const cited = Array.isArray(x.sources) ? x.sources : [];
      if (x.value !== null) {
        const action = kinds(cited, "action"), words = kinds(cited, "words");
        if (action.length && words.length) errors.push(`${st.id}: cites actions (${action.join(", ")}) and words (${words.join(", ")}); record over words: answer from the actions alone and drop the words`);
        continue;
      }
      // A null found nothing: it cites nothing. Only a nulling (a later pass, with a reviewHistory) cites the
      // source behind its reason.
      if (x.reviewHistory === undefined) {
        const action = kinds(cited, "action");
        if (action.length) errors.push(`${st.id}: null cites an action (${action.join(", ")}): an action on the statement answers it, so answer from it (or don't cite it here if it is about another question)`);
        else if (cited.length) errors.push(`${st.id}: a null found nothing, so it cites nothing ("sources": []); evidence that doesn't answer the statement isn't cited here`);
      } else if (!cited.length) errors.push(`${st.id}: a nulling cites the source behind its reason in "sources"`);
    }
  }
  const nullings = (Array.isArray(a.reviews) ? a.reviews : []).filter((r) => r && r.kind === "nulling");
  for (const r of nullings) if (!isId(r.reviewer) || !/^\d{4}-\d{2}-\d{2}$/.test(r.reviewedAt || "") || !(Number.isInteger(r.nulled) && r.nulled > 0)) {
    errors.push('a "nulling" review is { "kind": "nulling", "reviewer": who nulled, "reviewedAt": "YYYY-MM-DD", "nulled": how many answers }');
  }
  let nulledCount = 0;
  const historyIds = [];
  const sameAnswer = (p, q) => JSON.stringify([p.value, p.confidence, p.rationale, p.sources || []]) === JSON.stringify([q.value, q.confidence, q.rationale, q.sources || []]);
  for (const st of statements) {
    const x = answers[st.id], h = x && x.reviewHistory;
    if (h === undefined) continue;
    historyIds.push(st.id);
    if (!Array.isArray(h) || h.length < 2) { errors.push(`${st.id}: "reviewHistory" has the original answer and at least one reply that changed it (2 or more entries)`); continue; }
    let ok = true;
    for (const [i, e] of h.entries()) {
      const where = `${st.id}: reviewHistory[${i}]`;
      if (!e || typeof e !== "object" || !(e.value === null || [-2, -1, 0, 1, 2].includes(e.value)) || !CONFIDENCE.includes(e.confidence)
        || typeof e.rationale !== "string" || !e.rationale.trim() || !Array.isArray(e.sources) || !e.sources.length
        || !isId(e.author) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) {
        errors.push(`${where} is a signed, sourced version of the answer { "value", "confidence", "rationale", "sources" (not empty: an unsourced version has nothing to review, leave it out), "author", "date" }`);
        ok = false; continue;
      }
      for (const sid of e.sources) if (!sourceIds.has(sid)) errors.push(`${where}: unknown source '${sid}'`);
    }
    if (!ok) continue;
    if (h[0].value === null) errors.push(`${st.id}: reviewHistory starts at the first answer: a null before it found nothing and has nothing to review, so leave it out`);
    if (!sameAnswer(h[h.length - 1], x)) errors.push(`${st.id}: the last reviewHistory entry is the current answer, word for word`);
    // Walk the versions in order and check each change.
    let lastNulled = null;
    for (let i = 1; i < h.length; i++) {
      const prev = h[i - 1], next = h[i], where = `${st.id}: reviewHistory[${i}]`;
      if (prev.value !== null && next.value === null) {
        nulledCount++;
        lastNulled = prev;
        const act = kinds(prev.sources, "action"), why = kinds(next.sources, "words");
        if (act.length && why.length) errors.push(`${where}: words (${why.join(", ")}) can't null an action (${act.join(", ")})`);
      } else if (prev.value === null && next.value !== null && lastNulled) {
        if (kinds(lastNulled.sources, "action").length && !kinds(next.sources, "action").length) errors.push(`${where}: the nulled answer rested on an action, so a new answer needs an action too (words can't overturn it)`);
      }
    }
  }
  // Answers to a statement since removed from the bank keep their history. A nulling review recorded
  // before the removal counted those nullings; one recorded after it (ban-fgm, 2026-11-10) did not, so
  // the reviews may count any number of them.
  const current = new Set(statements.map((s) => s.id));
  let removedNulled = 0;
  for (const [id, x] of Object.entries(answers)) {
    const h = !current.has(id) && x && x.reviewHistory;
    if (Array.isArray(h)) for (let i = 1; i < h.length; i++) if (h[i - 1] && h[i] && h[i - 1].value !== null && h[i].value === null) removedNulled++;
  }
  const reviewed = nullings.reduce((n, r) => n + (Number.isInteger(r.nulled) ? r.nulled : 0), 0);
  // A first audit (one pass, no nulling review) is the original text: it has no review history.
  const firstAudit = !(Array.isArray(a.passes) && a.passes.length > 1) && !nullings.length;
  if (historyIds.length && firstAudit) errors.push(`${historyIds.join(", ")}: "reviewHistory" in a first audit: its answers are the original text and have no history; only a later pass or review (recorded in "passes" or "reviews") replaces answers`);
  else if ((reviewed < nulledCount || reviewed > nulledCount + removedNulled)) errors.push(`"reviews" count ${reviewed} nulled answer(s) but "reviewHistory" holds ${nulledCount} nulling(s); each nulling review records how many it nulled`);
  // Append-only: the committed history must still be there, unchanged, at the start of each list.
  const before = committedVersion(id, p);
  if (before && before.answers) {
    for (const [sid, old] of Object.entries(before.answers)) {
      const prev = old && Array.isArray(old.reviewHistory) ? old.reviewHistory : [];
      if (!prev.length) continue;
      const cur = answers[sid] && Array.isArray(answers[sid].reviewHistory) ? answers[sid].reviewHistory : [];
      if (cur.length < prev.length || prev.some((e, i) => JSON.stringify(e) !== JSON.stringify(cur[i]))) errors.push(`${sid}: "reviewHistory" was changed or shortened; it is append-only`);
    }
    // A later pass never edits a sourced answer away: a committed answer with sources that is now changed or gone
    // must be in that statement's reviewHistory, word for word (an unsourced one has nothing to review).
    const same = (p, q) => JSON.stringify([p.value, p.confidence, p.rationale, p.sources || []]) === JSON.stringify([q.value, q.confidence, q.rationale, q.sources || []]);
    for (const [sid, old] of Object.entries(before.answers)) {
      if (!old || !Array.isArray(old.sources) || !old.sources.length) continue;
      // An original null (nothing found) has nothing to review either: a later pass replaces it freely.
      if (old.value === null && !(Array.isArray(old.reviewHistory) && old.reviewHistory.length)) continue;
      const cur = answers[sid];
      if (cur && same(old, cur)) continue;
      if (!cur) { errors.push(`${sid}: a sourced answer was removed; change it instead, keeping the old version in its "reviewHistory"`); continue; }
      if (!(Array.isArray(cur.reviewHistory) && cur.reviewHistory.some((e) => e && same(e, old)))) errors.push(`${sid}: a sourced answer was changed without a talk-page record: add the committed version, word for word, to its "reviewHistory"`);
    }
    const prevReviews = (before.reviews || []).filter((r) => r && r.kind === "nulling");
    if (prevReviews.some((r) => !nullings.some((n) => JSON.stringify(n) === JSON.stringify(r)))) errors.push('a committed "nulling" review was changed or dropped; reviews are append-only');
  }
  // Rules 5, people: every one of the person's own books in the local library is read and cited (a source with
  // "library": its file name) or declined in "booksNotUsed": [{ "file", "reason" }] (e.g. a critic's book that
  // only names them). Each error names the book.
  if (PEOPLE && a.rules >= 5) {
    const entry0 = catalog().find((c) => c.id === id) || {};
    const books = personBooks(a.name || entry0.name, entry0.born);
    if (books) {
      const cited = new Set(sources.map((s) => s.library).filter(Boolean));
      const declined = Array.isArray(a.booksNotUsed) ? a.booksNotUsed : [];
      for (const d of declined) if (!d || !(typeof d.file === "string" || d.gutenberg !== undefined || Array.isArray(d.urls) || typeof d.corpus === "string") || typeof d.reason !== "string" || d.reason.trim().length < 20) {
        errors.push('"booksNotUsed" entries are { "file": the library file name (or "gutenberg", "urls", "corpus"), "reason": why it is not used (a sentence) }'); break;
      }
      for (const f of books) if (!cited.has(f) && !declined.some((d) => d && d.file === f)) {
        errors.push(`book in the local library not used: "${f}": read it and cite it (a source with "library": "${f}"), or list it in "booksNotUsed" with the reason`);
      }
    }
  }
  // Rules 6, people: every text known to exist by them (personTexts) is cited or declined in "booksNotUsed", which
  // also takes { "gutenberg": id or [ids] }, { "urls": [Miller Center speech URLs] } or { "corpus": "voteview" }.
  if (PEOPLE && a.rules >= 6) {
    const entry0 = catalog().find((c) => c.id === id) || {};
    const known = personTexts(a.name || entry0.name, entry0.born);
    if (known) {
      const declined = Array.isArray(a.booksNotUsed) ? a.booksNotUsed.filter((d) => d && typeof d.reason === "string" && d.reason.trim().length >= 20) : [];
      const has = (d, k, v) => [].concat(d[k] === undefined ? [] : d[k]).map(String).includes(String(v));
      const gutCited = (gid) => sources.some((s) => (s.library && String(s.library).startsWith(`${gid} `)) || new RegExp(`gutenberg\\.org/(?:ebooks|files|cache/epub)/${gid}(?:\\D|$)`).test(s.url || ""))
        || declined.some((d) => has(d, "gutenberg", gid) || (typeof d.file === "string" && d.file.startsWith(`${gid} `)));
      const missingG = known.gutenberg.filter((b) => !gutCited(b.id));
      if (missingG.length) errors.push(`Project Gutenberg has ${missingG.length} text${missingG.length > 1 ? "s" : ""} by them not cited or declined: ${missingG.slice(0, 12).map((b) => `${b.id} "${b.title.slice(0, 60)}"`).join(", ")}${missingG.length > 12 ? ", …" : ""}. Fetch with node scripts/gutenberg.js <id>, read, and cite it (a source with "library": its file), or decline it in "booksNotUsed" as { "gutenberg": <id or [ids]>, "reason" }`);
      const norm = (u) => String(u || "").replace(/\/+$/, "");
      const urls = new Set(sources.map((s) => norm(s.url)));
      const missingM = known.miller.filter((m) => !urls.has(norm(m.url)) && !declined.some((d) => [].concat(d.urls || []).map(norm).includes(norm(m.url))));
      if (missingM.length) errors.push(`${missingM.length} Miller Center speech${missingM.length > 1 ? "es" : ""} by them not cited or declined: ${missingM.slice(0, 8).map((m) => m.title).join("; ")}${missingM.length > 8 ? "; …" : ""}. Read them (node tools/miller.js in the corpora) and cite each one used, or decline the rest in "booksNotUsed" as { "urls": [...], "reason" }`);
      if (known.voteview && !sources.some((s) => /voteview/i.test(`${s.url || ""} ${s.title || ""}`)) && !declined.some((d) => d.corpus === "voteview"))
        errors.push('Voteview lists them as a member of Congress: search their roll calls (node tools/voteview.js in the corpora) and cite them, or decline in "booksNotUsed" as { "corpus": "voteview", "reason" }');
    }
  }
  // Rules 6, every audit: a work the notes call unavailable is listed in "notFound" as
  // { "work", "tried": [{ "where", "how" }, ...] } with at least two attempts in different places.
  if (a.rules >= 6) {
    const nf = a.notFound === undefined ? [] : a.notFound;
    if (!Array.isArray(nf)) errors.push('"notFound" must be a list of { "work", "tried": [{ "where", "how" }] }');
    else {
      for (const [i, e] of nf.entries()) {
        const tried = e && Array.isArray(e.tried) ? e.tried.filter((t) => t && typeof t.where === "string" && t.where.trim() && typeof t.how === "string" && t.how.trim().length >= 10) : [];
        const places = new Set(tried.map((t) => t.where.trim().toLowerCase()));
        if (!e || typeof e.work !== "string" || e.work.trim().length < 5) errors.push(`notFound[${i}]: "work" names the work looked for`);
        else if (places.size < 2) errors.push(`notFound[${i}] ("${e.work.slice(0, 60)}"): ${places.size} place tried; try a second place before calling it unavailable ("tried": at least two { "where", "how" } in different places)`);
      }
      const words = (x) => (String(x).toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((w) => !STOP.has(w));
      const covered = (sentence) => nf.some((e) => e && words(e.work).some((w) => sentence.toLowerCase().includes(w)));
      const sentences = String(a.notes || "").split(/(?<=[.;])\s+/).filter((x) => UNFOUND.test(x) && !covered(x));
      for (const x of sentences) errors.push(`notes call a source unavailable: "${x.trim().slice(0, 160)}". List the work in "notFound" with at least two places tried, or find it`);
    }
  }
  // Rules 7 (Brandon, 2026-11-12): a 0 is a split within actions or within words. Source tags can't see a split
  // inside one source (a biography recording both a speech and a law), so the rationale is read too: a 0 that
  // names both something said and something done is words against actions, which the actions decide.
  if (a.rules >= 7) {
    const SAID = /\b(said|says|saying|wrote|writes|written|argued|argues|arguing|stated|speech|speeches|praised|critici[sz]ed|denounced|interview|told|essay|pamphlet|called for|calls for|urged|urges|insisted|warned|rhetoric|manifesto|the green book)\b/i;
    const DONE = /\b(voted|votes|signed(?! (?:an? |the )?(?:open )?(?:letter|petition|statement|pledge))|enacted|decreed|decree|vetoed|veto|ordered|nationali[sz]ed|abolished|banned|imprisoned|executed|implemented|appointed|deported|expelled|invaded|annexed|legislated|cosponsored|sponsored|passed (?:a|the) (?:law|bill|act))\b/i;
    for (const [sid, x] of Object.entries(answers)) {
      if (!x || x.value !== 0) continue;
      const w = (x.rationale || "").match(SAID), d = (x.rationale || "").match(DONE);
      if (w && d) errors.push(`${sid}: a 0 whose rationale sets words ("${w[0]}") against actions ("${d[0]}"); record over words: that is no split, answer from the actions. (If "${w[0]}" only names what a source says, reword the rationale.)`);
    }
  }
  // People most associated with the ideology, shown as "Key figures".
  if (!PEOPLE && a.keyFigures === undefined) warnings.push('no "keyFigures" (1-3 founders, thinkers or leaders, or [] if none)');
  else if (!PEOPLE && (!Array.isArray(a.keyFigures) || a.keyFigures.length > 3)) errors.push('"keyFigures" must be a list of at most 3');
  else if (!PEOPLE) for (const [i, f] of a.keyFigures.entries()) {
    if (!f.name || !f.role) errors.push(`keyFigures[${i}]: needs a name and a role`);
    if (!/^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/.test(f.wikipedia || "")) errors.push(`keyFigures[${i}]: wikipedia must be an en.wikipedia.org article URL`);
    if (!Array.isArray(f.sources) || !f.sources.length) errors.push(`keyFigures[${i}]: needs at least one source`);
    else for (const sid of f.sources) if (!sourceIds.has(sid)) errors.push(`keyFigures[${i}]: unknown source '${sid}'`);
  }
  // Defining positions no statement captures (audits/statements/STANDARD.md).
  if (!PEOPLE && a.missingStatements === undefined) warnings.push('no "missingStatements" (list defining positions the statements miss, or [] if none)');
  else if (!PEOPLE && !Array.isArray(a.missingStatements)) errors.push('"missingStatements" must be a list');
  else if (!PEOPLE) for (const [i, m] of a.missingStatements.entries()) {
    if (typeof m.text !== "string" || m.text.trim().length < 10) errors.push(`missingStatements[${i}]: text missing or too short`);
    if (![-2, -1, 1, 2].includes(m.value)) errors.push(`missingStatements[${i}]: value must be -2, -1, 1 or 2`);
    if (typeof m.rationale !== "string" || m.rationale.trim().length < 20) errors.push(`missingStatements[${i}]: rationale missing or too short`);
    if (!Array.isArray(m.sources) || !m.sources.length) errors.push(`missingStatements[${i}]: needs at least one source`);
    else for (const sid of m.sources) if (!sourceIds.has(sid)) errors.push(`missingStatements[${i}]: unknown source '${sid}'`);
    // Rule of two (audits/PROMPT.md section 5): at least two verbatim passages from separate places.
    // Entries written before the rule have no "quotes" field: a warning, so old audits still validate.
    const quotes = Array.isArray(m.quotes) ? m.quotes.filter((q) => q && typeof q.text === "string" && q.text.trim()).length : null;
    if (!m.addedAs && !m.declined) {
      if (quotes === null) warnings.push(`missingStatements[${i}]: no "quotes" (rule of two: at least two verbatim passages from separate places)`);
      else if (quotes < 2) errors.push(`missingStatements[${i}]: ${quotes} quote(s); the rule of two needs at least two from separate places, or drop the entry`);
    }
  }

  // Not errors, but signs of a lazy audit worth a look.
  const vals = active.map((s) => answers[s.id]).filter(Boolean);
  if (errors.length === 0 && UNCERTAINTY) {
    // Uncertainty: does their record place them on every dividing line? (see pca.js)
    // For ideologies only stated positions count; inferred answers don't.
    const s = PEOPLE ? personUncertainty(answers) : ideologyUncertainty(a);
    if (!s.placed) {
      const bar = (b) => (isFinite(b) ? `±${b.toFixed(2)}` : "no position reaches it");
      const weak = s.bars.map((b, i) => [b, i]).filter(([b]) => b > s.maxBar).sort((x, y) => y[0] - x[0])
        .map(([b, i]) => `${lineName(i)} ${bar(b)}`);
      if (weak.length) errors.push(`uncertainty: ${s.known} ${PEOPLE ? "recorded" : "stated"} positions leave ${weak.length > 1 ? "these dividing lines" : "a dividing line"} with an error bar over ±${s.maxBar}: ${weak.join(", ")}`);
      if (s.mean > s.maxMean) errors.push(`uncertainty: ${s.known} ${PEOPLE ? "recorded" : "stated"} positions leave error bars of ${isFinite(s.mean) ? `±${s.mean.toFixed(2)}` : "infinite width"} on average over the dividing lines (over ±${s.maxMean}); the widest: ${s.bars.map((b, i) => [b, i]).sort((x, y) => y[0] - x[0]).slice(0, 4).map(([b, i]) => `${lineName(i)} ${bar(b)}`).join(", ")}`);
    }
  }
  const zeros = vals.filter((x) => x.value === 0).length;
  const lows = vals.filter((x) => x.confidence === "low" && x.value !== null).length;
  if (zeros > active.length * 0.3) warnings.push(`${zeros} neutral answers (over 30%)`);
  if (lows > active.length * 0.5) warnings.push(`${lows} low-confidence answers (over 50%)`);
  return { errors, warnings, sources: [...sources, ...reading.map((r, i) => ({ id: `reading${i + 1}`, url: r.url })),
    ...(a.wikipedia ? [{ id: "wikipedia", url: a.wikipedia }] : [])] };
}

async function checkLinks(sources) {
  const bad = [];
  await Promise.all(sources.map(async (s) => {
    try {
      const res = await fetch(s.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(20000),
        headers: { "user-agent": "Mozilla/5.0 (political-ideology-atlas audit link check)" } });
      if (res.status >= 400 && res.status !== 403 && res.status !== 429) bad.push(`${s.id} ${res.status} ${s.url}`);
    } catch (e) {
      bad.push(`${s.id} unreachable (${e.cause?.code || e.name}) ${s.url}`);
    }
  }));
  return bad;
}

async function main() {
  const args = process.argv.slice(2);
  const links = args.includes("--links");
  let ids = args.filter((x, i) => !x.startsWith("--") && args[i - 1] !== "--dir");
  const dir = DIR || PROFILES_DIR;
  if (ids.length === 0) ids = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];

  const fetchFailed = new Map();
  // Fetch (once, then cached) the whole Wikipedia page the DOES_NOT_INCLUDE_IDEAS check reads.
  if (!PEOPLE) for (const id of ids) {
    let a; try { a = readJson(profilePath(id)); } catch { continue; }
    const entry = a && a.notAnIdeology && a.notAnIdeology.reason === "DOES_NOT_INCLUDE_IDEAS" && catalog().find((c) => c.id === id);
    if (entry) try { await lib.fetchArticle(entry); } catch (e) { fetchFailed.set(id, e.message); }
  }
  let failed = 0, excluded = 0;
  for (const id of ids.sort()) {
    const { errors, warnings, sources = [] } = validate(id);
    if (fetchFailed.has(id)) errors.unshift(`DOES_NOT_INCLUDE_IDEAS unchecked: its Wikipedia page could not be fetched (${fetchFailed.get(id)}); validate again later`);
    if (links && errors.length === 0) for (const b of await checkLinks(sources)) errors.push(`dead link: ${b}`);
    if (errors.length) failed++;
    if (excludedOnly(errors)) excluded++;
    const status = errors.length ? "FAIL" : warnings.length ? "WARN" : "ok";
    console.log(`${status.padEnd(4)} ${id}`);
    for (const e of errors) console.log(`     error: ${e}`);
    for (const w of warnings) console.log(`     warning: ${w}`);
  }
  console.log(`\n${ids.length - failed}/${ids.length} audits valid.`);
  // Exit 2 when every failure is only the uncertainty rule: a finished audit that is excluded, not
  // one to redo. pending.js relies on this so excluded people aren't re-audited on every run.
  process.exit(failed === 0 ? 0 : failed === excluded ? 2 : 1);
}

// Finished but excluded: by the uncertainty rule, or as not an ideology (the first check).
// Errors that don't send an existing audit back to the audit queue (pending.js): an honest uncertainty
// failure, a "not an ideology" record, or a source-check finding (fixed in the audit, not by redoing it).
const excludedOnly = (errors) => errors.length > 0 && errors.every((e) => e.startsWith("uncertainty:") || e.startsWith("not an ideology:") || e.startsWith("sources:"));
// A dividing line as the site names it (data.js), or past the drawn ones by its strongest statements.
function lineName(i) {
  const { MODEL, QUESTIONS } = require(require("path").join(lib.ROOT, "data.js"));
  const label = (MODEL.labels || [])[i];
  if (label) return `line ${i + 1} (${label.low} / ${label.high})`;
  const top = MODEL.components[i].vector.map((w, j) => [Math.abs(w), j]).sort((x, y) => y[0] - x[0]).slice(0, 3);
  return `line ${i + 1} (strongest: ${top.map(([, j]) => QUESTIONS[j].id).join(", ")})`;
}

if (require.main === module) main();
// Tests (tests/validate-rules.test.js) stand in for the committed copy of an audit.
const setCommittedForTests = (fn) => { committedForTests = fn; };
const setLibraryForTests = (l) => { libraryForTests = l; };
const setTextsForTests = (t) => { textsForTests = t; };
module.exports = { validate, excludedOnly, CURRENT_RULES, setCommittedForTests, setLibraryForTests, setTextsForTests, nextPassFrom, reauditGap, PROJECT_START };
