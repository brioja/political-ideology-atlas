#!/usr/bin/env node
// Searches everything available on the subject and prints the passages found.
//   node scripts/search.js "<terms>"
"use strict";
// How it works (for maintainers; auditors read only the lines above):
// One search command for audits (Brandon, 2026-11-16):
//   node scripts/search.js "<terms>"
// The subject is the one next_question.js is serving (scratchpad/search-log/current-<id>.json, the most recent).
// Where it looks, in order:
//   1. the subject's library (scratchpad/sources/<id>/*.txt): passages holding every term;
//   2. the local corpora that hold this person (found once per subject by searching each for the name, then
//      remembered), with the name and the terms; passages found are saved into the library, so the data stays local
//      and later searches find them in step 1;
//   3. the web, only when 1 and 2 find nothing (one headless Claude Haiku call with the WebSearch tool, about $0.02):
//      the top results are saved into the library (scripts/get.js) and searched like the rest.
// A search already made (same words, any order, case and accents ignored) is answered from the cache. Every search is
// logged in scratchpad/search-log/<id>.jsonl with the statement being worked on (answer.js reads it for nulls).
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CORPORA = path.join(os.homedir(), ".cache", "political-ideology-atlas", "corpora");
const CACHE = path.join(os.homedir(), ".cache", "political-ideology-atlas", "search");
const LOGS = path.join(ROOT, "scratchpad", "search-log");
const WEB_DAYS = 60;
const WEB_SAVE = 3; // web results saved into the library per search
const MAX_CHARS = 12000;

const STOP = new Set(("a an and are as at be by for from has have in is it its of on or that the this to was were will with " +
  "au aux avec ce ces dans de des du en est et il la le les leur lui mais ne ni nous on ou par pas pour qu que qui sa se " +
  "ses son sur un une vous").split(" "));
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// The words of a query: folded, stop words dropped, sorted. Two queries with the same words are the same search.
function words(q) {
  const toks = fold(q).match(/[a-z0-9֐-׿Ѐ-ӿ]+/g) || [];
  return [...new Set(toks.filter((t) => !STOP.has(t)))].sort();
}
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const run = (args, timeout = 600000, withErr = false) => {
  try {
    const r = require("child_process").spawnSync("node", args, { cwd: CORPORA, maxBuffer: 256 * 1024 * 1024, timeout });
    return String(r.stdout || "") + (withErr ? `\n${r.stderr || ""}` : "");
  } catch { return ""; }
};
// Passages: blank-line separated blocks, or lines when a tool prints one record per line.
const blocks = (text) => {
  const b = String(text).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  return b.length === 1 && b[0].includes("\n") ? b[0].split("\n").map((x) => x.trim()).filter(Boolean) : b;
};
const holdsAll = (b, terms) => terms.every((t) => fold(b).includes(t));

// The subject being worked on: the most recent current-<id>.json.
function subject() {
  let best = null;
  try {
    for (const f of fs.readdirSync(LOGS).filter((x) => /^current-.+\.json$/.test(x))) {
      const t = fs.statSync(path.join(LOGS, f)).mtimeMs;
      if (!best || t > best.t) best = { t, c: JSON.parse(fs.readFileSync(path.join(LOGS, f), "utf8")) };
    }
  } catch { /* none */ }
  return best ? best.c : null;
}
function log(id, entry) {
  fs.mkdirSync(LOGS, { recursive: true });
  const cur = subject();
  fs.appendFileSync(path.join(LOGS, `${id}.jsonl`), JSON.stringify({ at: new Date().toISOString(), statement: cur && cur.id === id ? cur.statement : null, ...entry }) + "\n");
}

// 1. The library.
const libDir = (id) => path.join(ROOT, "scratchpad", "sources", id);
function searchLibrary(id, terms) {
  let files = []; try { files = fs.readdirSync(libDir(id)).filter((f) => f.endsWith(".txt")); } catch { return []; }
  const out = [];
  for (const f of files) {
    for (const para of fs.readFileSync(path.join(libDir(id), f), "utf8").split(/\n\s*\n/)) {
      for (const p of para.length > 1500 ? para.match(/[\s\S]{1,1200}(\s|$)/g) : [para]) if (holdsAll(p, terms)) out.push(`[${f}]\n${p.trim()}`);
    }
  }
  return out;
}

// 2. The corpora. Each entry: how to search it for a person with terms. "one": the tool takes a single keyword (the
// first term; passages are then kept only if they hold every term). "probe": the arguments that show whether the
// person is in it at all.
const surname = (n) => n.trim().split(/\s+/).pop();
const CORPUS = {
  hansard: { args: (n, t) => [n, ...t, "--max", "40"], probe: (n) => [n, "--max", "1"] },
  aushansard: { args: (n, t) => [n, ...t, "--max", "40"], probe: (n) => [n, "--count"] },
  parlamint: { args: (n, t) => [n, ...t, "--max", "40"], probe: (n) => ["--list", n] },
  congress: { tool: "crec", args: (n, t) => [n, ...t, "--max", "40"], probe: (n) => [n, "--max", "1"] },
  hearings: { tool: "crec", args: (n, t) => [n, ...t, "--max", "40", "--source", "hearings"], probe: (n) => [n, "--max", "1", "--source", "hearings"] },
  unsc: { surnameOnly: true, args: (n, t) => [surname(n), ...t, "--max", "40"], probe: (n) => [surname(n), "--list"] },
  millercenter: { tool: "miller", args: (n, t) => [n, ...t, "--max", "40"], probe: (n) => [n, "--count"] },
  sots: { args: (n, t) => [n, ...t, "--max", "40"], probe: (n) => [n, "--count"] },
  congresstweets: { args: (n, t) => [n, ...t, "--max", "40", "--own"], probe: (n) => [n, "--count", "--own"] },
  trumptweets: { args: (n, t) => ["Trump", ...t, "--max", "40", "--own"], probe: (n) => (/trump/i.test(n) ? ["Trump", "--count"] : null) },
  mediasum: { one: true, args: (n, t) => [n, t[0], "--max", "40"], probe: (n) => [n, "--max", "1"] },
  euspeech: { one: true, args: (n, t) => [n, t[0]], probe: (n) => ["--list", n] },
  lexfridman: { one: true, args: (n, t) => [n, t[0], "--max", "40"], probe: (n) => [n, "--max", "1"] },
  wef: { one: true, args: (n, t) => [n, t[0]], probe: (n) => [n] },
  ungdc: { one: true, args: (n, t) => [n, t[0]], probe: (n) => [n] },
  gutenberg: { one: true, surnameOnly: true, args: (n, t) => [surname(n), t[0], "--max", "40"], probe: (n) => ["--list", surname(n)] },
  howtheyvote: { one: true, args: (n, t) => [n, t[0]], probe: (n) => [n, "a"] },
  voteview: { one: true, args: (n, t) => [n, t[0]], probe: (n) => [n, "a"] },
  legi: { args: (n, t) => [...t], probe: (n) => [n] },
};
// Which corpora hold this person: searched once by name, remembered per subject.
function corporaFor(id, name) {
  const f = path.join(LOGS, `${id}.corpora.json`);
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { /* probe */ }
  const found = [];
  for (const [c, def] of Object.entries(CORPUS)) {
    const tool = path.join(CORPORA, "tools", `${def.tool || c}.js`);
    const args = def.probe(name);
    if (!args || !fs.existsSync(tool)) continue;
    // Both streams: some tools print their count to stderr.
    const out = fold(run([tool, ...args], 180000, true));
    // Held: the tool reports a positive count, or its output names the person (first and last name: a namesake who
    // shares only the surname, like a Gutenberg author called Brown, doesn't count).
    const parts = fold(name).split(/\s+/).filter(Boolean);
    const counted = /\b([1-9][0-9]*) (documents?|speeches|matches|results|utterances|tweets|votes|records|transcripts) (matched|found)/.test(out);
    const named = parts.length > 1 ? out.includes(parts[0]) && out.includes(parts[parts.length - 1]) : out.includes(parts[0] || "\u0000");
    // A tool that says it found no one ('No speaker matching "<name>"') echoes the name: not held.
    const none = /\bno (speakers?|members?|matches|match|results?|documents?|one)\b[^\n]{0,30}\bmatch/.test(out) || /\bno speaker matching\b/.test(out);
    // A tool searched by surname alone counts only when the full name shows up (any "Mr. Brown" isn't him).
    if ((counted && !def.surnameOnly) || (named && !none)) found.push(c);
  }
  fs.mkdirSync(LOGS, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(found));
  return found;
}
function searchCorpus(c, name, terms) {
  const def = CORPUS[c];
  const out = run([path.join(CORPORA, "tools", `${def.tool || c}.js`), ...def.args(name, terms)]);
  return blocks(out).filter((b) => holdsAll(b, terms));
}
// Corpus passages are kept in the library: one file per corpus and search, with an index.json entry.
function saveToLibrary(id, c, query, passages) {
  const dir = libDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const file = `${c}-search-${hash(`${c}|${query}`)}.txt`;
  fs.writeFileSync(path.join(dir, file), passages.join("\n\n") + "\n");
  const idxFile = path.join(dir, "index.json");
  let idx = []; try { idx = JSON.parse(fs.readFileSync(idxFile, "utf8")); } catch { /* new */ }
  if (!idx.some((e) => e.file === file)) {
    idx.push({ file, url: `corpus:${c}`, title: `${c} corpus: passages for "${query}"`, downloaded: new Date().toISOString().slice(0, 10), agent: "search.js" });
    fs.writeFileSync(idxFile, JSON.stringify(idx, null, 1) + "\n");
  }
  return file;
}

// 3. The web: one search through a headless Claude session (Haiku, only the WebSearch tool), run outside the repo.
function searchWeb(query) {
  const prompt = `Run exactly one WebSearch for: ${query}\nThen print only the results, one per line as: title | url | snippet (empty if none). No other text.`;
  try {
    const out = execFileSync("claude", ["-p", prompt, "--model", "haiku", "--allowedTools", "WebSearch", "--output-format", "json"],
      { cwd: os.tmpdir(), timeout: 180000, maxBuffer: 16 * 1024 * 1024 }).toString();
    const r = JSON.parse(out);
    if (r.is_error) return [];
    return String(r.result || "").split("\n").map((l) => l.trim()).filter((l) => / \| https?:\/\//.test(l));
  } catch { return []; }
}
function cachedWeb(query) {
  const f = path.join(CACHE, `web-${hash(words(query).join(" "))}.json`);
  try { const c = JSON.parse(fs.readFileSync(f, "utf8")); if ((Date.now() - Date.parse(c.at)) / 864e5 <= WEB_DAYS) return { ...c, cached: true }; } catch { /* fetch */ }
  const results = searchWeb(query);
  fs.mkdirSync(CACHE, { recursive: true });
  const c = { query, at: new Date().toISOString(), results };
  fs.writeFileSync(f, JSON.stringify(c));
  return c;
}

function cap(text) {
  return text.length <= MAX_CHARS ? text : `${text.slice(0, MAX_CHARS)}\n… (${text.length - MAX_CHARS} more characters: add a term to narrow)`;
}

function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) { console.error('usage: node scripts/search.js "<terms>"   (searches for the subject next_question.js is serving)'); process.exit(1); }
  const cur = subject();
  if (!cur) { console.error("no subject: run node scripts/next_question.js <id> first"); process.exit(1); }
  const id = cur.id, terms = words(query);
  const lib = require("./lib");
  const person = lib.peopleCatalog().find((e) => e.id === id);
  const name = person ? person.name : id;

  const show = (found, note) => {
    console.log(`${found.length} passage${found.length === 1 ? "" : "s"} for "${query}"${note}\n`);
    console.log(cap(found.join("\n\n")));
  };
  let found = searchLibrary(id, terms);
  if (found.length) { log(id, { query, where: "library", passages: found.length }); show(found, ""); return; }
  // Nothing in the library: the corpora that hold the person (once per subject and words), saved into the library.
  const corpusCache = path.join(LOGS, `${id}.corpus-searches.json`);
  let done = {}; try { done = JSON.parse(fs.readFileSync(corpusCache, "utf8")); } catch { /* none */ }
  const key = terms.join(" ");
  if (!done[key]) {
    const saved = [];
    for (const c of corporaFor(id, name)) {
      const passages = searchCorpus(c, name, terms);
      if (passages.length) saved.push(`${saveToLibrary(id, c, query, passages)} (${passages.length})`);
    }
    done[key] = saved;
    fs.writeFileSync(corpusCache, JSON.stringify(done));
    found = searchLibrary(id, terms);
    if (found.length) { log(id, { query, where: "corpora", passages: found.length, files: saved }); show(found, ` (from the corpora, now in the library: ${saved.join(", ")})`); return; }
  }
  // Nothing local: the web. The top results are saved into the library (get.js), then the library is searched again.
  const web = cachedWeb(query);
  const urls = web.results.map((r) => (r.match(/\| (https?:\/\/\S+)/) || [])[1]).filter(Boolean).slice(0, WEB_SAVE);
  const saved = [];
  if (!web.cached) for (const u of urls) {
    const r = require("child_process").spawnSync("node", [path.join(__dirname, "get.js"), id, u], { cwd: ROOT, timeout: 300000 });
    if (r.status === 0) saved.push(u);
  }
  found = searchLibrary(id, terms);
  log(id, { query, where: "web", results: web.results.length, saved: saved.length, passages: found.length, cached: !!web.cached });
  if (found.length) { show(found, ` (from the web, ${saved.length} page${saved.length === 1 ? "" : "s"} saved to the library)`); return; }
  if (!web.results.length) { console.log(`nothing for "${query}" in the library, the corpora that hold ${name}, or the web`); return; }
  console.log(`nothing for "${query}" in the library or the corpora; the saved web pages don't hold every term either. Web results:\n`);
  console.log(cap(web.results.join("\n\n")));
}

if (require.main === module) main();
module.exports = { words, blocks, CACHE, hash, subject, corporaFor };
