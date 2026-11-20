// Finds the English Wikipedia article for each ideology in audits/catalog.json and stores it
// as `wikipedia` plus `wikipediaMatch` (how it was found):
//   exact     the article; an entry whose name only redirects to it (or differs in case) takes the article's title
//             as its name, since a redirect is only ever another name of the article (Brandon, 2026-11-20)
//   search    best search hit; unconfirmed, so the site doesn't link it until an audit confirms one
//   none      nothing suitable found
// Entries that already have a link are left alone unless --all is passed.
//   node scripts/wikipedia.js [--all]
const fs = require("fs");
const path = require("path");
const { ROOT, readJson } = require("./lib");

const CATALOG = path.join(ROOT, "audits", "catalog.json");
const API = "https://en.wikipedia.org/w/api.php";
const { politeFetch } = require("./fetch");


// Paced, with 429s waited out (scripts/fetch.js).
async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const res = await politeFetch(url);
  if (res.ok) return res.json();
  throw new Error(`${res.status} for ${url}`);
}

const articleUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

async function lookup(name) {
  const plain = name.replace(/\s*\(.*?\)\s*/g, " ").trim();
  // Wikipedia titles are case-sensitive after the first letter, so also try sentence case.
  const sentence = plain[0] + plain.slice(1).toLowerCase();
  for (const title of [...new Set([plain, sentence])]) {
    const q = await api({ action: "query", titles: title, redirects: "1" });
    const page = q.query.pages[0];
    if (page && !page.missing && !page.invalid) {
      return { url: articleUrl(page.title), match: "exact", title: page.title };
    }
  }
  const s = await api({ action: "query", list: "search", srsearch: `${plain} ideology`, srlimit: "1" });
  const hit = s.query.search[0];
  return hit ? { url: articleUrl(hit.title), match: "search", title: hit.title } : { url: null, match: "none", title: null };
}

async function main() {
  const all = process.argv.includes("--all");
  const data = readJson(CATALOG);
  for (const entry of data.ideologies) {
    if (entry.wikipedia && !all) continue;
    const r = await lookup(entry.name);
    entry.wikipedia = r.url;
    entry.wikipediaMatch = r.match;
    if (r.match === "exact" && entry.name !== r.title) { console.log(`renamed ${entry.name} -> ${r.title}`); entry.name = r.title; }
    if (r.match === "search" || r.match === "none") console.log(`${r.match.padEnd(6)} ${entry.name} -> ${r.title ?? "-"}`);
    fs.writeFileSync(CATALOG, JSON.stringify(data, null, 1) + "\n");
  }
  const counts = data.ideologies.reduce((c, e) => ({ ...c, [e.wikipediaMatch]: (c[e.wikipediaMatch] || 0) + 1 }), {});
  console.log(counts);
}

main();
