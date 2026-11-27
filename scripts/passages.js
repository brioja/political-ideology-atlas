// Passage search for audits: the paragraphs of a subject's saved texts that match a pattern, with file and line, in
// pages of capped size (Brandon, 2026-11-27: lane sessions read whole sources, 20–40 kB per call carried on every
// later turn, or wrote their own grep helpers, one per session).
//   node scripts/passages.js <id> <regex> [--in <dir-or-file> ...] [--context N] [--page N] [--files] [--case]
// Searches scratchpad/sources/<id>/ and ~/.cache/political-ideology-atlas/corpora/ideology-books/<id>/ (the .txt and
// .md files), plus each --in path (a corpus folder, a reference book). The regex is case-insensitive unless --case.
// A passage is the paragraph holding the match (text between blank lines), cut to --context lines (default 4) either
// side of it when a paragraph runs long (books without paragraph breaks), and to 1,200 characters around the match.
// --files lists only the match count per file, most first, to choose where to look.
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, "..");
const PAGE_BYTES = 8000, PASSAGE_CHARS = 1200;
const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(k); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (k, d) => { const i = argv.indexOf(k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const ins = [];
for (let i; (i = argv.indexOf("--in")) > -1;) { ins.push(argv[i + 1]); argv.splice(i, 2); }
const FILES = flag("--files"), CASE = flag("--case");
const CONTEXT = +opt("--context", 4), PAGE = Math.max(1, +opt("--page", 1));
const [id, pattern] = argv;
if (!id || !pattern) {
  console.error("usage: node scripts/passages.js <id> <regex> [--in <dir-or-file> ...] [--context N] [--page N] [--files] [--case]");
  process.exit(1);
}
let re;
try { re = new RegExp(pattern, CASE ? "" : "i"); } catch (e) { console.error(`bad regex: ${e.message}`); process.exit(1); }
const home = (p) => p.replace(/^~(?=\/|$)/, os.homedir());
const roots = [path.join(ROOT, "scratchpad", "sources", id), path.join(os.homedir(), ".cache", "political-ideology-atlas", "corpora", "ideology-books", id), ...ins.map(home)];
const files = [];
const walk = (p) => {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f));
  else if (/\.(txt|md)$/i.test(p) || ins.map(home).includes(p)) files.push(p);
};
roots.forEach(walk);
if (!files.length) { console.log(`no texts in ${roots.map((r) => r.replace(os.homedir(), "~")).join(", ")}`); process.exit(0); }
const show = (f) => (f.startsWith(ROOT) ? path.relative(ROOT, f) : f.replace(os.homedir(), "~"));

if (FILES) {
  const counts = files.map((f) => [f, fs.readFileSync(f, "utf8").split("\n").filter((l) => re.test(l)).length]).filter(([, n]) => n);
  counts.sort((a, b) => b[1] - a[1]);
  console.log(counts.length ? counts.map(([f, n]) => `${n}\t${show(f)}`).join("\n") : `no match in ${files.length} file(s)`);
  process.exit(0);
}

// One passage per paragraph: later matches in a paragraph already shown are skipped, as are repeats of a passage
// already shown (running page headers) and a text saved twice (sources/ and ideology-books/).
const passages = [], seen = new Set(), seenFiles = new Set();
const norm = (t) => t.replace(/[\d\W_]+/g, " ").trim().toLowerCase();
for (const f of files) {
  const raw = fs.readFileSync(f, "utf8"), key = norm(raw.slice(0, 20000));
  if (seenFiles.has(key)) continue;
  seenFiles.add(key);
  const lines = raw.split("\n");
  let shownTo = -1;
  for (let i = 0; i < lines.length; i++) {
    if (i <= shownTo || !re.test(lines[i])) continue;
    let a = i, b = i;
    while (a > 0 && lines[a - 1].trim() && i - a < CONTEXT) a--;
    while (b < lines.length - 1 && lines[b + 1].trim() && b - i < CONTEXT) b++;
    let text = lines.slice(a, b + 1).join("\n").trim();
    if (text.length > PASSAGE_CHARS) {
      const m = text.search(re), start = Math.max(0, Math.min(m - PASSAGE_CHARS / 2, text.length - PASSAGE_CHARS));
      text = (start ? "…" : "") + text.slice(start, start + PASSAGE_CHARS) + (start + PASSAGE_CHARS < text.length ? "…" : "");
    }
    shownTo = b;
    if (seen.has(norm(text))) continue;
    seen.add(norm(text));
    passages.push(`${show(f)}:${i + 1}\n${text}`);
  }
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
console.log(pages[PAGE - 1].join("\n\n"));
const before = pages.slice(0, PAGE).reduce((n, p) => n + p.length, 0);
console.log(`\n[passages ${before - pages[PAGE - 1].length + 1}-${before} of ${passages.length}${PAGE < pages.length ? `; next: --page ${PAGE + 1}` : ""}; --files counts matches per file]`);
