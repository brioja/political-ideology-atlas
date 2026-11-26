// Books on an ideology, downloaded before its pass (Brandon, 2026-11-25: re-audits nulled what no defining source tied
// without looking for the scholarship that would tie it; Libertarian socialism never opened Prichard et al.,
// Libertarian Socialism: Politics in Black and Red, which is on archive.org). books-to-look-for.js --ideologies lists
// only books an audit named in notFound; this finds books on the ideology itself, whether or not an audit asked.
// Where the wanted books come from:
//   - the ideology's Wikipedia article: book citations in its Further reading / Bibliography / Works cited / Sources
//     sections and the items of a "Notable works" list (Wikipedia is for leads only: the book is the source);
//   - the committed audit's key works and its key figures' own books (and the draft's, after the scope phase);
//   - archive.org books whose title names the ideology (its name or a Wikipedia redirect to it of two words or more).
// Each wanted book is looked up on archive.org (title words + author surname). A copy whose full text is open is
// downloaded (its OCR text, _djvu.txt) into corpora/ideology-books/<id>/; a lending-only copy, or none, goes into the
// books-wanted list for the maintainer (~/work/ideology-books-wanted.md). Every request is cached, so a rerun is quick.
// Found by title only: whether a book is scholarship defining the subject is the auditor's call (AUDIT_RULES.md).
// scripts/lane.js runs it at the start of every ideology and hands the session the downloaded books.
//   node scripts/ideology-books.js <id> [<id> ...] [--refresh]   before the pass (skipped when already looked up)
//   node scripts/ideology-books.js <id> --draft <draft.json>      after the scope phase: adds the draft's key works and
//                                                                  key figures' books
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const lib = require("./lib");
const { cachedJson, politeFetch } = require("./fetch");
const { fold: foldName } = require("./prefetch-books");

const CORPORA = path.join(os.homedir(), ".cache", "political-ideology-atlas", "corpora");
const DIR = path.join(CORPORA, "ideology-books");
const WANTED = path.join(os.homedir(), "work", "ideology-books-wanted.md");
const MIN_WORDS = 20000;        // shorter texts are articles, pamphlets or failed OCR, not books
const TITLE_HITS = 8;           // archive.org books named after the ideology, most downloaded first
const SECTIONS = /^(Further_reading|Bibliography|Works_cited|Sources|Notable_works|Selected_bibliography|Literature)/i;
const fold = (s) => foldName(s).replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set("a an the of and or in on to for from by with its at as de la le les des du et el los las y".split(" "));
const words = (s) => fold(s).split(" ").filter((w) => w && !STOP.has(w));
const decode = (s) => s.replace(/<[^>]+>/g, "").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const safe = (s) => s.replace(/[\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);

// ---- wanted books ----
// A Wikipedia citation: "Surname, Given (1970). Title. ..." or a chapter "...". In ... (eds.). Book Title.
function parseCitation(t) {
  const m = /^(.*?)\s*\((?:c\.\s*)?(\d{3,4})[^)]*\)\s*(?:\[[^\]]*\]\s*)?\.?\s*(.*)$/.exec(t);
  if (!m) return null;
  let [, who, year, rest] = m, title;
  rest = rest.replace(/^[^."“]*\((?:eds?|trans)\.\)\.\s*/, "");   // "Otero, Carlos P. (ed.). Language and Politics"
  const chapter = /^["“](.*?)["”]\.?\s*(?:In\s+.*?\(eds?\.\)\.\s*)?(.*)$/.exec(rest);
  if (chapter) title = (chapter[2] || "").split(/\.\s/)[0];   // the book a chapter is in
  else title = rest.split(/\.\s|\.$/)[0];
  title = title.replace(/^In\s+/, "").trim();
  const author = who.replace(/\(eds?\.\)|,?\s*eds?\.$/g, "").split(";")[0].trim();
  if (!title || title.length < 4) return null;
  return { author, surname: author.split(",")[0].trim(), year, title };
}
async function wikipediaBooks(id) {
  const html = await lib.fetchArticle({ id });
  if (!html) return [];
  const out = [];
  let section = "", inList = false;
  // Walk the article's headings, book citations and (inside "Notable works") list items, in order.
  for (const m of html.matchAll(/<h[2-4][^>]*id="([^"]+)"|<cite[^>]*class="citation book[^"]*"[^>]*>([\s\S]*?)<\/cite>|<li>([\s\S]*?)<\/li>/g)) {
    if (m[1]) { section = m[1]; inList = /^Notable_works/i.test(section); continue; }
    if (!SECTIONS.test(section)) continue;
    // A list item holding a citation template is that citation; a bare one counts only in "Notable works".
    const cite = m[3] && /<cite[^>]*class="citation book[^"]*"[^>]*>([\s\S]*?)<\/cite>/.exec(m[3]);
    const text = decode(m[2] || (cite ? cite[1] : inList ? m[3] : "") || "");
    const c = text && parseCitation(text);
    if (c) out.push({ ...c, from: `Wikipedia, ${section.replace(/_/g, " ")}` });
  }
  return out;
}
// The audit's key works (each with its source's author) and its key figures' own books (their Wikipedia
// bibliography, as books-to-look-for.js reads it; the first FIGURE_BOOKS listed). From the committed audit before the
// pass, and from the draft once its scope phase is checked (Brandon, 2026-11-25: key figures are settled in phase 1).
const FIGURE_BOOKS = 8;
async function fromAudit(file) {
  let a;
  try { a = lib.readJson(file); } catch { return []; }
  const src = new Map((a.sources || []).map((s) => [s.id, s]));
  const out = (a.keyWorks || []).map((k) => {
    // A key work names its author itself; "work" (the source holding its text) is optional.
    const s = src.get(k.work) || {}, author = k.author || s.author || "";
    return { title: k.title, author, surname: author.split(" ").pop() || "", year: "", from: `audit key work${s.title ? ` (${s.title})` : ""}` };
  });
  const { bibliography } = require("./books-to-look-for");
  for (const f of a.keyFigures || []) {
    const name = [f.first, f.last].filter(Boolean).join(" ") || f.name || "";
    if (!f.wikipedia || !name) continue;
    let html;
    try { html = await lib.fetchArticle({ id: `figure-${name}`, wikipedia: f.wikipedia }); } catch (e) { console.error(`${name}: article not fetched (${e.message})`); continue; }
    if (!html) continue;
    const surname = fold(f.last || name.split(" ").pop()).split(" ").pop();
    for (const b of bibliography(html, surname).books.slice(0, FIGURE_BOOKS))
      out.push({ title: b.title, author: name, surname, year: b.year ? String(b.year) : "", from: `key figure ${name}, Wikipedia bibliography` });
  }
  return out;
}

// ---- archive.org ----
const FIELDS = ["identifier", "title", "creator", "date", "downloads", "access-restricted-item", "collection", "language"];
async function iaSearch(q, rows = 25) {
  const u = "https://archive.org/advancedsearch.php?" + new URLSearchParams({ q, rows: String(rows), output: "json", "sort[]": "downloads desc" })
    + "&" + FIELDS.map((f) => `fl[]=${f}`).join("&");
  try { return (await cachedJson(u)).response.docs || []; } catch (e) { console.error(`archive.org search failed: ${e.message}`); return []; }
}
const PERIODICAL = /\b(vol|volume|no|issue|bulletin|newsletter|journal|magazine|review|standard|pamph?|pamphlet)\b\.?\s*#?\d|#\s*\d|\b(18|19|20)\d\d\s+\d{2,4}\b/i;
const isPeriodical = (d) => PERIODICAL.test(d.title || "") || [].concat(d.collection || []).some((c) => /periodical|serial|magazine|newspaper|pulp/i.test(c));
const quote = (s) => `"${s.replace(/"/g, "")}"`;
// The archive.org copies of one wanted book: titles holding the wanted title's first significant words, by the author.
async function lookUp(book) {
  const tw = words(book.title).slice(0, 6);
  if (tw.length < 1 || (tw.length < 2 && !book.surname)) return [];
  const q = `title:(${tw.join(" AND ")}) AND mediatype:texts${book.surname ? ` AND creator:(${quote(book.surname)})` : ""}`;
  const match = (docs) => docs.filter((d) => !isPeriodical(d) && tw.every((w) => words([].concat(d.title)[0] || "").includes(w)));
  const hits = match(await iaSearch(q, 10));
  // Many scans carry no creator: a title of three significant words or more is also looked up on its own when no open
  // copy came up by the author (a lending copy with a creator hid an open user upload without one, Goodway 2026-11-25).
  const open = (docs) => docs.some((d) => !d["access-restricted-item"]);
  const loose = open(hits) || tw.length < 3 ? [] : match(await iaSearch(`title:(${tw.join(" AND ")}) AND mediatype:texts`, 10));
  // A copy credited to someone else is not the book (2026-11-25: Paul Guérin's Le pouvoir temporel had come in as de
  // Maistre's Étude sur la souveraineté); one with no creator is taken only if the surname is in its opening pages.
  const sn = book.surname ? fold(book.surname) : "", by = (d) => ` ${fold([].concat(d.creator || "").join(" "))} `;
  return [...hits, ...loose.filter((d) => !hits.some((h) => h.identifier === d.identifier))]
    .filter((d) => !sn || !d.creator || by(d).includes(` ${sn} `))
    .map((d) => ({ ...d, checkAuthor: !!sn && !d.creator }));
}
async function titleHits(name) {
  const docs = await iaSearch(`title:(${quote(name)}) AND mediatype:texts`, 40);
  const n = fold(name);
  return docs.filter((d) => !isPeriodical(d) && ` ${fold([].concat(d.title)[0] || "")} `.includes(` ${n} `));
}
// The OCR text of an open item: its largest _djvu.txt file, or null.
async function fullText(identifier) {
  const meta = await cachedJson(`https://archive.org/metadata/${identifier}`).catch(() => null);
  if (!meta || meta.is_dark || meta.metadata?.["access-restricted-item"] === "true") return null;
  const f = (meta.files || []).filter((x) => /_djvu\.txt$/.test(x.name)).sort((a, b) => (+b.size || 0) - (+a.size || 0))[0];
  if (!f) return null;
  const url = `https://archive.org/download/${identifier}/${encodeURIComponent(f.name).replace(/%2F/g, "/")}`;
  const r = await politeFetch(url);
  if (!r.ok) return null;
  return { url, text: await r.text() };
}

// ---- one ideology ----
// Incremental: what index.json already looked up is not looked up again, so the run after the scope phase only adds
// the draft's new key works and key figures. --refresh starts over.
async function run(id, { refresh = false, draft = null } = {}) {
  const out = path.join(DIR, id), indexFile = path.join(out, "index.json");
  const old = !refresh && fs.existsSync(indexFile) ? lib.readJson(indexFile) : null;
  if (old && !draft) return old;
  const entry = lib.catalog().find((e) => e.id === id);
  if (!entry) throw new Error(`${id}: not in the ideology catalog`);
  const index = old || { id, retrieved: null, books: [], lending: [], missing: [], looked: [] };
  const seen = new Set(index.looked), added = { books: 0, lending: 0, missing: 0 };
  const key = (title) => words(title).slice(0, 5).join(" ");
  fs.mkdirSync(out, { recursive: true });
  const take = async (doc, book) => {
    const title = [].concat(doc.title)[0] || book.title, author = [].concat(doc.creator || book.author || "")[0];
    const year = String(doc.date || book.year || "").slice(0, 4);
    if (doc["access-restricted-item"]) return false;
    if (index.books.some((b) => b.url.endsWith(`/${doc.identifier}`))) return true;
    const t = await fullText(doc.identifier);
    const n = t ? t.text.split(/\s+/).length : 0;
    if (!t || n < MIN_WORDS) return false;
    if (doc.checkAuthor && book.surname && !` ${fold(t.text.slice(0, 30000))} `.includes(` ${fold(book.surname)} `)) return false;
    // Wikipedia articles printed as a book (PediaPress and the like: "Text and image sources, contributors, and
    // licenses"; 2026-11-25, archive.org/details/LibertarianSocialism) are Wikipedia, not a book on the subject.
    if (/Text and image sources, contributors, and licen[cs]es|upload\.wikimedia\.org\/wikipedia\/commons/i.test(t.text.slice(-200000))) return false;
    // The same scan uploaded twice under other identifiers: same length to within 1%.
    if (index.books.some((b) => Math.abs(b.words - n) <= n / 100)) return true;
    const file = safe(`${author ? `${author.replace(/,\s*\d.*$/, "")} - ` : ""}${title}${year ? ` (${year})` : ""} [${doc.identifier}]`) + ".txt";
    fs.writeFileSync(path.join(out, file), t.text);
    index.books.push({ file, title, author, year, words: n, url: `https://archive.org/details/${doc.identifier}`, text: t.url, from: book.from });
    added.books++;
    return true;
  };
  const wanted = old ? await fromAudit(draft) : [...await wikipediaBooks(id), ...await fromAudit(lib.profilePath(id)), ...(draft ? await fromAudit(draft) : [])];
  for (const book of wanted) {
    const k = key(book.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const docs = await lookUp(book);
    let got = false;
    for (const d of docs.filter((d) => !d["access-restricted-item"]).slice(0, 3)) if ((got = await take(d, book))) break;
    if (got) continue;
    const lend = docs.find((d) => d["access-restricted-item"]);
    (lend ? index.lending : index.missing).push({ ...book, ...(lend ? { url: `https://archive.org/details/${lend.identifier}` } : {}) });
    added[lend ? "lending" : "missing"]++;
  }
  if (!old) {
    const names = [entry.name, ...lib.wikipediaOtherNames(id)].filter((n, i, a) => words(n).length >= (i ? 2 : 1) && a.findIndex((x) => fold(x) === fold(n)) === i);
    for (const name of names) {
      let n = 0;
      for (const d of await titleHits(name)) {
        if (n >= TITLE_HITS) break;
        const k = key([].concat(d.title)[0] || "");
        if (seen.has(k)) continue;
        seen.add(k);
        if (await take(d, { title: d.title, from: `archive.org title search "${name}"` })) n++;
      }
    }
  }
  index.looked = [...seen];
  index.retrieved = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 1) + "\n");
  return { ...index, added };
}

// The maintainer's list: lending-only copies and books not found, per ideology (rewritten from every index.json).
function writeWanted() {
  const lines = ["# Ideology books wanted", "", "Written by scripts/ideology-books.js. Books on ideologies about to be audited that archive.org has only as",
    "lending copies, or not at all. Downloads go to ~/Documents/ideology reference/ as usual.", ""];
  for (const id of fs.existsSync(DIR) ? fs.readdirSync(DIR).sort() : []) {
    const f = path.join(DIR, id, "index.json");
    if (!fs.existsSync(f)) continue;
    const ix = lib.readJson(f);
    if (!ix.lending.length && !ix.missing.length) continue;
    lines.push(`## ${id} (${ix.retrieved})`, "");
    for (const b of ix.lending) lines.push(`- [lending] ${b.author ? `${b.author}, ` : ""}*${b.title}*${b.year ? ` (${b.year})` : ""}: ${b.url} (${b.from})`);
    for (const b of ix.missing) lines.push(`- ${b.author ? `${b.author}, ` : ""}*${b.title}*${b.year ? ` (${b.year})` : ""} (${b.from})`);
    lines.push("");
  }
  fs.writeFileSync(WANTED, lines.join("\n"));
}

module.exports = { run, DIR };
if (require.main === module) (async () => {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
  const draft = arg("--draft"), ids = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--draft");
  if (!ids.length || (draft && ids.length > 1)) { console.error("usage: node scripts/ideology-books.js <id> [<id> ...] [--refresh] | <id> --draft <draft.json>"); process.exit(1); }
  for (const id of ids) {
    const ix = await run(id, { refresh: process.argv.includes("--refresh"), draft });
    const a = ix.added ? ` (this run: +${ix.added.books}, +${ix.added.lending}, +${ix.added.missing})` : " (already looked up)";
    console.log(`${id}: ${ix.books.length} book(s) downloaded, ${ix.lending.length} lending-only, ${ix.missing.length} not on archive.org${a}`);
  }
  writeWanted();
})().catch((e) => { console.error(e.message); process.exit(1); });
