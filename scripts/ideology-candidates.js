// Adds ideologies to the catalog from data, the way candidates.js does for people: every article
// linked from English Wikipedia's "List of political ideologies" that Wikidata classes as an ideology
// (see step 2; the list also links people, places and parties), with its English Wikipedia views over
// the last 12 full months, which set the audit order. Wikipedia's list is a loose source, like the
// older hand-made list the catalog started from, so it only proposes candidates: each audit's first
// check and the uncertainty rule decide what reaches the test.
//
// A second source (Brandon, 2026-11-20, after Incel was missing): the "See also" links and infobox
// "Ideology" rows of every catalog ideology's own article, and the "Ideology" rows of the parties,
// movements and organizations those link to (see step 4). Lead links were tried and are mostly noise. See also
// links are loose (a dry run found 4,700, Lilith and the Human Development Index among them), so each one enters
// only after a whole-article pre-check against the definition (scripts/ideology-precheck.js, Brandon 2026-11-20).
//
// Entries without their own Wikipedia article are dropped.
// Writes a report of the additions and drops and, with --write, applies them to the catalog.
//   node scripts/ideology-candidates.js [--write]
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, PROFILES_DIR, slug } = require("./lib");
const { sparql } = require("./sparql");

const LIST = "List_of_political_ideologies";
const CLASSES = { Q7257: "ideology", Q12909644: "political ideology", Q179805: "political philosophy" };
const SUBCLASS_ROOT = "Q12909644"; // political ideology: its subclasses count too
// Articles about an ideology in one place, its history, or a list of them aren't an ideology's own
// article: "Feminism in India", "Conservatism in Canada", "History of democracy".
const NOT_OWN_TOPIC = /^(History|List|Timeline) of | in (the |[A-Z])/;
const CATALOG = path.join(ROOT, "audits", "catalog.json");
const { politeFetch } = require("./fetch");
const CONCURRENCY = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const articleUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
const titleOf = (url) => decodeURIComponent(url.split("/wiki/")[1]).replace(/_/g, " ");

async function getJson(url, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await politeFetch(url, { ...opts }); // 429s waited out there; other failures retried here
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
// people's groups and offices. An item that is a direct subclass of one that passes counts too:
// Wikidata files Ecofeminism as a social movement, but also as a subclass of feminism. This middle
// rule still misses a few listed ideologies that Wikidata files elsewhere (Black nationalism,
// Eurasianism, absolute monarchy).
async function ideologyItems(ids) {
  const keep = new Set();
  const PREFIX = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>`;
  const classes = Object.keys(CLASSES).map((q) => `wd:${q}`).join(" ");
  for (let i = 0; i < ids.length; i += 400) {
    const values = ids.slice(i, i + 400).map((q) => `wd:${q}`).join(" ");
    const q = `${PREFIX} SELECT DISTINCT ?item WHERE { VALUES ?item { ${values} } VALUES ?c { ${classes} } { ?item wdt:P31 ?c } UNION { ?item wdt:P31/wdt:P279* wd:${SUBCLASS_ROOT} }
      UNION { ?item wdt:P279 ?parent . { ?parent wdt:P31 ?c } UNION { ?parent wdt:P31/wdt:P279* wd:${SUBCLASS_ROOT} } } }`;
    for (const b of await sparql(q)) keep.add(b.item.value.split("/").pop());
  }
  return keep;
}

// 3. English Wikipedia views over the last 12 full months, as in pageviews.js.
const { start, end } = require("./lib").viewsPeriod(); // moves every two months
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
async function views(title) {
  const t = encodeURIComponent(title.replace(/ /g, "_"));
  const r = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/${ymd(start)}/${ymd(end)}`);
  return r ? r.items.reduce((s, x) => s + x.views, 0) : 0;
}

// 4. Wikipedia's own links between ideologies. Every request goes through fetch.js (cached on disk,
// paced with the audits running alongside). The infobox type sorts out what has ideas but isn't a set
// of them: an article kept here has no infobox, or a movement, ideology, philosophy, religion or
// school-of-thought one; a person, party, organization, state, event, book or film is left out.
const lib = require("./lib");
const NOT_OWN_TOPIC_LINKED = /^(History|Lists?|Timeline|Outline|Index|Glossary) of | in (the |[A-Z])/;
// Whole infobox types, so "philosopher" or "religious biography" (people) don't pass as a philosophy or religion.
const IDEA_BOX = /^((political|social|cultural|art|religious) )?(movement|ideology|philosophy|school of thought|religion|religious group|christian denomination)$/;
const PERSON_BOX = /person|biography|officeholder|royalty|philosopher|clergy|saint/;
const GROUP_BOX = /party|organi[sz]ation|militant|movement/;
const wikiLib = require("./wiki");
async function linkedArticles() {
  const excluded = (id) => fs.existsSync(lib.profilePath(id)) && readJson(lib.profilePath(id)).notIdeasOfWhatSocietyShouldBe;
  const seeds = lib.catalog().filter((e) => lib.articleTitle(e) && !excluded(e.id) && !lib.personViews(e));
  const found = new Map(); // canonical title -> { title, boxes, disambig, via }
  const collect = async (links) => {
    const get = await wikiLib.pageInfo(links.map((l) => l.title));
    for (const l of links) {
      const p = get(l.title); if (!p) continue;
      const f = found.get(p.title) || { ...p, via: new Set() };
      f.via.add(l.via); found.set(p.title, f);
    }
  };
  const links = [];
  for (const s of seeds) {
    const html = await lib.fetchArticle(s).catch(() => null); if (!html) continue;
    for (const t of [...wikiLib.seeAlso(html), ...wikiLib.infoboxRow(html)]) links.push({ title: t, via: s.id });
  }
  await collect(links);
  // One hop: the Ideology rows of linked parties, movements and organizations.
  const hop = [];
  for (const g of [...found.values()].filter((f) => [...f.boxes].some((b) => GROUP_BOX.test(b)))) {
    const html = await wikiLib.articleHtml(g.title).catch(() => null); if (!html) continue;
    for (const t of wikiLib.infoboxRow(html)) hop.push({ title: t, via: g.title });
  }
  await collect(hop);
  const boxes = (f) => [...f.boxes].filter(Boolean); // "Template:Infobox" itself names no type
  return [...found.values()].filter((f) => !f.disambig && !NOT_OWN_TOPIC_LINKED.test(f.title) && !boxes(f).some((b) => PERSON_BOX.test(b))
    && (boxes(f).length === 0 || boxes(f).some((b) => IDEA_BOX.test(b))));
}

async function main() {
  const listed = await listedArticles();
  const ideologies = await ideologyItems([...new Set(listed.values())]);
  const found = [...listed].filter(([t, q]) => ideologies.has(q) && !NOT_OWN_TOPIC.test(t)).map(([title, wikidata]) => ({ title, wikidata }));
  const fromList = new Set(found.map((f) => f.title));
  // Linked articles enter only once the whole-article pre-check (scripts/ideology-precheck.js) found political
  // ideas of what society should be; the rest wait for it or stay out.
  const linked = await linkedArticles(), verdicts = require("./ideology-precheck").verdicts();
  const linkedNew = linked.filter((l) => !fromList.has(l.title));
  const precheck = { passed: 0, rejected: 0, pending: 0 };
  for (const l of linkedNew) {
    const v = verdicts[l.title];
    if (!v) { precheck.pending++; continue; }
    if (v.answer !== "yes") { precheck.rejected++; continue; }
    precheck.passed++;
    found.push({ title: l.title, source: "wikipedia-links", via: [...l.via].slice(0, 3) });
  }
  for (let i = 0; i < found.length; i += CONCURRENCY) {
    await Promise.all(found.slice(i, i + CONCURRENCY).map(async (f) => { f.views12m = await views(f.title); }));
  }
  found.sort((a, b) => b.views12m - a.views12m);

  // Neither source is strict, so the catalog is their union: every current entry with its own
  // Wikipedia article stays, and listed ideologies are added unless an entry already points at the
  // same article (whatever its name). An entry whose link is only a search hit (wikipedia.js) or
  // missing is dropped unless its audit confirmed an article: a quiz-taker matched to it would have
  // nowhere to read more. The audit's first check and the uncertainty rule decide what reaches the
  // test; views set the order.
  const data = readJson(CATALOG);
  const auditLink = (e) => {
    const p = path.join(PROFILES_DIR, `${e.id}.json`);
    return fs.existsSync(p) && readJson(p).wikipedia ? titleOf(readJson(p).wikipedia) : null;
  };
  const hasArticle = (e) => e.wikipediaMatch === "exact" || auditLink(e);
  const current = data.ideologies.filter(hasArticle);
  const dropped = data.ideologies.filter((e) => !hasArticle(e));
  const key = (t) => t.toLowerCase();
  const covered = new Set(current.flatMap((e) => [auditLink(e), e.wikipedia && titleOf(e.wikipedia), lib.articleTitle(e), ...lib.wikipediaOtherNames(e.id)]).filter(Boolean).map(key));
  const added = found.filter((f) => !covered.has(key(f.title)));
  const ids = new Set(current.map((e) => e.id));
  const entries = added.map((f) => {
    // The article's own title, disambiguator included (test.js): the bare name often redirects elsewhere
    // ("Black Codes (United States)": "Black Codes" lands on Black Code), and an entry stands on its title.
    const name = f.title;
    let id = slug(name);
    for (let n = 2; ids.has(id); n++) id = `${slug(name)}-${n}`;
    ids.add(id);
    return f.source ? { id, name, wikipedia: articleUrl(f.title), wikipediaMatch: "exact", views12m: f.views12m, source: f.source, foundVia: f.via }
      : { id, name, wikipedia: articleUrl(f.title), wikipediaMatch: "exact", wikidata: f.wikidata, views12m: f.views12m };
  });

  const report = {
    rule: `Union of the current catalog and articles linked from en.wikipedia ${LIST} that Wikidata classes as a political ideology (or a subclass), ideology or political philosophy, or as a direct subclass of one; plus (source wikipedia-links) articles linked from a catalog ideology's See also section or infobox Ideology row, or a linked group's Ideology row, whose infobox, if any, is a movement, ideology, philosophy, religion or school of thought and whose whole article passed the pre-check (scripts/ideology-precheck.js); leaving out articles on one place, a history or a list`,
    viewsPeriod: require("./lib").viewsPeriod().label,
    listed: listed.size, linked: linked.length, linkedPrecheck: precheck, found: found.length, alreadyInCatalog: found.length - added.length, added: added.length,
    addedList: entries.map((e) => `${e.name} (${e.views12m})`),
    droppedNoArticle: dropped.map((e) => e.name),
  };
  fs.writeFileSync(path.join(ROOT, "audits", "ideology-candidates-report.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(JSON.stringify({ ...report, addedList: report.addedList.slice(0, 15), droppedNoArticle: report.droppedNoArticle.slice(0, 15) }, null, 1));

  if (process.argv.includes("--write")) {
    data.ideologies = [...current, ...entries];
    fs.writeFileSync(CATALOG, JSON.stringify(data, null, 1) + "\n");
    console.log(`Added ${entries.length}, dropped ${dropped.length} without an article; the catalog now has ${data.ideologies.length} ideologies.`);
  }
}

module.exports = { linkedArticles };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
