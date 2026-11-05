// Report: which statements carry signal on the real dividing lines, by the same test that decides
// which lines are real (meaningfulAxes in pca.js: beat shuffled noise at the 95th percentile of 60
// shuffles). Matching uses line distance only, so a statement whose answers the lines don't predict
// better than shuffled answers changes no match.
//
// For each statement: the ideologies that answer it (non-null), their positions on the real lines,
// and R² of predicting the answers from those positions (least squares with an intercept). Null: the
// same answers shuffled among the same ideologies, 60 times. Signal = R² above the null's 95th
// percentile.
//   Candidates: tested against the current lines (built from the active statements).
//   Active statements: tested against lines refit without that statement (leave-one-out), so a
//   statement doesn't get credit for a line it helped make. Slow: one refit per statement.
// This is the bank's test 2 (audits/statements/STANDARD.md): candidates that pass are promoted,
// active statements that fail are demoted to candidates. A candidate answered by too few ideologies
// can't beat noise (with fewer answers than lines+1 any answers fit), so it waits for more audits.
// Limitation: a candidate that fills a gap may only make sense together with other new statements
// (a line that doesn't exist yet); against the current lines it shows no signal.
//
//   node scripts/statement-signal.js [--candidates] [--json]
// statements-check.js uses the candidate part.
"use strict";
const lib = require("./lib");
const { buildModel } = require("../pca.js");

const RUNS = 60, QUANTILE = 0.95; // the lines' own test (meaningfulAxes)
const K = lib.readJson(require("path").join(lib.ROOT, "audits", "lines.json")).realLines;
const onlyCandidates = process.argv.includes("--candidates");

const all = lib.allStatements();
const active = lib.activeStatements();
const ideologies = lib.completeIdeologies(active);
const audits = new Map(ideologies.map((i) => [i.id, lib.readJson(lib.profilePath(i.id))]));

function scores(model, profile) {
  const c = profile.map((x, j) => (x == null ? 0 : x - model.mean[j]));
  return model.components.slice(0, K).map((comp) => comp.vector.reduce((s, v, j) => s + v * c[j], 0));
}

// R² of y on X (rows of K scores) with an intercept, by the normal equations.
function r2(X, y) {
  const n = y.length, p = K + 1;
  if (n <= p) return 1;
  const A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
  for (let r = 0; r < n; r++) {
    const x = [1, ...X[r]];
    for (let i = 0; i < p; i++) { b[i] += x[i] * y[r]; for (let j = 0; j < p; j++) A[i][j] += x[i] * x[j]; }
  }
  for (let i = 0; i < p; i++) A[i][i] += 1e-9;
  // Gaussian elimination
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < p; c++) {
    let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < p; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= p; k++) M[r][k] -= f * M[c][k]; }
  }
  const beta = M.map((row, i) => row[p] / row[i]);
  const mean = y.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0, ssRes = 0;
  for (let r = 0; r < n; r++) {
    const x = [1, ...X[r]]; const fit = x.reduce((s, v, i) => s + v * beta[i], 0);
    ssRes += (y[r] - fit) ** 2; ssTot += (y[r] - mean) ** 2;
  }
  return ssTot ? 1 - ssRes / ssTot : 0;
}

let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
function test(X, y) {
  const real = r2(X, y);
  const nulls = [];
  for (let run = 0; run < RUNS; run++) {
    const s = [...y];
    for (let i = s.length - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [s[i], s[k]] = [s[k], s[i]]; }
    nulls.push(r2(X, s));
  }
  nulls.sort((a, b) => a - b);
  const bar = nulls[Math.min(RUNS - 1, Math.floor(QUANTILE * RUNS))];
  return { r2: real, bar, signal: real > bar };
}

function answersFor(id) {
  const rows = [];
  ideologies.forEach((ideo, i) => { const a = audits.get(ideo.id).answers[id]; if (a && a.value != null) rows.push([i, a.value]); });
  return rows;
}
const disagreeAgree = (vals) => ({ agree: vals.filter((v) => v > 0).length, disagree: vals.filter((v) => v < 0).length });

// Results for the candidates (fast: the current lines) and, unless candidatesOnly, the active
// statements (leave-one-out: one refit each, minutes).
function signal({ candidatesOnly = false, progress = false } = {}) {
  const results = [];
  const full = buildModel(ideologies, { skipExtras: true });
  const fullScores = ideologies.map((i) => scores(full, i.profile));
  for (const s of all.filter(lib.isCandidate)) {
    const rows = answersFor(s.id);
    const t = test(rows.map(([i]) => fullScores[i]), rows.map(([, v]) => v));
    results.push({ id: s.id, text: s.text, candidate: true, answered: rows.length, ...disagreeAgree(rows.map(([, v]) => v)), ...t });
  }
  if (!candidatesOnly) {
    active.forEach((s, j) => {
      const loo = ideologies.map((i) => ({ profile: i.profile.filter((_, c) => c !== j) }));
      const model = buildModel(loo, { skipExtras: true });
      const rows = answersFor(s.id);
      const t = test(rows.map(([i]) => scores(model, loo[i].profile)), rows.map(([, v]) => v));
      results.push({ id: s.id, text: s.text, candidate: false, answered: rows.length, ...disagreeAgree(rows.map(([, v]) => v)), ...t });
      if (progress && process.stderr.isTTY) process.stderr.write(`\r${j + 1}/${active.length}`);
    });
  }
  return results;
}
module.exports = { signal, LINES: K, IDEOLOGIES: ideologies.length };

if (require.main === module) {
  const results = signal({ candidatesOnly: onlyCandidates, progress: true });
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ lines: K, ideologies: ideologies.length, results }, null, 1) + "\n");
  } else {
    const f = (x) => x.toFixed(2);
    const show = (r) => `  ${r.id}  R² ${f(r.r2)} vs noise ${f(r.bar)}  (${r.answered} answered: ${r.agree} agree, ${r.disagree} disagree)\n    ${r.text}`;
    console.log(`${ideologies.length} complete ideology audits, ${K} real lines, ${RUNS} shuffles at the ${QUANTILE * 100}th percentile.`);
    for (const cand of [true, false]) {
      const rs = results.filter((r) => r.candidate === cand);
      if (!rs.length) continue;
      const yes = rs.filter((r) => r.signal).sort((a, b) => b.r2 - b.bar - (a.r2 - a.bar));
      const no = rs.filter((r) => !r.signal).sort((a, b) => b.answered - a.answered);
      console.log(`\n${cand ? "Candidates" : "Active statements"}: ${yes.length}/${rs.length} carry signal on the lines.`);
      if (cand && yes.length) console.log(`Ready to promote:\n${yes.map(show).join("\n")}`);
      if (no.length) console.log(`${cand ? "Waiting (no signal yet)" : "No signal: demote to candidate"}:\n${no.map(show).join("\n")}`);
    }
  }
}
