// Passage search for audits: the paragraphs of a subject's saved texts that match a pattern, with file and line, in
// pages of capped size (Brandon, 2026-11-27: lane sessions read whole sources, 20–40 kB per call carried on every
// later turn, or wrote their own grep, keyword-in-context, page-finding and line-reading helpers, one set per session).
//   node scripts/passages.js <id> <regex> [--in <dir | file | s2,s5> ...] [--brief [N]] [--context N] [--chars N]
//                            [--page N] [--from YYYY[-MM-DD]] [--to YYYY[-MM-DD]] [--files] [--case]
//   node scripts/passages.js <id> --counts <patterns-file | -> [--in ...] [--from ...] [--to ...]
//   node scripts/passages.js <id> --lines <a-b> <s4 | file>
// Searches scratchpad/sources/<id>/ and ~/.cache/political-ideology-atlas/corpora/ideology-books/<id>/ (the .txt, .md
// and .jsonl files), plus each --in path (a corpus folder, a reference book). --in with source ids (s2,s5), or a file
// of those folders named as the output names it, searches only those. A source's saved copy is found through the newest
// draft of <id> (scratchpad/lane-out/*/<id>.json, else the published audit), and labelled with its id ("s4:120" is
// s4's line 120); other files of those folders by their name alone.
// The regex is case-insensitive unless --case.
// A passage is the paragraph holding the match (text between blank lines), cut to --context lines (default 4) either
// side of it when a paragraph runs long (books without paragraph breaks), and to --chars characters (default 1,200)
// around the match, its lines joined and words split by a line-end hyphen rejoined. In a .jsonl file (one record per
// line, such as a speech dump) a passage is a record's "text" around the match, headed by its date, speaker and title;
// --from and --to keep records dated in that range. In a book whose text keeps its page numbers (a running head with
// the number, a number alone on a line, or PDF page breaks) each passage names the pages it lies between ("p.41-42").
// --brief prints one line per match, about 250 characters, at most N per file (default 5) and the count left over:
// to see where a source speaks of something before reading it.
// --files lists only the match count per file, most first, to choose where to look.
// --counts takes one pattern per line ("label: regex", or a bare regex) and prints, for each, the matching lines or
// records and the files with most, to choose which statements to search first.
// --lines prints lines a to b of a source (by id) or file, paragraphs joined, each headed by its first line number,
// up to about 8,000 characters (it says where to go on from).
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, "..");
const PAGE_BYTES = 8000;
const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(k); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (k, d) => { const i = argv.indexOf(k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const ins = [];
for (let i; (i = argv.indexOf("--in")) > -1;) { ins.push(argv[i + 1]); argv.splice(i, 2); }
const FILES = flag("--files"), CASE = flag("--case");
let BRIEF = 0;
{ const i = argv.indexOf("--brief"); if (i > -1) { const n = /^\d+$/.test(argv[i + 1] || "") ? +argv[i + 1] : 5; BRIEF = Math.max(1, n); argv.splice(i, /^\d+$/.test(argv[i + 1] || "") ? 2 : 1); } }
const CONTEXT = +opt("--context", 4), PAGE = Math.max(1, +opt("--page", 1));
let CHARS = Math.max(100, +opt("--chars", 1200));
const FROM = opt("--from", ""), TO = opt("--to", ""), COUNTS = opt("--counts", null), LINES = opt("--lines", null);
const [id, pattern] = argv;
const USAGE = "usage: node scripts/passages.js <id> <regex> [--in <dir | file | s2,s5> ...] [--brief [N]] [--context N] [--chars N] [--page N] [--from YYYY] [--to YYYY] [--files] [--case]\n       node scripts/passages.js <id> --counts <patterns-file | -> [--in ...]\n       node scripts/passages.js <id> --lines <a-b> <s4 | file>";
if (!id || (!pattern && !COUNTS)) { console.error(USAGE); process.exit(1); }
const regex = (p) => { try { return new RegExp(p, CASE ? "" : "i"); } catch (e) { console.error(`bad regex ${p}: ${e.message}`); process.exit(1); } };
const home = (p) => p.replace(/^~(?=\/|$)/, os.homedir());

// The draft's sources and their saved copies: source id -> files, file -> source id.
const LIB = path.join(ROOT, "scratchpad", "sources", id);
const draftFile = () => {
  const out = path.join(ROOT, "scratchpad", "lane-out");
  const drafts = (fs.existsSync(out) ? fs.readdirSync(out) : []).map((d) => path.join(out, d, `${id}.json`)).filter((f) => fs.existsSync(f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return drafts[0] || [path.join(ROOT, "audits", "profiles", `${id}.json`), path.join(ROOT, "audits", "people", `${id}.json`)].find((f) => fs.existsSync(f)) || null;
};
const sameUrl = (a, b) => [a, b].map((u) => String(u || "").replace(/[#?].*$/, "").replace(/\/+$/, "").replace(/^http:/, "https:")).reduce((x, y) => x === y);
const bySid = new Map(), sidOf = new Map();
{
  let sources = [], index = [];
  const df = draftFile();
  try { sources = (JSON.parse(fs.readFileSync(df, "utf8")).sources || []); } catch {}
  try { const j = JSON.parse(fs.readFileSync(path.join(LIB, "index.json"), "utf8")); index = Array.isArray(j) ? j : j.files || []; } catch {}
  for (const s of sources) {
    const fl = index.filter((it) => it && it.file && sameUrl(it.url, s.url)).map((it) => path.join(LIB, it.file))
      .map((f) => (/\.txt$/i.test(f) ? f : f.replace(/\.(html?|pdf)(\.gz)?$/i, "") + ".txt")).filter((f) => fs.existsSync(f));
    if (fl.length) bySid.set(s.id, fl);
    fl.forEach((f) => sidOf.set(f, s.id));
  }
}
const BOOKS = path.join(os.homedir(), ".cache", "political-ideology-atlas", "corpora", "ideology-books", id);
const resolve = (x) => {
  if (!/^s\d+(,s\d+)*$/.test(x)) return [[home(x), path.join(LIB, x), path.join(BOOKS, x)].find((f) => fs.existsSync(f)) || home(x)];
  return x.split(",").flatMap((s) => {
    if (!bySid.has(s)) { console.error(`${s}: no saved copy found (not in the draft's sources, or not in scratchpad/sources/${id}/)`); process.exit(1); }
    return bySid.get(s);
  });
};
// A file is named by its source id, by its name alone if it's in the subject's library or books folder, else by path.
const show = (f) => sidOf.has(f) ? sidOf.get(f) : [LIB, BOOKS].includes(path.dirname(f)) ? path.basename(f)
  : f.startsWith(ROOT) ? path.relative(ROOT, f) : f.replace(os.homedir(), "~");
// Lines joined, a word split by a line-end hyphen rejoined.
const flat = (t) => t.replace(/(\p{L})-[ \t]*\n\s*(\p{Ll})/gu, "$1$2").replace(/(\p{L})-[ \t]*\n\s*(?=\p{Lu})/gu, "$1-").replace(/[ \t]*\n\s*/g, " ").trim();

// The printed page numbers of a book's text, as [line, number] in order: a running head with the number, or a number
// alone on a line, kept only where they run upward in small steps; else PDF page breaks (form feeds).
function pageMarks(lines) {
  const head = /^\s*(?:(\d{1,4})\s+[A-Z][A-Z '\-.,:;]{5,}|[A-Z][A-Z '\-.,:;]{5,}\s+(\d{1,4})|(\d{1,4}))\s*$/;
  const marks = [];
  lines.forEach((l, i) => {
    const m = head.exec(l);
    if (!m) return;
    const n = +(m[1] || m[2] || m[3]), last = marks[marks.length - 1];
    if (!last || (n > last[1] && n - last[1] <= 4)) marks.push([i, n]);
  });
  if (marks.length >= 10 && marks.length * 120 >= lines.length / 4) return marks;
  const ff = [];
  lines.forEach((l, i) => { if (l.includes("\f")) ff.push([i, ff.length + 2]); });
  return ff.length >= 5 ? [[-1, 1], ...ff] : null;
}
const pageAt = (marks, i) => {
  if (!marks) return "";
  let k = -1;
  for (let j = 0; j < marks.length && marks[j][0] <= i; j++) k = j;
  const prev = k >= 0 ? marks[k][1] : null, next = marks[k + 1] ? marks[k + 1][1] : null;
  return prev && next ? ` p.${prev}-${next}` : prev || next ? ` p.${prev || next}` : "";
};

if (LINES) {
  const m = /^(\d+)-(\d+)$/.exec(LINES), target = argv[1];
  if (!m || !target) { console.error(USAGE); process.exit(1); }
  const f = resolve(target)[0];
  if (!fs.existsSync(f)) { console.error(`no file ${f}`); process.exit(1); }
  const lines = fs.readFileSync(f, "utf8").split("\n"), a = Math.max(1, +m[1]), b = Math.min(lines.length, +m[2]);
  const marks = pageMarks(lines), out = [];
  let size = 0, i = a - 1;
  while (i < b) {
    while (i < b && !lines[i].trim()) i++;
    if (i >= b) break;
    let j = i;
    while (j + 1 < b && lines[j + 1].trim()) j++;
    const para = `[${i + 1}${pageAt(marks, i)}] ${flat(lines.slice(i, j + 1).join("\n"))}`;
    if (size && size + para.length > PAGE_BYTES) { out.push(`[stopped at line ${i}; next: --lines ${i + 1}-${b}]`); break; }
    out.push(para); size += para.length; i = j + 1;
  }
  console.log(out.join("\n\n") + `\n[${show(f)}, lines ${a}-${Math.min(i, b)} of ${lines.length}]`);
  process.exit(0);
}

// --in naming the subject's own sources (ids, or a file of its library) searches only those.
const mine = (x) => /^s\d+(,s\d+)*$/.test(x) || [LIB, BOOKS].includes(path.dirname(resolve(x)[0]));
const roots = ins.some(mine) ? ins.flatMap(resolve) : [LIB, BOOKS, ...ins.flatMap(resolve)];
const named = new Set(roots);
const files = [];
const walk = (p) => {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f));
  else if (/\.(txt|md|jsonl)$/i.test(p) || named.has(p)) files.push(p);
};
roots.forEach(walk);
if (!files.length) { console.log(`no texts in ${roots.map((r) => r.replace(os.homedir(), "~")).join(", ")}`); process.exit(0); }

// Each file as units to search: a text's lines, or a .jsonl file's records (dated in --from..--to).
const norm = (t) => t.replace(/[\d\W_]+/g, " ").trim().toLowerCase();
const inRange = (d) => !d || ((!FROM || d >= FROM) && (!TO || d.slice(0, TO.length) <= TO));
function units(f) {
  const raw = fs.readFileSync(f, "utf8");
  if (!/\.jsonl$/i.test(f)) return { raw, lines: raw.split("\n") };
  const records = [];
  raw.split("\n").forEach((l, i) => {
    if (!l.trim()) return;
    let r; try { r = JSON.parse(l); } catch { return; }
    const text = String(r.text || r.content || r.body || "");
    const date = String(r.date || "");
    if (text && inRange(date)) records.push({ line: i + 1, text, head: [date, r.speaker, r.title].filter(Boolean).join(" · ") });
  });
  return { raw, records };
}
const cut = (text, re) => {
  if (text.length <= CHARS) return text;
  const m = Math.max(0, text.search(re)), start = Math.max(0, Math.min(m - CHARS / 2, text.length - CHARS));
  return (start ? "…" : "") + text.slice(start, start + CHARS) + (start + CHARS < text.length ? "…" : "");
};

if (COUNTS) {
  const pats = fs.readFileSync(COUNTS === "-" ? 0 : COUNTS, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const m = /^([\w-]+):\s+(.+)$/.exec(l); return m ? { label: m[1], re: regex(m[2]) } : { label: l, re: regex(l) }; });
  const loaded = files.map((f) => [f, units(f)]);
  for (const { label, re } of pats) {
    const per = loaded.map(([f, u]) => [f, (u.records ? u.records.map((r) => r.text) : u.lines).filter((t) => re.test(t)).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
    const total = per.reduce((n, [, k]) => n + k, 0);
    console.log(`${label}\t${total}${per.length ? `\t${per.slice(0, 3).map(([f, n]) => `${path.basename(f).slice(0, 40)} ${n}`).join("; ")}` : ""}`);
  }
  process.exit(0);
}

const re = regex(pattern);
if (FILES) {
  const counts = files.map((f) => { const u = units(f); return [f, (u.records ? u.records.map((r) => r.text) : u.lines).filter((t) => re.test(t)).length]; }).filter(([, n]) => n);
  counts.sort((a, b) => b[1] - a[1]);
  console.log(counts.length ? counts.map(([f, n]) => `${n}\t${show(f)}`).join("\n") : `no match in ${files.length} file(s)`);
  process.exit(0);
}

// One passage per paragraph: later matches in a paragraph already shown are skipped, as are repeats of a passage
// already shown (running page headers) and a text saved twice (sources/ and ideology-books/).
const passages = [], seen = new Set(), seenFiles = new Set();
const add = (where, text) => { if (seen.has(norm(text))) return; seen.add(norm(text)); passages.push(`${where}\n${text}`); };
for (const f of files) {
  const u = units(f), key = norm(u.raw.slice(0, 20000));
  if (seenFiles.has(key)) continue;
  seenFiles.add(key);
  const hits = [];
  if (u.records) {
    for (const r of u.records) if (re.test(r.text)) hits.push([`${show(f)}:${r.line}${r.head ? ` (${r.head})` : ""}`, r.text]);
  } else {
    const lines = u.lines, marks = pageMarks(lines);
    let shownTo = -1;
    for (let i = 0; i < lines.length; i++) {
      if (i <= shownTo || !re.test(lines[i])) continue;
      const ctx = BRIEF ? 1 : CONTEXT;
      let a = i, b = i;
      while (a > 0 && lines[a - 1].trim() && i - a < ctx) a--;
      while (b < lines.length - 1 && lines[b + 1].trim() && b - i < ctx) b++;
      shownTo = BRIEF ? i + 2 : b;
      hits.push([`${show(f)}:${i + 1}${pageAt(marks, i)}`, flat(lines.slice(a, b + 1).join("\n"))]);
    }
  }
  if (!BRIEF) { hits.forEach(([w, t]) => add(w, cut(t, re))); continue; }
  const keep = CHARS;
  CHARS = 250;
  let n = 0;
  for (const [w, t] of hits) {
    if (n >= BRIEF) break;
    const before = passages.length;
    add(w, cut(t, re));
    if (passages.length > before) { passages[passages.length - 1] = passages[passages.length - 1].replace("\n", "  "); n++; }
  }
  CHARS = keep;
  if (hits.length > n) passages.push(`  (${show(f)}: ${hits.length - n} more; --in ${sidOf.get(f) || show(f)} --brief ${hits.length} for all)`);
}
if (!passages.length) { console.log(`no match in ${files.length} file(s)`); process.exit(0); }
// Pages of about PAGE_BYTES each.
const pages = [[]];
let size = 0;
for (const p of passages) {
  if (size && size + p.length > PAGE_BYTES) { pages.push([]); size = 0; }
  pages[pages.length - 1].push(p);
  size += p.length + 2;
}
if (PAGE > pages.length) { console.log(`only ${pages.length} page(s)`); process.exit(0); }
console.log(pages[PAGE - 1].join(BRIEF ? "\n" : "\n\n"));
const before = pages.slice(0, PAGE).reduce((n, p) => n + p.length, 0);
console.log(`\n[passages ${before - pages[PAGE - 1].length + 1}-${before} of ${passages.length}${PAGE < pages.length ? `; next: --page ${PAGE + 1}` : ""}; --files counts matches per file]`);
