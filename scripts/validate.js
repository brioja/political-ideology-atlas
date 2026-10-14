// Validates ideology audits.
//   node scripts/validate.js             all audits present in audits/profiles
//   node scripts/validate.js <id> [...]  specific audits
//   add --links to also check that every source URL responds
//   add --people to validate person audits (audits/people) instead of ideologies
//   add --controls to validate the negative-control audits (audits/controls)
const fs = require("fs");
const lib = require("./lib");
const { readJson, allStatements, statementsVersion, personSalience, ideologySalience } = lib;
const CONTROLS = process.argv.includes("--controls");
const PEOPLE = CONTROLS || process.argv.includes("--people");
const PROFILES_DIR = CONTROLS ? lib.CONTROLS_DIR : PEOPLE ? lib.PEOPLE_DIR : lib.PROFILES_DIR;
const catalog = CONTROLS ? lib.controlsCatalog : PEOPLE ? lib.peopleCatalog : lib.catalog;
const profilePath = CONTROLS ? lib.controlPath : PEOPLE ? lib.personPath : lib.profilePath;

const KINDS = ["primary", "scholarly", "reference", "program"];
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
  if (a.id !== id) errors.push(`"id" is '${a.id}', expected '${id}'`);
  if (a.statementsVersion !== statementsVersion()) {
    errors.push(`stale: statementsVersion ${a.statementsVersion}, current ${statementsVersion()} (re-audit)`);
  }
  for (const f of PEOPLE ? ["name", "auditedAt", "auditor", "summary", "role"] : ["name", "category", "auditedAt", "auditor", "summary", "scope"]) {
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
  const active = allStatements();
  const activeIds = new Set(active.map((s) => s.id));
  for (const st of active) {
    const ans = answers[st.id];
    if (!ans) { errors.push(`no answer for '${st.id}'`); continue; }
    // People may have "no known position" (null); ideologies must take a position on everything.
    if (ans.value === null && PEOPLE) { if (!ans.rationale) errors.push(`${st.id}: say why there is no known position`); continue; }
    if (![-2, -1, 0, 1, 2].includes(ans.value)) errors.push(`${st.id}: value must be an integer from -2 to 2${PEOPLE ? " or null" : ""}`);
    if (!CONFIDENCE.includes(ans.confidence)) errors.push(`${st.id}: confidence must be high, medium or low`);
    if (!ans.rationale || ans.rationale.trim().length < 20) errors.push(`${st.id}: rationale missing or too short`);
    if (!Array.isArray(ans.sources) || ans.sources.length === 0) errors.push(`${st.id}: cite at least one source`);
    else for (const sid of ans.sources) if (!sourceIds.has(sid)) errors.push(`${st.id}: unknown source '${sid}'`);
  }
  for (const k of Object.keys(answers)) if (!activeIds.has(k)) errors.push(`answer for unknown statement '${k}'`);

  // Not errors, but signs of a lazy audit worth a look.
  const vals = Object.values(answers);
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
    if (errors.length && errors.every((e) => e.startsWith("salience:"))) salienceOnly++;
    const status = errors.length ? "FAIL" : warnings.length ? "WARN" : "ok";
    console.log(`${status.padEnd(4)} ${id}`);
    for (const e of errors) console.log(`     error: ${e}`);
    for (const w of warnings) console.log(`     warning: ${w}`);
  }
  console.log(`\n${ids.length - failed}/${ids.length} audits valid (statements version ${statementsVersion()}).`);
  // Exit 2 when every failure is only the salience rule: a finished audit that is excluded, not
  // one to redo. pending.js relies on this so excluded people aren't re-audited on every run.
  process.exit(failed === 0 ? 0 : failed === salienceOnly ? 2 : 1);
}

main();
