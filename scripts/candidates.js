// Builds the people catalog from data instead of hand-picking: every human on Wikidata with a
// political occupation (politician, political activist, political pundit, political scientist) or
// a public office held, who has an English Wikipedia article, ranked by English Wikipedia views
// over the last 12 full months. The salience check, not this list, decides who appears in the test.
//
// Fetching views for every such person is too slow, so the query keeps those whose article exists
// in at least MIN_LINKS Wikipedia languages. To show that floor doesn't drop anyone who belongs, a
// sample of people just below it is fetched too, and the catalog keeps only people with more views
// than anyone in that sample: below that level the list could be incomplete, above it it isn't.
// The floor is waived for anyone in English Wikipedia's monthly top-1,000 articles.
// People who already have an audit stay in the catalog regardless.
//   node scripts/candidates.js
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, PEOPLE_DIR } = require("./lib");
const { sparql } = require("./sparql");

const MIN_LINKS = 10;
const SAMPLE_BELOW = 3000;
const CONCURRENCY = 6;
const CATALOG = path.join(ROOT, "audits", "people-catalog.json");
const HEADERS = { "user-agent": "political-ideology-atlas/1.0 (https://github.com/brioja/political-ideology-atlas)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PREFIX = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX schema: <http://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>`;
// Politician, political activist, political pundit, political scientist, political theorist,
// political philosopher, philosopher, economist, and activists for a named cause: women's rights,
// civil rights, human rights, social, peace, environment, trade unionist, revolutionary, social
// reformer, suffragist, feminist, anarchist. Philosophers and economists bring in thinkers such as
// Adam Smith, Engels, Friedman and Rand, whom Wikidata never calls political. Plain "activist" and
// "philanthropist" are left out because Wikidata gives them to celebrities, and "writer" is too broad.
// Also pundit (Wikidata often tags commentators plain "pundit", not "political pundit": Tucker Carlson),
// monarch as an occupation (rulers with no office record: Genghis Khan), jihadist, terrorist and
// military leader (Osama bin Laden). "Podcaster", "journalist" and plain "activist" stay out: they
// bring in entertainers and reporters wholesale.
const OCCUPATIONS = ["Q82955", "Q11499147", "Q11499163", "Q1238570", "Q15994177", "Q18930007", "Q4964182", "Q188094",
  "Q28692502", "Q1021386", "Q1476215", "Q8359428", "Q16323111", "Q3578589", "Q15627169", "Q3242115", "Q16611574",
  "Q27532437", "Q34074720", "Q12359071"].map((q) => `wd:${q}`).join(" ");
const OCCUPATIONS_2 = ["Q116", "Q21512362", "Q12414919", "Q1402561"].map((q) => `wd:${q}`).join(" ");
// Plain "pundit" also tags football and TV pundits (Ian Wright, Sanjay Gupta), so it counts only for
// people with no sports, coaching, wrestling or medical occupation.
const NOT_PUNDITS = ["Q2066131", "Q2986228", "Q628099", "Q13474373", "Q39631"].map((q) => `wd:${q}`).join(" ");
// "Position held" counts only for political offices: public office, head of state or government,
// monarch, legislator. Any position let in goodwill ambassadors, CEOs and trustees (Messi, Bezos).
const OFFICES = ["Q294414", "Q48352", "Q2285706", "Q116", "Q4175034"].map((q) => `wd:${q}`).join(" ");
// Each way in is its own query, merged here: as one UNION the query timed out on QLever.
const BRANCHES = [
  `VALUES ?o { ${OCCUPATIONS} } ?item wdt:P106 ?o .`,
  `VALUES ?o { ${OCCUPATIONS_2} } ?item wdt:P106 ?o .`,
  `?item wdt:P106 wd:Q1642960 . FILTER NOT EXISTS { VALUES ?x { ${NOT_PUNDITS} } ?item wdt:P106/wdt:P279* ?x }`,
  `VALUES ?office { ${OFFICES} } ?item wdt:P39 ?pos . ?pos wdt:P31*/wdt:P279* ?office .`,
];
const query = (branch, linkFilter, extra = "") => `${PREFIX}
SELECT ?item (SAMPLE(?article) AS ?wiki) (SAMPLE(?name) AS ?label) (SAMPLE(?g) AS ?gender)
  (SAMPLE(?birth) AS ?born) (SAMPLE(?death) AS ?died) (SAMPLE(?contName) AS ?continent) (SAMPLE(?iso) AS ?countryCode) (SAMPLE(?birthIso) AS ?birthCode)
  (SAMPLE(?l) AS ?links) WHERE {
  ${branch}
  ${extra}
  ?item wdt:P31 wd:Q5 ; wikibase:sitelinks ?l .
  FILTER(${linkFilter})
  ?article schema:about ?item . FILTER(STRSTARTS(STR(?article), "https://en.wikipedia.org/wiki/"))
  OPTIONAL { ?item rdfs:label ?name . FILTER(LANG(?name) = "en") }
  OPTIONAL { ?item wdt:P21 ?g }
  OPTIONAL { ?item wdt:P569 ?birth }
  OPTIONAL { ?item wdt:P570 ?death }
  OPTIONAL { ?item wdt:P27 ?country . ?country wdt:P30 ?cont . ?cont rdfs:label ?contName . FILTER(LANG(?contName) = "en") }
  OPTIONAL { ?item wdt:P27/wdt:P297 ?iso }
  OPTIONAL { ?item wdt:P19/wdt:P17/wdt:P297 ?birthIso }
} GROUP BY ?item`;

// The site's nine regions, by country of citizenship (ISO code). Historical states have no ISO code,
// and some people have no citizenship recorded, so the fallbacks are the present-day country of their
// birthplace, then their continent where that is unambiguous (Asia is not, so it stays unknown).
const REGIONS = {
  "North America": "US CA",
  "Latin America & Caribbean": "MX GT BZ SV HN NI CR PA CU DO HT JM TT BS BB GD LC VC AG DM KN PR CO VE EC PE BO CL AR UY PY BR GY SR",
  Europe: "AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO SM RS SK SI ES SE CH UA GB VA",
  "Russia & Central Asia": "RU KZ KG TJ TM UZ GE AM AZ",
  "Middle East & North Africa": "DZ EG LY MA TN EH IL PS JO LB SY IQ IR SA YE OM AE QA BH KW TR",
  Africa: "AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ GQ ER SZ ET GA GM GH GN GW KE LS LR MG MW ML MR MU MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG UG ZM ZW",
  "South & Southeast Asia": "AF BD BT IN MV NP PK LK BN KH ID LA MY MM PH SG TH TL VN",
  "East Asia": "CN JP KR KP MN TW HK MO",
  Oceania: "AU NZ FJ PG SB VU WS TO KI TV NR FM MH PW",
};
const REGION_OF = Object.fromEntries(Object.entries(REGIONS).flatMap(([r, codes]) => codes.split(" ").map((c) => [c, r])));
const CONTINENT_REGION = { Europe: "Europe", Africa: "Africa", Oceania: "Oceania", "Australian continent": "Oceania",
  "South America": "Latin America & Caribbean", "Central America": "Latin America & Caribbean" };
const regionOf = (b) => (b.countryCode && REGION_OF[b.countryCode.value]) || (b.birthCode && REGION_OF[b.birthCode.value])
  || (b.continent && CONTINENT_REGION[b.continent.value]) || null;


const GENDER = { Q6581097: "m", Q6581072: "f", Q48270: "nb", Q1052281: "f", Q2449503: "m" };
const titleOf = (url) => decodeURIComponent(url.split("/wiki/")[1]).replace(/_/g, " ");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const year = (v) => (v ? parseInt(v.value.slice(0, v.value.startsWith("-") ? 5 : 4), 10) : null);
const toPerson = (b) => ({
  wikidata: b.item.value.split("/").pop(),
  name: b.label ? b.label.value : titleOf(b.wiki.value),
  gender: b.gender ? GENDER[b.gender.value.split("/").pop()] || "other" : null,
  region: regionOf(b),
  born: year(b.born),
  living: !b.died,
  wikipedia: b.wiki.value,
});

// Last 12 full months, as in pageviews.js.
const now = new Date();
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

// Fetching views for ~66k people takes hours, so every count is appended to a cache outside the
// repo as soon as it arrives. A rerun (or a resume after a crash) only fetches what's missing, and
// a different cutoff needs no fetching at all. Keyed by article and period, so a new month refetches.
const CACHE = path.join(process.env.XDG_CACHE_HOME || path.join(require("os").homedir(), ".cache"),
  "political-ideology-atlas", "pageviews.jsonl");
fs.mkdirSync(path.dirname(CACHE), { recursive: true });
const cache = new Map(fs.existsSync(CACHE) ? fs.readFileSync(CACHE, "utf8").split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((e) => [e.key, e.views]) : []);
const remember = (key, n) => (fs.appendFileSync(CACHE, JSON.stringify({ key, views: n }) + "\n"), cache.set(key, n), n);

// QLever and Wikidata's own endpoint often time out or run out of memory partway through the run,
// so each SPARQL result is kept for the month (the views period changes monthly too): a rerun
// repeats only the queries that hadn't come back.
const QUERY_CACHE = path.join(path.dirname(CACHE), `sparql-${new Date().toISOString().slice(0, 7)}`);
fs.mkdirSync(QUERY_CACHE, { recursive: true });
async function cachedSparql(q) {
  const file = path.join(QUERY_CACHE, require("crypto").createHash("sha1").update(q).digest("hex") + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = await sparql(q);
  fs.writeFileSync(file, JSON.stringify(rows));
  return rows;
}

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
// English Wikipedia's monthly top-1,000 articles over the same 12 months. Someone who qualifies and
// shows up there is in the catalog however few languages their article has (new politicians with a
// burst of attention, e.g. Francesca Hong, are in under 10 languages and so never reach the sample).
async function topTitles() {
  const file = path.join(QUERY_CACHE, `top-${ymd(start)}-${ymd(end)}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const names = new Set();
  for (let d = new Date(start); d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const res = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${d.getUTCFullYear()}/${m}/all-days`, { headers: HEADERS });
    if (!res.ok) throw new Error(`${res.status} for top articles ${d.getUTCFullYear()}-${m}`);
    for (const a of (await res.json()).items[0].articles) if (!a.article.includes(":")) names.add(a.article.replace(/_/g, " "));
  }
  fs.writeFileSync(file, JSON.stringify([...names]));
  return [...names];
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

// Someone with several citizenships gets an arbitrary one from the main query (Hasan Piker came out
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
  const candidates = async (linkFilter, extra) => {
    const byId = new Map();
    for (const branch of BRANCHES) for (const b of await cachedSparql(query(branch, linkFilter, extra))) byId.set(b.item.value, b);
    return [...byId.values()].sort((a, b) => a.item.value.localeCompare(b.item.value)).map(toPerson);
  };
  const above = await candidates(`xsd:integer(?l) >= ${MIN_LINKS}`);
  console.log(`${above.length} candidates in at least ${MIN_LINKS} languages`);
  const names = await topTitles();
  const lit = (t) => JSON.stringify(t) + "@en";
  for (let i = 0; i < names.length; i += 500) {
    const extra = `VALUES ?name { ${names.slice(i, i + 500).map(lit).join(" ")} } ?article schema:name ?name .`;
    above.push(...await candidates(`xsd:integer(?l) < ${MIN_LINKS}`, extra));
  }
  console.log(`${above.length} with those in the monthly top-1,000 lists below the language floor`);
  // A deterministic ~1% sample of those below the floor: Wikidata ids ending in "37".
  const sample = (await candidates(`xsd:integer(?l) < ${MIN_LINKS} && STRENDS(STR(?item), "37")`)).slice(0, SAMPLE_BELOW);
  console.log(`Sampled ${sample.length} people below the floor`);

  await fetchViews(sample, "sample");
  const cutoff = Math.max(...sample.map((p) => p.views12m));
  console.log(`Most-viewed person below the floor in the sample: ${cutoff} views`);
  await fetchViews(above, "candidates");

  const old = readJson(CATALOG);
  const audited = new Set(fs.readdirSync(PEOPLE_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));
  const oldByTitle = new Map(old.people.map((p) => [titleOf(p.wikipedia), p]));
  // Match by Wikidata id first: a renamed article ("Joseph II, Holy Roman Emperor" -> "Joseph II")
  // must keep its id, or its audit is orphaned. Views count only under the current title, so a
  // recent rename also adds the old title's views.
  const oldByQid = new Map(old.people.filter((p) => p.wikidata).map((p) => [p.wikidata, p]));
  const renamed = above.filter((p) => oldByQid.has(p.wikidata) && titleOf(oldByQid.get(p.wikidata).wikipedia) !== titleOf(p.wikipedia));
  const oldTitles = renamed.map((p) => ({ wikipedia: oldByQid.get(p.wikidata).wikipedia, p }));
  await fetchViews(oldTitles, "renamed");
  for (const o of oldTitles) o.p.views12m += o.views12m;
  const people = [];
  const seen = new Set();
  for (const p of above.filter((p) => p.views12m > cutoff).sort((a, b) => b.views12m - a.views12m)) {
    const prev = oldByQid.get(p.wikidata) || oldByTitle.get(titleOf(p.wikipedia));
    const id = prev ? prev.id : slug(titleOf(p.wikipedia));
    if (seen.has(id)) continue;
    seen.add(id);
    people.push({ id, ...p, ...(prev && prev.image ? { image: prev.image } : {}) });
  }
  await nationalityFromDescription(people);
  // Keep everyone already audited, even if they fall outside the criteria (e.g. the salience controls' kin).
  for (const p of old.people) if (audited.has(p.id) && !seen.has(p.id)) { people.push(p); seen.add(p.id); }
  people.sort((a, b) => (b.views12m || 0) - (a.views12m || 0));

  const dropped = old.people.filter((p) => !seen.has(p.id)).map((p) => p.name);
  fs.writeFileSync(CATALOG, JSON.stringify({
    _comment: "People to audit, generated by scripts/candidates.js from Wikidata (political occupation, cause activist, philosopher or economist, or a political office held) and ranked by English Wikipedia views. `living` is a hint for auditors to verify.",
    criteria: { occupations: ["politician", "political activist", "political pundit", "political scientist", "political theorist",
      "political philosopher", "philosopher", "economist", "pundit", "monarch", "jihadist", "terrorist", "military leader", "cause activists (women's rights, civil rights, human rights, social, peace, environment), trade unionist, revolutionary, social reformer, suffragist, feminist, anarchist"], orPoliticalOfficeHeld: ["public office", "head of state",
      "head of government", "monarch", "legislator"], minLanguages: MIN_LINKS, minLanguagesWaivedFor: "articles in English Wikipedia's monthly top 1,000", minViews12m: cutoff },
    viewsPeriod: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
    people,
  }, null, 1) + "\n");
  console.log(`Wrote ${people.length} people (more than ${cutoff} views). Dropped from the old catalog: ${dropped.length ? dropped.join(", ") : "none"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
