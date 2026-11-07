// Validates ideology audits.
//   node scripts/validate.js             all audits present in audits/profiles
//   node scripts/validate.js <id> [...]  specific audits
//   add --links to also check that every source URL responds
//   add --people to validate person audits (audits/people) instead of ideologies
//   add --controls to validate the negative-control audits (audits/controls)
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
const profilePath = CONTROLS ? lib.controlPath : PEOPLE ? lib.personPath : lib.profilePath;

const KINDS = ["primary", "scholarly", "reference", "program"];
const EVIDENCE = ["action", "words"]; // rules 4: what a source records of the subject (AUDIT_RULES.md, "Record over words")
// Why an entry isn't audited (the first check, audits/PROMPT.md). The first six are things that HAVE ideas
// but aren't a set of ideas (Brandon, 2026-11-05); the last is content that holds no political ideas.
const NOT_AN_IDEOLOGY_REASONS = ["PERSON", "PARTY", "ORGANIZATION", "STATE", "GOVERNMENT_BODY", "EVENT", "DOES_NOT_INCLUDE_IDEAS"];
const CONFIDENCE = ["high", "medium", "low"];
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
    // { "reason": one of NOT_AN_IDEOLOGY_REASONS, "explanation": "..." }; older records are a plain string.
    const n = a.notAnIdeology, legacy = typeof n === "string";
    if (legacy) { if (n.trim().length < 20) errors.push('"notAnIdeology" needs a reason of at least a sentence'); else warnings.push('"notAnIdeology" is free text: new records use { "reason", "explanation" }'); }
    else if (!n || !NOT_AN_IDEOLOGY_REASONS.includes(n.reason)) errors.push(`"notAnIdeology.reason" must be one of ${NOT_AN_IDEOLOGY_REASONS.join(", ")}`);
    else if (typeof n.explanation !== "string" || n.explanation.trim().length < 20) errors.push('"notAnIdeology.explanation" needs at least a sentence');
    const src = Array.isArray(a.sources) ? a.sources : [];
    if (!src.length || src.some((x) => !/^https?:\/\/\S+$/.test(x.url || ""))) errors.push('"notAnIdeology" needs at least one source with an http(s) url');
    // An article that talks about the entry's "ideas" holds ideas (Brandon, 2026-11-06): no DOES_NOT_INCLUDE_IDEAS
    // then; audit it. Reads the cached page (validate.js main fetches it first).
    if (!legacy && n && n.reason === "DOES_NOT_INCLUDE_IDEAS" && entry) {
      const text = lib.articleText(entry);
      const hits = text ? (text.match(/\bideas\b/gi) || []).length : 0;
      if (hits) errors.push(`DOES_NOT_INCLUDE_IDEAS not allowed: its Wikipedia article (${lib.articleTitle(entry)}) says "ideas" ${hits} time${hits > 1 ? "s" : ""}; audit it in full`);
    }
    if (!errors.length) errors.push(`not an ideology: ${legacy ? n : `${n.reason}: ${n.explanation}`}`);
    return { errors, warnings };
  }
  if (a.id !== id) errors.push(`"id" is '${a.id}', expected '${id}'`);
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
    // Evidence for aliases, authors and titles is required from 2026-11-06 on (no backfill).
    const { problems, unchecked } = require("./source-check").check(id, a, { strict: (a.auditedAt || "") >= "2026-11-06" });
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
  // A family entry (PROMPT.md section 1, "family": true) is answered from the scholarship that defines it, not members' texts.
  if (!a.family && !sources.some((s) => s.kind === "primary" || s.kind === "program")) errors.push("needs at least one primary or program source");
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
      if (!PEOPLE && ans.confidence !== "low") errors.push(`${st.id}: a "no known position" answer is low confidence`);
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
  const NOT_LOW = /\bnot (inferred|an inference|contested|speculative)\b/i;
  const UNADDRESSED = /\b(not addressed|never address\w*|not discussed|no documented position|sources? (do|does) not (discuss|address|mention))\b/i;
  const selfLow = [], unaddressedHigh = [];
  for (const st of statements) {
    const ans = answers[st.id];
    if (!ans?.rationale) continue;
    if (ans.confidence === "medium" && SELF_LOW.test(ans.rationale) && !NOT_LOW.test(ans.rationale)) selfLow.push(st.id);
    if (ans.confidence === "high" && UNADDRESSED.test(ans.rationale)) unaddressedHigh.push(st.id);
  }
  if (selfLow.length) errors.push(`${selfLow.join(", ")}: rationale says inferred, split, contested or anachronistic, so the confidence is low`);
  // A living person's view needs evidence (audits/PROMPT_PEOPLE.md): an answer whose rationale says it
  // is inferred, or that nothing records their view, is "no known position" instead.
  const NO_EVIDENCE = /\b(inferred|by inference|no record of|no source (states|says|addresses)|no known (statement|position))\b/i;
  if (PEOPLE && a.living !== false) {
    const guessed = statements.filter((st) => answers[st.id] && answers[st.id].value !== null && NO_EVIDENCE.test(answers[st.id].rationale || "")).map((st) => st.id);
    if (guessed.length) errors.push(`${guessed.join(", ")}: the rationale says there's no evidence of this living person's view, so answer null (no known position)`);
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
  const reviewed = nullings.reduce((n, r) => n + (Number.isInteger(r.nulled) ? r.nulled : 0), 0);
  // A first audit (one pass, no nulling review) is the original text: it has no review history.
  const firstAudit = !(Array.isArray(a.passes) && a.passes.length > 1) && !nullings.length;
  if (historyIds.length && firstAudit) errors.push(`${historyIds.join(", ")}: "reviewHistory" in a first audit: its answers are the original text and have no history; only a later pass or review (recorded in "passes" or "reviews") replaces answers`);
  else if (nulledCount !== reviewed) errors.push(`"reviews" count ${reviewed} nulled answer(s) but "reviewHistory" holds ${nulledCount} nulling(s); each nulling review records how many it nulled`);
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
      for (const d of declined) if (!d || typeof d.file !== "string" || typeof d.reason !== "string" || d.reason.trim().length < 20) {
        errors.push('"booksNotUsed" entries are { "file": the library file name, "reason": why it is not used (a sentence) }'); break;
      }
      for (const f of books) if (!cited.has(f) && !declined.some((d) => d && d.file === f)) {
        errors.push(`book in the local library not used: "${f}": read it and cite it (a source with "library": "${f}"), or list it in "booksNotUsed" with the reason`);
      }
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
  let ids = args.filter((x) => !x.startsWith("--"));
  if (ids.length === 0) ids = fs.existsSync(PROFILES_DIR) ? fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];

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
module.exports = { validate, excludedOnly, setCommittedForTests, setLibraryForTests };
