// UI: intro map, one-statement-at-a-time quiz, results.
const model = typeof MODEL !== "undefined" ? modelFromParts(IDEOLOGIES, MODEL) : buildModel(IDEOLOGIES);
const CHOICES = [
  { label: "Strongly disagree", value: -2 },
  { label: "Disagree", value: -1 },
  { label: "Neither agree nor disagree", value: 0 },
  { label: "Agree", value: 1 },
  { label: "Strongly agree", value: 2 },
];
const SITE_NAME = "Political Ideology Atlas";
const STORAGE_KEY = "ideology-atlas-progress";
const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

// `order` lists statements in the order they were asked (chosen adaptively, one at a time).
// `answers` is indexed by statement: a value, or null when skipped or not asked yet.
let order = [];
let answers = [];
let position = 0;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, order, answers, position })); } catch {}
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && s.v === 2 && s.answers.length === QUESTIONS.length) return s;
  } catch {}
  return null;
}
function clearSaved() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// How many dividing lines to show: those that beat shuffled-noise data (parallel analysis),
// at least 2 and at most 8. build.js precomputes the count; otherwise it's computed here.
const MAX_LINES = 8;
const REAL_LINES = typeof MEANINGFUL_LINES !== "undefined" ? MEANINGFUL_LINES : meaningfulAxes(model, IDEOLOGIES);
const SHOWN_LINES = Math.min(MAX_LINES, model.components.length, Math.max(2, REAL_LINES));

// Where a score falls along a drawn line, 0-1: scaled to the line's own extremes (plus a small
// margin) rather than centred on zero, so a lopsided line doesn't leave one end empty.
function lineScale(vals) {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.025 || 1;
  return (v) => (v - lo + pad) / (hi - lo + 2 * pad);
}

// Dividing line i, named by the ideologies at its two ends (no hand-written names: the lines are
// found from the data and mix many issues, so a fixed label would go stale). An end whose most extreme
// ideology has a long name (over END_CHARS) is named by the next one in that fits, from the five
// nearest that end, so labels stay short on phones and the share card; failing that, the most extreme.
// How much of the differences between ideologies line i covers, relative to the biggest line (0-1):
// shown as a bar, with the exact share only as a tooltip.
const lineWeight = (i) => model.components[i].share / model.components[0].share;
const weightBar = (i) => `<span class="bar line-weight" role="img" title="${pct(model.components[i].share)} of the differences between ideologies" aria-label="${pct(model.components[i].share)} of the differences between ideologies"><span style="width:${pct(lineWeight(i))}"></span></span>`;

const END_CHARS = 20;
function lineInfo(i) {
  // A rotated line named in audits/line-labels.json (see build.js) is named by its theme.
  const named = model.labels && model.labels[i];
  if (named) return { name: `${named.low} ↔ ${named.high}`, low: named.low, high: named.high, lowId: null, highId: null };
  const sorted = model.ideologies.slice().sort((a, b) => a.scores[i] - b.scores[i]);
  const pick = (ends) => ends.find((d) => d.name.length <= END_CHARS) || ends[0];
  const low = pick(sorted.slice(0, 5)), high = pick(sorted.slice(-5).reverse());
  return { name: `${low.name} ↔ ${high.name}`, low: low.name, high: high.name, lowId: low.id, highId: high.id };
}
// The line's name with each end linked to that ideology's page.
const endTitle = (name, id) => (id ? `<a href="${ideologyHref(id)}">${esc(name)}</a>` : esc(name));
const lineTitle = (L) => `${endTitle(L.low, L.lowId)} ↔ ${endTitle(L.high, L.highId)}`;

// ---------- Markers ----------
// Ideologies are told apart by where they sit on the dividing lines and by name, not by color. An
// earlier version colored them by hand-assigned categories (Left, Right, Third Position...), which
// the data-derived lines made redundant, so every marker is now the same neutral circle.
const POINT = "var(--muted)";
const styleOf = () => ({ shape: "circle" });
const colorOf = () => POINT;

// SVG path data for a marker of radius r centered on (x, y). Path2D accepts the same data,
// so the share image draws identical shapes.
function shapePath(shape, x, y, r) {
  const pts = (list) => "M" + list.map(([a, b]) => `${(x + a * r).toFixed(1)},${(y + b * r).toFixed(1)}`).join("L") + "Z";
  switch (shape) {
    case "square": return pts([[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]]);
    case "diamond": return pts([[0, -1.2], [1.2, 0], [0, 1.2], [-1.2, 0]]);
    case "triangle": return pts([[0, -1.25], [1.15, 0.85], [-1.15, 0.85]]);
    case "triangle-down": return pts([[0, 1.25], [1.15, -0.85], [-1.15, -0.85]]);
    case "plus": { const a = 0.38, b = 1.15; return pts([[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]]); }
    case "cross": { const t = 0.3, s = 1.05; return pts([[-s, -s + t], [-s + t, -s], [0, -t], [s - t, -s], [s, -s + t], [t, 0], [s, s - t], [s - t, s], [0, t], [-s + t, s], [-s, s - t], [-t, 0]]); }
    case "star": return pts(Array.from({ length: 10 }, (_, i) => {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.55 : 1.3;
      return [Math.cos(ang) * rr, Math.sin(ang) * rr];
    }));
    default: return `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
  }
}

// An ideology's traditional colors as a style for a .tinted box: they wash the background corner
// to corner, as on the share card, and the first one tints the border. Without colors, the accent.
function flagTint(ideo) {
  const c = ideo.flag && ideo.flag.colors.length ? ideo.flag.colors.map((x) => esc(x.hex)) : [];
  if (!c.length) return "--fam: var(--accent)";
  const stops = (c.length === 1 ? [c[0], c[0]] : c).map((col) => `color-mix(in srgb, ${col} 16%, var(--surface))`);
  return `--fam: ${c[0]}; --wash: linear-gradient(135deg, ${stops.join(", ")})`;
}

// A tiny map beside a name: where the ideology sits on the first two dividing lines (across and up,
// as on the big map), scaled to the furthest ideology on each.
const GLYPH_LIM = [0, 1].map((k) => Math.max(...model.ideologies.map((i) => Math.abs(i.scores[k] || 0))) || 1);
function posGlyph(ideo, size = 18) {
  const x = 8 + ((ideo.scores[0] || 0) / GLYPH_LIM[0]) * 5, y = 8 - ((ideo.scores[1] || 0) / GLYPH_LIM[1]) * 5;
  return `<svg class="swatch-mark" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3" fill="none" stroke="var(--line)" stroke-width="1.5"></rect><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="var(--ink)"></circle></svg>`;
}

const pct = (x) => `${Math.round(x * 100)}%`;

// ---------- Map ----------

function el(tag, attrs, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

// Draws ideologies (and optionally you) on two dividing lines. Every dot can be tapped or
// clicked: it gets a label on the map and `onPick(ideology)` is called. Tapping it again, tapping
// empty space or pressing Escape clears it and calls `onUnpick()`. Returns `pick(id)` so other
// parts of the page can select a dot too; `svg.unpick()` clears the selection.
function drawMap(svg, xi, yi, { you = null, highlight = null, labels = null, onPick = null, onUnpick = null } = {}) {
  svg.replaceChildren();
  const W = 640, H = 440, pad = 46;
  const points = model.ideologies.map((i) => [i.scores[xi], i.scores[yi]]);
  if (you) points.push([you[xi], you[yi]]);
  const lim = Math.max(...points.flat().map(Math.abs)) * 1.1;
  const sx = (v) => W / 2 + (v / lim) * (W / 2 - pad);
  const sy = (v) => H / 2 - (v / lim) * (H / 2 - pad);

  svg.append(
    el("line", { x1: pad, x2: W - pad, y1: H / 2, y2: H / 2, stroke: "var(--line)" }),
    el("line", { y1: pad, y2: H - pad, x1: W / 2, x2: W / 2, stroke: "var(--line)" })
  );
  const ex = lineInfo(xi), ey = lineInfo(yi);
  svg.append(
    el("text", { class: "end-label", x: 10, y: H - 10 }, `← ${ex.low}`),
    el("text", { class: "end-label", x: W - 10, y: H - 10, "text-anchor": "end" }, `${ex.high} →`),
    el("text", { class: "end-label", x: W / 2 + 6, y: pad - 16 }, `↑ ${ey.high}`),
    el("text", { class: "end-label", x: W / 2 + 6, y: H - pad + 16 }, `↓ ${ey.low}`)
  );

  // Greedy label placement: try right, left, then nudged up/down until a label clears the others.
  const placed = [];
  if (you) placed.push({ x0: sx(you[xi]) - 16, x1: sx(you[xi]) + 16, y0: sy(you[yi]) - 26, y1: sy(you[yi]) + 10 });
  const hits = (b) => b.x0 < 4 || b.x1 > W - 4 || placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  // Unlabeled dots first, so labeled ones are drawn on top.
  const ordered = labels ? [...model.ideologies].sort((a, b) => labels.has(a.name) - labels.has(b.name)) : model.ideologies;
  for (const ideo of ordered) {
    const x = sx(ideo.scores[xi]), y = sy(ideo.scores[yi]);
    const hot = ideo.name === highlight;
    const g = el("g", { class: "dot", "data-id": ideo.id });
    g.append(el("title", {}, ideo.name));
    g.append(el("path", { d: shapePath(styleOf(ideo).shape, x, y, hot ? 6.5 : 4.5), fill: colorOf(ideo), opacity: !labels || labels.has(ideo.name) ? 1 : 0.4 }));
    // Your top match: same marker, larger, with a dark ring (not a different color).
    if (hot) g.append(el("circle", { cx: x, cy: y, r: 11, fill: "none", stroke: "var(--ink)", "stroke-width": 2 }));
    g.append(el("circle", { cx: x, cy: y, r: 13, fill: "transparent" })); // bigger tap target
    svg.append(g);
    if (labels && !labels.has(ideo.name)) continue;
    const w = ideo.name.length * 6.4;
    let spot = null;
    for (const dy of [0, -12, 12, -24, 24]) {
      for (const right of x < W - w - 20 ? [true, false] : [false, true]) {
        const lx = right ? x + 8 : x - 8;
        const box = { x0: right ? lx : lx - w, x1: right ? lx + w : lx, y0: y + dy - 6, y1: y + dy + 6 };
        if (!hits(box)) { spot = { lx, ly: y + dy + 4, right, box }; break; }
      }
      if (spot) break;
    }
    if (!spot) { const right = x < W - w - 20; spot = { lx: right ? x + 8 : x - 8, ly: y + 4, right, box: null }; }
    if (spot.box) placed.push(spot.box);
    g.append(el("text", { class: "lbl", x: spot.lx, y: spot.ly, "text-anchor": spot.right ? "start" : "end",
      style: hot ? "font-weight: 700" : "" }, ideo.name));
  }
  if (you) {
    const x = sx(you[xi]), y = sy(you[yi]);
    svg.append(
      el("circle", { cx: x, cy: y, r: 9, fill: "var(--surface)", stroke: "var(--ink)", "stroke-width": 3 }),
      el("circle", { cx: x, cy: y, r: 3.5, fill: "var(--ink)" }),
      el("text", { class: "you-lbl", x: x, y: y - 14, "text-anchor": "middle" }, "You")
    );
  }

  // The picked dot gets a ring and a label with a backing box so it reads over other labels.
  const pickLayer = el("g", { "pointer-events": "none" });
  svg.append(pickLayer);
  let picked = null;
  const unpick = () => {
    picked = null;
    pickLayer.replaceChildren();
    if (onUnpick) onUnpick();
  };
  const pick = (id) => {
    const ideo = model.ideologies.find((i) => i.id === id);
    if (!ideo) return;
    if (id === picked) return unpick();
    picked = id;
    const x = sx(ideo.scores[xi]), y = sy(ideo.scores[yi]);
    pickLayer.replaceChildren();
    const ring = el("circle", { cx: x, cy: y, r: 12, fill: "none", stroke: "var(--ink)", "stroke-width": 1.5, "stroke-dasharray": "3 2" });
    const label = el("text", { class: "pick-lbl", x, y: y - 16, "text-anchor": "middle" }, ideo.name);
    const box = el("rect", { rx: 4, fill: "var(--surface)", stroke: "var(--ink)" });
    pickLayer.append(ring, box, label);
    const b = label.getBBox();
    const shift = Math.min(0, W - 6 - (b.x + b.width)) + Math.max(0, 6 - b.x);
    label.setAttribute("x", x + shift);
    if (b.y < 4) label.setAttribute("y", y + 26);
    const nb = label.getBBox();
    for (const [k, v] of Object.entries({ x: nb.x - 6, y: nb.y - 3, width: nb.width + 12, height: nb.height + 6 })) box.setAttribute(k, v);
    if (onPick) onPick(ideo);
  };
  svg.setAttribute("viewBox", "0 0 640 440");
  svg.onclick = (e) => {
    const dot = e.target.closest(".dot");
    if (dot) pick(dot.dataset.id); else unpick();
  };
  svg.unpick = unpick;
  return pick;
}

// ---------- Quiz ----------

// Draws the flat map with "Across" and "Up" pickers over the real dividing lines.
// `figure` holds the svg, the two selects and a .map-note caption; `opts` go to drawMap.
function mountMap(figure, opts, { extraNote = "" } = {}) {
  const svg = figure.querySelector("svg"), note = figure.querySelector(".map-note");
  const xs = figure.querySelector("select.across"), ys = figure.querySelector("select.up");
  const options = Array.from({ length: SHOWN_LINES }, (_, i) => `<option value="${i}">${esc(lineInfo(i).name)}</option>`).join("");
  xs.innerHTML = options;
  ys.innerHTML = options;
  xs.value = "0";
  ys.value = "1";
  let lastX = 0, lastY = 1;
  const draw = (e) => {
    // The same line on both axes would only draw a diagonal, so swap instead.
    if (xs.value === ys.value) {
      if (e && e.target === xs) ys.value = String(lastX); else xs.value = String(lastY);
    }
    const x = Number(xs.value), y = Number(ys.value);
    lastX = x; lastY = y;
    drawMap(svg, x, y, opts);
    const share = model.components[x].share + model.components[y].share;
    note.textContent = `Together these two lines cover about ${pct(share)} of how ideologies differ. Tap a dot to see which ideology it is. ${extraNote}`;
  };
  xs.onchange = ys.onchange = draw;
  draw();
}

// Calibration for the "likely to hold" figure: precomputed by build.js, otherwise computed once
// on the first quiz screen (fast for the small interim data set).
let calibrationCache = typeof CALIBRATION !== "undefined" ? CALIBRATION : null;
const quizCalibration = () => (calibrationCache ??= calibrateCertainty(model));

// ---------- Pages ----------

// The header's call-to-action: "Start" on most pages; on the test page it's hidden until the result
// settles, then becomes "See results" so it's reachable at the top on small screens.
function setHeaderAction(mode) {
  const btn = document.querySelector(".header-start");
  btn.hidden = mode === "none";
  // "early": enough answers to stop (quiet outline); "results": the result has settled (solid).
  btn.classList.toggle("primary", mode !== "early");
  if (mode === "more") {
    btn.innerHTML = `<span aria-hidden="true">←</span> Answer more`;
    btn.setAttribute("href", "#/test");
    btn.title = "Keep answering to sharpen your result";
    btn.onclick = null;
    return;
  }
  if (mode === "take") {
    btn.innerHTML = `Take the test <span aria-hidden="true">→</span>`;
    btn.setAttribute("href", "#/test");
    btn.title = "";
    btn.onclick = (e) => { e.preventDefault(); history.replaceState(null, "", `${location.pathname}#/test`); order = []; lastAnswers = null; route(); };
    return;
  }
  if (mode === "results" || mode === "early") {
    // The words carry the meaning; the style only reinforces it.
    btn.innerHTML = mode === "early" ? `Results so far <span aria-hidden="true">→</span>` : `See your result <span aria-hidden="true">→</span>`;
    btn.title = mode === "early" ? "Your top match could still change if you keep answering" : "The questions have narrowed it down";
    btn.setAttribute("href", "#/results");
    btn.onclick = (e) => { e.preventDefault(); finishQuiz(); };
  } else {
    btn.innerHTML = `Start <span aria-hidden="true">→</span>`;
    btn.title = "";
    btn.setAttribute("href", "#/test");
    btn.onclick = null;
  }
}

const PAGES = ["home", "test", "results", "ideologies", "ideology", "people", "person", "compare", "about"];
const PAGE_TITLES = { home: "", test: "Test", results: "Results", ideologies: "Ideologies", people: "People", compare: "Compare", about: "About" };
const NAV_FOR = { ideology: "ideologies", person: "people" };

function show(page, { scroll = true, title = null } = {}) {
  for (const p of PAGES) $(`page-${p}`).hidden = p !== page;
  for (const a of document.querySelectorAll(".site-nav a")) {
    if (a.dataset.page === (NAV_FOR[page] || page)) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  if (page !== "test") setHeaderAction("start");
  document.body.classList.toggle("in-test", page === "test"); // phones hide the menu mid-test (see CSS)
  const t = title || PAGE_TITLES[page];
  document.title = t ? `${t} · ${SITE_NAME}` : SITE_NAME;
  closeMenu();
  if (scroll) window.scrollTo(0, 0);
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function renderQuestion() {
  const q = order[position];
  const asked = new Set(order);
  const answered = answers.filter((a) => a !== null).length;
  const sure = certainty(model, answers, asked);
  // Conservative on purpose: no reading until there's at least one answer per real dividing line, and
  // "See your result" waits until no simulated taker at this reading changed their top match.
  const hold = answered >= Math.max(1, REAL_LINES) ? stability(quizCalibration(), sure) : null;
  const early = hold != null;
  const settled = early && hold >= 1;
  $("counter").textContent = `Statement ${position + 1}`;
  // The bar and the text show the same figure. It stays empty for the first statements, and stays
  // where it was while there's no calibrated reading ("Narrowing it down…").
  if (hold != null || answered < REAL_LINES) $("bar").style.width = pct(hold ?? 0);
  // The figure is calibrated on simulated takers who are noisy copies of one ideology, so it overstates
  // how likely a real (mixed) taker's top match is to hold: it's shown as progress, not a probability.
  const status = $("certainty");
  status.classList.toggle("ready", settled);
  if (settled) {
    status.innerHTML = `✓ Narrowed down · <a href="#/results" id="ready-link">See your result →</a>`;
    $("ready-link").onclick = (e) => { e.preventDefault(); finishQuiz(); };
  } else status.textContent = answered < Math.max(1, REAL_LINES) ? "Most telling statements first"
    : hold == null ? "Narrowing it down…"
    : `Narrowing it down · ${pct(hold)}`;
  $("statement").textContent = QUESTIONS[q].text;
  $("back").disabled = position === 0;
  setHeaderAction(settled ? "results" : early ? "early" : "none");
  // "No opinion" shows as chosen when this statement was already shown and skipped.
  const buttons = [...SHOWN_CHOICES.map((c, i) => [$(`choice-${i}`), answers[q] === c.value]),
    [$("choice-none"), answers[q] === null && position < order.length - 1]];
  for (const [b, chosen] of buttons) {
    b.classList.toggle("chosen", chosen);
    b.setAttribute("aria-pressed", String(chosen));
  }
  const Q = QUESTIONS[q];
  $("explain").hidden = !Q.agree;
  $("explain-btn").hidden = !Q.agree;
  if ($("explain-sheet").open) $("explain-sheet").close();
  $("ex-agree").textContent = Q.agree || "";
  $("ex-disagree").textContent = Q.disagree || "";
  $("ex-note").textContent = Q.note || "";
}

function answer(value) {
  // Touch browsers keep focus (and :hover) on the tapped button; drop it so the next statement starts clean.
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  answers[order[position]] = value;
  position++;
  if (position === order.length) {
    const next = nextQuestion(model, answers, new Set(order));
    if (!next) { save(); finishQuiz(); return; }
    order.push(next.q);
  }
  save();
  renderQuestion();
}

function startQuiz(saved) {
  if (saved) ({ order, answers, position } = saved);
  else {
    answers = Array(QUESTIONS.length).fill(null);
    order = [nextQuestion(model, answers, new Set()).q];
    position = 0;
  }
  show("test");
  renderQuestion();
}

// A statement link (#/test/<id>, from "What it stands for") asks that statement now, keeping any
// answers so far; afterwards the test carries on as usual. The last statement in `order` is the one
// still waiting for an answer (unless the test ran out), so the linked one goes just before it.
function askStatement(id) {
  const q = QUESTIONS.findIndex((s) => s.id === id);
  if (order.length === 0) {
    const saved = load();
    if (saved) ({ order, answers, position } = saved);
    else { answers = Array(QUESTIONS.length).fill(null); position = 0; }
  }
  if (q < 0) return;
  const at = order.indexOf(q);
  if (at >= 0) position = at;
  else {
    position = position < order.length ? order.length - 1 : order.length;
    order.splice(position, 0, q);
  }
  save();
}

// Results are a page of their own: finishing stores the answers and navigates there.
let lastAnswers = null;
function finishQuiz() {
  lastAnswers = answers.map((a) => (a === undefined ? null : a));
  go("#/results");
}

// Options are listed top to bottom from "Strongly agree"; number keys follow the on-screen order.
const SHOWN_CHOICES = [...CHOICES].reverse();
for (const [i, c] of SHOWN_CHOICES.entries()) {
  const b = document.createElement("button");
  b.id = `choice-${i}`;
  b.dataset.value = c.value;
  b.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${c.label}</span><span class="key" aria-hidden="true">${i + 1}</span>`;
  b.addEventListener("click", () => answer(c.value));
  $("likert").append(b);
}
// "No opinion": off the agree–disagree scale (the statement isn't counted), so it comes last, but
// styled like the other options so it reads as a real choice rather than an escape hatch.
{
  const b = document.createElement("button");
  b.id = "choice-none";
  b.className = "no-opinion";
  b.innerHTML = `<span class="dot" aria-hidden="true"></span><span>No opinion</span><span class="key" aria-hidden="true">6</span>`;
  b.addEventListener("click", () => answer(null));
  $("likert").append(b);
}
$("back").addEventListener("click", () => { if (position > 0) { position--; save(); renderQuestion(); } });
$("resume").addEventListener("click", () => go("#/test"));


// On phones the agree/disagree explanation opens as a bottom sheet instead of taking up the page.
$("explain-btn").addEventListener("click", () => {
  const Q = QUESTIONS[order[position]];
  $("sheet-statement").textContent = Q.text;
  $("sheet-agree").textContent = Q.agree || "";
  $("sheet-disagree").textContent = Q.disagree || "";
  $("sheet-note").textContent = Q.note || "";
  $("explain-sheet").showModal();
});
$("sheet-close").addEventListener("click", () => $("explain-sheet").close());
$("explain-sheet").addEventListener("click", (e) => { if (e.target === $("explain-sheet")) $("explain-sheet").close(); });

// Start over: a second tap within a few seconds confirms, so progress isn't wiped by accident.
let restartTimer = 0;
$("restart").addEventListener("click", () => {
  const btn = $("restart");
  if (!btn.classList.contains("confirming")) {
    btn.classList.add("confirming");
    btn.textContent = "Tap again to start over";
    restartTimer = setTimeout(() => { btn.classList.remove("confirming"); btn.textContent = "Start over"; }, 4000);
    return;
  }
  clearTimeout(restartTimer);
  btn.classList.remove("confirming");
  btn.textContent = "Start over";
  clearSaved();
  lastAnswers = null;
  startQuiz(null);
});
document.addEventListener("keydown", (e) => {
  if ($("page-test").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 5) answer(SHOWN_CHOICES[n - 1].value);
  else if (n === 6) answer(null);
  else if (e.key === "Backspace") $("back").click();
});

// ---------- Results ----------

// ---------- Share links ----------
// A result link carries only the answers: "?r=2." + one character per statement in data order,
// 0-4 for strongly disagree..strongly agree and "-" for skipped or not asked. The "2." is a
// format version; bump it whenever the statement list changes so old links stop decoding.

const CODE = "01234";
function encodeAnswers(given) {
  return "2." + given.map((a) => (a == null ? "-" : CODE[a + 2])).join("");
}
function decodeAnswers(s) {
  const m = /^2\.([0-4-]+)$/.exec(s || "");
  if (!m || m[1].length !== QUESTIONS.length) return null;
  return [...m[1]].map((c) => (c === "-" ? null : CODE.indexOf(c) - 2));
}
function shareUrl(given) {
  return `${location.origin}${location.pathname}?r=${encodeAnswers(given)}`;
}

const REPO = "https://github.com/brioja/political-ideology-atlas";

// Audit text is data, never markup.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const word = (v) => CHOICES.find((c) => c.value === v).label;

// The positions that set an ideology apart: strong answers far from the average ideology's.
function keyBeliefs(ideo, n = 4) {
  return ideo.profile
    .map((p, q) => ({ q, p, d: Math.abs(p - model.mean[q]) }))
    .filter((x) => x.p !== 0)
    .sort((a, b) => b.d - a.d || Math.abs(b.p) - Math.abs(a.p))
    .slice(0, n);
}

// A position in plain words: the stance itself (from the statement's agree/disagree explanation)
// rather than "disagree" with a negatively worded statement. The tag carries only the strength.
function stance(q, v) {
  if (v == null) return { tag: "No known position", cls: "none", text: `No known position on: ${q.text}` };
  if (v === 0) return { tag: "Mixed", cls: "mixed", text: `Mixed on: ${q.text}` };
  const plain = v > 0 ? q.agree : q.disagree;
  return {
    tag: Math.abs(v) === 2 ? "Strongly" : "Leans",
    cls: Math.abs(v) === 2 ? "strong" : "lean",
    text: plain || `${v > 0 ? "Agrees" : "Disagrees"}: ${q.text}`,
  };
}

function beliefList(ideo, n = 4) {
  return `<ul class="beliefs">${keyBeliefs(ideo, n).map((b) => {
    const s = stance(QUESTIONS[b.q], b.p);
    return `<li>${topicIcon(QUESTIONS[b.q])}<a class="belief-link" href="#/test/${encodeURIComponent(QUESTIONS[b.q].id)}" title="Where do you stand on this?">${esc(s.text)}</a></li>`;
  }).join("")}</ul>`;
}

// "You: … / Feudalism: …" for a statement where two answers differ. Each side is its own positive
// statement; the name reads like a speaker's, so a long one wraps with the text.
function versus(q, mine, theirs, me, them) {
  return `<li class="versus">${topicIcon(q)}<div class="stack-tight"><span><span class="who">${esc(me)}:</span> ${esc(stance(q, mine).text)}</span>
    <span><span class="who">${esc(them)}:</span> ${esc(stance(q, theirs).text)}</span></div></li>`;
}

// The card shown under a map when a dot is picked.
function pickCard(container, ideo, { similarity = null, onClose = null } = {}) {
  container.hidden = false;
  container.innerHTML = `
    <div class="pick-head"><h3>${posGlyph(ideo, 18)}${esc(ideo.name)}</h3>
      ${similarity != null ? `<span class="mono small">${pct(similarity)} match</span>` : ""}
      ${onClose ? `<button type="button" class="pick-close" aria-label="Close">×</button>` : ""}</div>
    ${aboutIdeology(ideo)}
    <h4>What it stands for</h4>
    ${beliefList(ideo, 3)}
    <p><a class="more-link" href="${ideologyHref(ideo.id)}">Open the full page for ${esc(ideo.name)} →</a></p>`;
  if (onClose) container.querySelector(".pick-close").onclick = onClose;
}

function readMore(ideo) {
  const links = [];
  if (ideo.wikipedia) links.push(`<a href="${esc(ideo.wikipedia)}" target="_blank" rel="noopener">Wikipedia</a>`);
  for (const r of ideo.furtherReading || []) {
    if (r.url !== ideo.wikipedia) links.push(`<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>`);
  }
  if (ideo.audited) links.push(`<a href="${REPO}/blob/main/audits/profiles/${esc(ideo.id)}.json" target="_blank" rel="noopener">How this profile was researched</a>`);
  return links.length ? `<p class="read-more small"><span class="muted">Read more:</span> ${links.join('<span class="muted"> · </span>')}</p>` : "";
}

function aboutIdeology(ideo) {
  return (ideo.summary ? `<p>${esc(ideo.summary)}</p>` : "") + relatedLine(ideo) + readMore(ideo);
}

// Ideologies whose positions can't be told apart from this one (scripts/build.js).
function relatedLine(ideo) {
  if (!ideo.related || !ideo.related.length) return "";
  const names = ideo.related.map((r) => r.wikipedia
    ? `<a href="${esc(r.wikipedia)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name));
  return `<p class="small muted">Holds the same positions as ${names.join(", ")}.</p>`;
}

// The description with the Wikipedia article's lead image beside it (when it has a free one), for
// the places that show one ideology in full: the results' top match and the ideology page.
function aboutWithImage(ideo) {
  const im = ideo.image;
  if (!im) return aboutIdeology(ideo);
  return `<div class="with-figure"><figure class="ideo-figure">
      <img src="${esc(im.url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
      <figcaption class="credit">Image: ${esc(im.artist)}, <a href="${esc(im.source)}" target="_blank" rel="noopener">${esc(im.license)}</a>, via Wikimedia Commons</figcaption>
    </figure>${aboutIdeology(ideo)}</div>`;
}

// Pass `shared` (decoded answers) to show someone else's result from a link.
function showResults(shared = null) {
  const given = shared || lastAnswers;
  const { you, ranked } = match(model, given);
  const top = ranked[0];
  const answered = given.filter((a) => a !== null).length;
  // More questions are left when the quiz stopped early (it settled, or you chose to see results):
  // "Answer more questions" goes back to the next one, and the result sharpens as you answer.
  const progress = order.length ? { order, position } : load();
  const canContinue = !shared && !!progress && progress.position < progress.order.length;
  const R = $("results");
  const You = shared ? "They" : "You";
  const you_ = shared ? "they" : "you";
  const your = shared ? "their" : "your";

  const answeredDiffs = (ideo) => given
    .map((a, q) => (a === null ? null : { q, a, t: ideo.profile[q], gap: Math.abs(a - ideo.profile[q]) }))
    .filter(Boolean);
  const diffs = answeredDiffs(top);
  const agree = diffs.filter((d) => d.gap === 0 && d.a !== 0).sort((x, y) => Math.abs(y.a) - Math.abs(x.a)).slice(0, 4);
  const disagree = diffs.filter((d) => d.gap >= 2).sort((x, y) => y.gap - x.gap).slice(0, 4);
  const closeCall = ranked[1].similarity > top.similarity - 0.05;
  const topPeople = typeof PEOPLE !== "undefined" && PEOPLE.length
    ? matchPeople(model, given, PEOPLE.map((p) => ({ ...p, profile: p.profile.slice(0, QUESTIONS.length) }))).slice(0, 3) : [];

  const others = ranked.slice(1, 7).map((r) => {
    const apart = answeredDiffs(r).filter((d) => d.gap >= 2).sort((x, y) => y.gap - x.gap).slice(0, 2);
    return `
      <li><details>
        <summary><span class="match-name">${posGlyph(r)}${esc(r.name)}</span><span class="bar"><span style="width:${pct(r.similarity)}"></span></span><span class="mono">${pct(r.similarity)}</span></summary>
        <div class="match-body">
          ${aboutIdeology(r)}
          <h4>What it stands for</h4>
          ${beliefList(r)}
          <p><a class="more-link" href="${ideologyHref(r.id)}">Full page for ${esc(r.name)} →</a></p>
          ${apart.length ? `<h4>Where ${you_} differ most</h4><ul class="iconed">${apart.map((d) =>
            versus(QUESTIONS[d.q], d.a, d.t, You, r.name)).join("")}</ul>` : ""}
        </div>
      </details></li>`;
  }).join("");

  R.innerHTML = `
    ${shared ? `<div class="shared-banner"><span>You're viewing someone's shared result.</span><button class="primary" id="own-test">Take the test yourself</button></div>` : ""}
    <div class="verdict tinted" style="${flagTint(top)}">
      <span class="eyebrow">${pct(top.similarity)} match · based on ${answered} answers</span>
      <h1 class="name">${esc(top.name)}</h1>
      ${topPeople.length ? `<a class="hero-person" href="${personHref(topPeople[0].id)}">
          ${avatar(topPeople[0], 88)}
          <span class="stack-tight">
            <span class="eyebrow">Thinks most like ${shared ? "them" : "you"}</span>
            <span class="hero-person-name">${esc(topPeople[0].name)}</span>
            ${topPeople[0].role ? `<span class="muted small">${esc(topPeople[0].role)}</span>` : ""}
          </span>
          <span class="hero-person-pct">${pct(topPeople[0].similarity)}<span class="muted small"> alike</span></span>
        </a>
        ${topPeople.length > 1 ? `<div class="people-strip">${topPeople.slice(1, 3).map((p) => `<a class="person-chip" href="${personHref(p.id)}">${avatar(p, 28)}<span>${esc(p.name)}</span><span class="mono small">${pct(p.similarity)}</span></a>`).join("")}</div>` : ""}` : ""}
      <div class="row verdict-actions">
        <a class="more-link" href="${ideologyHref(top.id)}">Explore ${esc(top.name)} in detail →</a>
      </div>
      ${aboutWithImage(top)}
      <p class="muted">${closeCall
        ? `It's close: ${you_} are almost as near to <strong>${ranked[1].name}</strong>${canContinue
          ? `. <a href="#/test">Answer a few more questions</a> to tell them apart.`
          : `, so it's worth reading both.`}`
        : `${shared ? "Their" : "Your"} next closest match is <strong>${ranked[1].name}</strong>.`}</p>
    </div>
    ${shared ? "" : `<div class="row"><a class="btn" href="#share" id="to-share">Share your result <span aria-hidden="true">↓</span></a></div>`}

    <section>
      <h2>What ${top.name} stands for</h2>
      ${beliefList(top)}
    </section>

    ${keyFiguresSection(top)}

    <section>
      <h2>Why ${you_} matched</h2>
      <div class="diffs">
        <div class="stack"><h3>${You} agree on</h3><ul class="iconed">${agree.map((d) => `<li>${topicIcon(QUESTIONS[d.q])}<span>${esc(stance(QUESTIONS[d.q], d.a).text)}</span></li>`).join("") || "<li class='muted'>No exact matches on strong views.</li>"}</ul></div>
        <div class="stack"><h3>${You} part ways on</h3><ul class="iconed">${disagree.map((d) => versus(QUESTIONS[d.q], d.a, d.t, You, top.name)).join("") || "<li class='muted'>No major disagreements.</li>"}</ul></div>
      </div>
      ${shared ? "" : `<div class="row"><a class="btn" href="${compareHref("me", `i:${top.id}`)}">Full comparison with ${esc(top.name)}</a><a class="btn" href="#/compare">Compare with anyone</a></div>`}
    </section>

    <section>
      <h2>Other close matches</h2>
      <p class="muted small">Tap one to see what it stands for and where ${you_} differ.</p>
      <ul class="matches">${others}</ul>
    </section>

    ${typeof PEOPLE !== "undefined" && PEOPLE.length ? `
    <section>
      <h2>People who think like ${shared ? "them" : "you"}</h2>
      <p class="muted small">Matched on the statements where both ${shared ? "this person and each figure" : "you and they"} have a known position.</p>
      <ul class="matches">${matchPeople(model, given, PEOPLE).slice(0, 5).map((p) => `
        <li><details>
          <summary><span class="match-name">${avatar(p)}${esc(p.name)}</span><span class="bar"><span style="width:${pct(p.similarity)}"></span></span><span class="mono">${pct(p.similarity)}</span></summary>
          <div class="match-body">${personBody(p)}<p class="muted small">Based on ${p.overlap} statements you both have a position on.</p>
            <p><a class="more-link" href="${personHref(p.id)}">Full page for ${esc(p.name)} →</a></p></div>
        </details></li>`).join("")}
      </ul>
    </section>` : ""}

    <section>
      <h2>Where ${you_} stand</h2>
      <p>Most disagreement between ideologies comes down to a few big dividing lines. The test found them by looking at how the ideologies answer, rather than deciding them in advance. The ${SHOWN_LINES} below are the ones that stand out from random noise, from biggest to smallest.</p>
      <div id="axes"></div>
    </section>

    <section>
      <h2>The map</h2>
      <figure>
        <div class="row map-pickers">
          <label for="result-across">Across</label><select id="result-across" class="across"></select>
          <label for="result-up">Up</label><select id="result-up" class="up"></select>
        </div>
        <svg id="result-map" class="chart" viewBox="0 0 640 440" role="img" aria-label="Map of the ideologies on two dividing lines"></svg>
        <figcaption class="map-note"></figcaption>
      </figure>
      <div class="pick" id="result-pick" hidden></div>
    </section>

    ${shared ? "" : `
    <section id="share">
      <h2>Share your result</h2>
      <p>The link opens this results page for anyone. It contains your answers to each statement and nothing else, so anyone with it can see how you answered.</p>
      <div class="share-link">
        <input id="share-url" readonly aria-label="Link to your result">
        <button class="primary" id="copy-link">Copy link</button>
        <button id="native-share" hidden>Share…</button>
      </div>
      <div class="row">
        <button id="save-image">Save image</button>
        <span class="muted" id="share-status" role="status"></span>
      </div>
      <figure>
        <canvas id="card" class="card-preview" width="1080" height="1350" aria-label="Shareable image of your result"></canvas>
        <figcaption>Save the image to post alongside your link.</figcaption>
      </figure>
      <p class="support-line">Enjoyed it? The test is free, ad-free and doesn't track you. <a href="https://ko-fi.com/sibshops" target="_blank" rel="noopener">Support it on Ko-fi ♥</a></p>
    </section>`}

    <p class="muted small">Curious how the matching and the dividing lines work? <a href="#/about">Read about the method and sources</a>.</p>

    <div class="row">${canContinue ? `<a class="btn primary" href="#/test">Answer more questions</a>` : ""}<button class="${shared || canContinue ? "" : "primary"}" id="retake">${shared ? "Take the test yourself" : "Take it again"}</button></div>
  `;

  const axesBox = $("axes");
  // Three of the line's cluster statements per end. A rotated line often loads on one end only, so
  // an end short of its own is topped up with the other end's spare ones, in their disagree wording.
  const sides = (L, cluster) => {
    const low = cluster.filter((p) => p.w < 0), high = cluster.filter((p) => p.w > 0);
    const end = (name, own, other) => {
      const items = own.slice(0, 3).map((p) => p.text)
        .concat(other.slice(3, 3 + 3 - Math.min(own.length, 3)).map((p) => esc(QUESTIONS[p.q].disagree)));
      return `<div><p class="pull-head">${esc(name)}</p><ul class="plain">${items.map((t) => `<li>${t}</li>`).join("")}</ul></div>`;
    };
    return `<div class="sides">${end(L.low, low, high)}${end(L.high, high, low)}</div>`;
  };
  for (let i = 0; i < SHOWN_LINES; i++) {
    const ax = describeAxis(model, i, QUESTIONS);
    const L = lineInfo(i);
    const vals = model.ideologies.map((d) => d.scores[i]).concat(you[i]);
    const scale = lineScale(vals);
    const pos = (v) => 6 + scale(v) * 588;
    const div = document.createElement("div");
    div.className = "axis";
    div.innerHTML = `
      <div class="axis-head"><h3>${lineTitle(L)}</h3>${weightBar(i)}</div>
      <svg viewBox="0 0 600 34" style="width:100%;height:auto;display:block" aria-hidden="true">
        <line x1="6" x2="594" y1="17" y2="17" stroke="var(--line)" stroke-width="2"></line>
        ${model.ideologies.map((d) => `<path d="${shapePath(styleOf(d).shape, pos(d.scores[i]), 17, d.name === top.name ? 6 : 4)}" fill="${colorOf(d)}" opacity="${d.name === top.name ? 1 : 0.45}"><title>${esc(d.name)}</title></path>`).join("")}
        <circle cx="${pos(you[i])}" cy="17" r="7" fill="var(--surface)" stroke="var(--ink)" stroke-width="3"><title>${shared ? "Them" : "You"}</title></circle>
      </svg>
      <details><summary>What divides ${esc(L.low)} and ${esc(L.high)}?</summary>
        ${sides(L, ax.cluster)}
      </details>`;
    axesBox.append(div);
  }

  const near = new Set(ranked.slice(0, 8).map((r) => r.name));
  const simById = new Map(ranked.map((r) => [r.id, r.similarity]));
  mountMap($("result-map").closest("figure"), { you, highlight: top.name, labels: model.ideologies.length > 25 ? near : null,
    onPick: (ideo) => pickCard($("result-pick"), ideo, { similarity: simById.get(ideo.id), onClose: () => $("result-map").unpick() }),
    onUnpick: () => { $("result-pick").hidden = true; } },
    { extraNote: `Close dots answer alike. ${shared ? "Their" : "Your"} match list uses every answer, not just these lines.` });

  const fresh = () => {
    if (shared) history.replaceState(null, "", `${location.pathname}#/test`);
    else clearSaved();
    order = [];
    lastAnswers = null;
    go("#/test");
  };
  $("retake").addEventListener("click", fresh);
  if (shared) $("own-test").addEventListener("click", fresh);
  else setUpSharing(given, ranked, you);
  setHeaderAction(shared ? "take" : canContinue ? "more" : "none");
}

function drawScree(svg) {
  const W = 640, H = 220, left = 40, bottom = 30, top = 14;
  const comps = model.components.slice(0, 15);
  const max = Math.ceil(comps[0].share * 10) / 10;
  const bw = (W - left - 10) / comps.length;
  const y = (v) => H - bottom - (v / max) * (H - bottom - top);
  for (let t = 0; t <= max + 1e-9; t += 0.1) {
    svg.append(el("line", { x1: left, x2: W - 10, y1: y(t), y2: y(t), stroke: "var(--line)" }));
    svg.append(el("text", { x: left - 6, y: y(t) + 4, "text-anchor": "end" }, pct(t)));
  }
  comps.forEach((c, i) => {
    const x = left + i * bw + 3;
    const used = i < SHOWN_LINES;
    svg.append(el("rect", { x, y: y(c.share), width: bw - 6, height: H - bottom - y(c.share),
      fill: used ? "var(--accent)" : "var(--line)", rx: 2 }));
    svg.append(el("text", { x: x + (bw - 6) / 2, y: H - bottom + 16, "text-anchor": "middle" }, i + 1));
  });
}

// ---------- Sharing ----------

function setUpSharing(given, ranked, you) {
  const url = shareUrl(given);
  const status = $("share-status");
  $("share-url").value = url;
  // The button under the verdict jumps to the Share section (the hash is the router's, so scroll instead).
  $("to-share").addEventListener("click", (e) => {
    e.preventDefault();
    $("share").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  // The phone's share sheet, where the browser has one.
  if (navigator.share) {
    const btn = $("native-share");
    btn.hidden = false;
    btn.addEventListener("click", () => navigator.share({ title: `My closest political ideology: ${ranked[0].name}`, url }).catch(() => {}));
  }

  $("copy-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = "Link copied.";
    } catch {
      $("share-url").select();
      status.textContent = "Press Ctrl+C (or ⌘C) to copy the selected link.";
    }
  });

  const canvas = $("card");
  drawShareCard(canvas, { ranked, you, people: cardPeople(given), answered: given.filter((a) => a !== null).length });
  $("save-image").addEventListener("click", () => {
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `political-ideology-${ranked[0].name.toLowerCase().replace(/[^a-z]+/g, "-")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      status.textContent = "Image saved.";
    }, "image/png");
  });
}

// The card uses a fixed light palette: it's an image that gets posted elsewhere, not page UI.
const CARD = { bg: "#eef1f4", surface: "#ffffff", ink: "#17202b", muted: "#5b6776", line: "#d3d9e1", accent: "#1f6f78", accent2: "#8a3b6b", point: "#5b6776" };
// An ideology's traditional color for marks on the card: its first color that stands out against the
// light background (3:1, the usual minimum for graphics), else its darkest one darkened until it does.
// Ideologies without colors keep the neutral point color.
function cardColor(ideo) {
  const colors = ideo && ideo.flag ? ideo.flag.colors.map((c) => c.hex) : [];
  if (!colors.length) return CARD.point;
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const limit = (lum(rgb(CARD.bg)) + 0.05) / 3 - 0.05;
  // Prefer real colors over neutral shades (grey, black, white) when an ideology has both.
  const sat = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255)); };
  const vivid = colors.filter((h) => sat(rgb(h)) >= 0.15);
  const pool = vivid.length ? vivid : colors;
  let c = rgb(pool.find((h) => lum(rgb(h)) <= limit) || pool.reduce((a, b) => (lum(rgb(b)) < lum(rgb(a)) ? b : a)));
  while (lum(c) > limit) c = c.map((v) => Math.round(v * 0.9));
  return `rgb(${c.join(", ")})`;
}
// The globe mark's three meridians (brand colors, as in the header logo).
const LOGO = { left: "#C2185B", center: "#A67C00", right: "#1565C0" };
const CARD_FONTS = { display: '"Bricolage Grotesque", "Segoe UI", sans-serif', body: '"Source Serif 4", Georgia, serif', mono: '"IBM Plex Mono", monospace' };

// The site's globe mark (as in the header), drawn at (x, y) top-left with the given size.
function drawGlobe(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(size / 28, size / 28);
  ctx.lineCap = "butt";
  const line = (d, color, width, alpha = 1) => {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(new Path2D(d)); ctx.globalAlpha = 1;
  };
  line("M2.5 14H25.5", CARD.muted, 1.2, 0.6);
  line("M14 2.5A6.5 11.5 0 0 0 14 25.5", LOGO.left, 2.2);
  line("M14 2.5V25.5", LOGO.center, 2.2);
  line("M14 2.5A6.5 11.5 0 0 1 14 25.5", LOGO.right, 2.2);
  line("M25.5 14A11.5 11.5 0 1 1 2.5 14A11.5 11.5 0 1 1 25.5 14", CARD.ink, 2); // outline last
  ctx.restore();
}

function fitText(ctx, text, maxWidth, size, weight, family) {
  do ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && --size > 24);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  let line = "";
  for (const word of text.split(" ")) {
    if (line && ctx.measureText(`${line} ${word}`).width > maxWidth) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = line ? `${line} ${word}` : word;
  }
  ctx.fillText(line, x, y);
  return y + lineHeight;
}

// Portrait share image (1080x1350, the 4:5 size phones and social feeds show uncropped): the ideology
// name, the closest person as the hero, other matches and people, and where you stand.
// The landscape drawCard() remains for the generic link preview (og.png).
function loadPhoto(p) {
  return new Promise((resolve) => {
    if (!p || !p.image) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous"; // Wikimedia allows it, so the canvas can still be saved
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = p.image.url;
  });
}

// Draws `img` to fill the box (cropping, biased toward the top where faces usually are).
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, Math.max(0, (img.height - sh) * 0.2), sw, sh, x, y, w, h);
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

async function drawShareCard(canvas, result, site = `${location.host}${location.pathname.replace(/\/$/, "")}`) {
  try {
    await Promise.all([
      document.fonts.load(`700 72px ${CARD_FONTS.display}`),
      document.fonts.load(`400 24px ${CARD_FONTS.body}`),
      document.fonts.load(`400 18px ${CARD_FONTS.mono}`),
    ]);
  } catch {}
  // A feed shows the card at about a third of its size, so nothing that should be read in the feed
  // is set below ~26px, and the card shows only what fits at that size.
  const W = 1080, H = 1350, PAD = 72;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const { ranked, you } = result;
  const top = ranked[0];
  const people = (result.people || []).slice(0, 4);
  const markColor = cardColor;
  const photos = await Promise.all(people.map(loadPhoto));

  // Background: neutral, with a soft wash of the top ideology's traditional colors (or its family
  // color when it has none), blended corner to corner so the colors set a mood without being a flag.
  ctx.fillStyle = CARD.bg; ctx.fillRect(0, 0, W, H);
  const wash = top.flag && top.flag.colors.length ? top.flag.colors.map((x) => x.hex) : [markColor(top)];
  const grad = ctx.createLinearGradient(0, 0, W, H);
  (wash.length === 1 ? [wash[0], wash[0]] : wash).forEach((col, i, all) => grad.addColorStop(i / (all.length - 1), col));
  ctx.globalAlpha = 0.16; ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic";

  // Header: site name (so a post says which test this is), then the ideology name.
  drawGlobe(ctx, PAD, 60, 44);
  ctx.fillStyle = CARD.muted; ctx.font = `500 28px ${CARD_FONTS.mono}`;
  ctx.fillText(SITE_NAME.toUpperCase(), PAD + 62, 92);
  ctx.fillStyle = CARD.ink;
  fitText(ctx, top.name, W - PAD * 2, 92, 700, CARD_FONTS.display);
  ctx.fillText(top.name, PAD, 200);
  ctx.fillStyle = CARD.muted; ctx.font = `400 30px ${CARD_FONTS.body}`;
  ctx.fillText(`${pct(top.similarity)} match · closest ideology${result.answered != null ? ` · based on ${result.answered} answers` : ""}`, PAD, 248);

  const card = (x, y, w, h) => {
    ctx.fillStyle = CARD.surface; ctx.strokeStyle = "rgba(23, 32, 43, 0.08)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill(); ctx.stroke();
  };
  const label = (text, x, y) => { ctx.fillStyle = CARD.muted; ctx.font = `500 26px ${CARD_FONTS.mono}`; ctx.fillText(text, x, y); };

  let y = 268;
  // Hero: the person who thinks most like you.
  if (people.length) {
    const p = people[0], hh = 290;
    card(PAD, y, W - PAD * 2, hh);
    const pw = 290;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(PAD, y, pw, hh, [22, 0, 0, 22]); ctx.clip();
    if (photos[0]) drawCover(ctx, photos[0], PAD, y, pw, hh);
    else { ctx.fillStyle = CARD.line; ctx.fillRect(PAD, y, pw, hh); }
    ctx.restore();
    const tx = PAD + pw + 40, tw = W - PAD - 36 - tx;
    label("THINKS MOST LIKE YOU", tx, y + 50);
    ctx.fillStyle = CARD.ink; ctx.font = `700 52px ${CARD_FONTS.display}`;
    const nameLines = wrapLines(ctx, p.name, tw, 2);
    nameLines.forEach((l, i) => ctx.fillText(l, tx, y + 108 + i * 56));
    const ry = y + 108 + (nameLines.length - 1) * 56 + 40;
    if (p.role) {
      // A two-line name leaves room for one line of role, so nothing runs into the percentage.
      ctx.fillStyle = CARD.muted; ctx.font = `400 28px ${CARD_FONTS.body}`;
      wrapLines(ctx, p.role, tw, nameLines.length > 1 ? 1 : 2).forEach((l, i) => ctx.fillText(l, tx, ry + i * 34));
    }
    ctx.fillStyle = CARD.ink; ctx.font = `700 76px ${CARD_FONTS.display}`;
    ctx.fillText(pct(p.similarity), tx, y + hh - 28);
    const pw2 = ctx.measureText(pct(p.similarity)).width;
    ctx.fillStyle = CARD.muted; ctx.font = `400 30px ${CARD_FONTS.body}`;
    ctx.fillText("alike", tx + pw2 + 14, y + hh - 32);
    y += hh + 20;
  }

  // Two columns, unlabelled (avatars and bars tell them apart): the next three ideologies, and three
  // more people. Rows in both columns share centres.
  const colW = (W - PAD * 2 - 28) / 2, ch = 200;
  const morePeople = people.slice(1, 4);
  const ideoW = morePeople.length ? colW : W - PAD * 2;
  card(PAD, y, ideoW, ch);
  // Names in a column share one size: as large as fits the longest (down to `min`); a name that
  // still doesn't fit is shortened.
  const columnSize = (names, maxW, weight, size, min) => {
    const widest = (n) => { ctx.font = `${weight} ${n}px ${CARD_FONTS.body}`; return Math.max(...names.map((t) => ctx.measureText(t).width)); };
    while (widest(size) > maxW && size > min) size--;
    return size;
  };
  const fitName = (text, maxW, weight, size) => {
    ctx.font = `${weight} ${size}px ${CARD_FONTS.body}`;
    while (ctx.measureText(text).width > maxW && text.length > 4) text = text.slice(0, -2) + "…";
    return text;
  };
  // Each ideology's name gets the full width; its percentage sits at the end of its bar.
  const closeIdeos = ranked.slice(1, 4), ideoNameW = ideoW - 64;
  const ideoSize = columnSize(closeIdeos.map((r) => r.name), ideoNameW, 400, 30, 24);
  closeIdeos.forEach((r, i) => {
    const ry = y + 50 + i * 54, x = PAD + 32, w = ideoW - 64, barW = w - 76;
    ctx.fillStyle = CARD.ink;
    ctx.fillText(fitName(r.name, ideoNameW, 400, ideoSize), x, ry);
    ctx.fillStyle = "rgba(23, 32, 43, 0.1)"; ctx.fillRect(x, ry + 18, barW, 6);
    ctx.fillStyle = markColor(r); ctx.fillRect(x, ry + 18, barW * r.similarity, 6);
    ctx.fillStyle = CARD.muted; ctx.font = `400 24px ${CARD_FONTS.mono}`; ctx.textAlign = "right";
    ctx.fillText(pct(r.similarity), x + w, ry + 26); ctx.textAlign = "left";
  });
  if (morePeople.length) {
    const x0 = PAD + colW + 28;
    card(x0, y, colW, ch);
    const personNameW = colW - 64 - 68 - 62;
    const personSize = columnSize(morePeople.map((p) => p.name), personNameW, 600, 29, 22);
    morePeople.forEach((p, i) => {
      const cy = y + 54 + i * 54 - 8, r = 24, x = x0 + 32;
      ctx.save();
      ctx.beginPath(); ctx.arc(x + r, cy, r, 0, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = CARD.line; ctx.fill();
      if (photos[i + 1]) { ctx.clip(); drawCover(ctx, photos[i + 1], x, cy - r, r * 2, r * 2); }
      ctx.restore();
      ctx.fillStyle = CARD.ink;
      ctx.fillText(fitName(p.name, personNameW, 600, personSize), x + 68, cy + 10);
      ctx.fillStyle = CARD.muted; ctx.font = `400 26px ${CARD_FONTS.mono}`; ctx.textAlign = "right";
      ctx.fillText(pct(p.similarity), x0 + colW - 32, cy + 10); ctx.textAlign = "left";
    });
  }
  y += ch + 12;

  // Where you stand on the real dividing lines: all of them, unless the card runs out of room. Each
  // row is "low end  ──○──  high end", so rows can sit 36px apart; the last needs ~20px above the footer.
  const room = H - 130 - 20 - (y + 68);
  const lines = Math.max(1, Math.min(SHOWN_LINES, Math.floor(room / 36) + 1));
  const lh = lines > 1 ? Math.min(64, room / (lines - 1)) : 0;
  label("WHERE YOU STAND", PAD, y + 30);
  {
    // Key: the dark ring is you, the faint marker your top match.
    let kx = W - PAD;
    ctx.font = `400 26px ${CARD_FONTS.body}`; ctx.textAlign = "right"; ctx.fillStyle = CARD.muted;
    ctx.fillText(top.name, kx, y + 30); kx -= ctx.measureText(top.name).width + 16;
    ctx.globalAlpha = 0.85; ctx.fillStyle = markColor(top);
    ctx.fill(new Path2D(shapePath(styleOf(top).shape, kx - 8, y + 21, 10))); ctx.globalAlpha = 1;
    kx -= 40; ctx.fillStyle = CARD.muted; ctx.fillText("You", kx, y + 30); kx -= ctx.measureText("You").width + 18;
    ctx.fillStyle = CARD.surface; ctx.strokeStyle = CARD.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(kx, y + 21, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.textAlign = "left";
  }
  // An end's name (the same one lineInfo gives the page), as large as fits its column (down to 22px);
  // shortened only if it can't fit even then.
  const endLabel = (text, x, ty, align) => {
    const sizeFor = (text) => {
      let size = 30;
      ctx.font = `600 ${size}px ${CARD_FONTS.display}`;
      while (ctx.measureText(text).width > END_W && size > 22) ctx.font = `600 ${--size}px ${CARD_FONTS.display}`;
      return ctx.measureText(text).width <= END_W ? size : 0;
    };
    if (!sizeFor(text)) {
      while (ctx.measureText(text).width > END_W && text.length > 4) text = text.slice(0, -2) + "…";
    }
    ctx.fillStyle = CARD.ink; ctx.textAlign = align; ctx.fillText(text, x, ty + 10); ctx.textAlign = "left";
  };
  const END_W = 262;
  for (let i = 0; i < lines; i++) {
    const ty = y + 68 + i * lh;
    const x0 = PAD + END_W + 24, x1 = W - PAD - END_W - 24;
    const vals = model.ideologies.map((d) => d.scores[i]).concat(you[i]);
    const scale = lineScale(vals);
    const px = (v) => x0 + scale(v) * (x1 - x0);
    const L = lineInfo(i);
    endLabel(L.low, x0 - 24, ty, "right");
    endLabel(L.high, x1 + 24, ty, "left");
    // Bigger lines (more of the differences) get a thicker track; the biggest comes first.
    ctx.strokeStyle = "rgba(23, 32, 43, 0.18)"; ctx.lineWidth = 2 + 6 * lineWeight(i); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x1, ty); ctx.stroke(); ctx.lineCap = "butt";
    ctx.globalAlpha = 0.85; ctx.fillStyle = markColor(top);
    ctx.fill(new Path2D(shapePath(styleOf(top).shape, px(top.scores[i]), ty, 9))); ctx.globalAlpha = 1;
    const ux = px(you[i]);
    ctx.fillStyle = CARD.surface; ctx.strokeStyle = CARD.ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ux, ty, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CARD.ink; ctx.beginPath(); ctx.arc(ux, ty, 4, 0, Math.PI * 2); ctx.fill();
  }

  // Footer.
  ctx.fillStyle = "rgba(23, 32, 43, 0.12)"; ctx.fillRect(PAD, H - 108, W - PAD * 2, 2);
  ctx.fillStyle = CARD.ink; ctx.font = `500 28px ${CARD_FONTS.mono}`;
  ctx.fillText("TAKE THE TEST", PAD, H - 54);
  ctx.textAlign = "right"; ctx.fillText(site.toUpperCase(), W - PAD, H - 54); ctx.textAlign = "left";
}

// The people closest to a set of answers, for the result card (empty until people are audited).
function cardPeople(answers) {
  const list = typeof PEOPLE === "undefined" ? [] : PEOPLE;
  return list.length ? matchPeople(model, answers, list.map((p) => ({ ...p, profile: p.profile.slice(0, QUESTIONS.length) }))).slice(0, 4) : [];
}

// Draws a 1200x630 result card. With no `result`, draws the generic link-preview image.
async function drawCard(canvas, result = null, site = `${location.host}${location.pathname.replace(/\/$/, "")}`) {
  try {
    await Promise.all([
      document.fonts.load(`700 72px ${CARD_FONTS.display}`),
      document.fonts.load(`400 24px ${CARD_FONTS.body}`),
      document.fonts.load(`400 18px ${CARD_FONTS.mono}`),
    ]);
  } catch {}
  const ctx = canvas.getContext("2d");
  const W = 1200, H = 630;
  ctx.fillStyle = CARD.bg;
  ctx.fillRect(0, 0, W, H);
  if (result) {
    // A light neutral wash.
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = CARD.point;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = "alphabetic";
  // Photos load from Wikimedia (CORS-enabled, so the canvas can still be saved).
  const photos = result && result.people ? await Promise.all(result.people.slice(0, 3).map((p) => new Promise((resolve) => {
    if (!p.image) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = p.image.url;
  }))) : [];

  drawGlobe(ctx, 60, 60, 32);
  ctx.fillStyle = CARD.muted;
  ctx.font = `500 18px ${CARD_FONTS.mono}`;
  ctx.fillText(SITE_NAME.toUpperCase(), 104, 83);

  if (result) {
    const { ranked } = result;
    const people = (result.people || []).slice(0, 4);
    const mark = (ideo, x, y, r) => {
      ctx.fillStyle = CARD.point;
      ctx.fill(new Path2D(shapePath(styleOf(ideo).shape, x, y, r)));
    };
    ctx.fillStyle = CARD.ink;
    fitText(ctx, ranked[0].name, 540, 64, 700, CARD_FONTS.display);
    ctx.fillText(ranked[0].name, 60, 156);
    const rows = people.length ? 4 : 5;
    ranked.slice(0, rows).forEach((r, i) => {
      const y = 222 + i * 56;
      mark(r, 70, y - 8, 7);
      ctx.fillStyle = CARD.ink;
      ctx.font = `${i === 0 ? 600 : 400} 23px ${CARD_FONTS.body}`;
      ctx.fillText(r.name, 88, y);
      ctx.fillStyle = CARD.muted;
      ctx.font = `400 19px ${CARD_FONTS.mono}`;
      ctx.textAlign = "right";
      ctx.fillText(pct(r.similarity), 600, y);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(23, 32, 43, 0.12)";
      ctx.fillRect(60, y + 12, 540, 9);
      ctx.fillStyle = CARD.point;
      ctx.fillRect(60, y + 12, 540 * r.similarity, 9);
    });
    if (people.length) {
      ctx.fillStyle = CARD.muted;
      ctx.font = `500 15px ${CARD_FONTS.mono}`;
      ctx.fillText("CLOSEST PEOPLE", 60, 462);
      people.forEach((p, i) => {
        const x = 60 + i * 180, cy = 506, r = 24;
        ctx.save();
        ctx.beginPath(); ctx.arc(x + r, cy, r, 0, Math.PI * 2); ctx.closePath();
        ctx.fillStyle = CARD.line; ctx.fill();
        if (photos[i]) {
          ctx.clip();
          const img = photos[i], side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) * 0.15, side, side, x, cy - r, r * 2, r * 2);
        } else {
          ctx.fillStyle = CARD.muted; ctx.font = `600 16px ${CARD_FONTS.display}`; ctx.textAlign = "center";
          ctx.fillText(p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join(""), x + r, cy + 6); ctx.textAlign = "left";
        }
        ctx.restore();
        ctx.fillStyle = CARD.ink;
        ctx.font = `600 16px ${CARD_FONTS.body}`;
        let name = p.name;
        while (ctx.measureText(name).width > 118 && name.length > 4) name = name.slice(0, -2) + "…";
        ctx.fillText(name, x + 56, cy - 3);
        ctx.fillStyle = CARD.muted;
        ctx.font = `400 15px ${CARD_FONTS.mono}`;
        ctx.fillText(pct(p.similarity), x + 56, cy + 17);
      });
    }
  } else {
    ctx.fillStyle = CARD.ink;
    ctx.font = `700 60px ${CARD_FONTS.display}`;
    const y = wrapText(ctx, "Which ideology are you nearest?", 60, 170, 540, 68);
    ctx.fillStyle = CARD.muted;
    ctx.font = `400 26px ${CARD_FONTS.body}`;
    wrapText(ctx, "Finds the real dividing lines between ideologies, then asks the statements that best tell them apart.", 60, y + 20, 520, 38);
  }

  ctx.fillStyle = CARD.ink;
  ctx.font = `500 20px ${CARD_FONTS.mono}`;
  ctx.fillText(`Take the test: ${site}`, 60, 585);

  // Where you stand: one row per real dividing line, with its plain-language ends.
  const mx = 660, my = 50, ms = 490;
  ctx.fillStyle = CARD.surface;
  ctx.strokeStyle = CARD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(mx, my, ms, ms, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = CARD.muted;
  ctx.font = `500 15px ${CARD_FONTS.mono}`;
  ctx.fillText(result ? "WHERE YOU STAND" : "THE DIVIDING LINES", mx + 28, my + 40);

  const lines = SHOWN_LINES;
  const top = result ? result.ranked[0] : null;
  const rowH = (ms - 80) / lines;
  for (let i = 0; i < lines; i++) {
    const L = lineInfo(i);
    const y0 = my + 64 + i * rowH;
    const x0 = mx + 36, x1 = mx + ms - 36;
    const vals = model.ideologies.map((d) => d.scores[i]).concat(result ? [result.you[i]] : []);
    const scale = lineScale(vals);
    const px = (v) => x0 + scale(v) * (x1 - x0);
    const ty = y0 + rowH * 0.55;

    ctx.fillStyle = "rgba(23, 32, 43, 0.1)"; ctx.fillRect(x0, y0 + 4, 140, 8);
    ctx.fillStyle = CARD.muted; ctx.fillRect(x0, y0 + 4, 140 * lineWeight(i), 8);
    ctx.fillStyle = CARD.muted;
    ctx.font = `400 15px ${CARD_FONTS.body}`;
    ctx.fillText(L.low, x0, ty + 26);
    ctx.textAlign = "right";
    ctx.fillText(L.high, x1, ty + 26);
    ctx.textAlign = "left";

    ctx.strokeStyle = CARD.line;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x1, ty); ctx.stroke();

    if (!result) {
      // Generic preview: every ideology as a faint marker.
      for (const d of model.ideologies) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = CARD.point;
        ctx.fill(new Path2D(shapePath(styleOf(d).shape, px(d.scores[i]), ty, 6)));
      }
      ctx.globalAlpha = 1;
      continue;
    }
    // Your top match, faint, for comparison; then you, as a dark ring.
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = CARD.point;
    ctx.fill(new Path2D(shapePath(styleOf(top).shape, px(top.scores[i]), ty, 9)));
    ctx.globalAlpha = 1;
    const ux = px(result.you[i]);
    ctx.fillStyle = CARD.surface; ctx.strokeStyle = CARD.ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ux, ty, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CARD.ink;
    ctx.beginPath(); ctx.arc(ux, ty, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (result) {
    // Key for the two markers.
    const ky = my + ms - 22;
    ctx.font = `400 14px ${CARD_FONTS.body}`;
    ctx.fillStyle = CARD.surface; ctx.strokeStyle = CARD.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx + 44, ky - 5, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CARD.muted;
    ctx.fillText("You", mx + 58, ky);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = CARD.point;
    ctx.fill(new Path2D(shapePath(styleOf(top).shape, mx + 112, ky - 5, 7)));
    ctx.globalAlpha = 1;
    ctx.fillStyle = CARD.muted;
    ctx.fillText(top.name, mx + 126, ky);
  }
  ctx.lineCap = "butt";
}

// ---------- Static page content ----------

const extremes = new Set([0, 1].flatMap((i) => { const ax = describeAxis(model, i, QUESTIONS); return [...ax.lowEnd, ...ax.highEnd]; }));
mountMap($("ideo-map").closest("figure"), { labels: model.ideologies.length > 25 ? extremes : null,
  onPick: (ideo) => pickCard($("ideo-pick"), ideo, { onClose: () => $("ideo-map").unpick() }),
  onUnpick: () => { $("ideo-pick").hidden = true; } },
  { extraNote: "Close dots answer alike." });
for (const el of document.querySelectorAll(".ideology-count")) el.textContent = `${model.ideologies.length}`;

// Be upfront while the site still runs on hand-written profiles instead of researched audits.
const auditedCount = model.ideologies.filter((i) => i.audited).length;
if (auditedCount < model.ideologies.length) {
  $("data-status").hidden = false;
  $("data-status").textContent = auditedCount
    ? `Work in progress: ${auditedCount} of the ${model.ideologies.length} ideology profiles have been researched and sourced so far. The rest are preliminary profiles written by hand.`
    : `Work in progress: the ${model.ideologies.length} ideology profiles used right now are preliminary and written by hand. Researched, sourced profiles for over 250 ideologies are on the way.`;
}
drawScree($("scree"));

// The home page shows an example result drawn by the same code as the share image: a simulated
// test-taker who leans toward a randomly chosen ideology (some statements skipped, some answers
// nudged by a point), matched with the live model, so it changes per visit and tracks the data.
(() => {
  const ideo = model.ideologies[Math.floor(Math.random() * model.ideologies.length)];
  const sample = ideo.profile.map((x) => {
    if (Math.random() < 0.35) return null;
    if (Math.random() < 0.25) return Math.max(-2, Math.min(2, x + (Math.random() < 0.5 ? -1 : 1)));
    return x;
  });
  const { you, ranked } = match(model, sample);
  drawShareCard($("example-card"), { you, ranked, people: cardPeople(sample), answered: sample.filter((a) => a !== null).length });
})();

// ---------- Explore ----------

function renderExplore() {
  const query = $("explore-search").value.trim().toLowerCase();
  const shown = model.ideologies
    .filter((i) => !query || i.name.toLowerCase().includes(query) || (i.summary || "").toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  $("explore-count").textContent = shown.length === model.ideologies.length
    ? `${shown.length} ideologies`
    : `${shown.length} of ${model.ideologies.length} ideologies`;
  $("explore-list").innerHTML = shown.length ? `<ul class="matches">${shown.map(ideologyRow).join("")}</ul>`
    : `<p class="muted">No ideologies match “${esc(query)}”.</p>`;
}
$("explore-search").addEventListener("input", renderExplore);
renderExplore();

// ---------- People ----------

// Round photo from Wikipedia (freely licensed); initials when there is no free image.
function avatar(p, size = 36) {
  if (p.image) {
    return `<img class="avatar" src="${esc(p.image.url)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  }
  const initials = p.name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("");
  return `<span class="avatar initials" style="width:${size}px;height:${size}px" aria-hidden="true">${esc(initials)}</span>`;
}
const imageCredit = (p) => p.image
  ? `<p class="credit">Photo: ${esc(p.image.artist)}, <a href="${esc(p.image.source)}" target="_blank" rel="noopener">${esc(p.image.license)}</a>, via Wikimedia Commons</p>`
  : "";

// AI models (audits/PROMPT_MODEL.md) sit with the people but took the quiz themselves: their answers
// live in audits/models, carry the model's own reason instead of sourced research, and have a date
// taken instead of a birth year.
const auditFolder = (p) => (p.kind === "model" ? "models" : "people");
const auditLabel = (p) => (p.kind === "model" ? "Its answers" : null);
const lifeLine = (p) => (p.kind === "model" ? `took the quiz ${p.takenAt}` : p.living ? `born ${p.born}` : `born ${p.born}, historical`);

function personBody(p) {
  const links = [p.wikipedia && `<a href="${esc(p.wikipedia)}" target="_blank" rel="noopener">Wikipedia</a>`,
    `<a href="${REPO}/blob/main/audits/${auditFolder(p)}/${esc(p.id)}.json" target="_blank" rel="noopener">${auditLabel(p) || "How this profile was researched"}</a>`].filter(Boolean);
  return `<div class="person-head">${avatar(p, 72)}<div class="stack">
    <p class="muted small">${esc(p.role || "")}${p.role ? " · " : ""}${esc(p.region)} · ${lifeLine(p)}</p>
    ${imageCredit(p)}</div></div>
    ${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
    <p class="read-more small"><span class="muted">Read more:</span> ${links.join('<span class="muted"> · </span>')}</p>`;
}

let peopleRegion = null;
function renderPeople() {
  const list = typeof PEOPLE === "undefined" ? [] : PEOPLE;
  $("people-status").hidden = list.length > 0;
  $("people-browse").hidden = list.length === 0;
  if (!list.length) {
    $("people-status").textContent = "Coming soon: profiles of around 250 people are being researched, each from their own words and record. Once they're ready, your results will include the people who think most like you.";
    return;
  }
  const q = $("people-search").value.trim().toLowerCase();
  const shown = list.filter((p) => (!peopleRegion || p.region === peopleRegion) &&
    (!q || p.name.toLowerCase().includes(q) || (p.role || "").toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  $("people-count").textContent = `${shown.length} of ${list.length} people`;
  $("people-list").innerHTML = shown.map(personRow).join("") || `<li class="muted">No one matches “${esc(q)}”.</li>`;
}
(() => {
  const list = typeof PEOPLE === "undefined" ? [] : PEOPLE;
  const regions = [...new Set(list.map((p) => p.region))].sort();
  $("people-regions").innerHTML = [["", "All"], ...regions.map((r) => [r, r])]
    .map(([v, label]) => `<button class="chip-btn" data-region="${esc(v)}" aria-pressed="${v === ""}">${esc(label)}</button>`).join("");
  $("people-regions").addEventListener("click", (e) => {
    const b = e.target.closest("[data-region]");
    if (!b) return;
    peopleRegion = b.dataset.region || null;
    for (const x of $("people-regions").children) x.setAttribute("aria-pressed", String(x === b));
    renderPeople();
  });
  $("people-search").addEventListener("input", renderPeople);
  renderPeople();
})();

// ---------- Detail pages: one per ideology and per person ----------
// (Row and link helpers are function declarations: the lists use them before this point in the file.)

const PEOPLE_LIST = typeof PEOPLE === "undefined" ? [] : PEOPLE;
function ideologyHref(id) { return `#/ideologies/${encodeURIComponent(id)}`; }
function personHref(id) { return `#/people/${encodeURIComponent(id)}`; }
// Profiles can cover more statements than the site's current model; use only the shared ones.
const onModel = (profile) => profile.slice(0, QUESTIONS.length);

// Where `scores` sits on each shown dividing line, with every ideology as a faint marker. `other`
// (a second set of scores) adds a filled marker, for comparing two sides.
function lineStrips(scores, { selfId = null, other = null } = {}) {
  return Array.from({ length: SHOWN_LINES }, (_, i) => {
    const L = lineInfo(i);
    const vals = model.ideologies.map((d) => d.scores[i]).concat(scores[i], other ? other[i] : []);
    const scale = lineScale(vals);
    const pos = (v) => 6 + scale(v) * 588;
    return `<div class="axis">
      <div class="axis-head"><h3>${lineTitle(L)}</h3>${weightBar(i)}</div>
      <svg viewBox="0 0 600 34" style="width:100%;height:auto;display:block" aria-hidden="true">
        <line x1="6" x2="594" y1="17" y2="17" stroke="var(--line)" stroke-width="2"></line>
        ${model.ideologies.filter((d) => d.id !== selfId).map((d) => `<path d="${shapePath(styleOf(d).shape, pos(d.scores[i]), 17, 4)}" fill="${colorOf(d)}" opacity="0.35"><title>${esc(d.name)}</title></path>`).join("")}
        ${other ? `<circle cx="${pos(other[i])}" cy="17" r="7" fill="var(--accent)"></circle>` : ""}
        <circle cx="${pos(scores[i])}" cy="17" r="8" fill="none" stroke="var(--ink)" stroke-width="3"></circle>
      </svg>
    </div>`;
  }).join("");
}


// Topic emoji for a statement; decorative (the sentence carries the meaning), so hidden from screen readers.
const topicIcon = (q) => `<span class="topic" aria-hidden="true">${q.icon || "•"}</span>`;

// Key positions only: the strongly held ones (or the leanings, if there are none), best-sourced
// first, each with its topic emoji; reasoning and sources are added once the audit loads. The rest
// are summarized in one line that points to the full audit.
const CONF_RANK = { high: 0, medium: 1, low: 2 };
function positionsList(profile, audit, auditUrl = null) {
  const answerOf = (j) => audit && audit.answers && audit.answers[QUESTIONS[j].id];
  const all = QUESTIONS.map((_, j) => j);
  const unknown = all.filter((j) => profile[j] == null);
  const strongest = Math.max(...all.map((j) => Math.abs(profile[j] ?? 0)));
  const known = all.filter((j) => profile[j] != null && strongest > 0 && Math.abs(profile[j]) === strongest)
    .sort((x, y) => (CONF_RANK[answerOf(x)?.confidence] ?? 1) - (CONF_RANK[answerOf(y)?.confidence] ?? 1) || x - y);
  const others = all.length - known.length - unknown.length;
  const sourceLink = (sid) => {
    const s = audit && (audit.sources || []).find((x) => x.id === sid);
    return s ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">${esc(sid)}</a>` : esc(sid);
  };
  const items = known.map((j) => {
    const v = profile[j];
    const a = answerOf(j);
    return `<li>${topicIcon(QUESTIONS[j])}
      <div class="stack-tight">
        <p class="stance">${esc(v === 0 ? QUESTIONS[j].text : stance(QUESTIONS[j], v).text)}</p>
        ${a && (a.rationale || a.reason) ? `<p class="muted small">${esc(a.rationale || a.reason)}
          ${a.confidence ? `<span class="conf">${esc(a.confidence)} confidence${a.sources && a.sources.length ? ` · sources ${a.sources.map(sourceLink).join(", ")}` : ""}</span>` : ""}</p>` : ""}
      </div></li>`;
  }).join("");
  const rest = [others && `${others} milder position${others === 1 ? "" : "s"}`, unknown.length && `no known position on ${unknown.length}`].filter(Boolean).join(", and ");
  const more = rest ? `<p class="muted small">${rest[0].toUpperCase() + rest.slice(1)}${auditUrl ? `: <a href="${esc(auditUrl)}" target="_blank" rel="noopener">see the full audit</a>` : ""}.</p>` : "";
  return `<ul class="positions">${items}</ul>${more}`;
}

function sourcesList(audit) {
  if (!audit || !audit.sources || !audit.sources.length) return "";
  return `<section class="stack"><h2>Sources</h2><ol class="sources">${audit.sources.map((s) => `
    <li id="src-${esc(s.id)}"><span class="mono small">${esc(s.id)}</span>
      <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.author ? ` <span class="muted small">· ${esc(s.author)}</span>` : ""}
      <span class="muted small">· ${esc(s.kind)}</span></li>`).join("")}</ol></section>`;
}

// The audit JSON is published next to the site; fetch it for reasoning and sources.
const auditCache = new Map();
function loadAudit(folder, id) {
  const key = `${folder}/${id}`;
  if (!auditCache.has(key)) {
    auditCache.set(key, fetch(`audits/${folder}/${encodeURIComponent(id)}.json`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return auditCache.get(key);
}

function ideologyRow(r) { return `<li><a class="row-link" href="${ideologyHref(r.id)}">
  <span class="match-name">${posGlyph(r)}${esc(r.name)}</span>
  ${r.similarity != null ? `<span class="mono small">${pct(r.similarity)}</span>` : ""}
  <span class="arrow" aria-hidden="true">→</span></a></li>`; }
function personRow(p) { return `<li><a class="row-link" href="${personHref(p.id)}">
  <span class="match-name">${avatar(p)}${esc(p.name)}</span>
  ${p.similarity != null ? `<span class="mono small">${pct(p.similarity)}</span>` : `<span class="muted small">${esc(p.region)}</span>`}
  <span class="arrow" aria-hidden="true">→</span></a></li>`; }

// An ideology's key figures (from its audit). Someone with a page here links to it; anyone else
// links to their Wikipedia article.
const sameArticle = (a, b) => !!a && !!b && decodeURIComponent(a) === decodeURIComponent(b);
function keyFigureRow(f) {
  const person = PEOPLE_LIST.find((p) => sameArticle(p.wikipedia, f.wikipedia));
  const href = person ? personHref(person.id) : f.wikipedia;
  return `<li><a class="row-link" href="${esc(href)}"${person ? "" : ` target="_blank" rel="noopener"`}>
  <span class="match-name">${avatar(person || f)}<span class="stack-tight"><span>${esc(f.name)}</span><span class="muted small">${esc(f.role)}</span></span></span>
  <span></span><span class="arrow" aria-hidden="true">${person ? "→" : "↗"}</span></a></li>`;
}
const keyFiguresSection = (ideo) => ideo.keyFigures && ideo.keyFigures.length
  ? `<section class="stack"><h2>Key figures</h2><ul class="matches">${ideo.keyFigures.map(keyFigureRow).join("")}</ul></section>` : "";

function yourMatchLine(value, name) {
  return value == null ? "" : `<p class="your-match">Your answers match ${esc(name)} <strong>${pct(value)}</strong>. <a href="#/results">Back to your results</a></p>`;
}

function renderIdeologyPage(id) {
  const ideo = model.ideologies.find((i) => i.id === id);
  if (!ideo) return false;
  const root = $("ideology-detail");
  const neighbors = match(model, ideo.profile).ranked.filter((r) => r.id !== ideo.id).slice(0, 5);
  const people = PEOPLE_LIST.length ? matchPeople(model, ideo.profile, PEOPLE_LIST.map((p) => ({ ...p, profile: onModel(p.profile) }))).slice(0, 5) : [];
  const yours = lastAnswers ? match(model, lastAnswers).ranked.find((r) => r.id === ideo.id).similarity : null;
  const draw = (audit) => {
    root.innerHTML = `
      <a class="back" href="#/ideologies">← All ideologies</a>
      <div class="detail-head stack tinted" style="${flagTint(ideo)}">
        <h1>${esc(ideo.name)}</h1>
        ${aboutWithImage(ideo)}
        ${audit && audit.scope ? `<p class="muted small"><strong>Scope:</strong> ${esc(audit.scope)}</p>` : ""}
        ${yourMatchLine(yours, ideo.name)}
      </div>
      <section class="stack"><h2>What it stands for</h2>${beliefList(ideo, 6)}</section>
      ${keyFiguresSection(ideo)}
      <section class="stack"><h2>Where it sits</h2>${lineStrips(ideo.scores, { selfId: ideo.id })}</section>
      <section class="stack"><h2>Closest ideologies</h2><ul class="matches">${neighbors.map(ideologyRow).join("")}</ul></section>
      ${people.length ? `<section class="stack"><h2>People closest to it</h2><ul class="matches">${people.map(personRow).join("")}</ul></section>` : ""}
      ${comparePicker(`i:${ideo.id}`)}
      <section class="stack"><h2>Key positions</h2>
        ${ideo.audited ? "" : `<p class="muted small">This is a preliminary profile, so reasoning and sources aren't available yet.</p>`}
        ${positionsList(ideo.profile, audit, ideo.audited ? `${REPO}/blob/main/audits/profiles/${ideo.id}.json` : null)}</section>
      ${sourcesList(audit)}`;
  };
  draw(null);
  if (ideo.audited) loadAudit("profiles", ideo.id).then((a) => { if (a && $("page-ideology").dataset.id === id) draw(a); });
  $("page-ideology").dataset.id = id;
  return ideo.name;
}

function renderPersonPage(id) {
  const p = PEOPLE_LIST.find((x) => x.id === id);
  if (!p) return false;
  const root = $("person-detail");
  const profile = onModel(p.profile);
  const closest = match(model, profile).ranked.slice(0, 5);
  const similar = matchPeople(model, profile, PEOPLE_LIST.filter((x) => x.id !== p.id).map((x) => ({ ...x, profile: onModel(x.profile) }))).slice(0, 5);
  const yours = lastAnswers ? (matchPeople(model, lastAnswers, [{ ...p, profile }])[0] || {}).similarity : null;
  const draw = (audit) => {
    root.innerHTML = `
      <a class="back" href="#/people">← All people</a>
      <div class="person-hero">
        ${avatar(p, 128)}
        <div class="stack">
          <span class="eyebrow">${esc(p.region)} · ${lifeLine(p)}</span>
          <h1>${esc(p.name)}</h1>
          ${p.role ? `<p class="muted">${esc(p.role)}</p>` : ""}
          ${p.related && p.related.length ? `<p class="small muted">Answers the same way as ${p.related.map((r) => esc(r.name)).join(", ")}, so the test can't tell them apart.</p>` : ""}
          ${imageCredit(p)}
        </div>
      </div>
      ${p.summary ? `<p class="lede">${esc(p.summary)}</p>` : ""}
      <p class="read-more small"><span class="muted">Read more:</span> ${p.wikipedia ? `<a href="${esc(p.wikipedia)}" target="_blank" rel="noopener">Wikipedia</a> · ` : ""}<a href="${REPO}/blob/main/audits/${auditFolder(p)}/${esc(p.id)}.json" target="_blank" rel="noopener">${auditLabel(p) || "The full audit"}</a></p>
      ${yourMatchLine(yours, p.name)}
      <section class="stack"><h2>Closest ideologies</h2>
        <p class="muted small">Based on the ${profile.filter((x) => x != null).length} statements where ${esc(p.name)} has a known position.</p>
        <ul class="matches">${closest.map(ideologyRow).join("")}</ul></section>
      <section class="stack"><h2>Where they sit</h2>${lineStrips(project(model, profile))}</section>
      ${similar.length ? `<section class="stack"><h2>Similar people</h2><ul class="matches">${similar.map(personRow).join("")}</ul></section>` : ""}
      ${comparePicker(`p:${p.id}`)}
      <section class="stack"><h2>Key positions</h2>${positionsList(profile, audit, `${REPO}/blob/main/audits/${auditFolder(p)}/${p.id}.json`)}</section>
      ${sourcesList(audit)}`;
  };
  draw(null);
  loadAudit(auditFolder(p), p.id).then((a) => { if (a && $("page-person").dataset.id === id) draw(a); });
  $("page-person").dataset.id = id;
  return p.name;
}

// ---------- Menu and routing ----------

// Compare any two of: an ideology (i:<id>), a person or AI model (p:<id>) and your own answers (me),
// at #/compare/<a>/<b>. Display only: nothing here feeds back into the ideologies.
function myAnswers() {
  if (lastAnswers) return lastAnswers;
  const saved = load();
  return saved && saved.answers.some((a) => a != null) ? saved.answers.map((a) => a ?? null) : null;
}
function compareSide(key) {
  if (key === "me") {
    const profile = myAnswers();
    return profile && { key, name: "You", profile, href: "#/results" };
  }
  const [kind, id] = [key.slice(0, 2), key.slice(2)];
  if (kind === "i:") {
    const i = model.ideologies.find((x) => x.id === id);
    return i && { key, name: i.name, profile: i.profile, href: ideologyHref(id) };
  }
  if (kind === "p:") {
    const p = PEOPLE_LIST.find((x) => x.id === id);
    return p && { key, name: p.name, profile: onModel(p.profile), href: personHref(id) };
  }
  return null;
}
const compareHref = (a, b) => `#/compare/${encodeURIComponent(a)}/${encodeURIComponent(b)}`;

// Every ideology, person and AI model as a picker option: the label is what the visitor types.
const compareOptions = () => [
  ...(myAnswers() ? [{ key: "me", label: "You (your answers)" }] : []),
  ...model.ideologies.map((i) => ({ key: `i:${i.id}`, label: i.name })),
  // Names show plainly; a person who shares a name with an ideology gets "(person)" to tell them apart.
  ...PEOPLE_LIST.map((p) => ({ key: `p:${p.id}`, label: model.ideologies.some((i) => i.name === p.name) ? `${p.name} (person)` : p.name })),
];
function comparePicker(selfKey) {
  const mine = myAnswers() ? `<a class="btn" href="${compareHref("me", selfKey)}">Compare with your answers</a>` : "";
  return `<section class="stack"><h2>Compare</h2>
    ${mine}
    ${comboBox("compare-pick", "Compare with another ideology or person", "", selfKey)}
  </section>`;
}
// The Compare tab's two boxes: once both name something, show that pair.
function comparePickers(aKey = "", bKey = "") {
  return `<div class="compare-pickers">${comboBox("compare-a", "An ideology, a person or you", aKey)}
    <span class="muted" aria-hidden="true">and</span>${comboBox("compare-b", "Another one to compare with", bKey)}</div>`;
}

// A search box with its own suggestion list (ARIA combobox). The browser's <datalist> opened only on a
// second click and differs between browsers, so this one opens on focus and filters as you type.
function comboBox(id, text, key = "", self = "") {
  const label = (compareOptions().find((o) => o.key === key) || {}).label || "";
  return `<div class="combo"><label class="visually-hidden" for="${id}">${text}</label>
    <input id="${id}" class="search" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list"
      value="${esc(label)}" data-key="${esc(key)}"${self ? ` data-self="${esc(self)}"` : ""} placeholder="${text}" autocomplete="off" spellcheck="false">
    <ul id="${id}-list" class="combo-list" role="listbox" hidden></ul></div>`;
}
function comboOpen(input) {
  const list = $(`${input.id}-list`);
  const options = compareOptions();
  const q = input.value.trim().toLowerCase();
  // A box that already names something shows everything, so it's easy to switch.
  const all = !q || options.some((o) => o.label.toLowerCase() === q);
  // Browsing (nothing typed): you, then ideologies and people A–Z under headings. Searching: every
  // match, best first (where the text appears earliest in the name).
  const byName = (x, y) => x.label.localeCompare(y.label);
  const group = (kind) => options.filter((o) => (kind === "me" ? o.key === "me" : o.key.startsWith(kind)));
  const groups = all
    ? [["", group("me")], ["Ideologies", group("i:").sort(byName)], ["People", group("p:").sort(byName)]]
    : [["", options.filter((o) => o.label.toLowerCase().includes(q))
      .sort((x, y) => x.label.toLowerCase().indexOf(q) - y.label.toLowerCase().indexOf(q) || byName(x, y))]];
  let n = 0;
  list.innerHTML = groups.filter(([, items]) => items.length).map(([title, items]) =>
    (title ? `<li class="combo-group" role="presentation">${title}</li>` : "") +
    items.map((o) => `<li id="${input.id}-opt-${n++}" role="option" data-key="${esc(o.key)}" aria-selected="false">${esc(o.label)}</li>`).join("")).join("")
    || `<li class="muted" aria-disabled="true">No match</li>`;
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  input.removeAttribute("aria-activedescendant");
}
function comboClose(input) {
  $(`${input.id}-list`).hidden = true;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
}
function comboMove(input, step) {
  const items = [...$(`${input.id}-list`).querySelectorAll("[role=option]")];
  if (!items.length) return;
  const at = items.findIndex((li) => li.getAttribute("aria-selected") === "true");
  const next = items[(at + step + items.length) % items.length];
  items.forEach((li) => li.setAttribute("aria-selected", String(li === next)));
  input.setAttribute("aria-activedescendant", next.id);
  next.scrollIntoView({ block: "nearest" });
}
// Choosing: on a page's own box, open that comparison; on the Compare tab, move to the other box until
// both are set, then open the pair.
function comboChoose(input, li) {
  input.value = li.textContent;
  input.dataset.key = li.dataset.key;
  comboClose(input);
  if (input.id === "compare-pick") { go(compareHref(input.dataset.self, li.dataset.key)); return; }
  const a = $("compare-a").dataset.key, b = $("compare-b").dataset.key;
  if (a && b && a !== b) go(compareHref(a, b));
  else $(input.id === "compare-a" ? "compare-b" : "compare-a").focus();
}
const isCombo = (el) => el && el.getAttribute && el.getAttribute("role") === "combobox";
document.addEventListener("focusin", (e) => { if (isCombo(e.target)) { e.target.select(); comboOpen(e.target); } });
document.addEventListener("focusout", (e) => { if (isCombo(e.target)) comboClose(e.target); });
document.addEventListener("input", (e) => { if (isCombo(e.target)) { e.target.dataset.key = ""; comboOpen(e.target); } });
document.addEventListener("keydown", (e) => {
  if (!isCombo(e.target)) return;
  const input = e.target, list = $(`${input.id}-list`);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (list.hidden) comboOpen(input);
    comboMove(input, e.key === "ArrowDown" ? 1 : -1);
  } else if (e.key === "Enter") {
    const li = list.querySelector("[aria-selected=true]") || list.querySelector("[role=option]");
    if (li && !list.hidden) { e.preventDefault(); comboChoose(input, li); }
  } else if (e.key === "Escape") comboClose(input);
});
// mousedown, not click: it fires before the box loses focus and closes the list.
document.addEventListener("mousedown", (e) => {
  const li = e.target.closest && e.target.closest(".combo-list [role=option]");
  if (!li) return;
  e.preventDefault();
  comboChoose($(li.parentElement.id.replace(/-list$/, "")), li);
});

// The Compare tab without a pair yet: just the two boxes.
function renderCompareHome() {
  $("compare-detail").innerHTML = `
    <h1>Compare</h1>
    <p class="lede">Pick any two: ideologies, people or your own answers.</p>
    ${comparePickers(myAnswers() ? "me" : "")}`;
  return "Compare";
}

function renderComparePage(aKey, bKey) {
  const a = compareSide(aKey), b = compareSide(bKey);
  const root = $("compare-detail");
  if (!a || !b) {
    root.innerHTML = `<h1>Compare</h1><p>${aKey === "me" || bKey === "me"
      ? `Take the test first to compare your own answers. <a href="#/test">Start the test</a>`
      : "One of these isn't in the atlas any more."}</p>`;
    return "Compare";
  }
  const both = QUESTIONS.map((_, j) => j).filter((j) => a.profile[j] != null && b.profile[j] != null);
  const similarity = (matchPeople(model, a.profile, [{ ...b, views12m: 0 }], { minOverlap: 1 })[0] || {}).similarity;
  const differ = both.filter((j) => Math.abs(a.profile[j] - b.profile[j]) >= 2)
    .sort((x, y) => Math.abs(a.profile[y] - b.profile[y]) - Math.abs(a.profile[x] - b.profile[x]) || x - y).slice(0, 10);
  const shared = both.filter((j) => a.profile[j] !== 0 && a.profile[j] === b.profile[j])
    .sort((x, y) => Math.abs(b.profile[y]) - Math.abs(b.profile[x]) || x - y).slice(0, 8);
  const link = (s) => `<a href="${s.href}">${esc(s.name)}</a>`;
  // When one side is the visitor, the page speaks to them ("you") rather than about "them".
  const mine = a.key === "me" || b.key === "me";
  const other = a.key === "me" ? b : a;
  const they = mine ? "you" : "they";
  root.innerHTML = `
    ${comparePickers(aKey, bKey)}
    <h1>${esc(a.name)} and ${esc(b.name)}</h1>
    ${similarity != null ? `<p class="lede">${mine ? `You and ${esc(other.name)} match` : "They match"} <strong>${pct(similarity)}</strong>, on the ${both.length} statements where ${mine ? "you both" : "both"} have a position.</p>` : ""}
    <section class="stack"><h2>Where ${they} sit</h2>
      <p class="read-more small"><span aria-hidden="true">○</span> ${link(a)} · <span aria-hidden="true" style="color:var(--accent)">●</span> ${link(b)}</p>
      ${lineStrips(project(model, a.profile), { other: project(model, b.profile) })}</section>
    <section class="stack"><h2>Where ${they} differ most</h2>
      <ul class="iconed">${differ.map((j) => versus(QUESTIONS[j], a.profile[j], b.profile[j], a.name, b.name)).join("") || `<li class='muted'>No statement where ${they}'re more than a step apart.</li>`}</ul></section>
    <section class="stack"><h2>What ${they} share</h2>
      <ul class="iconed">${shared.map((j) => `<li>${topicIcon(QUESTIONS[j])}<span>${esc(stance(QUESTIONS[j], a.profile[j]).text)}</span></li>`).join("") || `<li class='muted'>No position ${they} hold the same way.</li>`}</ul></section>
    <p class="muted small"><a href="${compareHref(b.key, a.key)}">Swap sides</a></p>`;
  return `${a.name} and ${b.name}`;
}

function closeMenu() {
  $("nav-links").classList.remove("open");
  $("menu-btn").setAttribute("aria-expanded", "false");
}
$("menu-btn").addEventListener("click", () => {
  const open = $("nav-links").classList.toggle("open");
  $("menu-btn").setAttribute("aria-expanded", String(open));
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeMenu();
  for (const svg of document.querySelectorAll("svg.chart")) if (svg.unpick) svg.unpick();
});

// Routes: #/ (home), #/how, #/test[/<statement id>], #/results, #/ideologies[/<id>], #/people[/<id>],
// #/compare/<a>/<b>, #/about.
// A shared result (?r=…) opens on the results page.
function route() {
  const [page = "", arg, arg2] = location.hash.replace(/^#\/?/, "").split("/");
  const shared = decodeAnswers(new URLSearchParams(location.search).get("r"));
  $("resume").hidden = !load();

  if (page === "test") {
    if (arg) {
      askStatement(decodeURIComponent(arg));
      history.replaceState(null, "", `${location.pathname}#/test`); // so a reload doesn't ask it again
    }
    if (order.length === 0) startQuiz(load());
    else { show("test"); renderQuestion(); }
  } else if (page === "results" || (page === "" && shared)) {
    if (shared && page !== "results" && !lastAnswers) { show("results"); showResults(shared); }
    else if (lastAnswers) { show("results"); showResults(); }
    else if (shared) { show("results"); showResults(shared); }
    else go("#/");
  } else if (page === "ideologies" && arg) {
    const name = renderIdeologyPage(decodeURIComponent(arg));
    if (name) show("ideology", { title: name }); else go("#/ideologies");
  } else if (page === "ideologies") {
    show("ideologies");
  } else if (page === "people" && arg) {
    const name = renderPersonPage(decodeURIComponent(arg));
    if (name) show("person", { title: name }); else go("#/people");
  } else if (page === "people") {
    show("people");
  } else if (page === "compare" && arg && arg2) {
    show("compare", { title: renderComparePage(decodeURIComponent(arg), decodeURIComponent(arg2)) });
  } else if (page === "compare") {
    show("compare", { title: renderCompareHome() });
  } else if (page === "about") {
    show("about");
  } else if (page === "how") {
    show("home", { scroll: false });
    $("how").scrollIntoView({ block: "start" });
  } else {
    show("home");
  }
}
window.addEventListener("hashchange", route);
route();
