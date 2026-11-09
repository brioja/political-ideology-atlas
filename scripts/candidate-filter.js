// The people catalog's only filter: English Wikipedia views over the last 12 full months. Whose views
// are checked comes from scripts/candidate-triage.js (people Wikidata ties to politics); everyone
// checked with more views than the cutoff is in audits/people-catalog.json. The cutoff is the
// most-viewed person in triage's sample below its language floor: below that level the list could
// be incomplete, above it it isn't. Anyone above the cutoff may also be added without a Wikidata
// label (Destiny, xQc); everyone with an audit stays in the catalog. scripts/triage.js then orders
// the catalog's people for auditing, and the uncertainty rule decides who appears in the test.
//   node scripts/candidate-filter.js
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, PEOPLE_DIR } = require("./lib");
const { triage, cachedSparql, PREFIX, REGION_OF, titleOf, viewsPeriod, CACHE_DIR, HEADERS, MIN_LINKS } = require("./candidate-triage");

const CONCURRENCY = 6;
const CATALOG = path.join(ROOT, "audits", "people-catalog.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The views period (lib.js) moves every two months.
const { start, end, ymd, label: periodLabel } = viewsPeriod();

// Fetching views for ~66k people takes hours, so every count is appended to a cache outside the
// repo as soon as it arrives. A rerun (or a resume after a crash) only fetches what's missing, and
// a different cutoff needs no fetching at all. Keyed by article and period, so a new period refetches.
const CACHE = path.join(CACHE_DIR, "pageviews.jsonl");
fs.mkdirSync(path.dirname(CACHE), { recursive: true });
const cache = new Map(fs.existsSync(CACHE) ? fs.readFileSync(CACHE, "utf8").split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((e) => [e.key, e.views]) : []);
const remember = (key, n) => (fs.appendFileSync(CACHE, JSON.stringify({ key, views: n }) + "\n"), cache.set(key, n), n);

async function views(p) {
  const t = encodeURIComponent(titleOf(p.wikipedia).replace(/ /g, "_"));
  const key = `${t}|${ymd(start)}-${ymd(end)}`;
  if (cache.has(key)) return cache.get(key);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/${ymd(start)}/${ymd(end)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return remember(key, (await res.json()).items.reduce((s, x) => s + x.views, 0));
    if (res.status === 404) return remember(key, 0);
    if (attempt >= 10) throw new Error(`${res.status} for ${url}`);
    // Rate limited: wait as asked, else back off exponentially (3s, 6s, 12s ... capped at 2 min).
    const retryAfter = Number(res.headers.get("retry-after")) * 1000;
    await sleep(retryAfter || Math.min(3000 * 2 ** attempt, 120000));
  }
}

async function fetchViews(list, label) {
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < list.length) {
      const p = list[next++];
      p.views12m = await views(p);
      if (++done % 2000 === 0) console.log(`${label}: ${done}/${list.length}`);
    }
  }));
}

// Someone with several citizenships gets an arbitrary one from the triage query (Hasan Piker came out
// Turkish). Their English description names the one they are known by ("American political
// commentator"), so pick the citizenship whose demonym appears first in it.
async function nationalityFromDescription(people) {
  const ids = people.filter((p) => p.wikidata).map((p) => p.wikidata);
  const byId = new Map(people.map((p) => [p.wikidata, p]));
  for (let i = 0; i < ids.length; i += 300) {
    const rows = await cachedSparql(`${PREFIX}
SELECT ?item (SAMPLE(?d) AS ?desc) (GROUP_CONCAT(DISTINCT CONCAT(?iso, "=", ?dem); separator="|") AS ?nations) WHERE {
  VALUES ?item { ${ids.slice(i, i + 300).map((q) => `wd:${q}`).join(" ")} }
  ?item wdt:P27 ?c . ?c wdt:P297 ?iso . ?c wdt:P1549 ?dem . FILTER(LANG(?dem) = "en")
  OPTIONAL { ?item schema:description ?d . FILTER(LANG(?d) = "en") }
} GROUP BY ?item`);
    for (const r of rows) {
      const nations = r.nations.value.split("|").map((s) => s.split("="));
      if (!r.desc || new Set(nations.map(([iso]) => iso)).size < 2) continue;
      const at = (dem) => r.desc.value.search(new RegExp(`\\b${dem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
      const [best] = nations.filter(([, dem]) => at(dem) >= 0).sort((a, b) => at(a[1]) - at(b[1]));
      const p = byId.get(r.item.value.split("/").pop());
      if (best && REGION_OF[best[0]]) p.region = REGION_OF[best[0]];
    }
  }
}

async function main() {
  const { check, sample } = await triage();
  await fetchViews(sample, "sample");
  const cutoff = Math.max(...sample.map((p) => p.views12m));
  console.log(`Most-viewed person below the language floor in the sample: ${cutoff} views`);
  await fetchViews(check, "checked");

  const old = readJson(CATALOG);
  const audited = new Set(fs.readdirSync(PEOPLE_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));
  const oldByTitle = new Map(old.people.map((p) => [titleOf(p.wikipedia), p]));
  // Match by Wikidata id first: a renamed article ("Joseph II, Holy Roman Emperor" -> "Joseph II")
  // must keep its id, or its audit is orphaned. Views count only under the current title, so a
  // recent rename also adds the old title's views.
  const oldByQid = new Map(old.people.filter((p) => p.wikidata).map((p) => [p.wikidata, p]));
  const renamed = check.filter((p) => oldByQid.has(p.wikidata) && titleOf(oldByQid.get(p.wikidata).wikipedia) !== titleOf(p.wikipedia));
  const oldTitles = renamed.map((p) => ({ wikipedia: oldByQid.get(p.wikidata).wikipedia, p }));
  await fetchViews(oldTitles, "renamed");
  for (const o of oldTitles) o.p.views12m += o.views12m;
  const people = [];
  const seen = new Set();
  for (const p of check.filter((p) => p.views12m > cutoff).sort((a, b) => b.views12m - a.views12m)) {
    const prev = oldByQid.get(p.wikidata) || oldByTitle.get(titleOf(p.wikipedia));
    const id = prev ? prev.id : slug(titleOf(p.wikipedia));
    if (seen.has(id)) continue;
    seen.add(id);
    people.push({ id, ...p, ...(prev && prev.image ? { image: prev.image } : {}) });
  }
  await nationalityFromDescription(people);
  // Keep everyone already audited, including people added without a Wikidata label (Destiny, xQc)
  // and the uncertainty controls' kin.
  for (const p of old.people) if (audited.has(p.id) && !seen.has(p.id)) { people.push(p); seen.add(p.id); }
  people.sort((a, b) => (b.views12m || 0) - (a.views12m || 0));

  const dropped = old.people.filter((p) => !seen.has(p.id)).map((p) => p.name);
  fs.writeFileSync(CATALOG, JSON.stringify({
    _comment: "People to audit: everyone checked with more English Wikipedia views over 12 months than the cutoff (scripts/candidate-filter.js; the only filter), plus anyone already audited. Whose views are checked comes from Wikidata labels (scripts/candidate-triage.js: political occupation, activist, philosopher or economist, a political office held, or a stated political ideology); labels are triage, not a filter, and anyone above the cutoff may be added without one. `living` is a hint for auditors to verify.",
    filter: { minViews12m: cutoff },
    triage: { occupations: ["politician", "political activist", "political pundit", "political scientist", "political theorist",
      "political philosopher", "philosopher", "economist", "pundit", "monarch", "jihadist", "terrorist", "military leader", "cause activists (women's rights, civil rights, human rights, social, peace, environment), trade unionist, revolutionary, social reformer, suffragist, feminist, anarchist"], orPoliticalOfficeHeld: ["public office", "head of state",
      "head of government", "monarch", "legislator"], orActivist: true, orPoliticalIdeologyStated: true, minLanguages: MIN_LINKS, minLanguagesWaivedFor: "articles in English Wikipedia's monthly top 1,000" },
    viewsPeriod: periodLabel,
    people,
  }, null, 1) + "\n");
  console.log(`Wrote ${people.length} people (more than ${cutoff} views). Dropped from the old catalog: ${dropped.length ? dropped.join(", ") : "none"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
