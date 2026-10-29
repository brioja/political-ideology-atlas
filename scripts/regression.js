// Regression set for matching changes: fixed simulated takers (and real result links kept outside the
// repo), each one's top 5 recorded as a baseline, so a change shows whose results it moves.
//   node scripts/regression.js                      compare today's matching with the baseline
//   node scripts/regression.js --save               record today's results as the baseline
//   node scripts/regression.js --variant nulls [--ids a,b]
//                                                   the same takers, with those ideologies' stock
//                                                   "no doctrine" zeros left out of matching (all if no ids)
// Real links: one "label<TAB>link" per line in ~/work/regression-links.txt (not in the repo, since they
// hold people's answers); their baseline is kept next to that file.
// Simulated takers are drawn once, from a fixed seed over the ideologies shown, and the ideologies
// drawn are saved with the baseline, so a change that alters the shown set is still compared on the
// same takers (an ideology no longer shown drops its takers).
const fs = require("fs");
const path = require("path");
const os = require("os");
const { ROOT, readJson, profilePath, activeStatements, silentZeros } = require("./lib");
const { QUESTIONS, IDEOLOGIES } = require(path.join(ROOT, "data.js"));
const { decodeShare } = require(path.join(ROOT, "pca.js"));

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const variant = arg("--variant") || "current";
const onlyIds = arg("--ids") ? new Set(arg("--ids").split(",")) : null;
const BASELINE = path.join(ROOT, "audits", "regression-baseline.json");
const LINKS = path.join(os.homedir(), "work", "regression-links.txt");
const REAL_BASELINE = path.join(os.homedir(), "work", "regression-baseline-real.json");
const n = QUESTIONS.length;
if (activeStatements().map((s) => s.id).join() !== QUESTIONS.map((q) => q.id).join()) {
  console.error("The statements changed since data.js was built: run a full build first.");
  process.exit(1);
}

// The "nulls" variant leaves silence out of matching: answers already null, and the low zeros
// scripts/lib.js silentZeros() reads as silence in audits written before null existed.
function profiles() {
  return IDEOLOGIES.map((ideo) => {
    if (variant !== "nulls" || (onlyIds && !onlyIds.has(ideo.id))) return ideo;
    const audit = readJson(profilePath(ideo.id));
    const silent = silentZeros(audit);
    const profile = QUESTIONS.map((q, j) => (audit.answers[q.id].value === null || silent.has(q.id) ? null : ideo.profile[j]));
    return { ...ideo, profile };
  });
}

// Ranks by mean gap on the statements both the taker and the ideology answered (with every ideology
// answering everything, this is match() in pca.js); one sharing fewer than 8 is left out.
function rank(ideos, answers) {
  const idx = answers.flatMap((a, j) => (a == null ? [] : [j]));
  return ideos.map((i) => {
    const both = idx.filter((j) => i.profile[j] != null);
    if (both.length < 8) return null;
    return { id: i.id, d: both.reduce((s, j) => s + Math.abs(answers[j] - i.profile[j]), 0) / both.length };
  }).filter(Boolean).sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
}

let seed = 20261029;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr, k) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const clamp = (v) => Math.max(-2, Math.min(2, v));
const firm = (id) => { const a = readJson(profilePath(id)).answers; return QUESTIONS.map((q) => (a[q.id].confidence !== "low" ? a[q.id].value : null)); };

// The cases. An adherent answers 60 of its ideology's firm positions, a fifth nudged one notch; a mild
// adherent answers the same, but strong answers soften and a third become "Neither"; a mixed taker
// answers 30 firm positions of each of two ideologies; a mostly-neutral taker answers 60 random
// statements, mostly 0 and ±1.
const shownIds = new Set(IDEOLOGIES.map((i) => i.id));
function cases(drawn) {
  const out = [];
  const sample = drawn ? drawn.sample.filter((id) => shownIds.has(id)) : pick(IDEOLOGIES.map((i) => i.id).sort(), 40);
  const pairs = drawn ? drawn.pairs.filter((p) => p.every((id) => shownIds.has(id))) : null;
  for (const id of sample) {
    const f = firm(id);
    const known = f.flatMap((v, j) => (v == null ? [] : [j]));
    const asked = pick(known, Math.min(60, known.length));
    const adherent = Array(n).fill(null), mild = Array(n).fill(null);
    for (const j of asked) {
      adherent[j] = rand() < 0.2 ? clamp(f[j] + (rand() < 0.5 ? -1 : 1)) : f[j];
      mild[j] = rand() < 1 / 3 ? 0 : Math.sign(f[j]) * Math.min(1, Math.abs(f[j]));
    }
    out.push({ suite: "adherent", label: `adherent of ${id}`, expect: [id], answers: adherent });
    out.push({ suite: "mild", label: `mild adherent of ${id}`, expect: [id], answers: mild });
  }
  const usedPairs = [];
  for (let k = 0; k < (pairs ? pairs.length : 20); k++) {
    const [a, b] = pairs ? pairs[k] : pick(IDEOLOGIES.map((i) => i.id).sort(), 2);
    usedPairs.push([a, b]);
    const fa = firm(a), fb = firm(b);
    const answers = Array(n).fill(null);
    for (const j of pick(fa.flatMap((v, j) => (v == null ? [] : [j])), 30)) answers[j] = fa[j];
    for (const j of pick(fb.flatMap((v, j) => (v == null ? [] : [j])), 30)) if (answers[j] == null) answers[j] = fb[j];
    out.push({ suite: "mixed", label: `mixed ${a} + ${b}`, expect: [a, b], answers });
  }
  for (let k = 0; k < 20; k++) {
    const answers = Array(n).fill(null);
    for (const j of pick([...Array(n).keys()], 60)) { const r = rand(); answers[j] = r < 0.5 ? 0 : r < 0.75 ? -1 : r < 0.95 ? 1 : (rand() < 0.5 ? -2 : 2); }
    out.push({ suite: "neutral", label: `mostly-neutral taker ${k + 1}`, expect: null, answers });
  }
  // A secular-only taker: Secularism's firm positions (it isn't shown) and 25 "Neither" answers.
  const sec = firm("secularism");
  for (let k = 0; k < 5; k++) {
    const answers = sec.slice();
    for (const j of pick(answers.flatMap((v, j) => (v == null ? [j] : [])), 25)) answers[j] = 0;
    out.push({ suite: "secular", label: `secular-only taker ${k + 1}`, expect: ["secular-humanism", "secular-liberalism"], answers });
  }
  if (fs.existsSync(LINKS)) {
    for (const line of fs.readFileSync(LINKS, "utf8").split("\n")) {
      const [label, link] = line.split("\t");
      if (!link) continue;
      const r = new URL(link.trim(), "https://x/").searchParams.get("r");
      const answers = decodeShare(r, QUESTIONS.map((q) => q.id), readJson(path.join(ROOT, "audits", "share-slots.json")).slots);
      if (answers) out.push({ suite: "real", label: label.trim(), expect: null, answers });
      else console.warn(`Couldn't read the link for ${label}`);
    }
  }
  out.drawn = { sample, pairs: usedPairs };
  return out;
}

const ideos = profiles();
const savedBase = fs.existsSync(BASELINE) ? readJson(BASELINE) : null;
if (variant === "nulls") {
  const left = ideos.reduce((t, i) => t + i.profile.filter((v) => v == null).length, 0);
  const zeros = IDEOLOGIES.reduce((t, i) => t + i.profile.filter((v) => v === 0).length, 0);
  console.log(`Silence left out: ${left} of ${zeros} zeros${onlyIds ? " in all ideologies" : ""}.`);
}
const name = Object.fromEntries(IDEOLOGIES.map((i) => [i.id, i.name]));
const drawnCases = cases(process.argv.includes("--save") ? null : savedBase && savedBase.drawn);
const results = drawnCases.map((c) => ({ ...c, top: rank(ideos, c.answers).slice(0, 5).map((r) => r.id) }));

// --rank <id>: where that ideology ranks for each suite's takers (median), to see a change below the top.
if (arg("--rank")) {
  const near = results.filter((r) => r.suite === "adherent").map((r) => [r.label, rank(ideos, r.answers).findIndex((x) => x.id === arg("--rank")) + 1]).filter(([, k]) => k <= 5);
  if (near.length) console.log(`  ${arg("--rank")} in the top 5 for: ${near.map(([l, k]) => `${l} (#${k})`).join(", ")}`);
  const id = arg("--rank");
  for (const s of [...new Set(results.map((r) => r.suite))]) {
    const ranks = results.filter((r) => r.suite === s).map((r) => rank(ideos, r.answers).findIndex((x) => x.id === id) + 1).sort((a, b) => a - b);
    console.log(`  ${id} in ${s}: median rank ${ranks[Math.floor(ranks.length / 2)]}, best ${ranks[0]}`);
  }
}

// --sides: how often each suite's top match takes the taker's side, on the statements where both
// take one (a softer ideology on the same sides is a different thing from one on the other side).
if (process.argv.includes("--sides")) {
  const byId = Object.fromEntries(ideos.map((i) => [i.id, i]));
  const sideRate = (answers, id) => {
    const p = byId[id].profile;
    const both = answers.flatMap((a, j) => (a && p[j] ? [j] : []));
    return both.length ? both.filter((j) => Math.sign(answers[j]) === Math.sign(p[j])).length / both.length : null;
  };
  for (const s of [...new Set(results.map((r) => r.suite))]) {
    const rs = results.filter((r) => r.suite === s);
    const top = rs.map((r) => sideRate(r.answers, r.top[0])).filter((x) => x != null).sort((a, b) => a - b);
    const own = rs.filter((r) => r.expect).map((r) => sideRate(r.answers, r.expect[0])).filter((x) => x != null).sort((a, b) => a - b);
    console.log(`  ${s.padEnd(9)} top match shares the taker's side on ${Math.round(top[Math.floor(top.length / 2)] * 100)}% of statements (median)${own.length ? `; their own ideology ${Math.round(own[Math.floor(own.length / 2)] * 100)}%` : ""}`);
  }
}

const suites = [...new Set(results.map((r) => r.suite))];
console.log(`Matching: ${variant}${onlyIds ? ` (${[...onlyIds].join(", ")})` : ""}`);
for (const s of suites) {
  const rs = results.filter((r) => r.suite === s);
  const scored = rs.filter((r) => r.expect);
  const top1 = scored.filter((r) => r.expect.includes(r.top[0])).length;
  const top3 = scored.filter((r) => r.top.slice(0, 3).some((id) => r.expect.includes(id))).length;
  console.log(`  ${s.padEnd(9)} ${rs.length} takers${scored.length ? `: expected match first ${top1}/${scored.length}, in top 3 ${top3}/${scored.length}` : ""}`);
}

const save = (file, rs, drawn) => fs.writeFileSync(file, JSON.stringify({ ...(drawn ? { drawn } : {}), tops: Object.fromEntries(rs.map((r) => [r.label, r.top])) }, null, 1) + "\n");
if (process.argv.includes("--save")) {
  if (variant !== "current") { console.error("Save the baseline from today's matching only."); process.exit(1); }
  save(BASELINE, results.filter((r) => r.suite !== "real"), drawnCases.drawn);
  if (results.some((r) => r.suite === "real")) save(REAL_BASELINE, results.filter((r) => r.suite === "real"));
  console.log(`Baseline saved (${results.length} takers).`);
  process.exit(0);
}
const base = { ...(savedBase ? savedBase.tops : {}), ...(fs.existsSync(REAL_BASELINE) ? readJson(REAL_BASELINE).tops : {}) };
const moved = results.filter((r) => base[r.label] && base[r.label][0] !== r.top[0]);
const missing = results.filter((r) => !base[r.label]).length;
if (missing) console.log(`${missing} takers have no baseline (run with --save).`);
console.log(`\nTop match changed for ${moved.length} of ${results.length - missing} takers:`);
for (const r of moved) {
  const was = base[r.label][0], now = r.top[0];
  const verdict = r.expect ? (r.expect.includes(now) ? "better" : r.expect.includes(was) ? "WORSE" : "other") : "";
  console.log(`  ${r.label}: ${name[was] || was} -> ${name[now] || now}${verdict ? ` (${verdict})` : ""}`);
}
