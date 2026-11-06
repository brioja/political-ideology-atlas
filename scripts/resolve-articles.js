// Notability by Wikipedia, decided by data (Brandon, 2026-11-05). For every catalog entry, starts from
// the entry's own article link (catalog `wikipedia`, never its display name: title-cased and generic
// names misread) and records in audits/wikipedia-articles.json:
//   title          the article the link lands on (after a redirect), or null
//   redirect       the entry was found through a redirect (wikipediaMatch "redirect", or the link itself
//                  now redirects); the redirect page's categories say what kind
//   disambiguation the article is a disambiguation page
//   notable        has an article of its own: the link is the article, or a redirect that Wikipedia
//                  files as another name for it (alternative name, spelling, capitalisation,
//                  abbreviation, other language...). A missing page, a disambiguation page, or a
//                  redirect to a section, subtopic or related topic is not.
// For a "redirect" entry the redirect is the name (or its sentence case) that lands on the linked
// article, as scripts/wikipedia.js found it.
// scripts/lib.js reads the file: non-notable entries are never queued, built or audited, and
// duplicates are decided on the resolved titles. Run after the catalog changes:
//   node scripts/resolve-articles.js
"use strict";
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

const OUT = path.join(lib.ROOT, "audits", "wikipedia-articles.json");
// Cached; a 429 is waited out (its retry-after plus a margin), at most three times in a run.
let throttles = 0;
async function get(params) {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (;;) {
    try { return await lib.cachedJson(url, { pauseMs: 5000 }); }
    catch (e) {
      const m = e.message.match(/429.*retry-after (\d+)/);
      if (!m || ++throttles > 60) throw e;
      await new Promise((r) => setTimeout(r, (Number(m[1]) + 10) * 1000));
    }
  }
}
// Redirect categories that make a redirect another name for its target.
const SAME = /Redirects from (alternative|other|alternate|modification|short|long|plural|ambiguous term|abbreviation|acronym|initialism|alternative spelling|alternative name|alternative language|non-English|other language|other capitalisation|miscapitalisation|American|British|incorrect hyphenation|hyphenation|diacritic|ASCII|title without diacritics|unnecessary disambiguation|synonym)/i;
const OTHER = /Redirects (from subtopic|to related topic|to section|to anchor|to list|from member|from related word|with possibilities|from former name|from historic name)/i;

const linkTitle = (url) => decodeURIComponent(String(url || "").replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, "")).replace(/_/g, " ");

// Resolves titles in batches of 50: title -> { from, title, redirect, fragment, disambiguation, missing }.
async function resolve(titles) {
  const info = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const r = await get({ action: "query", titles: batch.join("|"), redirects: "1", prop: "pageprops", ppprop: "disambiguation" });
    const norm = new Map((r.query.normalized || []).map((x) => [x.from, x.to]));
    const redir = new Map((r.query.redirects || []).map((x) => [x.from, x]));
    const pages = new Map((r.query.pages || []).map((p) => [p.title, p]));
    for (const n of batch) {
      const t0 = norm.get(n) || n, rd = redir.get(t0), target = rd ? rd.to : t0, p = pages.get(target) || {};
      info.set(n, { from: t0, title: p.missing || p.invalid ? null : target, redirect: !!rd, fragment: rd && rd.tofragment || null,
        disambiguation: !!(p.pageprops && "disambiguation" in p.pageprops), missing: !!p.missing || p.invalid === true });
    }
  }
  return info;
}

async function main() {
  const entries = lib.catalog();
  const links = await resolve([...new Set(entries.map((e) => linkTitle(e.wikipedia)).filter(Boolean))]);
  // For entries found through a redirect: the name, or its sentence case, that lands on the linked article.
  const plain = (n) => n.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const variants = (n) => [...new Set([plain(n), plain(n)[0] + plain(n).slice(1).toLowerCase()])];
  const viaNames = await resolve([...new Set(entries.filter((e) => e.wikipediaMatch === "redirect").flatMap((e) => variants(e.name)))]);
  const info = new Map(); // id -> resolved info
  for (const e of entries) {
    const l = links.get(linkTitle(e.wikipedia)) || { title: null, missing: true };
    let x = { ...l };
    if (e.wikipediaMatch === "redirect" && !l.redirect && l.title) {
      const v = variants(e.name).map((n) => viaNames.get(n)).find((y) => y && y.redirect && y.title === l.title);
      if (v) x = { ...l, from: v.from, redirect: true, fragment: v.fragment };
    }
    info.set(e.id, x);
  }
  // Categories of the redirect pages themselves (what kind of redirect each is).
  const redirects = [...new Set([...info.values()].filter((x) => x.redirect).map((x) => x.from))];
  const cats = new Map();
  for (let i = 0; i < redirects.length; i += 50) {
    const batch = redirects.slice(i, i + 50);
    let cont = {};
    do {
      const r = await get({ action: "query", titles: batch.join("|"), prop: "categories", cllimit: "max", ...cont });
      for (const p of r.query.pages || []) cats.set(p.title, [...(cats.get(p.title) || []), ...(p.categories || []).map((c) => c.title.replace(/^Category:/, ""))]);
      cont = r.continue || {};
    } while (cont.clcontinue);
  }
  const out = {};
  for (const e of entries) {
    const x = info.get(e.id) || {};
    const c = x.redirect ? cats.get(x.from) || [] : [];
    let notable = true, reason = "own article";
    if (x.missing || !x.title) { notable = false; reason = "no Wikipedia page"; }
    else if (x.disambiguation) { notable = false; reason = "disambiguation page"; }
    else if (x.redirect) {
      if (x.fragment) { notable = false; reason = `redirect to a section (${x.title}#${x.fragment})`; }
      else if (c.some((k) => OTHER.test(k))) { notable = false; reason = `redirect to a related topic (${x.title}; ${c.find((k) => OTHER.test(k))})`; }
      else if (c.some((k) => SAME.test(k))) { reason = `another name for ${x.title}`; }
      else { reason = `redirect to ${x.title} (uncategorised: counted as another name)`; }
    }
    out[e.id] = { name: e.name, title: x.title || null, redirect: !!x.redirect, disambiguation: !!x.disambiguation, notable, reason, ...(c.length ? { redirectCategories: c } : {}) };
  }
  // Other names (Brandon, 2026-11-06): every redirect to a notable entry's article that Wikipedia files as another
  // name for it (alternative name, adjective, short or long form, spelling...; not a redirect to a section). A redirect
  // has one target, so these connect one to one; source-check.js counts them as aliases.
  const titles = [...new Set(Object.values(out).filter((x) => x.notable && x.title).map((x) => x.title))];
  const redirectsTo = new Map(); // article title -> redirect titles (no section fragment)
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    let cont = {};
    do {
      const r = await get({ action: "query", titles: batch.join("|"), prop: "redirects", rdprop: "title|fragment", rdnamespace: "0", rdlimit: "max", ...cont });
      for (const p of r.query.pages || []) for (const rd of p.redirects || []) if (!rd.fragment) {
        if (!redirectsTo.has(p.title)) redirectsTo.set(p.title, []);
        redirectsTo.get(p.title).push(rd.title);
      }
      cont = r.continue || {};
    } while (cont.rdcontinue);
  }
  const allRedirects = [...new Set([...redirectsTo.values()].flat())];
  const rcats = new Map();
  for (let i = 0; i < allRedirects.length; i += 50) {
    const batch = allRedirects.slice(i, i + 50);
    let cont = {};
    do {
      const r = await get({ action: "query", titles: batch.join("|"), prop: "categories", cllimit: "max", ...cont });
      for (const p of r.query.pages || []) rcats.set(p.title, [...(rcats.get(p.title) || []), ...(p.categories || []).map((c) => c.title.replace(/^Category:/, ""))]);
      cont = r.continue || {};
    } while (cont.clcontinue);
  }
  const NAME = new RegExp(SAME.source.replace("(alternative|", "(adjectives?|alternative|"), "i");
  for (const x of Object.values(out)) {
    if (!x.notable || !x.title) continue;
    const names = (redirectsTo.get(x.title) || []).filter((t) => (rcats.get(t) || []).some((k) => NAME.test(k)) && !(rcats.get(t) || []).some((k) => OTHER.test(k)));
    if (names.length) x.otherNames = names;
  }
  fs.writeFileSync(OUT, JSON.stringify({ note: "Generated by scripts/resolve-articles.js from the English Wikipedia API: the article each catalog entry's name lands on and whether it is the entry's own (notability), and the redirects Wikipedia files as other names for it (otherNames, aliases in source-check.js). Read by scripts/lib.js.", fetched: new Date().toISOString().slice(0, 10), entries: out }, null, 1) + "\n");
  const n = Object.values(out);
  console.log(`${n.length} entries: ${n.filter((x) => x.notable).length} notable, ${n.filter((x) => !x.notable).length} not.`);
  for (const [id, x] of Object.entries(out)) if (!x.notable) console.log(`  ${id}: ${x.reason}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
