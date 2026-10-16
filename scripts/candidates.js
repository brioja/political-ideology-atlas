// Builds the people catalog from data instead of hand-picking: every human on Wikidata with a
// political occupation (politician, political activist, political pundit, political scientist) or
// a public office held, who has an English Wikipedia article, ranked by English Wikipedia views
// over the last 12 full months. The salience check, not this list, decides who appears in the test.
//
// Fetching views for every such person is too slow, so the query keeps those whose article exists
// in at least MIN_LINKS Wikipedia languages. To show that floor doesn't drop anyone who belongs, a
// sample of people just below it is fetched too, and the catalog keeps only people with more views
// than anyone in that sample: below that level the list could be incomplete, above it it isn't.
// People who already have an audit stay in the catalog regardless.
//   node scripts/candidates.js
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, PEOPLE_DIR } = require("./lib");
const { sparql } = require("./sparql");

const MIN_LINKS = 10;
const SAMPLE_BELOW = 3000;
const CONCURRENCY = 20;
const CATALOG = path.join(ROOT, "audits", "people-catalog.json");
const HEADERS = { "user-agent": "political-ideology-atlas/1.0 (https://github.com/brioja/political-ideology-atlas)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PREFIX = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX schema: <http://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>`;
const OCCUPATIONS = ["Q82955", "Q11499147", "Q11499163", "Q1238570"].map((q) => `wd:${q}`).join(" ");
const query = (linkFilter) => `${PREFIX}
SELECT ?item (SAMPLE(?article) AS ?wiki) (SAMPLE(?name) AS ?label) (SAMPLE(?g) AS ?gender)
  (SAMPLE(?birth) AS ?born) (SAMPLE(?death) AS ?died) (SAMPLE(?contName) AS ?continent) (SAMPLE(?l) AS ?links) WHERE {
  { VALUES ?o { ${OCCUPATIONS} } ?item wdt:P106 ?o } UNION { ?item wdt:P39 ?pos }
  ?item wdt:P31 wd:Q5 ; wikibase:sitelinks ?l .
  FILTER(${linkFilter})
  ?article schema:about ?item . FILTER(STRSTARTS(STR(?article), "https://en.wikipedia.org/wiki/"))
  OPTIONAL { ?item rdfs:label ?name . FILTER(LANG(?name) = "en") }
  OPTIONAL { ?item wdt:P21 ?g }
  OPTIONAL { ?item wdt:P569 ?birth }
  OPTIONAL { ?item wdt:P570 ?death }
  OPTIONAL { ?item wdt:P27 ?country . ?country wdt:P30 ?cont . ?cont rdfs:label ?contName . FILTER(LANG(?contName) = "en") }
} GROUP BY ?item`;


const GENDER = { Q6581097: "m", Q6581072: "f", Q48270: "nb", Q1052281: "f", Q2449503: "m" };
const titleOf = (url) => decodeURIComponent(url.split("/wiki/")[1]).replace(/_/g, " ");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const year = (v) => (v ? parseInt(v.value.slice(0, v.value.startsWith("-") ? 5 : 4), 10) : null);
const toPerson = (b) => ({
  wikidata: b.item.value.split("/").pop(),
  name: b.label ? b.label.value : titleOf(b.wiki.value),
  gender: b.gender ? GENDER[b.gender.value.split("/").pop()] || "other" : null,
  region: b.continent ? b.continent.value : null,
  born: year(b.born),
  living: !b.died,
  wikipedia: b.wiki.value,
});

// Last 12 full months, as in pageviews.js.
const now = new Date();
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
async function views(p) {
  const t = encodeURIComponent(titleOf(p.wikipedia).replace(/ /g, "_"));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/${ymd(start)}/${ymd(end)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return (await res.json()).items.reduce((s, x) => s + x.views, 0);
    if (res.status === 404) return 0;
    if (attempt >= 5) throw new Error(`${res.status} for ${url}`);
    await sleep(3000 * (attempt + 1));
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

async function main() {
  const above = (await sparql(query(`xsd:integer(?l) >= ${MIN_LINKS}`))).map(toPerson);
  console.log(`${above.length} candidates in at least ${MIN_LINKS} languages`);
  // A deterministic ~1% sample of those below the floor: Wikidata ids ending in "37".
  const sample = (await sparql(query(`xsd:integer(?l) < ${MIN_LINKS} && STRENDS(STR(?item), "37")`))).map(toPerson).slice(0, SAMPLE_BELOW);
  console.log(`Sampled ${sample.length} people below the floor`);

  await fetchViews(sample, "sample");
  const cutoff = Math.max(...sample.map((p) => p.views12m));
  console.log(`Most-viewed person below the floor in the sample: ${cutoff} views`);
  await fetchViews(above, "candidates");

  const old = readJson(CATALOG);
  const audited = new Set(fs.readdirSync(PEOPLE_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));
  const oldByTitle = new Map(old.people.map((p) => [titleOf(p.wikipedia), p]));
  const people = [];
  const seen = new Set();
  for (const p of above.filter((p) => p.views12m > cutoff).sort((a, b) => b.views12m - a.views12m)) {
    const prev = oldByTitle.get(titleOf(p.wikipedia));
    const id = prev ? prev.id : slug(titleOf(p.wikipedia));
    if (seen.has(id)) continue;
    seen.add(id);
    people.push({ id, ...p, ...(prev && prev.image ? { image: prev.image } : {}) });
  }
  // Keep everyone already audited, even if they fall outside the criteria (e.g. the salience controls' kin).
  for (const p of old.people) if (audited.has(p.id) && !seen.has(p.id)) { people.push(p); seen.add(p.id); }
  people.sort((a, b) => (b.views12m || 0) - (a.views12m || 0));

  const dropped = old.people.filter((p) => !seen.has(p.id)).map((p) => p.name);
  fs.writeFileSync(CATALOG, JSON.stringify({
    _comment: "People to audit, generated by scripts/candidates.js from Wikidata (political occupation or public office held) and ranked by English Wikipedia views. `living` is a hint for auditors to verify.",
    criteria: { occupations: ["politician", "political activist", "political pundit", "political scientist"], orPositionHeld: true, minLanguages: MIN_LINKS, minViews12m: cutoff },
    viewsPeriod: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
    people,
  }, null, 1) + "\n");
  console.log(`Wrote ${people.length} people (more than ${cutoff} views). Dropped from the old catalog: ${dropped.length ? dropped.join(", ") : "none"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
