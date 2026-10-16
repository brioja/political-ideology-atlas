// PCA over the ideology x question matrix, plus projection and matching.
// No dependencies: the covariance matrix is symmetric, so the cyclic Jacobi
// method gives all eigenvalues/eigenvectors exactly enough for our sizes.

function jacobiEigen(matrix, { maxSweeps = 100, tol = 1e-12 } = {}) {
  const n = matrix.length;
  const a = matrix.map((row) => row.slice());
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < tol) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  // Columns of v are eigenvectors; return them sorted by eigenvalue, largest first.
  return a
    .map((row, i) => ({ value: Math.max(row[i], 0), vector: v.map((r) => r[i]) }))
    .sort((x, y) => y.value - x.value);
}

const dot = (x, y) => x.reduce((sum, xi, i) => sum + xi * y[i], 0);

// Builds the axes from the reference profiles. `varianceTarget` decides how many
// axes are kept: the fewest that together explain that share of the variance.
function buildModel(ideologies, opts = {}) {
  const { varianceTarget = 0.8, minAxes = 2 } = opts;
  const rows = ideologies.map((i) => i.profile);
  const m = rows.length;
  const n = rows[0].length;
  const mean = Array.from({ length: n }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / m);
  const centered = rows.map((r) => r.map((x, j) => x - mean[j]));

  const cov = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => centered.reduce((s, r) => s + r[i] * r[j], 0) / (m - 1))
  );

  const eig = jacobiEigen(cov);
  const total = eig.reduce((s, e) => s + e.value, 0);
  const components = eig
    .filter((e) => e.value / total > 1e-9) // at most m-1 components carry any variance
    .map((e) => {
      // Eigenvector signs are arbitrary; make the largest loading positive so axes are stable.
      const big = e.vector.reduce((b, x) => (Math.abs(x) > Math.abs(b) ? x : b), 0);
      const vector = big < 0 ? e.vector.map((x) => -x) : e.vector;
      return { eigenvalue: e.value, share: e.value / total, vector };
    });

  let kept = 0;
  for (let cum = 0; kept < components.length && (cum < varianceTarget || kept < minAxes); kept++) {
    cum += components[kept].share;
  }

  const model = { mean, components, kept, ideologies: [] };
  if (opts.skipExtras) return model;
  model.ideologies = ideologies.map((i) => ({ ...i, scores: project(model, i.profile) }));
  model.initialGain = nextQuestion(model, Array(n).fill(null), new Set()).gain;
  return model;
}

// Varimax rotation of the first k components: turns them within the space they span so each one is
// driven by a separate cluster of statements rather than a blend of everything, as factor analysis
// does before naming factors. Placements in that space and all matching are unchanged. Returns
// components in the same shape (unit vector, eigenvalue = variance along it, share), biggest first,
// followed by the untouched components after k.
function varimax(model, k, { iters = 100 } = {}) {
  const total = model.components.reduce((s, c) => s + c.eigenvalue, 0);
  const n = model.mean.length;
  const L = Array.from({ length: n }, (_, j) => model.components.slice(0, k).map((c) => c.vector[j] * Math.sqrt(c.eigenvalue)));
  for (let it = 0; it < iters; it++) {
    let turned = false;
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      let A = 0, B = 0, C = 0, D = 0;
      for (const r of L) { const u = r[a] ** 2 - r[b] ** 2, v = 2 * r[a] * r[b]; A += u; B += v; C += u * u - v * v; D += 2 * u * v; }
      const phi = 0.25 * Math.atan2(D - (2 * A * B) / n, C - (A * A - B * B) / n);
      if (Math.abs(phi) < 1e-10) continue;
      turned = true;
      const cs = Math.cos(phi), sn = Math.sin(phi);
      for (const r of L) { const x = r[a], y = r[b]; r[a] = cs * x + sn * y; r[b] = -sn * x + cs * y; }
    }
    if (!turned) break;
  }
  const rotated = Array.from({ length: k }, (_, a) => {
    const eigenvalue = L.reduce((s, r) => s + r[a] ** 2, 0);
    let vector = L.map((r) => r[a] / Math.sqrt(eigenvalue));
    const big = vector.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
    if (big < 0) vector = vector.map((x) => -x);
    return { eigenvalue, share: eigenvalue / total, vector };
  }).sort((x, y) => y.eigenvalue - x.eigenvalue);
  return [...rotated, ...model.components.slice(k)];
}

// The same model from parts build.js computed ahead of time (mean and the leading components), so
// the page skips the eigen-decomposition, which grows with the cube of the statement count.
function modelFromParts(ideologies, parts) {
  const model = { mean: parts.mean, components: parts.components, kept: parts.kept, labels: parts.labels || [], ideologies: [] };
  model.ideologies = ideologies.map((i) => ({ ...i, scores: project(model, i.profile) }));
  model.initialGain = nextQuestion(model, Array(parts.mean.length).fill(null), new Set()).gain;
  return model;
}

// Places a set of answers on the axes. Skipped or unasked statements are null.
// With every statement answered this is the exact projection. With only some, it is the
// least-squares fit on the first `dims` axes using just the answered statements, so
// unanswered statements don't drag the result toward the center.
function project(model, answers, dims = Math.min(model.components.length, 8)) {
  const rows = [];
  answers.forEach((x, j) => { if (x != null) rows.push(j); });
  const y = rows.map((j) => answers[j] - model.mean[j]);
  if (rows.length === answers.length) {
    return model.components.map((c) => dot(y, c.vector));
  }
  const scores = new Array(model.components.length).fill(0);
  if (rows.length === 0) return scores;

  // Solve (AᵀA + λI) s = Aᵀy, where A holds the answered rows of the first `dims` eigenvectors.
  const d = Math.min(dims, rows.length);
  const A = rows.map((j) => model.components.slice(0, d).map((c) => c.vector[j]));
  const M = Array.from({ length: d }, (_, a) =>
    Array.from({ length: d }, (_, b) => A.reduce((s, r) => s + r[a] * r[b], 0) + (a === b ? 0.05 : 0)));
  const rhs = Array.from({ length: d }, (_, a) => A.reduce((s, r, i) => s + r[a] * y[i], 0));
  const sol = solve(M, rhs);
  sol.forEach((v, i) => { scores[i] = v; });
  return scores;
}

// Gaussian elimination with partial pivoting for a small dense system.
function solve(M, b) {
  const n = b.length;
  const a = M.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r][n];
    for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k];
    x[r] = s / a[r][r];
  }
  return x;
}

const answeredIndexes = (answers) => answers.flatMap((x, j) => (x == null ? [] : [j]));

// The average gap between two sets of answers, in notches on the answer scale. An average rather
// than a root mean square, so a few one-notch differences don't weigh like real disagreement.
function gap(answers, profile, idx) {
  if (idx.length === 0) return 0;
  let s = 0;
  for (const j of idx) s += Math.abs(answers[j] - profile[j]);
  return s / idx.length;
}

// Ranks ideologies by how far their answers are from yours on the statements you answered.
// Similarity rescales that distance so 0% is as far apart as the two most distant ideologies
// are on those same statements.
// The largest distance between any two ideologies on these statements: the "0%" end of the scale.
function spreadOn(model, idx) {
  const ideos = model.ideologies;
  let spread = 0;
  for (let a = 0; a < ideos.length; a++) {
    for (let b = a + 1; b < ideos.length; b++) spread = Math.max(spread, gap(ideos[a].profile, ideos[b].profile, idx));
  }
  return spread;
}

function match(model, answers) {
  const idx = answeredIndexes(answers);
  const ideos = model.ideologies;
  const spread = spreadOn(model, idx);
  const ranked = ideos
    .map((i) => {
      const d = gap(answers, i.profile, idx);
      return { ...i, distance: d, similarity: spread ? Math.max(0, 1 - d / spread) : 0 };
    })
    .sort((x, y) => x.distance - y.distance);
  return { you: project(model, answers), ranked };
}

// The id match() would rank first, without its similarity scale (spreadOn compares every pair of
// ideologies, which dominates calibration's cost). Ties go to the earlier ideology, as in match().
function topMatch(model, answers) {
  const idx = answeredIndexes(answers);
  let best = null, bestD = Infinity;
  for (const i of model.ideologies) {
    const d = gap(answers, i.profile, idx);
    if (d < bestD) { bestD = d; best = i.id; }
  }
  return best;
}

// Ranks people on the statements both you and they have a position on, using the same 0–100%
// scale as ideologies. People sharing fewer than `minOverlap` statements with you are left out.
// Near-ties (within `tie`) go to the more widely read person, by Wikipedia page views.
function matchPeople(model, answers, people, { minOverlap = 8, tie = 0.03 } = {}) {
  const idx = answeredIndexes(answers);
  const spread = spreadOn(model, idx);
  const ranked = people
    .map((p) => {
      const both = idx.filter((j) => p.profile[j] != null);
      if (both.length < minOverlap) return null;
      const d = gap(answers, p.profile, both);
      return { ...p, distance: d, overlap: both.length, similarity: spread ? Math.max(0, 1 - d / spread) : 0 };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity);
  for (let i = 1; i < ranked.length; i++) {
    for (let j = i; j > 0 && ranked[j - 1].similarity - ranked[j].similarity < tie && ranked[j].views12m > ranked[j - 1].views12m; j--) {
      [ranked[j - 1], ranked[j]] = [ranked[j], ranked[j - 1]];
    }
  }
  return ranked;
}

// How plausible each ideology is given the answers so far: each answer multiplies an
// ideology's weight by exp(-(difference)² / 2), so a 2-point miss costs far more than a 1-point one.
function weights(model, answers) {
  const idx = answeredIndexes(answers);
  const logs = model.ideologies.map((i) => -idx.reduce((s, j) => s + (answers[j] - i.profile[j]) ** 2, 0) / 2);
  const top = Math.max(...logs);
  const w = logs.map((l) => Math.exp(l - top));
  const total = w.reduce((s, x) => s + x, 0);
  return w.map((x) => x / total);
}

// Picks the unasked statement on which the currently plausible ideologies disagree most.
// With no answers that is simply the most divisive statement overall; later it is the one
// that best separates your remaining candidates. `gain` is that weighted disagreement.
function nextQuestion(model, answers, asked) {
  const w = weights(model, answers);
  let best = null;
  for (let q = 0; q < answers.length; q++) {
    if (asked.has(q)) continue;
    let mean = 0;
    model.ideologies.forEach((i, k) => { mean += w[k] * i.profile[q]; });
    let gain = 0;
    model.ideologies.forEach((i, k) => { gain += w[k] * (i.profile[q] - mean) ** 2; });
    if (!best || gain > best.gain) best = { q, gain };
  }
  return best;
}

// How settled the result is, from 0 to 1: the share of the starting disagreement that the
// remaining statements could still resolve, or the leading ideology's weight if that is higher.
function certainty(model, answers, asked) {
  const next = nextQuestion(model, answers, asked);
  const lead = Math.max(...weights(model, answers));
  const resolved = next ? 1 - next.gain / model.initialGain : 1;
  return Math.min(1, Math.max(lead, resolved));
}

// Parallel analysis: how many axes reflect real structure rather than noise. Each run shuffles
// every statement's answers independently across ideologies (keeping each statement's spread
// but destroying any pattern between statements) and recomputes the eigenvalues. An axis
// counts as real if its eigenvalue beats the same-rank eigenvalue in `quantile` of the runs.
// Deterministic (seeded), so the result is stable between builds.
function meaningfulAxes(model, ideologies, { runs = 60, quantile = 0.95, seed = 12345 } = {}) {
  let state = seed;
  const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rows = ideologies.map((i) => i.profile);
  const m = rows.length, n = rows[0].length;
  const random = [];
  for (let run = 0; run < runs; run++) {
    const cols = Array.from({ length: n }, (_, j) => {
      const col = rows.map((r) => r[j]);
      for (let i = m - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [col[i], col[k]] = [col[k], col[i]]; }
      return col;
    });
    const shuffled = Array.from({ length: m }, (_, i) => ({ profile: cols.map((c) => c[i]) }));
    random.push(buildModel(shuffled, { skipExtras: true }).components.map((c) => c.eigenvalue));
  }
  let count = 0;
  for (const c of model.components) {
    const sorted = random.map((r) => r[count] || 0).sort((a, b) => a - b);
    if (c.eigenvalue > sorted[Math.min(runs - 1, Math.floor(quantile * runs))]) count++;
    else break;
  }
  return count;
}

// A result counts as settled when the calibrated chance that the top match holds is at least this
// (see calibrateCertainty). test.js's simulated takers stop here; the quiz (app.js) waits for 100%.
const SETTLE = { hold: 0.9 };
function isSettled(model, calibration, answers, asked) {
  const h = stability(calibration, certainty(model, answers, asked));
  return h != null && h >= SETTLE.hold;
}

// Calibration: turns the quiz's "how settled" reading into an honest probability. Simulated takers
// (each ideology's answers, ~20% nudged by one point) answer every statement in the adaptive order;
// at each step we record the reading and whether their top match then is their final top match.
// The result is, per tenth of the reading, the share whose top match held (made non-decreasing).
function calibrateCertainty(model, { takers = 200, seed = 11 } = {}) {
  let state = seed;
  const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const ideos = model.ideologies;
  const reps = Math.max(1, Math.ceil(takers / ideos.length));
  const held = Array.from({ length: 10 }, () => [0, 0]);
  for (let rep = 0; rep < reps; rep++) {
    for (const ideo of ideos) {
      const truth = ideo.profile.map((x) => (rand() < 0.2 ? Math.max(-2, Math.min(2, x + (rand() < 0.5 ? -1 : 1))) : x));
      const answers = Array(truth.length).fill(null);
      const asked = new Set();
      const steps = [];
      for (;;) {
        const next = nextQuestion(model, answers, asked);
        if (!next) break;
        asked.add(next.q);
        answers[next.q] = truth[next.q];
        steps.push({ c: certainty(model, answers, asked), top: topMatch(model, answers) });
      }
      const final = topMatch(model, answers);
      for (const st of steps) {
        const bin = held[Math.min(9, Math.floor(st.c * 10))];
        bin[1]++;
        if (st.top === final) bin[0]++;
      }
    }
  }
  // Readings no simulated taker produced stay null (shown as words, never a made-up number).
  const out = [];
  let floor = 0;
  for (const [h, n] of held) {
    if (!n) { out.push(null); continue; }
    floor = Math.max(floor, h / n);
    out.push(floor);
  }
  return out;
}

// The calibrated chance that the current top match will hold, for a "how settled" reading.
const stability = (calibration, c) => calibration[Math.min(9, Math.floor(c * 10))];

// Salience: can a record place someone precisely enough to tell them apart from their neighbours?
// Depends only on WHICH statements have a recorded position, never on the answers, so unusual
// views are not penalized. Bayesian: before any evidence, a position is as spread out as the
// ideologies are on each dividing line (the eigenvalues); each recorded statement narrows that
// along the lines it measures, weighted by the leftover noise per statement (the variance the
// real lines don't explain). The bar is the resolution: the median distance, on the real lines,
// between an ideology and its nearest neighbour. A record less precise than that can't say which
// of two neighbouring ideologies it is closer to, so it isn't matched against.
function salienceContext(model, ideologies, { lines } = {}) {
  const k = Math.max(2, Math.min(lines ?? meaningfulAxes(model, ideologies), model.components.length));
  const n = model.mean.length;
  const noise = model.components.slice(k).reduce((s, c) => s + c.eigenvalue, 0) / n || 1e-6;
  const dist = (a, b) => Math.sqrt(a.slice(0, k).reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
  const gaps = model.ideologies
    .map((a) => Math.min(...model.ideologies.filter((b) => b !== a).map((b) => dist(a.scores, b.scores))))
    .sort((x, y) => x - y);
  const ctx = { model, k, noise, resolution: gaps[Math.floor(gaps.length / 2)] };
  ctx.bar = ctx.resolution;
  return ctx;
}

function placementUncertainty(ctx, knownIdx) {
  const { model, k, noise } = ctx;
  const comps = model.components.slice(0, k);
  const M = comps.map((ca, a) => comps.map((cb, b) =>
    (a === b ? 1 / ca.eigenvalue : 0) + knownIdx.reduce((s, j) => s + ca.vector[j] * cb.vector[j], 0) / noise));
  // Trace of M⁻¹: solve M x = e_i for each axis.
  let trace = 0;
  for (let i = 0; i < k; i++) trace += solve(M, comps.map((_, j) => (j === i ? 1 : 0)))[i];
  return Math.sqrt(trace);
}

function salience(ctx, profile) {
  const known = profile.flatMap((x, j) => (x == null ? [] : [j]));
  const uncertainty = placementUncertainty(ctx, known);
  return { known: known.length, uncertainty, bar: ctx.bar, salient: uncertainty <= ctx.bar };
}

// Describes an axis by the statements that load on it most and the ideologies at each end.
function describeAxis(model, index, questions, count = 3) {
  const c = model.components[index];
  const byLoading = c.vector.map((w, q) => ({ q, text: questions[q].text, w })).sort((x, y) => y.w - x.w);
  const byScore = model.ideologies.slice().sort((x, y) => x.scores[index] - y.scores[index]);
  return {
    positive: byLoading.slice(0, count),
    negative: byLoading.slice(-count).reverse(),
    lowEnd: byScore.slice(0, 2).map((i) => i.name),
    highEnd: byScore.slice(-2).reverse().map((i) => i.name),
  };
}

if (typeof module !== "undefined") {
  module.exports = { jacobiEigen, buildModel, modelFromParts, varimax, project, match, matchPeople, weights, nextQuestion, certainty, calibrateCertainty, stability, isSettled, meaningfulAxes, salienceContext, salience, describeAxis, SETTLE };
}
