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
  return model;
}

// Answers may contain null for skipped questions; those count as "average" (no pull either way).
function project(model, answers) {
  const centered = answers.map((x, j) => (x == null ? 0 : x - model.mean[j]));
  return model.components.map((c) => dot(centered, c.vector));
}

function distance(a, b, k) {
  let s = 0;
  for (let i = 0; i < k; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

// Ranks ideologies by distance in the kept-axis subspace. Dropping the low-variance
// axes discards differences that barely separate any ideologies (mostly noise).
function match(model, answers) {
  const you = project(model, answers);
  const k = model.kept;
  let spread = 0;
  for (const a of model.ideologies) for (const b of model.ideologies) spread = Math.max(spread, distance(a.scores, b.scores, k));

  const ranked = model.ideologies
    .map((i) => {
      const d = distance(you, i.scores, k);
      return { name: i.name, profile: i.profile, scores: i.scores, distance: d, similarity: Math.max(0, 1 - d / spread) };
    })
    .sort((x, y) => x.distance - y.distance);
  return { you, ranked };
}

// Describes an axis by the questions that load on it most and the ideologies at each end.
function describeAxis(model, index, questions, count = 3) {
  const c = model.components[index];
  const byLoading = c.vector.map((w, q) => ({ q, text: questions[q], w })).sort((x, y) => y.w - x.w);
  const byScore = model.ideologies.slice().sort((x, y) => x.scores[index] - y.scores[index]);
  return {
    positive: byLoading.slice(0, count),
    negative: byLoading.slice(-count).reverse(),
    lowEnd: byScore.slice(0, 2).map((i) => i.name),
    highEnd: byScore.slice(-2).reverse().map((i) => i.name),
  };
}

if (typeof module !== "undefined") module.exports = { jacobiEigen, buildModel, project, match, describeAxis };
