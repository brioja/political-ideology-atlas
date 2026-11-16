#!/usr/bin/env node
// Records one answer and prints the next statement.
//   node scripts/answer.js <id> <statement> <-2..2> <low|medium|high> --cite <file>[,<file>] --evidence words|action --rationale "..."
//   node scripts/answer.js <id> <statement> null
//   node scripts/answer.js <id> about --role "..." --summary "..."        (at the end)
// <file>: as search.js shows it. --evidence: the files show what they said (words) or what they did (action).
"use strict";
// How it works (for maintainers; auditors read only the lines above): a position cites library files, and their source
// entries are built from the library index (title, url; kind from the address, see kindOf), so the auditor never edits
// the draft. A null's rationale lists any searches logged for the statement. Every answer is checked at once with
// validate.js: an error about this statement undoes the answer and is shown. "about" also takes --notes.
const fs = require("fs"), path = require("path");
const lib = require("./lib");
const { next, print, loadDraft, draftPath } = require("./next_question");

const ROOT = path.join(__dirname, "..");
const LOGS = path.join(ROOT, "scratchpad", "search-log");
const CLEAR_AFTER = 40;
const fail = (m) => { console.error(`refused: ${m}`); process.exit(2); };
const opt = (a, k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
const save = (id, dir, d) => fs.writeFileSync(draftPath(id, dir), JSON.stringify(d, null, 2) + "\n");

// A source's kind, from where it comes from: encyclopedias are reference works, academic publishers and journals are
// scholarship, everything else (the subject's own texts and record, the press, corpora) is primary.
function kindOf(url) {
  const u = String(url || "").toLowerCase();
  if (/plato\.stanford\.edu|iep\.utm\.edu|britannica\.com|encyclopedia|oxfordreference|routledge.*encyclop/.test(u)) return "reference";
  if (/doi\.org|jstor\.org|\.edu\/|springer|tandfonline|cambridge\.org|oup\.com|academic\.oup|sagepub|wiley\.com|muse\.jhu|scholar|journals?\./.test(u)) return "scholarly";
  return "primary";
}

function searchesFor(id, statement) {
  let lines = []; try { lines = fs.readFileSync(path.join(LOGS, `${id}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { /* none */ }
  return lines.filter((e) => e.statement === statement && !e.refused);
}

function main() {
  const a = process.argv.slice(2);
  const [id, what] = a;
  const dir = null; // the draft is always scratchpad/lane-out/qa/<id>.json
  if (!id || !what) fail("usage: see the header of scripts/answer.js");
  const d = loadDraft(id, dir);
  if (what === "about") {
    for (const k of ["role", "summary", "notes"]) if (opt(a, `--${k}`) !== undefined) d[k] = opt(a, `--${k}`);
    if (!d.role || !d.summary) fail("about needs --role and --summary");
    save(id, dir, d); console.log("recorded role, summary and notes"); return;
  }
  const st = lib.allStatements().find((s) => s.id === what);
  if (!st) fail(`no statement ${what}`);
  const value = a[2];
  let ans;
  if (value === "null") {
    const own = searchesFor(id, what);
    const searched = own.map((e) => `"${e.query}" (${e.where || e.channel})`).slice(0, 8);
    const base = opt(a, "--rationale");
    ans = { value: null, confidence: "low", sources: [],
      rationale: `${base ? `${base.replace(/\.?$/, ".")} ` : "No recorded position found. "}${searched.length
        ? `Searched on ${new Date().toISOString().slice(0, 10)}: ${searched.join("; ")}.` : ""}`.trim() };
  } else {
    const v = Number(value);
    if (![-2, -1, 0, 1, 2].includes(v)) fail("the value is -2, -1, 0, 1, 2 or null");
    const confidence = a[3];
    if (!["low", "medium", "high"].includes(confidence)) fail("the confidence is low, medium or high");
    const files = String(opt(a, "--cite") || "").split(",").map((x) => x.trim().replace(/^\[|\]$/g, "")).filter(Boolean);
    const evidence = opt(a, "--evidence");
    if (!files.length) fail("a position needs --cite <library file>[,<file>...] (the [file] names search.js shows)");
    if (!["words", "action"].includes(evidence)) fail("--evidence words|action: do the cited files show what they said, or what they did?");
    let index = []; try { index = JSON.parse(fs.readFileSync(path.join(ROOT, "scratchpad", "sources", id, "index.json"), "utf8")); } catch { /* none */ }
    const sources = files.map((f) => {
      const e = index.find((x) => x.file === f);
      if (!e) fail(`${f} is not in the library index (cite the [file] names search.js shows)`);
      let src = d.sources.find((x) => x.library === f && x.evidence === evidence);
      if (!src) {
        const sid = `s${d.sources.reduce((m, x) => Math.max(m, Number(String(x.id).slice(1)) || 0), 0) + 1}`;
        src = { id: sid, kind: kindOf(e.url), evidence, title: e.title || f, url: /^https?:/.test(e.url || "") ? e.url : `https://${String(e.url || "local-corpus").replace(/^corpus:/, "corpus.local/")}`, library: f };
        d.sources.push(src);
      }
      return src.id;
    });
    const rationale = opt(a, "--rationale");
    if (!rationale || rationale.trim().length < 20) fail("a position needs a --rationale stating the evidence");
    ans = { value: v, confidence, rationale: rationale.trim(), sources };
  }
  const before = d.answers[what];
  d.answers[what] = ans;
  save(id, dir, d);
  // Check the answer now, with the validator's own rules (not the uncertainty rule, which is about the whole audit).
  {
    // In process: validate.js reads its options from the command line when it loads, and a child's long output can
    // be cut short when it exits, losing the errors at the end.
    process.argv.push("--people", "--no-uncertainty", "--dir", path.dirname(draftPath(id, dir)));
    const { validate } = require("./validate");
    const mine = validate(id).errors.filter((e) => e.includes(what));
    if (mine.length) {
      if (before === undefined) delete d.answers[what]; else d.answers[what] = before;
      save(id, dir, d);
      fail(`${what} not recorded:\n  ${mine.join("\n  ")}`);
    }
  }
  console.log(`recorded ${what}: ${ans.value === null ? "null" : ans.value} (${ans.confidence})\n`);
  // Clear after 40 answers (Brandon, 2026-11-16): a cache write costs 40 times a cache read ($4.00 against $0.10 per
  // million tokens on Sonnet 5.5), so after about 40 calls a session has re-read its context for what writing it fresh
  // would cost. The count lives next to the draft; the next session continues from the draft.
  const counter = draftPath(id, dir).replace(/\.json$/, ".session.json");
  let n = 0; try { n = JSON.parse(fs.readFileSync(counter, "utf8")).answered || 0; } catch { /* first answer */ }
  n++;
  if (n >= CLEAR_AFTER) {
    fs.writeFileSync(counter, JSON.stringify({ answered: 0 }));
    console.log(`Clear now: ${CLEAR_AFTER} answers in this session. Stop here; a fresh session continues from the draft with node scripts/next_question.js ${id}.`);
    process.exit(3);
  }
  fs.writeFileSync(counter, JSON.stringify({ answered: n }));
  print(next(id, dir), id);
}

main();
