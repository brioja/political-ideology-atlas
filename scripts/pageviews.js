// Stores English Wikipedia page views (last 12 full months) in a catalog: people (used to break
// near-ties between matched people) or, with --ideologies, ideologies (used to order audits).
// Ideologies whose article link is only an unconfirmed search hit get 0.
// Run occasionally; the site only reads the stored numbers.
//   node scripts/pageviews.js [--ideologies]
const fs = require("fs");
const path = require("path");
const { ROOT, readJson } = require("./lib");

const IDEOLOGIES = process.argv.includes("--ideologies");
const CATALOG = path.join(ROOT, "audits", IDEOLOGIES ? "catalog.json" : "people-catalog.json");
const LIST = IDEOLOGIES ? "ideologies" : "people";
const HEADERS = { "user-agent": "political-ideology-atlas/1.0 (https://github.com/brioja/political-ideology-atlas)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    await sleep(150);
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (res.status !== 429 || attempt >= 5) throw new Error(`${res.status} for ${url}`);
    await sleep(5000 * (attempt + 1));
  }
}

const titleOf = (url) => decodeURIComponent(url.split("/wiki/")[1]).replace(/_/g, " ");
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

async function main() {
  const data = readJson(CATALOG);
  const people = data[LIST].filter((p) => p.wikipedia && (!IDEOLOGIES || ["exact", "redirect"].includes(p.wikipediaMatch)));
  if (IDEOLOGIES) for (const p of data[LIST]) if (!people.includes(p)) p.views12m = 0;

  // 1. Resolve redirects in batches (the page-view API counts only the exact title).
  for (let i = 0; i < people.length; i += 50) {
    const batch = people.slice(i, i + 50);
    const q = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&titles=${
      encodeURIComponent(batch.map((p) => titleOf(p.wikipedia)).join("|"))}`);
    const norm = new Map([...(q.query.normalized || []), ...(q.query.redirects || [])].map((r) => [r.from, r.to]));
    const pages = new Map(q.query.pages.map((p) => [p.title, p]));
    for (const p of batch) {
      let t = titleOf(p.wikipedia);
      for (let hops = 0; norm.has(t) && hops < 3; hops++) t = norm.get(t);
      const page = pages.get(t);
      if (!page || page.missing) { console.log(`missing article: ${p.name} (${p.wikipedia})`); p.wikipediaMissing = true; continue; }
      delete p.wikipediaMissing;
      p.wikipedia = `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`;
    }
  }

  // 2. Sum monthly views over the last 12 full months.
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
  for (const p of people) {
    if (p.wikipediaMissing) continue;
    const t = encodeURIComponent(titleOf(p.wikipedia).replace(/ /g, "_"));
    const r = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/${ymd(start)}/${ymd(end)}`);
    p.views12m = r ? r.items.reduce((s, x) => s + x.views, 0) : 0;
  }
  data.viewsPeriod = `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
  fs.writeFileSync(CATALOG, JSON.stringify(data, null, 1) + "\n");
  const top = [...people].sort((a, b) => (b.views12m || 0) - (a.views12m || 0));
  console.log(`Views for ${data.viewsPeriod}. Most viewed: ${top.slice(0, 5).map((p) => `${p.name} ${p.views12m}`).join(", ")}`);
  console.log(`Least viewed: ${top.slice(-5).map((p) => `${p.name} ${p.views12m}`).join(", ")}`);
}

main();
