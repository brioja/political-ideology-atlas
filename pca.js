// PCA over the ideology x question matrix, plus projection and matching.
// No dependencies: the covariance matrix is symmetric, so Householder reduction to tridiagonal form
// and the implicit QL method (tred2 + tql2, as in EISPACK/JAMA) give all eigenvalues/eigenvectors.

function symmetricEigen(matrix) {
  const n = matrix.length;
  const V = matrix.map((row) => Float64Array.from(row));
  const d = new Float64Array(n), e = new Float64Array(n);

  // tred2
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; }
    } else {
      for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
      let f = d[i - 1];
      let g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g;
      h -= f * g;
      d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j];
        V[j][i] = f;
        g = e[j] + V[j][j] * f;
        for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        f = d[j]; g = e[j];
        for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
        d[j] = V[i - 1][j];
        V[i][j] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i];
    V[i][i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; }
  V[n - 1][n - 1] = 1;
  e[0] = 0;

  // tql2
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  let f = 0, tst1 = 0;
  const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n && Math.abs(e[m]) > eps * tst1) m++;
    if (m > l) {
      do {
        let g = d[l];
        let p = (d[l + 1] - g) / (2 * e[l]);
        let r = Math.hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l] / (p + r);
        d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1];
        let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m];
        let c = 1, c2 = c, c3 = c, s = 0, s2 = 0;
        const el1 = e[l + 1];
        for (let i = m - 1; i >= l; i--) {
          c3 = c2; c2 = c; s2 = s;
          g = c * e[i];
          h = c * p;
          r = Math.hypot(p, e[i]);
          e[i + 1] = s * r;
          s = e[i] / r;
          c = p / r;
          p = c * d[i] - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]);
          for (let k = 0; k < n; k++) {
            h = V[k][i + 1];
            V[k][i + 1] = s * V[k][i] + c * h;
            V[k][i] = c * V[k][i] - s * h;
          }
        }
        p = (-s * s2 * c3 * el1 * e[l]) / dl1;
        e[l] = s * p;
        d[l] = c * p;
      } while (Math.abs(e[l]) > eps * tst1);
    }
    d[l] += f;
    e[l] = 0;
  }

  // Columns of V are eigenvectors; return them sorted by eigenvalue, largest first.
  return Array.from(d, (value, i) => ({ value: Math.max(value, 0), vector: V.map((r) => r[i]) }))
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
  // An ideology with no known position on a statement (null) is filled with that statement's mean
  // over the ideologies that have one, so after centring it adds nothing to the lines.
  const mean = Array.from({ length: n }, (_, j) => {
    let s = 0, c = 0;
    for (const r of rows) if (r[j] != null) { s += r[j]; c++; }
    return c ? s / c : 0;
  });
  const centered = rows.map((r) => r.map((x, j) => (x == null ? 0 : x - mean[j])));

  const cov = Array.from({ length: n }, () => new Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let r = 0; r < m; r++) s += centered[r][i] * centered[r][j];
      cov[i][j] = cov[j][i] = s / (m - 1);
    }
  }

  const eig = symmetricEigen(cov);
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
  // The real lines are counted on this bare model (parallel analysis) before anything is placed on
  // them; the build counts them once and passes `realLines` in.
  model.realLines = opts.realLines ?? meaningfulAxes(model, ideologies);
  model.ideologies = ideologies.map((i) => ({ ...i, scores: project(model, i.profile), at: place(model, i.profile) }));
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
// `placement`: the shipped placement context (PLACEMENT in data.js), which the quiz's next-question
// selector needs (plausibility); the shipped parts hold too few components to work it out.
function modelFromParts(ideologies, parts, placement = null) {
  const model = { mean: parts.mean, components: parts.components, kept: parts.kept, labels: parts.labels || [], span: parts.span, realLines: parts.realLines,
    placement: placementFromParts(placement), ideologies: [] };
  // When every shipped line is a real one (the usual case), an ideology's scores are its place, so
  // each is projected once.
  model.ideologies = ideologies.map((i) => {
    const at = place(model, i.profile);
    return { ...i, scores: at && at.length === model.components.length ? at : project(model, i.profile), at };
  });
  model.initialGain = nextQuestion(model, Array(parts.mean.length).fill(null), new Set()).gain;
  return model;
}

// Places a set of answers on the axes. Skipped or unasked statements are null, and so are
// statements an ideology has no known position on, so ideologies are placed the same way.
// With every statement answered this is the exact projection. With only some, the unanswered
// statements are filled in from a least-squares fit of the answered ones on every axis, then
// projected the same way, so they don't drag the result toward the center. (The fit's coefficients
// aren't scores themselves: the rotated axes aren't orthogonal, and ideologies are placed by projection.)
// Only the first `dims` scores are returned (all by default).
function project(model, answers, dims = model.components.length) {
  const out = model.components.slice(0, dims);
  const rows = [];
  answers.forEach((x, j) => { if (x != null) rows.push(j); });
  if (rows.length === answers.length) {
    const y = answers.map((x, j) => x - model.mean[j]);
    return out.map((c) => dot(y, c.vector));
  }
  if (rows.length === 0) return new Array(out.length).fill(0);
  const { sol } = lineFit(model, answers);
  const full = answers.map((x, j) => (x != null ? x - model.mean[j]
    : sol.reduce((s, v, i) => s + v * model.components[i].vector[j], 0)));
  return out.map((c) => dot(full, c.vector));
}

// The least-squares fit of the answered statements on the real lines (matchLines), so the build, the
// tests and the page place alike: solves (AᵀA + λI) s = Aᵀy, where A holds the answered rows of the
// line vectors. `sol` are coefficients on the line vectors, not scores (the rotated lines aren't
// orthogonal), so the fitted answer to statement j is mean[j] + Σ sol[i] · vector[i][j].
function lineFit(model, answers) {
  const rows = answeredIndexes(answers);
  const y = rows.map((j) => answers[j] - model.mean[j]);
  const d = Math.min(matchLines(model), rows.length);
  const A = rows.map((j) => model.components.slice(0, d).map((c) => c.vector[j]));
  const M = Array.from({ length: d }, (_, a) =>
    Array.from({ length: d }, (_, b) => A.reduce((s, r) => s + r[a] * r[b], 0) + (a === b ? 0.05 : 0)));
  const rhs = Array.from({ length: d }, (_, a) => A.reduce((s, r, i) => s + r[a] * y[i], 0));
  return { rows, y, A, sol: solve(M, rhs) };
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

// ---- The fit measure ------------------------------------------------------------------------------
// Everything that says how close a set of answers is to a profile is here, implemented once:
// placement (answers -> a position), the distance between two positions, the similarity scale
// (0-100%), how precisely the answers place you (s, which also tells the quiz you're done) and the
// plausibility the quiz's next-question selector weights ideologies by. Every
// ranking (match(), topMatch(), matchPeople(), the Compare page), the selector and its progress
// (weights()) and the calibration go through these functions only, so changing the measure here
// changes them all together and they cannot drift apart.
//
// Fit is distance on the real dividing lines (matchLines). Comparing statement by statement favoured
// whoever had answered the most and whoever held the mildest views, and two sparse records often
// share few statements. Silence (null) is never scored, as "Neither" or as disagreement: a decision,
// not a default (test.js checks it). Placement solves the real lines from the answered statements
// only (see project), and with nothing answered there is no position at all.

// Where a set of answers sits on the real lines, or null with nothing answered.
function place(model, answers) {
  if (!answers.some((x) => x != null)) return null;
  return project(model, answers, matchLines(model));
}

// The distance between two positions (Euclidean, on the real lines). No position is no basis for a match.
function distance(a, b) {
  if (!a || !b) return Infinity;
  let s = 0;
  for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s);
}

// The distances from a set of answers to each of `positions` (from place()), or null with nothing
// answered: no basis to rank anyone, rather than everyone measured from the centre.
function fitTo(model, answers, positions) {
  const you = place(model, answers);
  return you && positions.map((at) => distance(you, at));
}

// The similarity scale's 0% end: the largest distance between two shown ideologies. Fixed for a model,
// whatever was answered; the build ships it (MODEL.span), so the page doesn't compare every pair.
function fitScale(model) {
  if (model.span == null) {
    const at = model.ideologies.map((i) => i.at);
    let span = 0;
    for (let a = 0; a < at.length; a++) for (let b = a + 1; b < at.length; b++) span = Math.max(span, distance(at[a], at[b]));
    model.span = span;
  }
  return model.span;
}

// A distance as a similarity: 100% at the same position, 0% as far apart as the two most distant ideologies.
const similarity = (model, d) => {
  const span = fitScale(model);
  return span && d != null ? Math.max(0, 1 - d / span) : 0;
};

// s: how precisely the answers place you on the real lines (the expected distance from your true
// place; placementUncertainty), with the landscape's noise per statement (the variance ideology
// profiles leave off the real lines, as salience uses), so it only shrinks as you answer. Always
// positive and finite: it starts from the ideologies' own spread on each line.
function placementSpread(model, answers) {
  return placementUncertainty(placementOf(model), answeredIndexes(answers));
}

// How precisely a set of answers places someone, in units of the typical gap between neighbouring
// ideologies (the placement context's bar): 1 means s is about one such gap. The quiz says you're done
// at a fixed precision (app.js), so a taker between two ideologies isn't asked every statement.
function placementPrecision(model, answers) {
  if (!answers.some((x) => x != null)) return 0;
  return placementOf(model).bar / placementSpread(model, answers);
}

// How plausible each ideology is given the answers so far (weights summing to 1), from its distance
// `d` (fitTo): a Gaussian, exp(-d² / 2s²), whose width s is how precisely the answers place you
// (placementSpread, the same s that tells the quiz you're done), so there is no tuning constant. Few
// answers place you loosely and every nearby ideology stays in play; more answers narrow
// it down. Before any answer (d null) all weigh the same.
function plausibility(model, answers, d) {
  const m = model.ideologies.length;
  if (!d) return new Array(m).fill(1 / m);
  const s = placementSpread(model, answers);
  const logs = d.map((x) => -(x * x) / (2 * s * s));
  const top = Math.max(...logs);
  const w = logs.map((l) => Math.exp(l - top));
  const total = w.reduce((t, x) => t + x, 0);
  return w.map((x) => x / total);
}

// The placement context plausibility() measures with: shipped (modelFromParts), or worked out from a
// model built here (buildModel), which has every component.
function placementOf(model) {
  if (model.placement === undefined) model.placement = salienceContext(model);
  if (!model.placement) throw new Error("This model has no placement context: pass PLACEMENT to modelFromParts.");
  return model.placement;
}
// ---- End of the fit measure -----------------------------------------------------------------------

// Ranks ideologies by fit, nearest first, with each one's similarity. With nothing answered there is
// no basis to rank: every ideology is at distance 0 and 0% similarity, in catalog order.
function match(model, answers) {
  const d = fitTo(model, answers, model.ideologies.map((i) => i.at));
  const ranked = model.ideologies
    .map((i, k) => ({ ...i, distance: d ? d[k] : 0, similarity: d ? similarity(model, d[k]) : 0 }))
    .sort((x, y) => x.distance - y.distance);
  return { you: project(model, answers), ranked };
}

// The index of the smallest distance; ties (and no basis at all) go to the earlier one, as in match().
function nearest(d) {
  let best = 0;
  if (d) for (let k = 1; k < d.length; k++) if (d[k] < d[best]) best = k;
  return best;
}
// The id match() would rank first, without sorting or similarities.
const topMatch = (model, answers) => model.ideologies[nearest(fitTo(model, answers, model.ideologies.map((i) => i.at)))].id;

// The dividing lines that are real (they beat shuffled noise, see meaningfulAxes): matching, placing
// answers and the quiz's progress all use these, whatever the page has room to show
// (MAX_SHOWN_LINES). Counted once per model (buildModel) and shipped with it (build.js).
function matchLines(model) {
  if (model.realLines == null) throw new Error("This model has no count of real lines (realLines): build it with buildModel or ship it from build.js.");
  return Math.min(model.components.length, model.realLines);
}

// Ranks people (or any profiles: the Compare page ranks one ideology against another this way) by fit,
// on the same scale as ideologies. Near-ties (within `tie`) go to the more widely read person, by
// Wikipedia page views. Nothing answered: an empty list.
function matchPeople(model, answers, people, { tie = 0.03 } = {}) {
  const d = fitTo(model, answers, people.map((p) => place(model, p.profile)));
  if (!d) return [];
  const ranked = people.map((p, k) => ({ ...p, distance: d[k], similarity: similarity(model, d[k]) }))
    .sort((a, b) => b.similarity - a.similarity);
  for (let i = 1; i < ranked.length; i++) {
    for (let j = i; j > 0 && ranked[j - 1].similarity - ranked[j].similarity < tie && ranked[j].views12m > ranked[j - 1].views12m; j--) {
      [ranked[j - 1], ranked[j]] = [ranked[j], ranked[j - 1]];
    }
  }
  return ranked;
}

// How plausible each ideology is given the answers so far (see plausibility).
const weights = (model, answers) => plausibility(model, answers, fitTo(model, answers, model.ideologies.map((i) => i.at)));

// Picks the unasked statement on which the currently plausible ideologies disagree most.
// With no answers that is simply the most divisive statement overall; later it is the one
// that best separates your remaining candidates. `gain` is that weighted disagreement.
function nextQuestion(model, answers, asked) {
  const w = weights(model, answers);
  let best = null;
  for (let q = 0; q < answers.length; q++) {
    if (asked.has(q)) continue;
    // Only ideologies with a position on it can be told apart by it.
    let mean = 0, known = 0;
    model.ideologies.forEach((i, k) => { if (i.profile[q] != null) { mean += w[k] * i.profile[q]; known += w[k]; } });
    if (known) mean /= known;
    let gain = 0;
    model.ideologies.forEach((i, k) => { if (i.profile[q] != null) gain += w[k] * (i.profile[q] - mean) ** 2; });
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

// The most dividing lines the site shows (and build.js names and rotates for), however many beat noise.
const MAX_SHOWN_LINES = 8;

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
// It is the slowest part of the build, so each step measures fit once (fitTo, as weights() and
// topMatch() do) and inlines nextQuestion() and certainty() over a packed typed array, in the same
// arithmetic order.
function calibrateCertainty(model, { takers = 200, seed = 11 } = {}) {
  let state = seed;
  const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const ideos = model.ideologies;
  const m = ideos.length, n = ideos[0].profile.length;
  const positions = ideos.map((i) => i.at);
  // NaN marks no known position, which nextQuestion() leaves out.
  const colMajor = new Float64Array(n * m);
  ideos.forEach((i, k) => i.profile.forEach((x, q) => { colMajor[q * m + k] = x ?? NaN; }));
  const answers = new Array(n), asked = new Uint8Array(n);
  let w, d;

  // weights() and topMatch(), from one fit measurement.
  const measure = () => { d = fitTo(model, answers, positions); w = plausibility(model, answers, d); };
  // nextQuestion(): the unasked statement with the largest weighted disagreement.
  const next = () => {
    let bestQ = -1, bestGain = 0;
    for (let q = 0; q < n; q++) {
      if (asked[q]) continue;
      const base = q * m;
      let mean = 0, known = 0;
      for (let k = 0; k < m; k++) { const x = colMajor[base + k]; if (x === x) { mean += w[k] * x; known += w[k]; } }
      if (known) mean /= known;
      let gain = 0;
      for (let k = 0; k < m; k++) { const x = colMajor[base + k]; if (x === x) gain += w[k] * (x - mean) ** 2; }
      if (bestQ < 0 || gain > bestGain) { bestQ = q; bestGain = gain; }
    }
    return bestQ < 0 ? null : { q: bestQ, gain: bestGain };
  };

  const reps = Math.max(1, Math.ceil(takers / m));
  const held = Array.from({ length: 10 }, () => [0, 0]);
  for (let rep = 0; rep < reps; rep++) {
    for (const ideo of ideos) {
      const truth = ideo.profile.map((x) => (rand() < 0.2 && x != null ? Math.max(-2, Math.min(2, x + (rand() < 0.5 ? -1 : 1))) : x));
      asked.fill(0);
      answers.fill(null);
      measure();
      const steps = [];
      let ask = next();
      while (ask) {
        asked[ask.q] = 1;
        // A statement its ideology has no position on, the simulated taker skips ("No opinion").
        if (truth[ask.q] != null) answers[ask.q] = truth[ask.q];
        measure();
        ask = next(); // certainty() reads the same next question the loop asks after this one
        let lead = -Infinity;
        for (let k = 0; k < m; k++) if (w[k] > lead) lead = w[k];
        const resolved = ask ? 1 - ask.gain / model.initialGain : 1;
        steps.push({ c: Math.min(1, Math.max(lead, resolved)), top: nearest(d) });
      }
      const final = nearest(d);
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
  for (const [h, cnt] of held) {
    if (!cnt) { out.push(null); continue; }
    floor = Math.max(floor, h / cnt);
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
  const k = Math.max(2, Math.min(lines ?? matchLines(model), model.components.length));
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

// `noise`: the variance per statement off the real lines (the landscape's; salience and a taker's s).
function placementUncertainty(ctx, knownIdx, noise = ctx.noise) {
  const { model, k } = ctx;
  const comps = model.components.slice(0, k);
  const M = comps.map((ca, a) => comps.map((cb, b) =>
    (a === b ? 1 / ca.eigenvalue : 0) + knownIdx.reduce((s, j) => s + ca.vector[j] * cb.vector[j], 0) / noise));
  // Trace of M⁻¹: solve M x = e_i for each axis.
  let trace = 0;
  for (let i = 0; i < k; i++) trace += solve(M, comps.map((_, j) => (j === i ? 1 : 0)))[i];
  return Math.sqrt(trace);
}

// The placement context salience() needs, rebuilt from what the build ships (PLACEMENT in data.js):
// the page's MODEL carries only the rotated lines, not the unrotated components or the noise level.
function placementFromParts(parts) {
  return parts && { model: { components: parts.components }, k: parts.k, noise: parts.noise, bar: parts.bar };
}

// How precisely a record places someone on every real line, not only overall: each line gets an equal
// share of the bar, since an error of the same size moves a distance equally on any line. The worst
// line counts, scaled back to the whole (sqrt(k) times its error) so it compares with the bar. A record
// precise on a few lines and silent on the rest (a single-cause ideology) sits by default near the
// middle of the lines it doesn't address, and would match takers there; it fails here. A narrow line,
// which barely changes any distance, is uncertain by little even with no answers, so it rarely decides.
function lineUncertainty(ctx, knownIdx) {
  const { model, k, noise } = ctx;
  const comps = model.components.slice(0, k);
  const M = comps.map((ca, a) => comps.map((cb, b) =>
    (a === b ? 1 / ca.eigenvalue : 0) + knownIdx.reduce((s, j) => s + ca.vector[j] * cb.vector[j], 0) / noise));
  const worst = Math.max(...comps.map((_, i) => solve(M, comps.map((_, j) => (j === i ? 1 : 0)))[i]));
  return Math.sqrt(k * worst);
}

function salience(ctx, profile) {
  const known = profile.flatMap((x, j) => (x == null ? [] : [j]));
  const uncertainty = lineUncertainty(ctx, known);
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
    // The line's cluster: its strongest statements whichever end they point to, among those mostly
    // about this line (over half their squared weight across the named lines is on it), so one shared
    // with another line isn't shown as this line's. A rotated line usually loads on one end only.
    cluster: byLoading.filter((p) => {
      const lines = model.components.slice(0, model.labels ? model.labels.length : index + 1);
      return p.w * p.w > lines.reduce((s, l) => s + l.vector[p.q] ** 2, 0) / 2;
    }).sort((x, y) => Math.abs(y.w) - Math.abs(x.w)).slice(0, count * 2),
    lowEnd: byScore.slice(0, 2).map((i) => i.name),
    highEnd: byScore.slice(-2).reverse().map((i) => i.name),
  };
}

// Share links carry only the answers: "3." + one character per slot in SHARE_SLOTS
// (audits/share-slots.json, append-only), 0-4 for strongly disagree..strongly agree and "-" for
// skipped, not asked or no longer asked. Trailing "-" are dropped, and a shorter string reads its
// missing slots as not asked, so links keep working as statements are added. "2." links (before
// v1.0) hold exactly one character per statement as of v1.0, which are the first V2_SLOTS slots.
const SHARE_CODE = "01234";
const V2_SLOTS = 490;
function encodeShare(given, ids, slots) {
  const at = new Map(ids.map((id, j) => [id, j]));
  const chars = slots.map((id) => {
    const a = at.has(id) ? given[at.get(id)] : null;
    return a == null ? "-" : SHARE_CODE[a + 2];
  });
  return "3." + chars.join("").replace(/-+$/, "");
}
// Answers indexed like `ids`, or null if the string isn't a share link.
function decodeShare(s, ids, slots) {
  const m = /^([23])\.([0-4-]*)$/.exec(s || "");
  if (!m || m[2].length > slots.length || (m[1] === "2" && m[2].length !== V2_SLOTS)) return null;
  const at = new Map(slots.map((id, k) => [id, k]));
  return ids.map((id) => {
    const c = m[2][at.get(id)];
    return c == null || c === "-" ? null : SHARE_CODE.indexOf(c) - 2;
  });
}

if (typeof module !== "undefined") {
  module.exports = { MAX_SHOWN_LINES, matchLines, place, distance, fitTo, fitScale, similarity, plausibility, placementSpread, topMatch, answeredIndexes, encodeShare, decodeShare, symmetricEigen, buildModel, modelFromParts, varimax, project, match, matchPeople, weights, nextQuestion, certainty, calibrateCertainty, stability, isSettled, meaningfulAxes, salienceContext, salience, placementFromParts, placementPrecision, describeAxis, SETTLE };
}
