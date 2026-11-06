// Triage for the people queue (Brandon, 2026-11-06): audit people in order of how likely they are to pass
// the audit (the uncertainty rule), not by page views. The only filter is the views cutoff (prominence);
// triage excludes nobody, it only orders.
//
// The likelihood is learned from the audits already done: a logistic regression on Wikidata facts about
// each person (offices held, party, stated ideology, occupations, notable works, memberships, number of
// Wikipedia languages, era; own writings: a Gutenberg author ID, works authored and own full-length books
// already on disk (about 20,000 words or more; fetched by prefetch-books.js before each people run), kept only if they raise the cross-validated AUC) plus page views, fitted to pass/fail (on the site or not) of every audited
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
        P463: (c.P463 || []).length, P106: vals("P106"), sitelinks: Object.keys(e.sitelinks || {}).length, gutenberg: (c.P1938 || []).length > 0 });
    }
  }
  return out;
}

// How many works Wikidata lists with the person as author (P50), scholarly articles left out: a proxy for
// own writings an audit can read. Cached on disk; SPARQL in batches of 200.
const WORKS_CACHE = path.join(require("os").homedir(), ".cache", "political-ideology-atlas", "triage-works.json");
async function worksAuthored(qids) {
  const cache = fs.existsSync(WORKS_CACHE) ? JSON.parse(fs.readFileSync(WORKS_CACHE, "utf8")) : {};
  const todo = qids.filter((q) => !(q in cache));
  const { sparql } = require("./sparql");
  for (let i = 0; i < todo.length; i += 200) {
    const batch = todo.slice(i, i + 200);
    const rows = await sparql(`PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT ?a (COUNT(DISTINCT ?w) AS ?n) WHERE { VALUES ?a { ${batch.map((q) => "wd:" + q).join(" ")} } ?w wdt:P50 ?a .
FILTER NOT EXISTS { ?w wdt:P31 wd:Q13442814 } } GROUP BY ?a`);
    for (const q of batch) cache[q] = 0;
    for (const b of rows) cache[b.a.value.replace(/.*\//, "")] = Number(b.n.value);
    fs.writeFileSync(WORKS_CACHE, JSON.stringify(cache));
    await new Promise((res) => setTimeout(res, 2000));
  }
  return cache;
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
  const works = await worksAuthored([...new Set(people.map((p) => p.wikidata).filter(Boolean))]);
  // Own books on disk (local Gutenberg corpus, reference library, Marxists section; prefetch-books.js), counted the
  // same way for audited and pending people.
  const available = require("./prefetch-books").availableBooks(people);
  const occCount = new Map();
  for (const f of facts.values()) for (const o of new Set(f.P106)) occCount.set(o, (occCount.get(o) || 0) + 1);
  const occs = [...occCount].filter(([, n]) => n >= MIN_OCC).map(([o]) => o).sort();
  const raw = (p) => {
    const f = facts.get(p.wikidata) || { P39: 0, P102: 0, P1142: 0, P800: 0, P463: 0, P106: [], sitelinks: 0 };
    const born = p.born == null ? 1950 : p.born;
    return [Math.log1p(p.views12m || 0), Math.log1p(f.sitelinks), Math.log1p(f.P39), f.P102 > 0 ? 1 : 0, f.P1142 > 0 ? 1 : 0,
      Math.log1p(f.P800), Math.log1p(f.P463), p.living ? 1 : 0, born < 1500 ? 1 : 0, born >= 1500 && born < 1800 ? 1 : 0,
      born >= 1800 && born < 1900 ? 1 : 0, born >= 1900 && born < 1945 ? 1 : 0, ...occs.map((o) => (f.P106.includes(o) ? 1 : 0)),
      // Own writings (last BOOK_FEATURES columns, so the fit can be compared with and without them).
      f.gutenberg ? 1 : 0, Math.log1p(works[p.wikidata] || 0), Math.log1p(available[p.id] || 0)];
  };
  const names = ["log views", "log languages", "log offices held", "party", "stated ideology", "log notable works", "log memberships",
    "living", "born <1500", "born 1500-1799", "born 1800-1899", "born 1900-1944", ...occs.map((o) => `occupation ${o}`),
    "Gutenberg author", "log works authored", "log own books available"];
  const BOOK_FEATURES = 3;
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
  const allCols = (x) => x, noBooks = (x) => x.slice(0, x.length - BOOK_FEATURES), viewsOnly = (x) => [x[0]];
  const grid = [0.003, 0.01, 0.03, 0.1, 0.3, 1, 3];
  const best = (cols) => grid.map((l) => [l, cv(l, cols)]).sort((a, b) => b[1] - a[1])[0];
  const withBooks = best(allCols), withoutBooks = best(noBooks);
  // The own-writings features stay only if they raise the cross-validated AUC.
  const useBooks = withBooks[1] > withoutBooks[1];
  const cols = useBooks ? allCols : noBooks;
  const [lambda, cvAuc] = useBooks ? withBooks : withoutBooks;
  const viewsAuc = cv(0.01, viewsOnly);
  const model = fit(Xl.map(cols), yl, lambda);
  const scores = {};
  people.forEach((p, i) => { scores[p.id] = Math.round(predict(model, cols(X[i])) * 1000) / 1000; });
  const weights = cols(names).map((n, j) => [n, Math.round(model.w[j] * 100) / 100]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  fs.writeFileSync(OUT, JSON.stringify({
    note: "Generated by scripts/triage.js: each catalog person's estimated chance of passing the audit, from a logistic regression on Wikidata facts fitted to the people already audited. Orders the people queue (pending.js --triage); excludes nobody.",
    fitted: new Date().toISOString().slice(0, 10), labelled: yl.length, passed: yl.filter(Boolean).length,
    lambda, crossValidatedAuc: Math.round(cvAuc * 1000) / 1000, viewsOnlyAuc: Math.round(viewsAuc * 1000) / 1000,
    ownWritings: { used: useBooks, aucWith: Math.round(withBooks[1] * 1000) / 1000, aucWithout: Math.round(withoutBooks[1] * 1000) / 1000 },
    topWeights: weights.slice(0, 15), scores }, null, 1) + "\n");
  console.log(`Own-writings features (Gutenberg author, works authored, own books available): AUC ${withBooks[1].toFixed(3)} with, ${withoutBooks[1].toFixed(3)} without -> ${useBooks ? "used" : "left out"}.`);
  console.log(`${yl.length} audited (${yl.filter(Boolean).length} passed). Cross-validated AUC ${cvAuc.toFixed(3)} (lambda ${lambda}); views alone ${viewsAuc.toFixed(3)}.`);
  console.log("Strongest weights:", weights.slice(0, 10).map(([n, w]) => `${n} ${w}`).join(", "));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
