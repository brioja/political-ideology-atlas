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
function buildModel(ideologies, { varianceTarget = 0.8, minAxes = 2 } = {}) {
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
  model.ideologies = ideologies.map((i) => ({ ...i, scores: project(model, i.profile) }));
  model.initialGain = nextQuestion(model, Array(n).fill(null), new Set()).gain;
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

function rms(answers, profile, idx) {
  if (idx.length === 0) return 0;
  let s = 0;
  for (const j of idx) s += (answers[j] - profile[j]) ** 2;
  return Math.sqrt(s / idx.length);
}

// Ranks ideologies by how far their answers are from yours on the statements you answered.
// Similarity rescales that distance so 0% is as far apart as the two most distant ideologies
// are on those same statements.
function match(model, answers) {
  const idx = answeredIndexes(answers);
  const ideos = model.ideologies;
  let spread = 0;
  for (let a = 0; a < ideos.length; a++) {
    for (let b = a + 1; b < ideos.length; b++) spread = Math.max(spread, rms(ideos[a].profile, ideos[b].profile, idx));
  }
  const ranked = ideos
    .map((i) => {
      const d = rms(answers, i.profile, idx);
      return { ...i, distance: d, similarity: spread ? Math.max(0, 1 - d / spread) : 0 };
    })
    .sort((x, y) => x.distance - y.distance);
  return { you: project(model, answers), ranked };
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
  module.exports = { jacobiEigen, buildModel, project, match, weights, nextQuestion, certainty, describeAxis };
}
