// Adds ideologies to the catalog from data, the way candidates.js does for people: every article
// linked from English Wikipedia's "List of political ideologies" that Wikidata classes as an ideology
// (see step 2; the list also links people, places and parties), with its English Wikipedia views over
// the last 12 full months, which set the audit order. Wikipedia's list is a loose source, like the
// older hand-made list the catalog started from, so it only proposes candidates: each audit's first
// check and the salience rule decide what reaches the test.
//
// Writes a report of the additions and, with --write, appends them to the catalog.
//   node scripts/ideology-candidates.js [--write]
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, PROFILES_DIR } = require("./lib");

const LIST = "List_of_political_ideologies";
const CLASSES = { Q7257: "ideology", Q12909644: "political ideology", Q179805: "political philosophy" };
const SUBCLASS_ROOT = "Q12909644"; // political ideology: its subclasses count too
const CATALOG = path.join(ROOT, "audits", "catalog.json");
const QLEVER = "https://qlever.dev/api/wikidata";
const HEADERS = { "user-agent": "political-ideology-atlas/1.0 (https://github.com/brioja/political-ideology-atlas)" };
const CONCURRENCY = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const articleUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
const titleOf = (url) => decodeURIComponent(url.split("/wiki/")[1]).replace(/_/g, " ");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function getJson(url, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (attempt >= 5) throw new Error(`${res.status} for ${url.slice(0, 200)}`);
    await sleep(3000 * (attempt + 1));
  }
}
const wiki = (params) => getJson(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`);

// 1. Every article the list links to, resolved through redirects, with its Wikidata item.
async function listedArticles() {
  const links = (await wiki({ action: "parse", page: LIST, prop: "links" })).parse.links
    .filter((l) => l.ns === 0).map((l) => l.title); // missing pages drop out below (no Wikidata item)
  const out = new Map(); // canonical title -> Wikidata id
  for (let i = 0; i < links.length; i += 50) {
    const q = (await wiki({ action: "query", titles: links.slice(i, i + 50).join("|"), redirects: "1", prop: "pageprops", ppprop: "wikibase_item" })).query;
    for (const p of q.pages) if (!p.missing && p.pageprops && p.pageprops.wikibase_item) out.set(p.title, p.pageprops.wikibase_item);
    await sleep(200);
  }
  return out;
}

// 2. Which of those Wikidata items are ideologies: an instance of political ideology or any of its
// subclasses (anarchist school of thought, ...), or directly an instance of ideology or political
// philosophy. Following subclass chains under "ideology" itself would let in organisations and
// conspiracy theories by way of "belief"; excluding classes instead of including them lets in
// people's groups and offices. This middle rule misses a few listed ideologies that Wikidata files
// elsewhere (Black nationalism, Eurasianism, absolute monarchy).
async function ideologyItems(ids) {
  const keep = new Set();
  const PREFIX = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>`;
  const classes = Object.keys(CLASSES).map((q) => `wd:${q}`).join(" ");
  for (let i = 0; i < ids.length; i += 400) {
    const values = ids.slice(i, i + 400).map((q) => `wd:${q}`).join(" ");
    const q = `${PREFIX} SELECT DISTINCT ?item WHERE { VALUES ?item { ${values} } VALUES ?c { ${classes} } { ?item wdt:P31 ?c } UNION { ?item wdt:P31/wdt:P279* wd:${SUBCLASS_ROOT} } }`;
    const r = await getJson(`${QLEVER}?query=${encodeURIComponent(q)}`, { headers: { accept: "application/sparql-results+json" } });
    for (const b of r.results.bindings) keep.add(b.item.value.split("/").pop());
  }
  return keep;
}

// 3. English Wikipedia views over the last 12 full months, as in pageviews.js.
const now = new Date();
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
async function views(title) {
  const t = encodeURIComponent(title.replace(/ /g, "_"));
  const r = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/${ymd(start)}/${ymd(end)}`);
  return r ? r.items.reduce((s, x) => s + x.views, 0) : 0;
}

async function main() {
  const listed = await listedArticles();
  const ideologies = await ideologyItems([...new Set(listed.values())]);
  const found = [...listed].filter(([, q]) => ideologies.has(q)).map(([title, wikidata]) => ({ title, wikidata }));
  for (let i = 0; i < found.length; i += CONCURRENCY) {
    await Promise.all(found.slice(i, i + CONCURRENCY).map(async (f) => { f.views12m = await views(f.title); }));
  }
  found.sort((a, b) => b.views12m - a.views12m);

  // Neither source is strict, so the catalog is their union: every current entry stays, and listed
  // ideologies are added unless an entry already points at the same article (whatever its name).
  // The audit's first check and the salience rule decide what reaches the test; views set the order.
  const data = readJson(CATALOG);
  const current = data.ideologies;
  const auditLink = (e) => {
    const p = path.join(PROFILES_DIR, `${e.id}.json`);
    return fs.existsSync(p) && readJson(p).wikipedia ? titleOf(readJson(p).wikipedia) : null;
  };
  const key = (t) => t.toLowerCase();
  const covered = new Set(current.flatMap((e) => [auditLink(e), e.wikipedia && titleOf(e.wikipedia)]).filter(Boolean).map(key));
  const added = found.filter((f) => !covered.has(key(f.title)));
  const ids = new Set(current.map((e) => e.id));
  const entries = added.map((f) => {
    const name = f.title.replace(/\s*\(.*?\)\s*$/, "");
    let id = slug(name);
    for (let n = 2; ids.has(id); n++) id = `${slug(name)}-${n}`;
    ids.add(id);
    return { id, name, wikipedia: articleUrl(f.title), wikipediaMatch: "exact", wikidata: f.wikidata, views12m: f.views12m };
  });

  const report = {
    rule: `Union of the current catalog and articles linked from en.wikipedia ${LIST} that Wikidata classes as a political ideology (or a subclass), ideology or political philosophy`,
    viewsPeriod: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
    listed: listed.size, found: found.length, alreadyInCatalog: found.length - added.length, added: added.length,
    addedList: entries.map((e) => `${e.name} (${e.views12m})`),
  };
  fs.writeFileSync(path.join(ROOT, "audits", "ideology-candidates-report.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(JSON.stringify({ ...report, addedList: report.addedList.slice(0, 15) }, null, 1));

  if (process.argv.includes("--write")) {
    data.ideologies = [...current, ...entries];
    fs.writeFileSync(CATALOG, JSON.stringify(data, null, 1) + "\n");
    console.log(`Added ${entries.length}; the catalog now has ${data.ideologies.length} ideologies.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
