#!/usr/bin/env node
// Size cap on what an auditor reads before answering (Brandon, 2026-11-16): the instruction files and the headers of
// the scripts it is told to read. Their total may not grow past the cap in audits/auditor-input-cap.json, so a new rule
// has to replace words rather than add them. Run by test.js and the local pre-push hook; a failure blocks the push.
//   node scripts/auditor-input-size.js   exit 1 over the cap; under it, the cap is lowered to the new total (it never
//                                        rises here: raising it is an edit to the cap file, a maintainer's decision)
"use strict";
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");
const CAP_FILE = path.join(ROOT, "audits", "auditor-input-cap.json");
// Whole files the auditor reads, and scripts whose leading comment block is their instructions.
const FILES = ["AGENTS.md", "audits/AUDIT_RULES.md", "audits/PROMPT_PEOPLE.md", "audits/PROMPT.md", "audits/PROMPT_LANE.md"];
const HEADERS = ["scripts/next_question.js", "scripts/search.js", "scripts/answer.js"];

function header(text) {
  const lines = text.split("\n"), out = [];
  for (const l of lines) { if (/^#!/.test(l)) continue; if (/^\s*\/\//.test(l)) out.push(l); else if (out.length) break; }
  return out.join("\n");
}
function sizes() {
  const parts = [];
  for (const f of FILES) { try { parts.push([f, Buffer.byteLength(fs.readFileSync(path.join(ROOT, f), "utf8"))]); } catch { /* absent */ } }
  for (const f of HEADERS) { try { parts.push([`${f} (header)`, Buffer.byteLength(header(fs.readFileSync(path.join(ROOT, f), "utf8")))]); } catch { /* absent */ } }
  return parts;
}

if (require.main === module) {
  const parts = sizes(), total = parts.reduce((t, [, b]) => t + b, 0);
  let cap = null; try { cap = JSON.parse(fs.readFileSync(CAP_FILE, "utf8")).bytes; } catch { /* first run */ }
  const fmt = (n) => n.toLocaleString("en-US");
  if (cap === null) {
    fs.writeFileSync(CAP_FILE, JSON.stringify({ bytes: total, set: new Date().toISOString().slice(0, 10) }, null, 1) + "\n");
    console.log(`auditor inputs: ${fmt(total)} bytes; cap set to that`);
    process.exit(0);
  }
  if (total > cap) {
    console.error(`auditor inputs are ${fmt(total)} bytes, over the cap of ${fmt(cap)} by ${fmt(total - cap)}. Cut words elsewhere in:`);
    for (const [f, b] of parts) console.error(`  ${fmt(b).padStart(8)}  ${f}`);
    process.exit(1);
  }
  if (total < cap) {
    fs.writeFileSync(CAP_FILE, JSON.stringify({ bytes: total, set: new Date().toISOString().slice(0, 10) }, null, 1) + "\n");
    console.log(`auditor inputs: ${fmt(total)} bytes; cap lowered from ${fmt(cap)}`);
  } else console.log(`auditor inputs: ${fmt(total)} of ${fmt(cap)} bytes`);
}
module.exports = { sizes };
