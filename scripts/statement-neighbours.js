#!/usr/bin/env node
// Statement neighbours, computed once (Brandon, 2026-11-16) from every audit at rules 7, people and ideologies: within
// one audit, two statements are together when a single source is cited for both (nulls ignored). Score = audits
// together / sqrt(audits citing each); pairs together in fewer than 5 audits are dropped. next_question.js asks next
// for the closest unanswered neighbour of the last cited answer, so one source answers many statements in a row.
//   node scripts/statement-neighbours.js   writes audits/statement-neighbours.json
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), RULES = 7, MIN = 5;
const cited = {}, pairs = {};
let audits = 0;
for (const dir of ["profiles", "people"]) {
  const d = path.join(ROOT, "audits", dir);
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json"))) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(d, f), "utf8")); } catch { continue; }
    if (!j || j.rules !== RULES || !j.answers) continue;
    audits++;
    const bySource = {};
    for (const [st, a] of Object.entries(j.answers)) {
      if (!a || a.value === null || a.value === undefined) continue;
      for (const sid of a.sources || []) (bySource[sid] = bySource[sid] || new Set()).add(st);
    }
    const here = new Set(), together = new Set();
    for (const set of Object.values(bySource)) {
      const l = [...set].sort(); l.forEach((x) => here.add(x));
      for (let i = 0; i < l.length; i++) for (let k = i + 1; k < l.length; k++) together.add(`${l[i]}|${l[k]}`);
    }
    here.forEach((x) => (cited[x] = (cited[x] || 0) + 1));
    together.forEach((x) => (pairs[x] = (pairs[x] || 0) + 1));
  }
}
const near = {};
for (const [k, n] of Object.entries(pairs)) {
  if (n < MIN) continue;
  const [a, b] = k.split("|"), score = n / Math.sqrt(cited[a] * cited[b]);
  (near[a] = near[a] || []).push([b, score]); (near[b] = near[b] || []).push([a, score]);
}
const out = {};
for (const k of Object.keys(near).sort()) out[k] = near[k].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map((x) => x[0]);
const lines = Object.entries(out).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
fs.writeFileSync(path.join(ROOT, "audits", "statement-neighbours.json"),
  `{"rules": ${RULES}, "audits": ${audits}, "minTogether": ${MIN}, "near": {\n${lines.join(",\n")}\n}}\n`);
console.log(`${audits} audits at rules ${RULES}: ${Object.keys(out).length} statements with neighbours`);
