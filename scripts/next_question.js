#!/usr/bin/env node
// Shows the next statement to answer.
//   node scripts/next_question.js <id>
"use strict";
// How it works (for maintainers; auditors read only the lines above):
// One statement at a time for a person audit (Brandon, 2026-11-16): the agent never faces the whole bank at once.
//   node scripts/next_question.js <id>
// Prints the next unanswered statement (text, agree/disagree meanings), the library passages that share the most
// words with it, and progress. Statements whose library passages match best come first; those with no match come
// last. Records the statement in scratchpad/search-log/current-<id>.json, so searches made now (scripts/search.js) are
// logged against it. Answer with scripts/answer.js, which prints the next question. Nothing left: says so.
// The draft is scratchpad/lane-out/qa/<id>.json, created on first use.
const fs = require("fs"), path = require("path");
const lib = require("./lib");
const { words } = require("./search");

const ROOT = path.join(__dirname, "..");
const LOGS = path.join(ROOT, "scratchpad", "search-log");

function draftPath(id, dir) { return path.join(dir || path.join(ROOT, "scratchpad", "lane-out", "qa"), `${id}.json`); }
function loadDraft(id, dir) {
  const p = draftPath(id, dir);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  const e = lib.peopleCatalog().find((c) => c.id === id);
  if (!e) throw new Error(`${id} is not in the people catalog`);
  const { CURRENT_RULES } = require("./validate");
  const d = { id, name: e.name, auditedAt: new Date().toISOString().slice(0, 10), auditor: "claude-sonnet-5-5", rules: CURRENT_RULES,
    living: e.living !== undefined ? e.living : null, role: "", summary: "", wikipedia: e.wikipedia || null,
    sources: [], booksNotUsed: [], notFound: [], answers: {}, notes: "" };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
  return d;
}

// Library passages, split like search.js does, with their words.
function libraryPassages(id) {
  const dir = path.join(ROOT, "scratchpad", "sources", id);
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch { return []; }
  const out = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    for (const para of text.split(/\n\s*\n/)) {
      for (const p of para.length > 1500 ? para.match(/[\s\S]{1,1200}(\s|$)/g) : [para]) {
        const t = p.trim(); if (t.length < 80) continue;
        out.push({ file: f, text: t, words: new Set(words(t)) });
      }
    }
  }
  return out;
}
const statementWords = (s) => words(`${s.text} ${s.agree || ""} ${s.disagree || ""}`).filter((w) => w.length >= 4);
function best(s, passages) {
  const sw = statementWords(s);
  return passages.map((p) => ({ p, score: sw.filter((w) => p.words.has(w)).length })).filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score).slice(0, 3);
}

// Done: the corpora that hold no record of the person (search.js's check by name) are declined in booksNotUsed, so
// the auditor doesn't write it. Corpora that do hold them are left to the audit: cited, or declined with a reason.
function declineCorpora(id, dir, d) {
  if ((d.booksNotUsed || []).some((b) => b && b.auto === "corpora")) return;
  const { corporaFor } = require("./search");
  const root = path.join(require("os").homedir(), ".cache", "political-ideology-atlas", "corpora");
  let all = []; try { all = fs.readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory() && !["tools", "wikidata-aliases"].includes(x.name)).map((x) => x.name); } catch { return; }
  const held = new Set(corporaFor(id, d.name));
  const none = all.filter((c) => !held.has(c)).sort();
  if (!none.length) return;
  const day = new Date().toISOString().slice(0, 10);
  d.booksNotUsed = [...(d.booksNotUsed || []), ...none.map((c) => ({ corpus: c, auto: "corpora",
    reason: `No record of ${d.name} in the ${c} corpus: searched by name on ${day} (scripts/search.js).` }))];
  fs.writeFileSync(draftPath(id, dir), JSON.stringify(d, null, 2) + "\n");
}

function next(id, dir) {
  const d = loadDraft(id, dir);
  const statements = lib.allStatements();
  const left = statements.filter((s) => !d.answers[s.id]);
  if (!left.length) { declineCorpora(id, dir, d); return { done: true, d, total: statements.length }; }
  const passages = libraryPassages(id);
  const ranked = left.map((s, i) => ({ s, hits: best(s, passages), i }))
    .sort((a, b) => (b.hits[0] ? b.hits[0].score : 0) - (a.hits[0] ? a.hits[0].score : 0) || a.i - b.i);
  const q = ranked[0];
  fs.mkdirSync(LOGS, { recursive: true });
  fs.writeFileSync(path.join(LOGS, `current-${id}.json`), JSON.stringify({ id, statement: q.s.id, libraryMatches: q.hits.length, at: new Date().toISOString() }));
  return { done: false, d, q, left: left.length, total: statements.length };
}

function print(r, id) {
  if (r.done) { console.log(`All ${r.total} statements answered for ${id}. Last step: node scripts/answer.js ${id} about --role "..." --summary "..." [--notes "..."]`); return; }
  const { s, hits } = r.q;
  console.log(`Statement ${r.total - r.left + 1} of ${r.total} (${r.left} left): ${s.id}${s.status === "candidate" ? " (candidate)" : ""}, theme ${s.theme}`);
  console.log(`  "${s.text}"`);
  if (s.agree) console.log(`  agree: ${s.agree}`);
  if (s.disagree) console.log(`  disagree: ${s.disagree}`);
  if (!hits.length) console.log("\nNo library passage shares its words. If the person likely spoke to it, search the corpora or the web.");
  else {
    console.log(`\nLibrary passages sharing its words:`);
    for (const h of hits) console.log(`\n[${h.p.file}] (${h.score} shared words)\n${h.p.text.slice(0, 900)}`);
  }
  console.log(`\nSearch: node scripts/search.js "<terms>"   Answer: node scripts/answer.js ${id} ${s.id} ...`);
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const id = a[0], dir = null;
  if (!id) { console.error("usage: node scripts/next_question.js <id>"); process.exit(1); }
  print(next(id, dir), id);
}
module.exports = { next, print, loadDraft, draftPath };
