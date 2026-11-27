// Saves a copy of each source an audit cites that has none in scratchpad/sources/<id>/, so validate.js can check it
// (Brandon, 2026-11-27: fidelismo's s4 and s5 went to its session as "no saved copy to check"; the session dropped
// them, and the 140 answers kept aside that cited them were nulled, though no one had checked whether they were tied).
// The lane driver runs it before each session, ahead of dropFailing, which then takes out what the check fails.
//   node scripts/save-sources.js <id> [--dir <draft folder>] [--people]
// marxists.org pages come from the local corpus (fetched into it if needed), Gutenberg books from scripts/gutenberg.js,
// everything else through scripts/get.js. Wikipedia and YouTube are left alone (Wikipedia citations are dropped anyway).
// Prints one line per source tried; a copy no tool could get stays missing, for the session.
const fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync } = require("child_process");
const lib = require("./lib");
const { sourceText } = require("./coatrack-check");

const ROOT = path.join(__dirname, "..");
const MARXISTS = path.join(os.homedir(), ".cache", "political-ideology-atlas", "corpora", "tools", "marxists.js");
const MARXISTS_TEXT = path.join(os.homedir(), ".cache", "political-ideology-atlas", "corpora", "marxists", "text");
const run = (cmd, args, timeout = 300000) => {
  try { return { ok: true, out: execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || "") + String(e.stderr || e.message || "") }; }
};

// Adds a local text file to the audit's library as the copy of `url` (agent "local-corpus").
function addLocal(id, url, file) {
  const dir = path.join(ROOT, "scratchpad", "sources", id);
  fs.mkdirSync(dir, { recursive: true });
  const name = url.replace(/^https?:\/\/(www\.)?/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 70) + ".txt";
  fs.copyFileSync(file, path.join(dir, name));
  const idxFile = path.join(dir, "index.json");
  const idx = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, "utf8")) : [];
  const list = Array.isArray(idx) ? idx : (idx.files = idx.files || []);
  const entry = { file: name, title: path.basename(file), url, downloaded: new Date().toISOString().slice(0, 10), agent: "local-corpus" };
  const i = list.findIndex((x) => x.url === url);
  if (i >= 0) list[i] = entry; else list.push(entry);
  fs.writeFileSync(idxFile, JSON.stringify(idx, null, 1) + "\n");
}

// The corpus text file whose header names `url` (marxists.js writes the title, then the URL, as its first lines).
function marxistsFile(url) {
  const want = url.replace(/^http:/, "https:").replace(/[#?].*$/, "");
  const r = run("grep", ["-rlF", "--include=*.txt", want, MARXISTS_TEXT], 60000);
  return r.ok ? r.out.split("\n").filter(Boolean).find((f) => fs.readFileSync(f, "utf8").split("\n").slice(0, 5).some((l) => l.includes(want))) || null : null;
}

function saveOne(id, url) {
  if (/(^|\.)(wikipedia|wikidata)\.org\//i.test(url) || /youtube\.com|youtu\.be/i.test(url)) return null;
  if (/(^|\/\/|\.)marxists\.org\//i.test(url)) {
    let f = marxistsFile(url);
    if (!f) { run("node", [MARXISTS, "--fetch", url]); f = marxistsFile(url); }
    if (!f) return "not found in the marxists.org corpus";
    addLocal(id, url, f);
    return "saved from the local corpus";
  }
  const g = /gutenberg\.org\/(?:ebooks|cache\/epub|files)\/(\d+)/i.exec(url);
  if (g) {
    const r = run("node", ["scripts/gutenberg.js", g[1]]);
    const f = r.ok && r.out.split("\n").map((l) => l.trim()).find((l) => l && fs.existsSync(l));
    if (!f) return "Gutenberg book not fetched";
    addLocal(id, url, f);
    return "saved from the Gutenberg corpus";
  }
  const r = run("node", ["scripts/get.js", id, url], 600000);
  return r.ok ? "saved" : `not saved: ${(r.out.trim().split("\n").pop() || "").slice(0, 160)}`;
}

// Returns [{ source, url, result }] for each cited source that had no saved copy (Wikipedia and YouTube left out).
function saveSources(id, file) {
  const a = JSON.parse(fs.readFileSync(file, "utf8")), out = [];
  for (const s of Array.isArray(a.sources) ? a.sources : []) {
    if (!s || typeof s.url !== "string" || !/^https?:\/\//.test(s.url) || sourceText(id, s.url) != null) continue;
    const result = saveOne(id, s.url);
    if (result) out.push({ source: s.id, url: s.url, result });
  }
  return out;
}

module.exports = { saveSources };

if (require.main === module) {
  const args = process.argv.slice(2), id = args.find((x) => !x.startsWith("--") && args[args.indexOf(x) - 1] !== "--dir");
  const dirArg = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : null;
  if (!id) { console.error("usage: node scripts/save-sources.js <id> [--dir <draft folder>] [--people]"); process.exit(1); }
  const file = dirArg ? path.join(dirArg, `${id}.json`) : path.join(args.includes("--people") ? lib.PEOPLE_DIR : lib.PROFILES_DIR, `${id}.json`);
  for (const r of saveSources(id, file)) console.log(`${r.source} ${r.url}: ${r.result}`);
}
