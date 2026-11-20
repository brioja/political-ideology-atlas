// Books for the maintainer to look for (Brandon, 2026-11-20: "make it a script, keep track of people who I looked for,
// still"; it replaces the hand-made ~/work/books-to-look-for-2026-11-18.md). For people still to audit, or audited and
// failing (pending.js --people --triage order: most likely to pass first), the books listed in their Wikipedia
// article's bibliography sections (or its "Main article: X bibliography"), minus what is already on disk.
// Left out: people already looked for (audits/books-sought.json, which never forgets), people on hold for books
// (pending.js skips them), and people the books-wanted document (prefetch-books.js) already lists.
// Record each person once looked for, so the next list leaves them out:
//   node scripts/waiting-for-books.js add <id>      (downloads queued: also holds them until the books land)
//   node scripts/waiting-for-books.js sought <id>   (nothing found)
// Everyone listed is held out of the audit queue (waiting-for-books.js hold) until add or sought, so audits wait for the search.
// Usage: node scripts/books-to-look-for.js [--ideologies] [--limit N people listed, default 40] [--doc ~/work/books-to-look-for.md] [--no-hold]
// Wikipedia's lists are leads for the search, not evidence. Sections of fiction, poetry, children's books,
// edited or translated works are left out; whether a book is political nonfiction in the person's own words is the
// maintainer's call when looking.
const fs = require("fs"), os = require("os"), path = require("path");
const { execFileSync } = require("child_process");
const lib = require("./lib");
const { nameMatcher, gutenbergBooks, readCsv, GUT, CORPORA } = require("./prefetch-books");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const LIMIT = +arg("--limit", 40);
const DOC = arg("--doc", path.join(os.homedir(), "work", "books-to-look-for.md"));
const WANTED = path.join(os.homedir(), "work", "books-wanted.json");
const REF = path.join(os.homedir(), ".cache", "political-ideology-atlas", "corpora", "reference", "text");

const fold = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const text = (h) => h.replace(/<[^>]+>/g, "").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&nbsp;/g, " ")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const KEEP = /bibliograph|books|works|writings|publications|non-?fiction/i;
const DROP = /fiction|novel|poe(m|try)|children|short stor|plays|screen|film|discograph|edited|translat|about him|about her|further reading|works cited|cited|sources|journal|article|essays? in|chapters?|reviews?|music|album|song/i;
const NONFICTION = /non-?fiction/i;

// Book titles in an article's bibliography sections: the first italic title of each list item or table row.
// Many articles use "Bibliography" for the sources about the person ("Mango, Andrew (1999). Atatürk"): an item with
// words before its title is kept only when those words name the person (their surname). Footnotes never count.
// Also returns the bibliography articles it points to ("Main article: Noam Chomsky bibliography").
function bibliography(html, surname) {
  const parts = html.split(/(<h[2-4][^>]*>[\s\S]*?<\/h[2-4]>)/i);
  const books = [], more = [];
  // keepLevel: level of the bibliography section we're in; dropLevel: level of a fiction etc. subsection inside it.
  let keepLevel = null, dropLevel = null;
  const isKeep = (n) => KEEP.test(n) && (!DROP.test(n) || NONFICTION.test(n)), isDrop = (n) => DROP.test(n) && !NONFICTION.test(n);
  for (const part of parts) {
    const h = part.match(/^<h([2-4])[^>]*>([\s\S]*?)<\/h[2-4]>$/i);
    if (h) {
      const lv = +h[1], name = text(h[2]);
      if (dropLevel !== null && lv > dropLevel) continue;
      dropLevel = null;
      if (keepLevel !== null && lv <= keepLevel) keepLevel = null;
      if (keepLevel !== null) { if (isDrop(name)) dropLevel = lv; }
      else if (isKeep(name)) keepLevel = lv;
      continue;
    }
    const keep = keepLevel !== null && dropLevel === null;
    if (!keep) continue;
    for (const m of part.matchAll(/hatnote[^>]*>[\s\S]*?<\/div>/gi))
      for (const a of m[0].matchAll(/href="\/wiki\/([^"#]+)"[^>]*>([^<]*)/g)) if (/bibliograph|works/i.test(a[2])) more.push(decodeURIComponent(a[1]).replace(/_/g, " "));
    for (const item of part.matchAll(/<(li|tr)([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      // Footnotes, and articles in journals or the press (the italics there are the periodical's name), never count.
      if (/cite.note/.test(item[2]) || /class="citation (journal|news|magazine|web)/.test(item[3])) continue;
      const i = item[3].match(/<i>([\s\S]*?)<\/i>/i);
      if (!i) continue;
      const rawBefore = text(item[3].slice(0, i.index));
      if (/["“”]/.test(rawBefore)) continue;
      const before = fold(rawBefore.replace(/\b\d{4}\b/g, ""));
      if (/[a-z]/.test(before) && !` ${before} `.includes(` ${surname} `)) continue;
      const title = text(i[1]).replace(/\[\d+\]/g, "").replace(/[.,:;]$/, "");
      const year = (text(item[3]).match(/\b(1[6-9]\d\d|20[0-2]\d)\b/) || [])[1];
      if (title.length > 2 && title.length < 160) books.push({ title, year: year ? +year : null });
    }
  }
  const seen = new Set();
  return { books: books.filter((b) => !seen.has(fold(b.title)) && seen.add(fold(b.title))), more: [...new Set(more)] };
}

// --ideologies (Brandon, 2026-11-20: "can you make a list for ideologies as well?"): the books each ideology's audit
// tried and couldn't get (notFound; journal articles, web pages and short documents left out: waiting-for-books.js
// bookWorks), failing audits first, then by views. Written to ~/work/ideology-books-to-look-for.md; nothing is held.
// Once looked for: `waiting-for-books.js add <id>` queues a later pass (it runs once the re-audit gap opens; the ideology
// waits while a queued download matches one of the works) or `sought <id>`. Books found are named "<Author> - <title>.txt".
function ideologies() {
  const wfb = require("./waiting-for-books"), sought = wfb.sought("ideologies");
  const { validate, excludedOnly } = require("./validate");
  const doc = arg("--doc", path.join(os.homedir(), "work", "ideology-books-to-look-for.md"));
  const out = [];
  for (const c of lib.catalog()) {
    if (sought[c.id] || !fs.existsSync(lib.profilePath(c.id))) continue;
    const works = wfb.bookWorks(lib.readJson(lib.profilePath(c.id)));
    if (!works.length) continue;
    const { errors } = validate(c.id);
    out.push({ id: c.id, name: c.name, failing: errors.length > 0 && !excludedOnly(errors), views: c.views12m || 0, works });
  }
  out.sort((a, b) => b.failing - a.failing || b.views - a.views);
  const shown = out.slice(0, LIMIT);
  const md = [`# Ideology books to look for (${new Date().toISOString().slice(0, 10)})`, "",
    "Books the audits tried and couldn't get; failing audits first. Once looked for: `node scripts/waiting-for-books.js add <id>` (downloading: queues a later pass) or `sought <id>` (nothing found).", ""];
  // Each book as the author's first and last name (one name for those known by one) and a short title, no commas, so it
  // can be pasted into a search (Brandon, 2026-11-20); audits/book-searches.json, hand-written. A work not in it yet is
  // listed as the audit words it, marked "(add to book-searches.json)".
  const searches = lib.readJson(path.join(lib.ROOT, "audits", "book-searches.json")).works;
  const seen = (o) => { const s = new Set(); return (b) => !s.has(b) && s.add(b); };
  for (const o of shown) md.push(`- ${o.name} (\`${o.id}\`): ${o.works.flatMap((w) => searches[w] ? searches[w].map(([a, t]) => `${a} *${t}*`) : [`${w.replace(/\(full texts?, /gi, "(").replace(/,? ?\(?(in |as openly hosted )?full (texts?|book)\)?/gi, "").trim()} (add to book-searches.json)`]).filter(seen()).join("; ")}`);
  fs.writeFileSync(doc, md.join("\n") + "\n");
  console.log(`${shown.length} ideologies listed in ${doc} (${out.length} with books to find, ${out.filter((o) => o.failing).length} failing).`);
}

async function main() {
  if (process.argv.includes("--ideologies")) return ideologies();
  const sought = require("./waiting-for-books").sought();
  const wanted = fs.existsSync(WANTED) ? JSON.parse(fs.readFileSync(WANTED, "utf8")) : {};
  const pending = JSON.parse(execFileSync("node", [path.join(__dirname, "pending.js"), "--people", "--triage"], { cwd: lib.ROOT, maxBuffer: 1 << 28 }).toString());
  const catalog = new Map(lib.peopleCatalog().map((p) => [p.id, p]));
  const refFiles = fs.readdirSync(REF);
  const gutCatalog = readCsv(path.join(GUT, "raw", "pg_catalog.csv"));
  const audited = (id) => fs.existsSync(lib.personPath(id));
  const out = [];
  let checked = 0, none = 0;
  // People held for an earlier list and not yet looked for stay on it, first (pending.js passes held people over).
  const searching = require("./waiting-for-books").status().filter((e) => e.held && e.searching).map((e) => ({ id: e.id }));
  for (const { id } of [...searching, ...pending.filter((p) => !searching.some((e) => e.id === p.id))]) {
    if (out.length >= LIMIT) break;
    if (sought[id] || wanted[id]) continue;
    const p = catalog.get(id);
    if (!p || !p.wikipedia) continue;
    checked++;
    let html;
    try { html = await lib.fetchArticle(p); } catch (e) { console.warn(`${id}: article not fetched (${e.message})`); continue; }
    if (!html) continue;
    const surname = fold(p.name).split(" ").pop();
    let { books, more } = bibliography(html, surname);
    for (const t of more) {
      try { const b = await lib.fetchArticle({ id: `${id}-bibliography`, wikipedia: `https://en.wikipedia.org/wiki/${t.replace(/ /g, "_")}` }); if (b) books = books.concat(bibliography(b, surname).books); }
      catch (e) { console.warn(`${id}: ${t} not fetched (${e.message})`); }
    }
    // On disk already, or on Gutenberg (prefetch-books.js fetches those before the audit).
    const mine = [...refFiles.filter(nameMatcher(p)), ...gutenbergBooks(gutCatalog, p).map((r) => r.Title)].map(fold);
    books = books.filter((b) => !mine.some((f) => f.includes(fold(b.title).slice(0, 25))));
    if (!books.length) { none++; continue; }
    const marxists = fs.existsSync(path.join(CORPORA, "marxists", "text", surname));
    out.push({ id, name: p.name, audited: audited(id), marxists, books });
  }
  // One line per person (Brandon, 2026-11-20: "trim? One line with the name", "maybe a short list of books after the name, too").
  const md = [`# Books to look for (${new Date().toISOString().slice(0, 10)})`, "",
    "Most likely to pass first. Once looked for: `node scripts/waiting-for-books.js add <id>` (downloading) or `sought <id>` (nothing found).", ""];
  // A short list: the first SHOWN books as the article lists them, subtitles cut, and how many more it lists.
  const SHOWN = 3, short = (t) => t.split(/: | \[|\. /)[0].trim();
  for (const o of out) {
    const more = o.books.length - SHOWN;
    md.push(`- ${o.name} (\`${o.id}\`): ${o.books.slice(0, SHOWN).map((b) => short(b.title)).join("; ")}${more > 0 ? `; +${more} more` : ""}${o.marxists ? " (some may be in the local Marxists archive)" : ""}`);
  }
  fs.writeFileSync(DOC, md.join("\n"));
  // Everyone listed waits for the search, as with the 2026-11-18 list: held until add or sought (at most GRACE_DAYS).
  if (out.length && !process.argv.includes("--no-hold"))
    execFileSync("node", [path.join(__dirname, "waiting-for-books.js"), "hold", ...out.map((o) => o.id)], { cwd: lib.ROOT, stdio: "ignore" });
  console.log(`${out.length} people listed in ${DOC} (${checked} checked; ${none} with no bibliography books left to find).`);
}
main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
