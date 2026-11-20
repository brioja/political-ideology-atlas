// Wikipedia and Wikidata for agents and scripts, through the project's on-disk cache (Brandon, 2026-11-06): one
// request at a time, polite pauses, rate limits waited out, and every page read only once across all runs. Agents
// never fetch wikipedia.org or wikidata.org directly (a project hook blocks it); they use this.
//   node scripts/wiki.js "<title or en.wikipedia.org URL>"        the article as plain text
//   node scripts/wiki.js --html "<title or URL>"                   the rendered article HTML (links, references)
//   node scripts/wiki.js --links "<title or URL>"                  its "See also" links and infobox "Ideology" rows, as JSON
//   node scripts/wiki.js --info "<title>|<title>|..."              canonical title, infobox types, disambiguation, Wikidata id
//   node scripts/wiki.js --wikidata Q12345                         the Wikidata item (labels, aliases, claims) as JSON
//   node scripts/wiki.js --search "<words>"                        article titles matching the words
//   node scripts/wiki.js --commons "File:<name>"                   a Commons file: where it redirects, and its log
//                                                                  (renames, deletions), as JSON
// Wikipedia is for leads only (audits/AUDIT_RULES.md section 2): follow its citations to the originals.
//
// As a library (require("./wiki")), the same reading for scripts, so each one doesn't rediscover Wikipedia's quirks
// (Brandon, 2026-11-20):
//   apiUrl(params, host)    an API URL (JSON, formatversion 2), en.wikipedia.org unless host is given
//   titleOf(s)              a title from a title or an en.wikipedia.org URL (underscores, %-escapes, #fragments)
//   articleHtml(title)      the rendered article, redirects followed, cached; null if there is no such page
//   htmlToText(html)        plain text with paragraph breaks
//   linkTitles(html)        article titles linked from a piece of HTML (namespaced pages such as File: dropped)
//   seeAlso(html)           titles linked from the "See also" section
//   infoboxRow(html, re)    titles linked from infobox rows whose label matches re (default: Ideology / Ideologies)
//   pageInfo(titles)        for any number of titles: a lookup t => { title, boxes, disambig, wikidata } or undefined
//                           for missing pages. It follows normalization and redirect chains, asks 50 titles at a
//                           time and follows "continue" (long template lists otherwise drop pages' later fields).
//                           boxes: infobox types from the article's Infobox templates ("political party", "person").
"use strict";
const lib = require("./lib");

// lib.cachedJson waits out a 429 itself.
const cached = (url) => lib.cachedJson(url);
const titleOf = (s) => decodeURIComponent(String(s).replace(/^https?:\/\/en\.(m\.)?wikipedia\.org\/wiki\//, "").replace(/[#?].*$/, "")).replace(/_/g, " ");
const apiUrl = (params, host = "en.wikipedia.org") => `https://${host}/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;

async function parsed(title) {
  const r = await cached(apiUrl({ action: "parse", prop: "text", redirects: "1", page: titleOf(title) }));
  return r && !r.error && r.parse ? r.parse : null;
}
const articleHtml = async (title) => { const p = await parsed(title); return p && p.text; };
const htmlToText = (html) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|li|h[1-6]|tr|div)>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

const linkTitles = (html) => [...String(html || "").matchAll(/href="\/wiki\/([^"#?]+)/g)]
  .map((m) => decodeURIComponent(m[1]).replace(/_/g, " ")).filter((t) => !/^[A-Za-z ]+:/.test(t));
// The section runs from its heading to the next level-2 heading (the current skin wraps headings in
// <div class="mw-heading mw-heading2">; older cached pages have bare <h2>).
const seeAlso = (html) => { const m = String(html || "").match(/id="See_also"[\s\S]*?(?=<div class="mw-heading mw-heading2|<h2[ >]|$)/); return m ? linkTitles(m[0]) : []; };
// An infobox row is <th>label</th><td>value</td>; the label may sit inside links or spans.
const infoboxRow = (html, label = /Ideolog(?:y|ies)/) => linkTitles([...String(html || "").matchAll(
  new RegExp(`<th[^>]*>(?:\\s*<[^>]+>)*\\s*(?:${label.source})[\\s\\S]*?<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "gi"))].map((m) => m[1]).join(" "));

async function pageInfo(titles) {
  titles = [...new Set(titles)];
  const pages = new Map(), to = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    for (let cont = {}; ;) {
      const j = await cached(apiUrl({ action: "query", titles: titles.slice(i, i + 50).join("|"), redirects: "1",
        prop: "templates|pageprops", tlnamespace: "10", tllimit: "max", ppprop: "disambiguation|wikibase_item", ...cont }));
      const q = j.query || {};
      for (const r of [...(q.normalized || []), ...(q.redirects || [])]) to.set(r.from, r.to);
      for (const p of q.pages || []) {
        if (p.missing || p.invalid) continue;
        const e = pages.get(p.title) || { title: p.title, boxes: new Set(), disambig: false, wikidata: null };
        for (const t of p.templates || []) if (/^Template:Infobox/i.test(t.title)) e.boxes.add(t.title.replace(/^Template:Infobox ?/i, "").toLowerCase());
        if (p.pageprops && "disambiguation" in p.pageprops) e.disambig = true;
        if (p.pageprops && p.pageprops.wikibase_item) e.wikidata = p.pageprops.wikibase_item;
        pages.set(p.title, e);
      }
      if (!j.continue) break;
      cont = { ...j.continue };
    }
  }
  const resolve = (t) => { for (let k = 0; k < 3 && to.has(t); k++) t = to.get(t); return t; };
  return (t) => pages.get(resolve(t));
}

module.exports = { apiUrl, titleOf, articleHtml, htmlToText, linkTitles, seeAlso, infoboxRow, pageInfo };

async function main() {
  const [flag, arg] = process.argv[2] && process.argv[2].startsWith("--") ? [process.argv[2], process.argv[3]] : [null, process.argv[2]];
  if (!arg) { console.error("usage: node scripts/wiki.js [--html | --links | --info | --wikidata | --search | --commons] <title, URL, Q-id, words or File:name>"); process.exit(1); }
  if (flag === "--commons") {
    const t = String(arg).replace(/^https?:\/\/commons\.wikimedia\.org\/wiki\//, "").replace(/_/g, " ");
    const page = await cached(apiUrl({ action: "query", redirects: "1", titles: t, prop: "imageinfo", iiprop: "url" }, "commons.wikimedia.org"));
    const log = await cached(apiUrl({ action: "query", list: "logevents", letitle: t, lelimit: "10" }, "commons.wikimedia.org"));
    console.log(JSON.stringify({ page: page.query, log: (log.query.logevents || []).map((e) => ({ when: e.timestamp, type: e.type, action: e.action,
      comment: e.comment, target: e.params && e.params.target_title })) }, null, 1));
    return;
  }
  if (flag === "--wikidata") {
    const r = await cached(apiUrl({ action: "wbgetentities", ids: arg, props: "labels|aliases|descriptions|claims|sitelinks", languages: "en" }, "www.wikidata.org"));
    console.log(JSON.stringify(r.entities && r.entities[arg], null, 1));
    return;
  }
  if (flag === "--search") {
    const r = await cached(apiUrl({ action: "query", list: "search", srsearch: arg, srlimit: "20" }));
    for (const s of r.query.search) console.log(s.title);
    return;
  }
  if (flag === "--info") {
    const titles = arg.split("|").map(titleOf), get = await pageInfo(titles);
    console.log(JSON.stringify(titles.map((t) => { const p = get(t); return p ? { asked: t, ...p, boxes: [...p.boxes] } : { asked: t, missing: true }; }), null, 1));
    return;
  }
  const p = await parsed(arg);
  if (!p) { console.error(`no article: ${titleOf(arg)}`); process.exit(1); }
  if (flag === "--links") { console.log(JSON.stringify({ title: p.title, seeAlso: seeAlso(p.text), ideology: infoboxRow(p.text) }, null, 1)); return; }
  console.log(`Title: ${p.title}\nURL: https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}\n`);
  if (flag === "--html") { console.log(p.text); return; }
  console.log(htmlToText(p.text));
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
