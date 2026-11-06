// Before a people run (Brandon, 2026-11-06): the next people in triage order get their own books into the local
// corpora first, since audits that read a person's own books pass more often (about +12 points at the same triage
// score). For each of the next N pending people:
//   - public-domain books on Project Gutenberg (official catalog, matched by surname and birth year) are added to
//     the local Gutenberg corpus through its mirror route (corpora/gutenberg/fetch.sh) and converted;
//   - what is already local is listed (Gutenberg, Marxists Internet Archive section, maintainer reference library);
//   - their works that are NOT local (Wikidata: works with the person as author, scholarly articles left out, most
//     linked first) go into a "books wanted" document for the maintainer to look for.
// Nobody is reordered or skipped by this; it only fetches and reports.
//   node scripts/prefetch-books.js [--next N] [--skip id,id] [--doc ~/work/books-wanted.md]
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const lib = require("./lib");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const N = Number(arg("--next", 10));
const SKIP = new Set((arg("--skip", "") || "").split(",").filter(Boolean));
const DOC = arg("--doc", path.join(os.homedir(), "work", "books-wanted.md"));
const STATE = DOC.replace(/\.md$/, ".json");
const CORPORA = path.join(os.homedir(), ".cache", "political-ideology-atlas", "corpora");
const GUT = path.join(CORPORA, "gutenberg");
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function readCsv(file) {
  // RFC 4180 rows (quoted fields may hold newlines).
  const t = fs.readFileSync(file, "utf8"), rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(head.map((h, j) => [h, r[j] || ""])));
}

// A Gutenberg author entry ("Rizal, José, 1861-1896") is this person when its surname is one of the person's name
// words and its birth year is the person's. Translators, editors and other roles ("[Translator]") don't count.
function gutenbergBooks(catalog, person) {
  const words = new Set(fold(person.name).split(/[\s.]+/).filter(Boolean));
  return catalog.filter((r) => r.Language === "en" && r.Type === "Text" && r.Authors.split(/;\s*/).some((a) => {
    if (/\[/.test(a)) return false;
    const m = a.match(/^([^,]+),.*?(-?\d{1,4})\??\s*(BCE|BC)?-/) || a.match(/^([^,]+?),?\s+(-?\d{1,4})\??\s*(BCE|BC)?-/);
    if (!m) return false;
    const born = (m[3] ? -1 : 1) * Number(m[2]);
    return words.has(fold(m[1]).trim()) && person.born != null && Math.abs(born - person.born) <= 1;
  }));
}

async function wantedWorks(qid) {
  const { sparql } = require("./sparql");
  const rows = await sparql(`PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX schema: <http://schema.org/>
SELECT ?w ?label (MIN(YEAR(?d)) AS ?year) (MAX(?links) AS ?n) WHERE { ?w wdt:P50 wd:${qid} . ?w rdfs:label ?label . FILTER(LANG(?label) = "en")
FILTER NOT EXISTS { ?w wdt:P31 wd:Q13442814 } OPTIONAL { ?w wdt:P577 ?d } OPTIONAL { ?w wikibase:sitelinks ?links } }
GROUP BY ?w ?label ORDER BY DESC(?n) LIMIT 25`);
  // Wikisource subpages ("Utopia (1901)/Chapter 4") and repeated labels are dropped.
  const seen = new Set();
  return rows.map((b) => ({ title: b.label.value, year: b.year ? Number(b.year.value) : null, links: b.n ? Number(b.n.value) : 0 }))
    .filter((w) => !w.title.includes("/") && !seen.has(fold(w.title)) && seen.add(fold(w.title)));
}

async function main() {
  const pending = JSON.parse(execFileSync("node", [path.join(__dirname, "pending.js"), "--people", "--triage", "--limit", String(N + SKIP.size)]).toString())
    .filter((p) => !SKIP.has(p.id)).slice(0, N);
  const people = new Map(lib.peopleCatalog().map((p) => [p.id, p]));
  const scores = lib.readJson(path.join(lib.ROOT, "audits", "people-triage.json")).scores;
  const catalog = readCsv(path.join(GUT, "raw", "pg_catalog.csv"));
  const selected = new Set(fs.readFileSync(path.join(GUT, "selection.tsv"), "utf8").split("\n").map((l) => l.split("\t")[0]));
  const refFiles = fs.readdirSync(path.join(CORPORA, "reference", "text"));
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
  const added = [];
  for (const { id } of pending) {
    const p = people.get(id);
    const books = gutenbergBooks(catalog, p);
    for (const r of books) if (!selected.has(r["Text#"])) { added.push([r["Text#"], r.Authors.replace(/\s+/g, " "), r.Title.replace(/\s+/g, " ").slice(0, 100)]); selected.add(r["Text#"]); }
    const surname = fold(p.name.split(/\s+/).pop());
    const marxists = fs.existsSync(path.join(CORPORA, "marxists", "text", surname)) ? `marxists/text/${surname}` : null;
    const reference = refFiles.filter((f) => fold(f).includes(surname));
    let works = [];
    try { works = p.wikidata ? await wantedWorks(p.wikidata) : []; } catch (e) { console.warn(`${id}: Wikidata works lookup failed (${e.message})`); }
    const local = (t) => books.some((b) => fold(b.Title).includes(fold(t).slice(0, 25))) || reference.some((f) => fold(f).includes(fold(t).slice(0, 25)));
    state[id] = { name: p.name, triage: scores[id], checked: new Date().toISOString().slice(0, 10),
      gutenberg: books.map((b) => b.Title.replace(/\s+/g, " ").slice(0, 80)), marxists, reference,
      wanted: works.filter((w) => !local(w.title)) };
  }
  if (added.length) {
    fs.appendFileSync(path.join(GUT, "selection.tsv"), added.map((r) => r.join("\t")).join("\n") + "\n");
    execFileSync(path.join(GUT, "fetch.sh"), { stdio: "ignore", timeout: 30 * 60 * 1000 });
    execFileSync("node", [path.join(CORPORA, "tools", "gutenberg.js"), "--build"], { stdio: "ignore" });
  }
  // People audited since they were listed leave the document.
  for (const id of Object.keys(state)) if (fs.existsSync(lib.personPath(id))) delete state[id];
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
  const order = Object.entries(state).sort((a, b) => (b[1].triage || 0) - (a[1].triage || 0));
  const md = ["# Books wanted for people audits", "",
    "Written by `scripts/prefetch-books.js` before each people run (political_ideology_test). People are in triage order (most likely to pass first).",
    "Public-domain books on Gutenberg are fetched automatically; the books below are the person's own works that are not in the local corpora.",
    "Put any you find in `~/Documents/ideology reference/<Name>/`. A person leaves this list once audited.", ""];
  for (const [, s] of order) {
    md.push(`## ${s.name} (triage ${s.triage})`);
    const have = [s.gutenberg.length ? `${s.gutenberg.length} on Gutenberg (local)` : null, s.marxists ? "Marxists Internet Archive section (local)" : null,
      s.reference.length ? `${s.reference.length} in the reference library` : null].filter(Boolean);
    md.push(`- Local: ${have.length ? have.join("; ") : "nothing"}`);
    if (s.wanted.length) { md.push("- Wanted:"); for (const w of s.wanted) md.push(`  - ${w.title}${w.year ? ` (${w.year})` : ""}`); }
    else md.push("- Wanted: no other works listed on Wikidata");
    md.push("");
  }
  fs.mkdirSync(path.dirname(DOC), { recursive: true });
  fs.writeFileSync(DOC, md.join("\n"));
  console.log(`${pending.length} people checked; ${added.length} Gutenberg books added to the local corpus; ${order.reduce((n, [, s]) => n + s.wanted.length, 0)} wanted works listed in ${DOC}.`);
}
// Own books already on disk for a person (Brandon: download first, then check locally), counting full-length
// books only (Brandon, 2026-11-06: papers, speeches and articles would make the triage look easier to pass):
// a text of about 20,000 words or more (BOOK_BYTES of plain text). Sources: Gutenberg books in the local
// corpus, the maintainer's reference library (its index has word counts), and a local Marxists Internet
// Archive section, where a book is split into chapter files, so a work's folder counts once it adds up to book
// length. Used by triage.js.
const BOOK_WORDS = 20000, BOOK_BYTES = BOOK_WORDS * 6;
function marxistsBooks(dir) {
  if (!fs.existsSync(dir)) return 0;
  // A work split into chapters has a folder of its own (works/1917/staterev/ch01.txt...); year folders and the
  // author's index folders hold separate short pieces, so only a single file of book length counts there.
  const byWork = new Map(); let single = 0;
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { walk(p); continue; }
    if (!f.name.endsWith(".txt")) continue;
    const size = fs.statSync(p).size, folder = path.basename(d);
    if (d === dir || /^\d{4}(-\d{2,4})?$/.test(folder) || /^(works|subject|letters|quotes|index|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|xx)$/i.test(folder)) { if (size >= BOOK_BYTES) single++; }
    else byWork.set(d, (byWork.get(d) || 0) + size);
  } };
  walk(dir);
  return single + [...byWork.values()].filter((b) => b >= BOOK_BYTES).length;
}
function availableBooks(people) {
  const catalog = readCsv(path.join(GUT, "raw", "pg_catalog.csv"));
  const gutText = new Map(fs.readdirSync(path.join(GUT, "text")).map((f) => [f.split(" ")[0], path.join(GUT, "text", f)]));
  const refBooks = fs.readFileSync(path.join(CORPORA, "reference", "index.tsv"), "utf8").split("\n")
    .map((l) => l.split("\t")).filter(([w, f]) => f && Number(w) >= BOOK_WORDS).map(([, f]) => fold(f));
  const out = {};
  for (const p of people) {
    // The catalog name and the Wikipedia title both count ("Aurobindo Ghosh" is "Sri Aurobindo" on Wikipedia).
    const title = decodeURIComponent(String(p.wikipedia || "").replace(/^.*\/wiki\//, "")).replace(/_/g, " ").replace(/\s*\([^)]*\)$/, "");
    const names = [...new Set([p.name, title].filter(Boolean).map(fold))];
    const surnames = [...new Set(names.map((n) => n.split(/\s+/).pop()))];
    out[p.id] = gutenbergBooks(catalog, { ...p, name: names.join(" ") }).filter((b) => gutText.has(b["Text#"]) && fs.statSync(gutText.get(b["Text#"])).size >= BOOK_BYTES).length
      + refBooks.filter((f) => names.some((n) => f.includes(n)) || surnames.some((sn) => f.includes(sn + ","))).length
      + Math.max(0, ...surnames.map((sn) => marxistsBooks(path.join(CORPORA, "marxists", "text", sn))));
  }
  return out;
}
module.exports = { availableBooks };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
