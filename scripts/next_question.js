#!/usr/bin/env node
// Shows the next statement to answer.
//   node scripts/next_question.js <id>
"use strict";
// How it works (for maintainers; auditors read only the lines above):
// One statement at a time for a person audit (Brandon, 2026-11-16): the agent never faces the whole bank at once.
//   node scripts/next_question.js <id>
// Prints the next unanswered statement (text, agree/disagree meanings) and progress. The order is fixed and computed
// once (scripts/statement-neighbours.js -> audits/statement-neighbours.json): statements one source settled together
// in the rules-7 audits follow each other. No library is read. Statements added to the bank since go last, in bank
// order. Names the files the latest position cited, to check first. Records the statement in
// scratchpad/search-log/current-<id>.json, so searches made now (scripts/search.js) are logged against it. Answer with
// scripts/answer.js, which prints the next question. Nothing left: says so.
// The draft is scratchpad/lane-out/qa/<id>.json, created on first use.
const fs = require("fs"), path = require("path");
const lib = require("./lib");

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

const ORDER = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "audits", "statement-neighbours.json"), "utf8")).order; } catch { return []; } })();
// The library files cited by the most recently recorded position (nulls cite nothing and are passed over).
function recentFiles(d) {
  for (const k of Object.keys(d.answers).reverse()) {
    const ids = (d.answers[k] && d.answers[k].sources) || [];
    if (ids.length) return ids.map((sid) => (d.sources.find((x) => x.id === sid) || {}).library).filter(Boolean);
  }
  return [];
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
  const rank = Object.fromEntries(ORDER.map((sid, i) => [sid, i]));
  const s = left.map((x, i) => [x, rank[x.id] ?? ORDER.length + i]).sort((x, y) => x[1] - y[1])[0][0];
  fs.mkdirSync(LOGS, { recursive: true });
  fs.writeFileSync(path.join(LOGS, `current-${id}.json`), JSON.stringify({ id, statement: s.id, at: new Date().toISOString() }));
  return { done: false, d, s, left: left.length, total: statements.length, recent: recentFiles(d) };
}

function print(r, id) {
  if (r.done) { console.log(`All ${r.total} statements answered for ${id}. Last step: node scripts/answer.js ${id} about --role "..." --summary "..." [--notes "..."]`); return; }
  const { s } = r;
  console.log(`Statement ${r.total - r.left + 1} of ${r.total} (${r.left} left): ${s.id}${s.status === "candidate" ? " (candidate)" : ""}, theme ${s.theme}`);
  console.log(`  "${s.text}"`);
  if (s.agree) console.log(`  agree: ${s.agree}`);
  if (s.disagree) console.log(`  disagree: ${s.disagree}`);
  if (r.recent.length) console.log(`\nYour last answer cited ${r.recent.map((f) => `[${f}]`).join(", ")}.`);
  console.log(`\nSearch: node scripts/search.js "<terms>"   Answer: node scripts/answer.js ${id} ${s.id} ...`);
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const id = a[0], dir = null;
  if (!id) { console.error("usage: node scripts/next_question.js <id>"); process.exit(1); }
  print(next(id, dir), id);
}
module.exports = { next, print, loadDraft, draftPath };
