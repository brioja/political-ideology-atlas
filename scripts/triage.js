// Triage for the people queue (Brandon, 2026-11-06): audit people in order of how likely they are to pass
// the audit (the uncertainty rule), not by page views. The only filter is the views cutoff (prominence);
// triage excludes nobody, it only orders.
//
// The likelihood is learned from the audits already done: a logistic regression on Wikidata facts about
// each person (offices held, party, stated ideology, occupations, notable works, memberships, number of
// Wikipedia languages, era) plus page views, fitted to pass/fail (on the site or not) of every audited
// person. The regularisation strength is chosen by cross-validation; nothing is hand-weighted. Gender and
// region are left out on purpose: they would only reproduce who has been documented, not who has a record.
// Rerun after audits (labels grow): writes audits/people-triage.json, read by pending.js --triage.
//   node scripts/triage.js
"use strict";
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

const OUT = path.join(lib.ROOT, "audits", "people-triage.json");
const MIN_OCC = 15; // an occupation becomes a feature when at least this many catalog people have it

async function entities(qids) {
  const out = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50);
    const url = `https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: "wbgetentities", ids: batch.join("|"), props: "claims|sitelinks", format: "json" })}`;
    let r;
    for (let tries = 0; ; tries++) {
      try { r = await lib.cachedJson(url, { pauseMs: 2000 }); break; }
      catch (e) {
        const m = e.message.match(/429.*retry-after (\d+)/);
        if (!m || tries >= 5) throw e;
        await new Promise((res) => setTimeout(res, (Number(m[1]) + 15) * 1000));
      }
    }
    for (const [q, e] of Object.entries(r.entities || {})) {
      const c = e.claims || {};
      const vals = (p) => (c[p] || []).map((s) => s.mainsnak && s.mainsnak.datavalue && s.mainsnak.datavalue.value && s.mainsnak.datavalue.value.id).filter(Boolean);
      out.set(q, { P39: (c.P39 || []).length, P102: (c.P102 || []).length, P1142: (c.P1142 || []).length, P800: (c.P800 || []).length,
        P463: (c.P463 || []).length, P106: vals("P106"), sitelinks: Object.keys(e.sitelinks || {}).length });
    }
  }
  return out;
}

function fit(X, y, lambda, iters = 1500) {
  const d = X[0].length; let w = new Array(d).fill(0), b = 0;
  const n = X.length, lr = 0.5;
  for (let it = 0; it < iters; it++) {
    const gw = new Array(d).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      const z = b + X[i].reduce((s, x, j) => s + x * w[j], 0), p = 1 / (1 + Math.exp(-z)), e = p - y[i];
      for (let j = 0; j < d; j++) gw[j] += e * X[i][j];
      gb += e;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + lambda * w[j]);
    b -= lr * gb / n;
  }
  return { w, b };
}
const predict = (m, x) => 1 / (1 + Math.exp(-(m.b + x.reduce((s, v, j) => s + v * m.w[j], 0))));
function auc(scores, y) {
  const pos = scores.filter((_, i) => y[i]), neg = scores.filter((_, i) => !y[i]);
  let s = 0; for (const p of pos) for (const q of neg) s += p > q ? 1 : p === q ? 0.5 : 0;
  return s / (pos.length * neg.length);
}

async function main() {
  const people = lib.peopleCatalog();
  const facts = await entities([...new Set(people.map((p) => p.wikidata).filter(Boolean))]);
  const occCount = new Map();
  for (const f of facts.values()) for (const o of new Set(f.P106)) occCount.set(o, (occCount.get(o) || 0) + 1);
  const occs = [...occCount].filter(([, n]) => n >= MIN_OCC).map(([o]) => o).sort();
  const raw = (p) => {
    const f = facts.get(p.wikidata) || { P39: 0, P102: 0, P1142: 0, P800: 0, P463: 0, P106: [], sitelinks: 0 };
    const born = p.born == null ? 1950 : p.born;
    return [Math.log1p(p.views12m || 0), Math.log1p(f.sitelinks), Math.log1p(f.P39), f.P102 > 0 ? 1 : 0, f.P1142 > 0 ? 1 : 0,
      Math.log1p(f.P800), Math.log1p(f.P463), p.living ? 1 : 0, born < 1500 ? 1 : 0, born >= 1500 && born < 1800 ? 1 : 0,
      born >= 1800 && born < 1900 ? 1 : 0, born >= 1900 && born < 1945 ? 1 : 0, ...occs.map((o) => (f.P106.includes(o) ? 1 : 0))];
  };
  const names = ["log views", "log languages", "log offices held", "party", "stated ideology", "log notable works", "log memberships",
    "living", "born <1500", "born 1500-1799", "born 1800-1899", "born 1900-1944", ...occs.map((o) => `occupation ${o}`)];
  const all = people.map(raw);
  // Standardise on the whole pool.
  const mean = all[0].map((_, j) => all.reduce((s, r) => s + r[j], 0) / all.length);
  const sd = all[0].map((_, j) => Math.sqrt(all.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / all.length) || 1);
  const z = (r) => r.map((v, j) => (v - mean[j]) / sd[j]);
  const X = all.map(z);

  // Labels: audited people (not AI models), passing = on the site (people.js).
  const live = new Set(require(path.join(lib.ROOT, "people.js")).PEOPLE.filter((x) => x.kind !== "model").map((x) => x.id));
  const idx = people.map((p, i) => [p, i]).filter(([p]) => fs.existsSync(lib.personPath(p.id)));
  const Xl = idx.map(([, i]) => X[i]), yl = idx.map(([p]) => (live.has(p.id) ? 1 : 0));

  // 5-fold cross-validation picks lambda and reports how well the order predicts passing.
  const folds = idx.map((_, k) => k % 5);
  const cv = (lambda, cols) => {
    const sc = new Array(Xl.length);
    for (let f = 0; f < 5; f++) {
      const tr = Xl.map((x, k) => [x, k]).filter(([, k]) => folds[k] !== f);
      const m = fit(tr.map(([x]) => cols(x)), tr.map(([, k]) => yl[k]), lambda);
      Xl.forEach((x, k) => { if (folds[k] === f) sc[k] = predict(m, cols(x)); });
    }
    return auc(sc, yl);
  };
  const allCols = (x) => x, viewsOnly = (x) => [x[0]];
  const grid = [0.003, 0.01, 0.03, 0.1, 0.3, 1, 3];
  const scored = grid.map((l) => [l, cv(l, allCols)]);
  const [lambda, cvAuc] = scored.sort((a, b) => b[1] - a[1])[0];
  const viewsAuc = cv(0.01, viewsOnly);
  const model = fit(Xl, yl, lambda);
  const scores = {};
  people.forEach((p, i) => { scores[p.id] = Math.round(predict(model, X[i]) * 1000) / 1000; });
  const weights = names.map((n, j) => [n, Math.round(model.w[j] * 100) / 100]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  fs.writeFileSync(OUT, JSON.stringify({
    note: "Generated by scripts/triage.js: each catalog person's estimated chance of passing the audit, from a logistic regression on Wikidata facts fitted to the people already audited. Orders the people queue (pending.js --triage); excludes nobody.",
    fitted: new Date().toISOString().slice(0, 10), labelled: yl.length, passed: yl.filter(Boolean).length,
    lambda, crossValidatedAuc: Math.round(cvAuc * 1000) / 1000, viewsOnlyAuc: Math.round(viewsAuc * 1000) / 1000,
    topWeights: weights.slice(0, 15), scores }, null, 1) + "\n");
  console.log(`${yl.length} audited (${yl.filter(Boolean).length} passed). Cross-validated AUC ${cvAuc.toFixed(3)} (lambda ${lambda}); views alone ${viewsAuc.toFixed(3)}.`);
  console.log("Strongest weights:", weights.slice(0, 10).map(([n, w]) => `${n} ${w}`).join(", "));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
