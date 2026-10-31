// PCA over the ideology x question matrix, plus placement and matching.
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
  model.ideologies = ideologies.map((i) => ({ ...i }));
  model.ideologies.forEach((i) => { Object.assign(i, locate(model, i.profile)); i.scores = positions(model, i.profile, i.at); });
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
  // An ideology's scores (drawn) are its place on the real lines (matched), from the build when shipped.
  model.ideologies = ideologies.map((i) => {
    const l = located(model, i);
    return { ...i, ...l, scores: positions(model, i.profile, l && l.at) };
  });
  return model;
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
// (0-100%), how precisely the answers place you (lineStats, which also tells the quiz you're done) and the
// plausibility the quiz's next-question selector weights ideologies by. Every
// ranking (match(), topMatch(), matchPeople(), the Compare page), the selector and its progress
// (weights()) go through these functions only, so changing the measure here
// changes them all together and they cannot drift apart.
//
// Fit is distance on the real dividing lines (matchLines). Comparing statement by statement favoured
// whoever had answered the most and whoever held the mildest views, and two sparse lists of answers often
// share few statements. Silence (null) is never scored, as "Neither" or as disagreement: a decision,
// not a default (test.js checks it). Placement reads the real lines from the answered statements
// only (see posterior), and with nothing answered there is no position at all.
//
// Each line counts as far as both lists of answers are placed on it (lineStats, the same per-line
// precision that decides who is shown and tells the quiz you're done). A line a list says nothing
// about would otherwise sit at its middle by default and count in full, as if it were moderate there:
// someone placed only on economics would match whoever sits mid-way on religion. Weighted by
// precision, it counts for nothing until it is answered, so ideologies that differ only there stay
// tied, and the next-question selector asks about it because they disagree there.

// Where a list of answers sits on the real lines (`at`) and how reliably on each (`reliability`, 0 for
// a line it says nothing about to 1 for a line it pins down), both from one posterior, or null with
// nothing answered. Ideologies in a model carry both (modelFromParts, buildModel).
function locate(model, answers) {
  const known = answeredIndexes(answers);
  if (!known.length) return null;
  const p = posterior(placementOf(model), known, answers.map((x, j) => (x == null ? null : x - model.mean[j]))); // only `known` is read
  return { at: p.at, reliability: p.lines.map((l) => l.reliability) };
}
// Where a list of answers sits on the real lines, or null with nothing answered.
const place = (model, answers) => { const l = locate(model, answers); return l && l.at; };
// A list of answers as shipped by the build (ideologies in IDEOLOGIES, people in PEOPLE carry `at` and
// `reliability`, so the page doesn't work them out for each; test.js checks they are current), or
// located here.
const located = (model, r) => (r.at && r.reliability ? { at: r.at, reliability: r.reliability } : locate(model, r.profile));
// Scores on every component the model has, for drawing: the real lines from the posterior (place());
// components past them aren't placed (0, their middle). The page draws only real lines, so that is
// only ever a model built here with every component (buildModel), whose extra scores nothing reads.
function positions(model, answers, at = place(model, answers)) {
  const k = model.components.length;
  const out = new Array(k).fill(0);
  if (at) at.slice(0, k).forEach((x, i) => { out[i] = x; });
  return out;
}

// The distance between two located lists of answers (locate): Euclidean on the real lines, each line weighted
// by how reliably both are placed on it. No position is no basis for a match.
function distance(a, b) {
  if (!a || !b) return Infinity;
  let s = 0;
  for (let k = 0; k < a.at.length; k++) s += a.reliability[k] * b.reliability[k] * (a.at[k] - b.at[k]) ** 2;
  return Math.sqrt(s);
}

// The distances from a set of answers to each of `places` (located lists of answers, such as a model's
// ideologies), or null with nothing answered: no basis to rank anyone, rather than everyone measured
// from the centre.
function fitTo(model, answers, places) {
  const you = locate(model, answers);
  return you && places.map((p) => distance(you, p));
}

// The similarity scale's 0% end: the largest distance between two shown ideologies. Fixed for a model,
// whatever was answered; the build ships it (MODEL.span), so the page doesn't compare every pair.
function fitScale(model) {
  if (model.span == null) {
    const at = model.ideologies;
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

// How far the quiz has placed you, from 0 to 1: 1 once your uncertainty on every real line (the same
// measure that decides who is shown; see uncertainty()) is at most DONE_UNCERTAINTY, and on the way
// there, how much of its spread your worst line has resolved against that target. It only grows as you
// answer. The quiz says you're done at 1, so a taker between two ideologies isn't asked every statement,
// and one is never done while a line is still mostly unknown.
// Being shown asks "is this a full politics?"; "Done" asks "is the result settled?", so it has its own
// target. Measured on simulated adherents (Brandon picked ~60 questions, 2026-10-31): at 35% the median
// taker is done after 64 statements with their own ideology first for 75% (top 3 for 86%); 50% took 35
// statements at 46%, 25% took 105 at 91%.
const DONE_UNCERTAINTY = 0.35;
function placementProgress(model, answers) {
  if (!answers.some((x) => x != null)) return 0;
  return Math.min(1, (1 - worstUncertainty(placementOf(model), answeredIndexes(answers))) / (1 - DONE_UNCERTAINTY));
}

// How plausible each ideology is given the answers so far (weights summing to 1), from its distance
// `d` (fitTo): a Gaussian, exp(-d² / 2s²), whose width s is how far off the distance itself may be
// from your placement error: on each line, its variance weighted the way distance weighs that line
// (distanceSpread), so there is no tuning constant. A line you haven't
// answered adds neither distance nor width; a loosely placed one keeps every nearby ideology in play.
// Before any answer (d null) all weigh the same.
function plausibility(model, answers, d) {
  const m = model.ideologies.length;
  if (!d) return new Array(m).fill(1 / m);
  const s = distanceSpread(placementOf(model), answeredIndexes(answers));
  if (!(s > 0)) return new Array(m).fill(1 / m);
  const logs = d.map((x) => -(x * x) / (2 * s * s));
  const top = Math.max(...logs);
  const w = logs.map((l) => Math.exp(l - top));
  const total = w.reduce((t, x) => t + x, 0);
  return w.map((x) => x / total);
}

// The placement context plausibility() measures with: shipped (modelFromParts), or worked out from a
// model built here (buildModel), which has every component.
function placementOf(model) {
  if (model.placement === undefined) model.placement = placementContext(model);
  if (!model.placement) throw new Error("This model has no placement context: pass PLACEMENT to modelFromParts.");
  return model.placement;
}
// ---- End of the fit measure -----------------------------------------------------------------------

// Ranks ideologies by fit, nearest first, with each one's similarity. With nothing answered there is
// no basis to rank: every ideology is at distance 0 and 0% similarity, in catalog order.
function match(model, answers) {
  const d = fitTo(model, answers, model.ideologies);
  const ranked = model.ideologies
    .map((i, k) => ({ ...i, distance: d ? d[k] : 0, similarity: d ? similarity(model, d[k]) : 0 }))
    .sort((x, y) => x.distance - y.distance);
  return { you: positions(model, answers), ranked };
}

// The index of the smallest distance; ties (and no basis at all) go to the earlier one, as in match().
function nearest(d) {
  let best = 0;
  if (d) for (let k = 1; k < d.length; k++) if (d[k] < d[best]) best = k;
  return best;
}
// The id match() would rank first, without sorting or similarities.
const topMatch = (model, answers) => model.ideologies[nearest(fitTo(model, answers, model.ideologies))].id;

// The dividing lines that are real (they beat shuffled noise, see meaningfulAxes): matching, placing
// answers and the quiz's progress all use these, whatever the page has room to show
// (MAX_SHOWN_LINES). Counted once per model (buildModel) and shipped with it (build.js).
function matchLines(model) {
  if (model.realLines == null) throw new Error("This model has no count of real lines (realLines): build it with buildModel or ship it from build.js.");
  return Math.min(model.components.length, model.realLines);
}

// Ranks people (or any profiles: the Compare page ranks one ideology against another this way) by fit,
// on the same scale as ideologies, closest first. Nothing answered: an empty list.
function matchPeople(model, answers, people) {
  const d = fitTo(model, answers, people.map((p) => located(model, p)));
  if (!d) return [];
  return people.map((p, k) => ({ ...p, distance: d[k], similarity: similarity(model, d[k]) }))
    .sort((a, b) => a.distance - b.distance);
}

// How plausible each ideology is given the answers so far (see plausibility).
const weights = (model, answers) => plausibility(model, answers, fitTo(model, answers, model.ideologies));

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

// The placement context: how precisely a list of answers is placed on each real line. Depends only on WHICH
// statements have a recorded position, never on the answers, so unusual views are not penalized.
// Bayesian: before any evidence, a position is as spread out as the ideologies are on each dividing
// line (the eigenvalues); each recorded statement narrows that along the lines it measures, weighted
// by the leftover noise per statement (the variance the real lines don't explain). Precision is
// judged on the lines matching uses (`rotated`: the rotated real lines, which span the same space as
// the first k components; the components themselves without).
function placementContext(model, { lines, rotated } = {}) {
  const k = Math.max(2, Math.min(lines ?? matchLines(model), model.components.length));
  const n = model.mean.length;
  const noise = model.components.slice(k).reduce((s, c) => s + c.eigenvalue, 0) / n || 1e-6;
  const comps = model.components.slice(0, k);
  // lines[i][a]: line i's loading on component a, so a score on line i is Σ_a lines[i][a] · score on a.
  const toLines = rotated ? rotated.slice(0, k).map((r) => comps.map((c) => dot(r.vector, c.vector)))
    : comps.map((_, i) => comps.map((__, a) => (a === i ? 1 : 0)));
  return withLines({ model, k, noise, lines: toLines });
}

// A placement context with each line's spread before any answer (`prior`: the ideologies' variance
// along it).
function withLines(ctx) {
  const comps = ctx.model.components.slice(0, ctx.k);
  ctx.prior = ctx.lines.map((row) => row.reduce((s, x, a) => s + x * x * comps[a].eigenvalue, 0));
  return ctx;
}

// The placement context, rebuilt from what the build ships (PLACEMENT in data.js): the page's MODEL
// carries only the rotated lines, not the unrotated components or the noise level.
function placementFromParts(parts) {
  return parts && withLines({ model: { components: parts.components }, k: parts.k, noise: parts.noise,
    lines: parts.lines || parts.components.map((_, i) => parts.components.map((__, a) => (a === i ? 1 : 0))) });
}

// The one placement of a list of answers on the real lines (Bayesian): before any answer, a position
// is as spread out as the ideologies are along each component (its eigenvalue) and sits at the
// middle; each answered statement (`knownIdx`) is a noisy reading of the components it loads on
// (noise: the landscape's per-statement variance off the real lines). The posterior gives, on each
// line in the order matching uses them, `variance` (expected squared error) and `reliability` (the
// share of the line's spread the answers account for: 1 - variance / prior), and, given the answers
// centred on the statement means (`centred`), `at`: the posterior mean position. Thin evidence on a
// line moves the position there only part of the way, as far as it narrows the line, with no tuned
// constant. Which statements are answered decides the precision; the answers decide only the place.
// Everything uses this: matching and drawing (locate, place), who is shown and "Done" (uncertainty),
// the selector's plausibility width (distanceSpread).
function lineStats(ctx, knownIdx) {
  return posterior(ctx, knownIdx).lines;
}
function posterior(ctx, knownIdx, centred = null) {
  const { model, k, noise, lines, prior } = ctx;
  const comps = model.components.slice(0, k);
  const M = comps.map((ca, a) => comps.map(() => 0));
  for (const j of knownIdx) {
    for (let a = 0; a < k; a++) {
      const x = comps[a].vector[j] / noise;
      for (let b = a; b < k; b++) M[a][b] += x * comps[b].vector[j];
    }
  }
  for (let a = 0; a < k; a++) { M[a][a] += 1 / comps[a].eigenvalue; for (let b = 0; b < a; b++) M[a][b] = M[b][a]; }
  const C = comps.map((_, i) => solve(M, comps.map((__, j) => (j === i ? 1 : 0)))); // M⁻¹ (symmetric)
  const out = { lines: lines.map((row, i) => {
    const variance = row.reduce((s, x, a) => s + x * row.reduce((t, y, b) => t + C[a][b] * y, 0), 0);
    return { variance, reliability: Math.max(0, 1 - variance / prior[i]) };
  }) };
  if (centred) {
    // Mean on the components: C · Aᵀy / noise; on the lines: lines · that.
    const rhs = comps.map((c) => knownIdx.reduce((s, j) => s + c.vector[j] * centred[j], 0) / noise);
    const z = C.map((row) => row.reduce((s, x, b) => s + x * rhs[b], 0));
    out.at = lines.map((row) => row.reduce((s, x, a) => s + x * z[a], 0));
  }
  return out;
}

// A political ideology or figure takes positions across every dividing line; a list of answers that speaks
// to only some of them holds opinions, not a full politics, and isn't shown (Brandon, 2026-10-31).
// Uncertainty: on a list of answers' worst line, the share of that line's spread its answers leave unknown
// (1 with nothing on it, near 0 once pinned down). Shown when it is at most MAX_UNCERTAINTY: every
// line more known than unknown. The same rule for ideologies, people and AI models; the quiz's "Done"
// uses the same measure with its own target (DONE_UNCERTAINTY).
const MAX_UNCERTAINTY = 0.5;
function worstUncertainty(ctx, knownIdx) {
  return Math.max(...lineStats(ctx, knownIdx).map((l) => 1 - l.reliability));
}

function uncertainty(ctx, profile) {
  const known = profile.flatMap((x, j) => (x == null ? [] : [j]));
  const lines = lineStats(ctx, known).map((l) => 1 - l.reliability);
  const worst = Math.max(...lines);
  return { known: known.length, uncertainty: worst, lines, max: MAX_UNCERTAINTY, placed: worst <= MAX_UNCERTAINTY };
}

// How far off a distance may be from placement error alone, for a list of answers with positions on `knownIdx`:
// on each line its variance, weighted the way distance weighs that line (s² = Σ reliability ·
// variance). The selector's plausibility width, and, for every statement answered, the closest two
// ideologies can be and still be told apart.
function distanceSpread(ctx, knownIdx) {
  return Math.sqrt(lineStats(ctx, knownIdx).reduce((t, l) => t + l.reliability * l.variance, 0));
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
  module.exports = { MAX_SHOWN_LINES, matchLines, place, locate, positions, posterior, lineStats, distance, fitTo, fitScale, similarity, plausibility, topMatch, answeredIndexes, encodeShare, decodeShare, symmetricEigen, buildModel, modelFromParts, varimax, match, matchPeople, weights, nextQuestion, meaningfulAxes, placementContext, uncertainty, distanceSpread, worstUncertainty, MAX_UNCERTAINTY, DONE_UNCERTAINTY, placementFromParts, placementProgress, describeAxis };
}
