#!/usr/bin/env node
// The order statements are asked in, computed once (Brandon, 2026-11-16) from every audit at rules 7, people and
// ideologies, so one source answers many statements in a row. Within one audit, two statements are neighbours when a
// single source is cited for both (nulls ignored). Score = audits together / sqrt(audits citing each); no cut-off, the
// closest neighbour wins (ties: more audits together, then bank order). The order is one chain: start at the most
// cited statement, go to its closest neighbour not yet placed; when none is left, jump to the most cited statement not
// yet placed (never cited: bank order). next_question.js asks the first unanswered statement in it.
//   node scripts/statement-neighbours.js   writes audits/statement-neighbours.json
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), RULES = 7;
const bank = require("./lib").allStatements().map((x) => x.id), pos = Object.fromEntries(bank.map((id, i) => [id, i]));
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
  const [a, b] = k.split("|"), score = n / Math.sqrt(cited[a] * cited[b]);
  (near[a] = near[a] || []).push([b, score, n]); (near[b] = near[b] || []).push([a, score, n]);
}
const closer = (x, y) => y[1] - x[1] || y[2] - x[2] || (pos[x[0]] ?? 1e9) - (pos[y[0]] ?? 1e9);
for (const k in near) near[k].sort(closer);
const placed = new Set(), order = [];
const byCited = [...bank].sort((a, b) => (cited[b] || 0) - (cited[a] || 0) || pos[a] - pos[b]);
let cur = null;
while (order.length < bank.length) {
  const nxt = cur && (near[cur] || []).find((x) => pos[x[0]] !== undefined && !placed.has(x[0]));
  cur = nxt ? nxt[0] : byCited.find((id) => !placed.has(id));
  placed.add(cur); order.push(cur);
}
const jumps = order.filter((id, i) => i && !(near[order[i - 1]] || []).some((x) => x[0] === id)).length;
fs.writeFileSync(path.join(ROOT, "audits", "statement-neighbours.json"),
  `{"rules": ${RULES}, "audits": ${audits}, "order": [\n${order.map((id) => `  ${JSON.stringify(id)}`).join(",\n")}\n]}\n`);
console.log(`${audits} audits at rules ${RULES}: ${order.length} statements in order, ${jumps} jumps to a non-neighbour`);
