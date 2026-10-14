// Validates ideology audits.
//   node scripts/validate.js             all audits present in audits/profiles
//   node scripts/validate.js <id> [...]  specific audits
//   add --links to also check that every source URL responds
//   add --people to validate person audits (audits/people) instead of ideologies
//   add --controls to validate the negative-control audits (audits/controls)
const fs = require("fs");
const lib = require("./lib");
const { readJson, allStatements, isCandidate, personSalience, ideologySalience } = lib;
const CONTROLS = process.argv.includes("--controls");
const PEOPLE = CONTROLS || process.argv.includes("--people");
const PROFILES_DIR = CONTROLS ? lib.CONTROLS_DIR : PEOPLE ? lib.PEOPLE_DIR : lib.PROFILES_DIR;
const catalog = CONTROLS ? lib.controlsCatalog : PEOPLE ? lib.peopleCatalog : lib.catalog;
const profilePath = CONTROLS ? lib.controlPath : PEOPLE ? lib.personPath : lib.profilePath;

const KINDS = ["primary", "scholarly", "reference", "program"];
const CATEGORIES = ["Radical Left", "Left", "Center", "Right", "Far-Right", "Third Position", "Libertarian", "Anarchist"];
const CONFIDENCE = ["high", "medium", "low"];
const BANNED_HOSTS = ["12axes", "8values", "politicalcompass", "idrlabs", "polcompball", "sapplyvalues"];

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
  // short record instead of an audit. It's finished, and excluded like a salience failure.
  if (!PEOPLE && a.notAnIdeology !== undefined) {
    if (typeof a.notAnIdeology !== "string" || a.notAnIdeology.trim().length < 20) errors.push('"notAnIdeology" needs a reason of at least a sentence');
    const src = Array.isArray(a.sources) ? a.sources : [];
    if (!src.length || src.some((x) => !/^https?:\/\/\S+$/.test(x.url || ""))) errors.push('"notAnIdeology" needs at least one source with an http(s) url');
    if (!errors.length) errors.push(`not an ideology: ${a.notAnIdeology}`);
    return { errors, warnings };
  }
  if (a.id !== id) errors.push(`"id" is '${a.id}', expected '${id}'`);
  if (!PEOPLE && a.category != null && !CATEGORIES.includes(a.category)) errors.push(`"category" must be null or one of: ${CATEGORIES.join(", ")}`);
  for (const f of PEOPLE ? ["name", "auditedAt", "auditor", "summary", "role"] : ["name", "auditedAt", "auditor", "summary", "scope"]) {
    if (typeof a[f] !== "string" || !a[f].trim()) errors.push(`"${f}" must be a non-empty string`);
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
  const sourceIds = new Set();
  for (const s of sources) {
    if (sourceIds.has(s.id)) errors.push(`duplicate source id ${s.id}`);
    sourceIds.add(s.id);
    if (!KINDS.includes(s.kind)) errors.push(`source ${s.id}: kind must be one of ${KINDS.join(", ")}`);
    if (!/^https?:\/\/\S+$/.test(s.url || "")) errors.push(`source ${s.id}: url must be an http(s) URL`);
    else if (BANNED_HOSTS.some((h) => new URL(s.url).host.includes(h))) errors.push(`source ${s.id}: political-quiz sites are not allowed`);
    if (!s.title) errors.push(`source ${s.id}: missing title`);
  }
  if (!sources.some((s) => s.kind === "primary" || s.kind === "program")) errors.push("needs at least one primary or program source");
  if (!sources.some((s) => s.kind === "scholarly" || s.kind === "reference")) errors.push("needs at least one scholarly or reference source");
  if (sources.length && sources.every((s) => /wikipedia\.org/.test(s.url || ""))) errors.push("Wikipedia cannot be the only kind of source");

  const answers = a.answers || {};
  const statements = allStatements();
  const active = statements.filter((s) => !isCandidate(s));
  const backfill = [];
  for (const st of statements) {
    const ans = answers[st.id];
    // A new (candidate) statement only needs answering; the rest of the audit stays valid.
    if (!ans && isCandidate(st)) { backfill.push(st.id); continue; }
    if (!ans) { errors.push(`no answer for '${st.id}'`); continue; }
    // People may have "no known position" (null); ideologies must take a position on everything.
    if (ans.value === null && PEOPLE) { if (!ans.rationale) errors.push(`${st.id}: say why there is no known position`); continue; }
    if (![-2, -1, 0, 1, 2].includes(ans.value)) errors.push(`${st.id}: value must be an integer from -2 to 2${PEOPLE ? " or null" : ""}`);
    if (!CONFIDENCE.includes(ans.confidence)) errors.push(`${st.id}: confidence must be high, medium or low`);
    if (!ans.rationale || ans.rationale.trim().length < 20) errors.push(`${st.id}: rationale missing or too short`);
    if (!Array.isArray(ans.sources) || ans.sources.length === 0) errors.push(`${st.id}: cite at least one source`);
    else for (const sid of ans.sources) if (!sourceIds.has(sid)) errors.push(`${st.id}: unknown source '${sid}'`);
  }
  if (backfill.length) warnings.push(`needs answers for new statements (backfill): ${backfill.join(", ")}`);
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
  }

  // Not errors, but signs of a lazy audit worth a look.
  const vals = active.map((s) => answers[s.id]).filter(Boolean);
  if (errors.length === 0) {
    // Salience: can their record place them precisely enough to match? (see pca.js)
    // For ideologies only stated positions count; inferred (low-confidence) answers don't.
    const s = PEOPLE ? personSalience(answers) : ideologySalience(answers);
    if (!s.salient) {
      errors.push(`salience: ${s.known} ${PEOPLE ? "recorded" : "stated"} positions place them with uncertainty ${s.uncertainty.toFixed(2)}, less precisely than a typical test-taker's settled result (${s.bar.toFixed(2)})`);
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

  let failed = 0, salienceOnly = 0;
  for (const id of ids.sort()) {
    const { errors, warnings, sources = [] } = validate(id);
    if (links && errors.length === 0) for (const b of await checkLinks(sources)) errors.push(`dead link: ${b}`);
    if (errors.length) failed++;
    // Finished but excluded: by the salience rule, or as not an ideology (the first check).
    if (errors.length && errors.every((e) => e.startsWith("salience:") || e.startsWith("not an ideology:"))) salienceOnly++;
    const status = errors.length ? "FAIL" : warnings.length ? "WARN" : "ok";
    console.log(`${status.padEnd(4)} ${id}`);
    for (const e of errors) console.log(`     error: ${e}`);
    for (const w of warnings) console.log(`     warning: ${w}`);
  }
  console.log(`\n${ids.length - failed}/${ids.length} audits valid.`);
  // Exit 2 when every failure is only the salience rule: a finished audit that is excluded, not
  // one to redo. pending.js relies on this so excluded people aren't re-audited on every run.
  process.exit(failed === 0 ? 0 : failed === salienceOnly ? 2 : 1);
}

main();
