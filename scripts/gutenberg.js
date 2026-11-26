// Project Gutenberg for agents, by the route its robot policy allows (gutenberg.org/policy/robot_access.html: robots
// use the mirror, never the website). Search reads the official catalog already on disk; a book not yet local is
// fetched once from the mirror into the local corpus (corpora/gutenberg), then read locally. A project hook blocks
// direct fetches of gutenberg.org.
//   node scripts/gutenberg.js --search "<author or title words>"   matching English books: id, author, title, local or not
//   node scripts/gutenberg.js <id>                                 the local text file's path (fetched from the mirror if
//                                                                  missing); search it with grep -n
//   node scripts/gutenberg.js <id> --fetch-if-not-local [--grep "<keyword>"]   an audit's web phase (Brandon, 2026-11-26):
//       a book not yet local is fetched into the corpus and the passages with the keyword printed; a book already
//       local is refused (the local phase reads the corpus, and .claude/hooks/web-only.js keeps the web phase off it)
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CORPORA = path.join(require("os").homedir(), ".cache", "political-ideology-atlas", "corpora");
const GUT = path.join(CORPORA, "gutenberg");
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function catalog() {
  const t = fs.readFileSync(path.join(GUT, "raw", "pg_catalog.csv"), "utf8"), rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c;
  }
  const [head, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(head.map((h, j) => [h, r[j] || ""])));
}
const localFile = (id) => fs.readdirSync(path.join(GUT, "text")).find((f) => f.startsWith(id + " "));

function main() {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const ifNew = args.includes("--fetch-if-not-local"), kw = opt("--grep");
  const [a, b] = args.filter((x, i) => !x.startsWith("--fetch-if-not-local") && args[i - 1] !== "--grep" && x !== "--grep");
  if (a === "--search") {
    const words = fold(b).split(/\s+/).filter(Boolean);
    if (!words.length) throw new Error('usage: node scripts/gutenberg.js --search "<author or title words>"');
    const hits = catalog().filter((r) => r.Language === "en" && r.Type === "Text" && words.every((w) => fold(`${r.Authors} ${r.Title}`).includes(w)));
    for (const r of hits.slice(0, 40)) console.log(`${r["Text#"]}\t${r.Authors.replace(/\s+/g, " ").slice(0, 60)}\t${r.Title.replace(/\s+/g, " ").slice(0, 90)}\t${localFile(r["Text#"]) ? "local" : "not local"}`);
    if (hits.length > 40) console.log(`... ${hits.length - 40} more; narrow the words`);
    return;
  }
  const id = String(a || "");
  if (!/^\d+$/.test(id)) throw new Error('usage: node scripts/gutenberg.js <id> | --search "<words>"');
  if (ifNew && localFile(id)) throw new Error(`${id} is already in the local corpus: the local phase reads it; this phase adds only books the corpus lacks`);
  if (!localFile(id)) {
    const r = catalog().find((x) => x["Text#"] === id);
    if (!r) throw new Error(`${id} is not in the Gutenberg catalog`);
    const sel = path.join(GUT, "selection.tsv");
    if (!fs.readFileSync(sel, "utf8").split("\n").some((l) => l.split("\t")[0] === id))
      fs.appendFileSync(sel, [id, r.Authors.replace(/\s+/g, " "), r.Title.replace(/\s+/g, " ").slice(0, 100)].join("\t") + "\n");
    execFileSync(path.join(GUT, "fetch.sh"), { stdio: "ignore", timeout: 10 * 60 * 1000 });
    execFileSync("node", [path.join(CORPORA, "tools", "gutenberg.js"), "--build"], { stdio: "ignore" });
    if (!localFile(id)) throw new Error(`${id}: the mirror has no plain-text file for it`);
  }
  const file = path.join(GUT, "text", localFile(id));
  console.log(file);
  if (kw) {
    const t = fs.readFileSync(file, "utf8"), ft = fold(t), k = fold(kw); let i = -1, n = 0;
    while ((i = ft.indexOf(k, i + 1)) >= 0 && n < 40) { console.log(`  ...${t.slice(Math.max(0, i - 300), i + k.length + 300).replace(/\s+/g, " ")}...`); n++; i += k.length; }
    console.log(`${n} passage(s) with "${kw}"${n >= 40 ? " (first 40)" : ""}`);
  }
}
try { main(); } catch (e) { console.error(e.message); process.exit(1); }
