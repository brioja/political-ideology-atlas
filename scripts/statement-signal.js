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
//   statement doesn't get credit for a line it helped make. One refit per statement: the covariance
//   is computed once (leaving a statement out only drops its row and column), and the refits run in
//   worker threads, one per core. Each test's shuffles start where the serial run's would, so the
//   results don't depend on the number of workers.
// This is the bank's test 2 (audits/statements/STANDARD.md): candidates that pass are promoted,
// active statements that fail are demoted to candidates. A candidate answered by too few ideologies
// can't beat noise (with fewer answers than lines+1 any answers fit), so it waits for more audits.
// Limitation: a candidate that fills a gap may only make sense together with other new statements
// (a line that doesn't exist yet); against the current lines it shows no signal.
//
//   node scripts/statement-signal.js [--candidates] [--json] [--apply]
// --apply promotes candidates with signal and demotes active statements without it (statements.json).
// statements-check.js uses the candidate part.
"use strict";
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { buildModel, covariance, componentsOf } = require("../pca.js");

const RUNS = 60, QUANTILE = 0.95; // the lines' own test (meaningfulAxes)

// R² of y on X (rows of K scores) with an intercept, by the normal equations.
function r2(X, y) {
  const K = X.length ? X[0].length : 0;
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

// The shuffles' random numbers: one linear congruential sequence. A test of n answers draws
// RUNS * (n - 1) of them, so where each test starts in the sequence is known without running the
// tests before it.
const SEED = 12345;
const nextSeed = (seed) => (seed * 1103515245 + 12345) % 2147483648;
function skip(seed, n) { for (let i = RUNS * Math.max(0, n - 1); i > 0; i--) seed = nextSeed(seed); return seed; }
function test(X, y, seed) {
  const rand = () => ((seed = nextSeed(seed)) / 2147483648);
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

// Leave-one-out test of active statement j: the lines refit on the covariance without j's row and
// column, the answering ideologies placed on them from their centred answers without j.
function leaveOneOut({ cov, centered, K }, { j, rows, seed }) {
  const keep = cov.map((_, c) => c).filter((c) => c !== j);
  const components = componentsOf(keep.map((a) => keep.map((b) => cov[a][b]))).slice(0, K);
  const X = rows.map(([i]) => components.map((comp) => comp.vector.reduce((s, v, c) => s + v * centered[i][keep[c]], 0)));
  return test(X, rows.map(([, v]) => v), seed);
}

if (!isMainThread) {
  const data = workerData;
  parentPort.postMessage(data.tasks.map((t) => ({ j: t.j, ...leaveOneOut(data, t) })));
  return;
}

const lib = require("./lib");
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

function answersFor(id) {
  const rows = [];
  ideologies.forEach((ideo, i) => { const a = audits.get(ideo.id).answers[id]; if (a && a.value != null) rows.push([i, a.value]); });
  return rows;
}
const disagreeAgree = (vals) => ({ agree: vals.filter((v) => v > 0).length, disagree: vals.filter((v) => v < 0).length });

// Candidates, tested against the current lines (fast, synchronous). Also returns where the
// shuffles' random sequence stands after them, for the active statements' tests.
function candidateSignal() {
  const results = [];
  const full = buildModel(ideologies, { skipExtras: true });
  const fullScores = ideologies.map((i) => scores(full, i.profile));
  let seed = SEED;
  for (const s of all.filter(lib.isCandidate)) {
    const rows = answersFor(s.id);
    const t = test(rows.map(([i]) => fullScores[i]), rows.map(([, v]) => v), seed);
    seed = skip(seed, rows.length);
    results.push({ id: s.id, text: s.text, candidate: true, answered: rows.length, ...disagreeAgree(rows.map(([, v]) => v)), ...t });
  }
  return { results, seed };
}

// Results for the candidates and, unless candidatesOnly, the active statements (leave-one-out, in
// worker threads, so async).
async function signal({ candidatesOnly = false, progress = false } = {}) {
  let { results, seed } = candidateSignal();
  if (candidatesOnly) return results;
  const tasks = active.map((s, j) => {
    const rows = answersFor(s.id), task = { j, rows, seed };
    seed = skip(seed, rows.length);
    return task;
  });
  const { cov, centered } = covariance(ideologies.map((i) => i.profile));
  const workers = Math.min(require("os").availableParallelism(), tasks.length);
  let done = 0;
  const parts = await Promise.all(Array.from({ length: workers }, (_, w) => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { cov, centered, K, tasks: tasks.filter((_, t) => t % workers === w) } });
    worker.once("message", (out) => {
      done += out.length;
      if (progress && process.stderr.isTTY) process.stderr.write(`\r${done}/${active.length}`);
      resolve(out);
    });
    worker.once("error", reject);
    worker.once("exit", (code) => { if (code) reject(new Error(`worker exited with ${code}`)); });
  })));
  const byJ = new Map(parts.flat().map(({ j, ...t }) => [j, t]));
  active.forEach((s, j) => {
    const rows = tasks[j].rows;
    results.push({ id: s.id, text: s.text, candidate: false, answered: rows.length, ...disagreeAgree(rows.map(([, v]) => v)), ...byJ.get(j) });
  });
  return results;
}
module.exports = { signal, candidateSignal: () => candidateSignal().results, LINES: K, IDEOLOGIES: ideologies.length };

// Promote candidates with signal and demote active statements without it, in statements.json
// (one-line format kept). Returns the ids changed. Needs the full run (not candidatesOnly).
function apply(results) {
  const fs = require("fs"), file = require("path").join(lib.ROOT, "statements.json");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const promoted = [], demoted = [];
  const want = new Map(results.filter((r) => r.candidate === r.signal).map((r) => [r.id, r.signal ? "promote" : "demote"]));
  for (let n = 0; n < lines.length; n++) {
    const m = lines[n].match(/^(\s*)(\{"id":"([^"]+)".*\})(,?)\s*$/);
    if (!m || !want.has(m[3])) continue;
    const q = JSON.parse(m[2]);
    if (want.get(m[3]) === "promote") { delete q.status; promoted.push(q.id); }
    else { const { id, ...rest } = q; Object.keys(q).forEach((k) => delete q[k]); Object.assign(q, { id, status: "candidate", ...rest }); demoted.push(q.id); }
    lines[n] = m[1] + JSON.stringify(q) + m[4];
  }
  if (promoted.length || demoted.length) {
    const text = lines.join("\n");
    JSON.parse(text); // still valid JSON
    fs.writeFileSync(file, text);
  }
  return { promoted, demoted };
}
module.exports.apply = apply;

if (require.main === module) (async () => {
  const results = await signal({ candidatesOnly: onlyCandidates, progress: true });
  if (process.argv.includes("--apply")) {
    if (onlyCandidates) { console.error("--apply needs the full run (active statements too)"); process.exit(1); }
    const { promoted, demoted } = apply(results);
    console.log(`Promoted: ${promoted.join(", ") || "none"}\nDemoted: ${demoted.join(", ") || "none"}`);
    process.exit(0);
  }
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
})().catch((e) => { console.error(e); process.exit(1); });
