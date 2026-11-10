// Triage for the people catalog: which people's page views to check. Checking views for every human
// on Wikipedia would take days, so the people Wikidata ties to politics are checked: a political
// occupation (politician, political activist, political pundit, political scientist, theorist,
// philosopher, economist...), a political office held, a stated political ideology, or plain
// "activist" as an occupation: a heuristic for who is likely to pass an audit, since a public political
// record is what places someone on every dividing line. These labels are triage, not a filter: they decide whose views are
// fetched, never who may be in the catalog. The only filter is the views cutoff
// (scripts/candidate-filter.js), and anyone above it may be added, label or not (Destiny, xQc).
// The uncertainty rule, not the catalog, decides who appears in the test; scripts/triage.js then
// orders the catalog's people for auditing.
//
// Labelled people whose article exists in fewer than MIN_LINKS Wikipedia languages are skipped, as
// almost none of them reach the cutoff. To show that doesn't miss anyone above it, a sample of
// them is returned too, and candidate-filter.js sets the cutoff above the most-viewed of the sample.
// The language floor is waived for anyone in English Wikipedia's monthly top-1,000 articles.
//   node scripts/candidate-triage.js     prints how many people would be checked (no views fetched)
const fs = require("fs");
const path = require("path");
const { viewsPeriod } = require("./lib");
const { sparql } = require("./sparql");

const MIN_LINKS = 10;
const SAMPLE_BELOW = 3000;
const HEADERS = { "user-agent": "political-ideology-atlas/1.0 (https://github.com/brioja/political-ideology-atlas)" };

const PREFIX = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX schema: <http://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>`;
// Politician, political activist, political pundit, political scientist, political theorist,
// political philosopher, philosopher, economist, and activists for a named cause: women's rights,
// civil rights, human rights, social, peace, environment, trade unionist, revolutionary, social
// reformer, suffragist, feminist, anarchist. Philosophers and economists bring in thinkers such as
// Adam Smith, Engels, Friedman and Rand, whom Wikidata never calls political. Plain "activist" is
// its own branch below; "philanthropist" stays out (donors, not positions), and "writer" is too broad.
// Also pundit (Wikidata often tags commentators plain "pundit", not "political pundit": Tucker Carlson),
// monarch as an occupation (rulers with no office record: Genghis Khan), jihadist, terrorist and
// military leader (Osama bin Laden). "Podcaster" and "journalist" stay out: they bring in
// entertainers and reporters wholesale.
const OCCUPATIONS = ["Q82955", "Q11499147", "Q11499163", "Q1238570", "Q15994177", "Q18930007", "Q4964182", "Q188094",
  "Q28692502", "Q1021386", "Q1476215", "Q8359428", "Q16323111", "Q3578589", "Q15627169", "Q3242115", "Q16611574",
  "Q27532437", "Q34074720", "Q12359071"].map((q) => `wd:${q}`).join(" ");
const OCCUPATIONS_2 = ["Q116", "Q21512362", "Q12414919", "Q1402561"].map((q) => `wd:${q}`).join(" ");
// Plain "pundit" also tags football and TV pundits (Ian Wright, Sanjay Gupta), so it counts only for
// people with no sports, coaching, wrestling or medical occupation.
const NOT_PUNDITS = ["Q2066131", "Q2986228", "Q628099", "Q13474373", "Q39631"].map((q) => `wd:${q}`).join(" ");
// "Position held" counts only for political offices: public office, head of state or government,
// monarch, legislator. Any position brought in goodwill ambassadors, CEOs and trustees (Messi, Bezos).
const OFFICES = ["Q294414", "Q48352", "Q2285706", "Q116", "Q4175034"].map((q) => `wd:${q}`).join(" ");
// Each label is its own query, merged here: as one UNION the query timed out on QLever.
const BRANCHES = [
  `VALUES ?o { ${OCCUPATIONS} } ?item wdt:P106 ?o .`,
  `VALUES ?o { ${OCCUPATIONS_2} } ?item wdt:P106 ?o .`,
  `?item wdt:P106 wd:Q1642960 . FILTER NOT EXISTS { VALUES ?x { ${NOT_PUNDITS} } ?item wdt:P106/wdt:P279* ?x }`,
  `VALUES ?office { ${OFFICES} } ?item wdt:P39 ?pos . ?pos wdt:P31*/wdt:P279* ?office .`,
  // A popular figure with a stated or defined political ideology (George Orwell, Selena Gomez), or
  // "activist" as an occupation (Joan Baez, Bono). These bring in politically active celebrities on
  // purpose since 2026-11-01: the uncertainty rule, not this list, decides who is shown, and someone
  // without positions across every dividing line fails it like the negative controls.
  `?item wdt:P1142 ?ideology .`,
  `?item wdt:P106 wd:Q15253558 .`,
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

// The views period (lib.js) moves every two months.
const { start, end, ymd } = viewsPeriod();
const CACHE_DIR = path.join(process.env.XDG_CACHE_HOME || path.join(require("os").homedir(), ".cache"), "political-ideology-atlas");

// QLever and Wikidata's own endpoint often time out or run out of memory partway through the run,
// so each SPARQL result is kept for the views period: a rerun repeats only the queries that hadn't
// come back.
const QUERY_CACHE = path.join(CACHE_DIR, `sparql-${ymd(end)}`);
fs.mkdirSync(QUERY_CACHE, { recursive: true });
async function cachedSparql(q) {
  const file = path.join(QUERY_CACHE, require("crypto").createHash("sha1").update(q).digest("hex") + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = await sparql(q);
  fs.writeFileSync(file, JSON.stringify(rows));
  return rows;
}

// English Wikipedia's monthly top-1,000 articles over the same 12 months. A labelled person who shows
// up there is checked however few languages their article has (new politicians with a burst of
// attention, e.g. Francesca Hong, are in under 10 languages and so never reach the sample).
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

// The people whose views to check: `check` (labelled, in at least MIN_LINKS languages or in a monthly
// top-1,000) and `sample` (a deterministic ~1% of the labelled people below the language floor,
// Wikidata ids ending in "37", whose views set the cutoff).
async function triage() {
  const labelled = async (linkFilter, extra) => {
    const byId = new Map();
    for (const branch of BRANCHES) for (const b of await cachedSparql(query(branch, linkFilter, extra))) byId.set(b.item.value, b);
    return [...byId.values()].sort((a, b) => a.item.value.localeCompare(b.item.value)).map(toPerson);
  };
  const check = await labelled(`xsd:integer(?l) >= ${MIN_LINKS}`);
  console.log(`${check.length} labelled people in at least ${MIN_LINKS} languages`);
  const names = await topTitles();
  const lit = (t) => JSON.stringify(t) + "@en";
  for (let i = 0; i < names.length; i += 500) {
    const extra = `VALUES ?name { ${names.slice(i, i + 500).map(lit).join(" ")} } ?article schema:name ?name .`;
    check.push(...await labelled(`xsd:integer(?l) < ${MIN_LINKS}`, extra));
  }
  console.log(`${check.length} with those in the monthly top-1,000 lists below the language floor`);
  const sample = (await labelled(`xsd:integer(?l) < ${MIN_LINKS} && STRENDS(STR(?item), "37")`)).slice(0, SAMPLE_BELOW);
  console.log(`Sampled ${sample.length} labelled people below the language floor`);
  return { check, sample };
}

module.exports = { triage, cachedSparql, PREFIX, REGION_OF, titleOf, viewsPeriod, CACHE_DIR, HEADERS, MIN_LINKS };

if (require.main === module) triage().catch((e) => { console.error(e); process.exit(1); });
