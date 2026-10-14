// UI: intro map, one-statement-at-a-time quiz, results.
const model = buildModel(IDEOLOGIES);
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

// Plain names for the dividing lines. `toward` lists statements and the answer direction (+1 agree,
// -1 disagree) that points toward the `high` end. See nameAxes in pca.js for how lines get matched.
const LINE_NAMES = [
  { name: "Social values", low: "Traditional", high: "Progressive",
    toward: { "abortion-legal": 1, "same-sex-marriage": 1, "gender-social-construct": 1, "traditional-family": -1, "more-religion-public": -1 } },
  { name: "Economy", low: "Collective", high: "Free market",
    toward: { "markets-allocate-better": 1, "free-trade": 1, "cut-welfare": 1, "regulate-corporations": -1, "raise-minimum-wage": -1, "public-ownership": -1 } },
  { name: "Role of the state", low: "Strong state", high: "No state",
    toward: { "state-harmful": 1, "revolution-justified": 1, "experts-over-public": -1, "empower-international-orgs": -1, "surveillance-ok": -1 } },
  { name: "Outlook", low: "National", high: "Global",
    toward: { "empower-international-orgs": 1, "open-borders": 1, "nation-first": -1, "reduce-immigration": -1, "preserve-national-culture": -1 } },
  { name: "Growth", low: "Pro-growth", high: "Green",
    toward: { "limit-growth": 1, "drastic-climate-action": 1, "tech-solves-problems": -1, "expand-nuclear": -1 } },
];

// How many dividing lines to show: those that beat shuffled-noise data (parallel analysis),
// at least 2 and at most 6. build.js precomputes the count; otherwise it's computed here.
const MAX_LINES = 6;
const SHOWN_LINES = Math.min(MAX_LINES, model.components.length, Math.max(2,
  typeof MEANINGFUL_LINES !== "undefined" ? MEANINGFUL_LINES : meaningfulAxes(model, IDEOLOGIES)));

// Name and ends of dividing line i, from LINE_NAMES when one fits, else the ideologies at its ends.
const LINE_INFO = nameAxes(model, QUESTIONS, LINE_NAMES, SHOWN_LINES);
function lineInfo(i) {
  const ax = describeAxis(model, i, QUESTIONS);
  const n = LINE_INFO[i];
  return n
    ? { name: n.name, low: n.low, high: n.high, lowIdeo: ax.lowEnd[0], highIdeo: ax.highEnd[0] }
    : { name: `Line ${i + 1}`, low: ax.lowEnd[0], high: ax.highEnd[0], lowIdeo: ax.lowEnd[0], highIdeo: ax.highEnd[0] };
}

// ---------- Category colors and shapes ----------
// Color marks one of three broad families in the international convention (red left, gold
// liberal, blue right; not the US red/blue); shape marks the category, and the written category
// name always appears too (WCAG 2.2 SC 1.4.1). Shades were chosen to pass the dataviz palette
// checker on every pair, including colorblind simulation, and to meet 3:1 contrast on light and
// dark backgrounds (SC 1.4.11). A rose-red is used because pure red is too close to gold for
// deuteranopes; a fourth color (purple, green, teal or brown) collided with red or blue.
const FAMILIES = {
  left: { label: "Left", color: "var(--fam-left)", card: "#C2185B" },
  center: { label: "Liberal & center", color: "var(--fam-center)", card: "#A67C00" },
  right: { label: "Right", color: "var(--fam-right)", card: "#1565C0" },
};
const CATEGORY_STYLE = {
  "Radical Left": { family: "left", shape: "triangle" },
  "Left": { family: "left", shape: "circle" },
  "Anarchist": { family: "left", shape: "cross" },
  "Libertarian": { family: "center", shape: "star" },
  "Center": { family: "center", shape: "diamond" },
  "Right": { family: "right", shape: "square" },
  "Far-Right": { family: "right", shape: "triangle-down" },
  "Third Position": { family: "right", shape: "plus" },
};
const styleOf = (ideo) => CATEGORY_STYLE[ideo.category] || { family: "center", shape: "circle" };
const colorOf = (ideo) => FAMILIES[styleOf(ideo).family].color;

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

// An ideology's traditional colors as a little flag: one color solid, two split diagonally (like
// the anarchist flags), three as horizontal stripes. Decorative; the name is always written out.
function flagSwatch(ideo, w = 42, h = 28) {
  if (!ideo.flag || !ideo.flag.colors.length) return "";
  const c = ideo.flag.colors.map((x) => esc(x.hex));
  const shapes = c.length === 1 ? `<rect width="${w}" height="${h}" fill="${c[0]}"/>`
    : c.length === 2 ? `<polygon points="0,0 ${w},0 0,${h}" fill="${c[0]}"/><polygon points="${w},0 ${w},${h} 0,${h}" fill="${c[1]}"/>`
    : c.map((col, i) => `<rect y="${(h / c.length) * i}" width="${w}" height="${h / c.length + 0.5}" fill="${col}"/>`).join("");
  const title = esc(ideo.flag.colors.map((x) => x.name).join(" and ") + (ideo.flag.note ? ` (${ideo.flag.note})` : ""));
  return `<svg class="flag" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><title>${title}</title>${shapes}<rect width="${w}" height="${h}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1"/></svg>`;
}

// A small inline marker (shape in its family color) to sit next to a category name.
function swatch(category, size = 14) {
  const st = CATEGORY_STYLE[category] || { family: "center", shape: "circle" };
  return `<svg class="swatch-mark" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><path d="${shapePath(st.shape, 8, 8, 5.5)}" fill="${FAMILIES[st.family].color}"></path></svg>`;
}
const categoryTag = (ideo) => ideo.category ? `<span class="cat-tag">${swatch(ideo.category)}${esc(ideo.category)}</span>` : "";

// Legend under a map: every category with its marker and name, grouped by family.
function categoryLegend() {
  const present = new Set(model.ideologies.map((i) => i.category));
  return Object.entries(FAMILIES).map(([key, fam]) => {
    const cats = Object.keys(CATEGORY_STYLE).filter((c) => CATEGORY_STYLE[c].family === key && present.has(c));
    if (!cats.length) return "";
    return `<li><span class="fam-name">${esc(fam.label)}:</span> ${cats.map((c) => `<span class="cat-tag">${swatch(c)}${esc(c)}</span>`).join(" ")}</li>`;
  }).join("");
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
// clicked: it gets a label on the map and `onPick(ideology)` is called. Returns `pick(id)`
// so other parts of the page can select a dot too.
function drawMap(svg, xi, yi, { you = null, highlight = null, labels = null, onPick = null } = {}) {
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
    el("text", { x: 10, y: H - 10 }, `← ${ex.low}`),
    el("text", { x: W - 10, y: H - 10, "text-anchor": "end" }, `${ex.high} →`),
    el("text", { x: W / 2 + 6, y: pad - 18 }, `↑ ${ey.high}`),
    el("text", { x: W / 2 + 6, y: H - pad + 12 }, `↓ ${ey.low}`)
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
  const pick = (id) => {
    const ideo = model.ideologies.find((i) => i.id === id);
    if (!ideo) return;
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
    if (dot) pick(dot.dataset.id);
  };
  return pick;
}

// ---------- Quiz ----------

// Draws the flat map with "Across" and "Up" pickers over the real dividing lines.
// `figure` holds the svg, the two selects and a .map-note caption; `opts` go to drawMap.
function mountMap(figure, opts, { extraNote = "" } = {}) {
  const svg = figure.querySelector("svg"), note = figure.querySelector(".map-note");
  figure.querySelector(".cat-legend").innerHTML = categoryLegend();
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
  if (mode === "share") {
    btn.innerHTML = `Share <span aria-hidden="true">↗</span>`;
    btn.setAttribute("href", "#share");
    btn.title = "Share your result";
    btn.onclick = (e) => { e.preventDefault(); shareResult(); };
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
    btn.title = mode === "early" ? "Your top match could still change if you keep answering" : "Your result has settled";
    btn.setAttribute("href", "#/results");
    btn.onclick = (e) => { e.preventDefault(); finishQuiz(); };
  } else {
    btn.innerHTML = `Start <span aria-hidden="true">→</span>`;
    btn.title = "";
    btn.setAttribute("href", "#/test");
    btn.onclick = null;
  }
}

const PAGES = ["home", "test", "results", "ideologies", "ideology", "people", "person", "about"];
const PAGE_TITLES = { home: "", test: "Test", results: "Results", ideologies: "Ideologies", people: "People", about: "About" };
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
  const hold = answered > 0 ? stability(quizCalibration(), sure) : null;
  const settled = hold != null && hold >= SETTLE.hold;
  $("counter").textContent = `Statement ${position + 1}`;
  $("bar").style.width = pct(sure);
  // A calibrated percentage: in simulations, the share of takers at this reading whose top match
  // didn't change after answering everything. Readings never seen in simulation get words instead.
  const status = $("certainty");
  status.classList.toggle("ready", settled);
  if (settled) {
    status.innerHTML = `✓ Your result is ready · <a href="#/results" id="ready-link">See your result →</a>`;
    $("ready-link").onclick = (e) => { e.preventDefault(); finishQuiz(); };
  } else status.textContent = answered === 0 ? "Most telling statements first"
    : hold == null ? "Narrowing it down…"
    : `top match ${pct(hold)} likely to hold`;
  $("statement").textContent = QUESTIONS[q].text;
  $("back").disabled = position === 0;
  setHeaderAction(settled ? "results" : hold != null ? "early" : "none");
  // "Don't care" shows as chosen when this statement was already shown and skipped.
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

// Results are a page of their own: finishing stores the answers and navigates there.
let lastAnswers = null;
function finishQuiz() {
  lastAnswers = answers.map((a) => (a === undefined ? null : a));
  go("#/results");
}

// Options are listed top to bottom from "Strongly agree"; number keys 1-5 follow the scale.
// "Don't care" sits right under "Neither agree nor disagree" so the two read as a pair: one is a
// position in the middle, the other is no position (the statement isn't counted).
const SHOWN_CHOICES = [...CHOICES].reverse();
for (const [i, c] of SHOWN_CHOICES.entries()) {
  const b = document.createElement("button");
  b.id = `choice-${i}`;
  b.dataset.value = c.value;
  b.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${c.label}</span><span class="key" aria-hidden="true">${i + 1}</span>`;
  b.addEventListener("click", () => answer(c.value));
  $("likert").append(b);
  if (c.value !== 0) continue;
  const none = document.createElement("button");
  none.id = "choice-none";
  none.className = "no-opinion";
  none.innerHTML = `<span class="dot" aria-hidden="true"></span><span>Don't care</span><span class="key" aria-hidden="true">6</span>`;
  none.addEventListener("click", () => answer(null));
  $("likert").append(none);
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
    return `<li>${topicIcon(QUESTIONS[b.q])}<span>${esc(s.text)}</span></li>`;
  }).join("")}</ul>`;
}

// "You: … / It: …" for a statement where two answers differ.
function versus(q, mine, theirs, me, them) {
  return `<li class="versus">${topicIcon(q)}<div class="stack-tight"><span><span class="who">${me}</span> ${esc(stance(q, mine).text)}</span>
    <span><span class="who">${them}</span> ${esc(stance(q, theirs).text)}</span></div></li>`;
}

// The card shown under a map when a dot is picked.
function pickCard(container, ideo, { similarity = null } = {}) {
  container.hidden = false;
  container.innerHTML = `
    <div class="pick-head"><h3>${esc(ideo.name)}</h3>${categoryTag(ideo)}
      ${similarity != null ? `<span class="mono small">${pct(similarity)} match</span>` : ""}</div>
    ${aboutIdeology(ideo)}
    <h4>What it stands for</h4>
    ${beliefList(ideo, 3)}
    <p><a class="more-link" href="${ideologyHref(ideo.id)}">Open the full page for ${esc(ideo.name)} →</a></p>`;
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
  return (ideo.summary ? `<p>${esc(ideo.summary)}</p>` : "") + readMore(ideo);
}

// Pass `shared` (decoded answers) to show someone else's result from a link.
function showResults(shared = null) {
  const given = shared || lastAnswers;
  const { you, ranked } = match(model, given);
  const top = ranked[0];
  const answered = given.filter((a) => a !== null).length;
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
        <summary><span class="match-name">${swatch(r.category)}${esc(r.name)}</span><span class="bar"><span style="width:${pct(r.similarity)}"></span></span><span class="mono">${pct(r.similarity)}</span></summary>
        <div class="match-body">
          ${aboutIdeology(r)}
          <h4>What it stands for</h4>
          ${beliefList(r)}
          <p><a class="more-link" href="${ideologyHref(r.id)}">Full page for ${esc(r.name)} →</a></p>
          ${apart.length ? `<h4>Where ${you_} differ most</h4><ul class="iconed">${apart.map((d) =>
            versus(QUESTIONS[d.q], d.a, d.t, You, "It")).join("")}</ul>` : ""}
        </div>
      </details></li>`;
  }).join("");

  R.innerHTML = `
    ${shared ? `<div class="shared-banner"><span>You're viewing someone's shared result.</span><button class="primary" id="own-test">Take the test yourself</button></div>` : ""}
    <div class="verdict tinted" style="--fam: ${colorOf(top)}">
      <span class="eyebrow">${pct(top.similarity)} match · based on ${answered} answers</span>
      <h1 class="name">${esc(top.name)}</h1>
      <div class="tag-row">${categoryTag(top)}${flagSwatch(top)}</div>
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
        ${shared ? "" : `<button class="btn" id="share-top">Share ↗</button>`}
      </div>
      ${aboutIdeology(top)}
      <p class="muted">${closeCall
        ? `It's close: ${you_} ${shared ? "are" : "are"} almost as near to <strong>${ranked[1].name}</strong>, so it's worth reading both.`
        : `${shared ? "Their" : "Your"} next closest match is <strong>${ranked[1].name}</strong>.`}</p>
    </div>

    <section>
      <h2>What ${top.name} stands for</h2>
      ${beliefList(top)}
    </section>

    ${keyFiguresSection(top)}

    <section>
      <h2>Why ${you_} matched</h2>
      <div class="diffs">
        <div class="stack"><h3>${You} agree on</h3><ul class="iconed">${agree.map((d) => `<li>${topicIcon(QUESTIONS[d.q])}<span>${esc(stance(QUESTIONS[d.q], d.a).text)}</span></li>`).join("") || "<li class='muted'>No exact matches on strong views.</li>"}</ul></div>
        <div class="stack"><h3>${You} part ways on</h3><ul class="iconed">${disagree.map((d) => versus(QUESTIONS[d.q], d.a, d.t, You, "It")).join("") || "<li class='muted'>No major disagreements.</li>"}</ul></div>
      </div>
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
        <ul class="cat-legend" aria-label="Map key"></ul>
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

    <div class="row"><button class="${shared ? "" : "primary"}" id="retake">${shared ? "Take the test yourself" : "Take it again"}</button></div>
  `;

  const axesBox = $("axes");
  for (let i = 0; i < SHOWN_LINES; i++) {
    const ax = describeAxis(model, i, QUESTIONS);
    const L = lineInfo(i);
    const vals = model.ideologies.map((d) => d.scores[i]).concat(you[i]);
    const lim = Math.max(...vals.map(Math.abs)) * 1.05;
    const pos = (v) => 6 + (50 + (v / lim) * 50) * 5.88;
    const div = document.createElement("div");
    div.className = "axis";
    div.innerHTML = `
      <div class="axis-head"><h3>${esc(L.name)}</h3><span class="muted small">${pct(model.components[i].share)} of the differences</span></div>
      <div class="axis-ends"><span>${esc(L.low)}</span><span>${esc(L.high)}</span></div>
      <svg viewBox="0 0 600 34" style="width:100%;height:auto;display:block" aria-hidden="true">
        <line x1="6" x2="594" y1="17" y2="17" stroke="var(--line)" stroke-width="2"></line>
        ${model.ideologies.map((d) => `<path d="${shapePath(styleOf(d).shape, pos(d.scores[i]), 17, d.name === top.name ? 6 : 4)}" fill="${colorOf(d)}" opacity="${d.name === top.name ? 1 : 0.45}"><title>${esc(d.name)}</title></path>`).join("")}
        <circle cx="${pos(you[i])}" cy="17" r="7" fill="var(--surface)" stroke="var(--ink)" stroke-width="3"><title>${shared ? "Them" : "You"}</title></circle>
      </svg>
      <details><summary>What this line is about</summary>
        <ul class="plain">${ax.negative.map((p) => `<li>Agreeing moves you toward ${esc(L.low)}: ${p.text}</li>`).join("")}
            ${ax.positive.map((p) => `<li>Agreeing moves you toward ${esc(L.high)}: ${p.text}</li>`).join("")}</ul>
        ${L.low === L.lowIdeo ? "" : `<p class="muted small">Furthest apart on this line: ${esc(L.lowIdeo)} and ${esc(L.highIdeo)}.</p>`}
      </details>`;
    axesBox.append(div);
  }

  const near = new Set(ranked.slice(0, 8).map((r) => r.name));
  const simById = new Map(ranked.map((r) => [r.id, r.similarity]));
  mountMap($("result-map").closest("figure"), { you, highlight: top.name, labels: model.ideologies.length > 25 ? near : null,
    onPick: (ideo) => pickCard($("result-pick"), ideo, { similarity: simById.get(ideo.id) }) },
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
  setHeaderAction(shared ? "take" : "share");
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

// Share: the phone's share sheet where available, otherwise copy the link and show the share section.
let shareTarget = null;
async function shareResult() {
  if (!shareTarget) return;
  if (navigator.share) {
    try { await navigator.share({ title: shareTarget.title, url: shareTarget.url }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(shareTarget.url); $("share-status").textContent = "Link copied."; } catch {}
  $("share").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function setUpSharing(given, ranked, you) {
  const url = shareUrl(given);
  const status = $("share-status");
  $("share-url").value = url;
  shareTarget = { url, title: `My closest political ideology: ${ranked[0].name}` };
  $("share-top").addEventListener("click", shareResult);

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
const CARD = { bg: "#eef1f4", surface: "#ffffff", ink: "#17202b", muted: "#5b6776", line: "#d3d9e1", accent: "#1f6f78", accent2: "#8a3b6b" };
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
  line("M14 2.5A6.5 11.5 0 0 0 14 25.5", FAMILIES.left.card, 2.2);
  line("M14 2.5V25.5", FAMILIES.center.card, 2.2);
  line("M14 2.5A6.5 11.5 0 0 1 14 25.5", FAMILIES.right.card, 2.2);
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

// Portrait share image (1080x1350, the 4:5 size phones and social feeds show well): the ideology
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
  const W = 1080, H = 1350, PAD = 72;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const { ranked, you } = result;
  const top = ranked[0];
  const people = (result.people || []).slice(0, 4);
  const famColor = (ideo) => FAMILIES[styleOf(ideo).family].card;
  const photos = await Promise.all(people.map(loadPhoto));

  // Background: neutral, with a soft wash of the top ideology's traditional colors (or its family
  // color when it has none), blended corner to corner so the colors set a mood without being a flag.
  ctx.fillStyle = CARD.bg; ctx.fillRect(0, 0, W, H);
  const wash = top.flag && top.flag.colors.length ? top.flag.colors.map((x) => x.hex) : [famColor(top)];
  const grad = ctx.createLinearGradient(0, 0, W, H);
  (wash.length === 1 ? [wash[0], wash[0]] : wash).forEach((col, i, all) => grad.addColorStop(i / (all.length - 1), col));
  ctx.globalAlpha = 0.16; ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic";

  // Header: site name, category, ideology name.
  drawGlobe(ctx, PAD, 66, 40);
  ctx.fillStyle = CARD.muted; ctx.font = `500 24px ${CARD_FONTS.mono}`;
  ctx.fillText(SITE_NAME.toUpperCase(), PAD + 56, 95);
  ctx.fillStyle = famColor(top);
  ctx.fill(new Path2D(shapePath(styleOf(top).shape, PAD + 10, 152, 10)));
  ctx.fillStyle = CARD.ink; ctx.font = `500 26px ${CARD_FONTS.mono}`;
  ctx.fillText((top.category || "").toUpperCase(), PAD + 32, 161);
  fitText(ctx, top.name, W - PAD * 2, 92, 700, CARD_FONTS.display);
  ctx.fillText(top.name, PAD, 256);
  ctx.fillStyle = CARD.muted; ctx.font = `400 28px ${CARD_FONTS.body}`;
  ctx.fillText(`${pct(top.similarity)} match${result.answered != null ? ` · based on ${result.answered} answers` : ""}`, PAD, 302);

  const card = (x, y, w, h) => {
    ctx.fillStyle = CARD.surface; ctx.strokeStyle = "rgba(23, 32, 43, 0.08)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill(); ctx.stroke();
  };
  const label = (text, x, y) => { ctx.fillStyle = CARD.muted; ctx.font = `500 20px ${CARD_FONTS.mono}`; ctx.fillText(text, x, y); };

  let y = 336;
  // Hero: the person who thinks most like you.
  if (people.length) {
    const p = people[0], hh = 330;
    card(PAD, y, W - PAD * 2, hh);
    const pw = 300;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(PAD, y, pw, hh, [22, 0, 0, 22]); ctx.clip();
    if (photos[0]) drawCover(ctx, photos[0], PAD, y, pw, hh);
    else { ctx.fillStyle = CARD.line; ctx.fillRect(PAD, y, pw, hh); }
    ctx.restore();
    const tx = PAD + pw + 44, tw = W - PAD - 40 - tx;
    label("THINKS MOST LIKE YOU", tx, y + 56);
    ctx.fillStyle = CARD.ink; ctx.font = `700 50px ${CARD_FONTS.display}`;
    const nameLines = wrapLines(ctx, p.name, tw, 2);
    nameLines.forEach((l, i) => ctx.fillText(l, tx, y + 116 + i * 54));
    const ry = y + 116 + (nameLines.length - 1) * 54 + 40;
    if (p.role) {
      // A two-line name leaves room for one line of role, so nothing runs into the percentage.
      ctx.fillStyle = CARD.muted; ctx.font = `400 24px ${CARD_FONTS.body}`;
      wrapLines(ctx, p.role, tw, nameLines.length > 1 ? 1 : 2).forEach((l, i) => ctx.fillText(l, tx, ry + i * 30));
    }
    ctx.fillStyle = CARD.ink; ctx.font = `700 84px ${CARD_FONTS.display}`;
    ctx.fillText(pct(p.similarity), tx, y + hh - 36);
    const pw2 = ctx.measureText(pct(p.similarity)).width;
    ctx.fillStyle = CARD.muted; ctx.font = `400 26px ${CARD_FONTS.body}`;
    ctx.fillText("alike", tx + pw2 + 14, y + hh - 40);
    y += hh + 28;
  }

  // Two columns: other close ideologies, and more people.
  const colW = (W - PAD * 2 - 28) / 2, ch = 262;
  const morePeople = people.slice(1, 4);
  const ideoW = morePeople.length ? colW : W - PAD * 2;
  card(PAD, y, ideoW, ch);
  label("CLOSE IDEOLOGIES", PAD + 32, y + 50);
  ranked.slice(1, 4).forEach((r, i) => {
    const ry = y + 104 + i * 62, x = PAD + 32, w = ideoW - 64;
    ctx.fillStyle = famColor(r); ctx.fill(new Path2D(shapePath(styleOf(r).shape, x + 8, ry - 8, 8)));
    ctx.fillStyle = CARD.ink; ctx.font = `400 25px ${CARD_FONTS.body}`;
    let name = r.name;
    while (ctx.measureText(name).width > w - 110 && name.length > 4) name = name.slice(0, -2) + "…";
    ctx.fillText(name, x + 28, ry);
    ctx.fillStyle = CARD.muted; ctx.font = `400 22px ${CARD_FONTS.mono}`; ctx.textAlign = "right";
    ctx.fillText(pct(r.similarity), x + w, ry); ctx.textAlign = "left";
    ctx.fillStyle = "rgba(23, 32, 43, 0.1)"; ctx.fillRect(x, ry + 12, w, 6);
    ctx.fillStyle = famColor(r); ctx.fillRect(x, ry + 12, w * r.similarity, 6);
  });
  if (morePeople.length) {
    const x0 = PAD + colW + 28;
    card(x0, y, colW, ch);
    label("MORE PEOPLE", x0 + 32, y + 50);
    morePeople.forEach((p, i) => {
      const cy = y + 104 + i * 62, r = 26, x = x0 + 32;
      ctx.save();
      ctx.beginPath(); ctx.arc(x + r, cy, r, 0, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = CARD.line; ctx.fill();
      if (photos[i + 1]) { ctx.clip(); drawCover(ctx, photos[i + 1], x, cy - r, r * 2, r * 2); }
      ctx.restore();
      ctx.fillStyle = CARD.ink; ctx.font = `600 24px ${CARD_FONTS.body}`;
      let name = p.name;
      while (ctx.measureText(name).width > colW - 64 - 72 - 70 && name.length > 4) name = name.slice(0, -2) + "…";
      ctx.fillText(name, x + 72, cy + 8);
      ctx.fillStyle = CARD.muted; ctx.font = `400 22px ${CARD_FONTS.mono}`; ctx.textAlign = "right";
      ctx.fillText(pct(p.similarity), x0 + colW - 32, cy + 8); ctx.textAlign = "left";
    });
  }
  y += ch + 28;

  // Where you stand on the (up to 3) biggest dividing lines.
  const lines = Math.min(SHOWN_LINES, 3);
  const lh = Math.min(62, (H - 130 - (y + 72)) / lines);
  label("WHERE YOU STAND", PAD, y + 26);
  {
    // Key: the dark ring is you, the faint marker your top match.
    let kx = W - PAD;
    ctx.font = `400 20px ${CARD_FONTS.body}`; ctx.textAlign = "right"; ctx.fillStyle = CARD.muted;
    ctx.fillText(top.name, kx, y + 26); kx -= ctx.measureText(top.name).width + 14;
    ctx.globalAlpha = 0.5; ctx.fillStyle = famColor(top);
    ctx.fill(new Path2D(shapePath(styleOf(top).shape, kx - 6, y + 19, 8))); ctx.globalAlpha = 1;
    kx -= 34; ctx.fillStyle = CARD.muted; ctx.fillText("You", kx, y + 26); kx -= ctx.measureText("You").width + 16;
    ctx.fillStyle = CARD.surface; ctx.strokeStyle = CARD.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(kx, y + 19, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.textAlign = "left";
  }
  for (let i = 0; i < lines; i++) {
    const L = lineInfo(i), ty = y + 72 + i * lh;
    const x0 = PAD + 300, x1 = W - PAD;
    const vals = model.ideologies.map((d) => d.scores[i]).concat(you[i]);
    const lim = Math.max(...vals.map(Math.abs)) * 1.05 || 1;
    const px = (v) => x0 + ((v / lim) + 1) / 2 * (x1 - x0);
    ctx.fillStyle = CARD.ink; ctx.font = `600 24px ${CARD_FONTS.display}`;
    ctx.fillText(L.name, PAD, ty + 8);
    ctx.fillStyle = CARD.muted; ctx.font = `400 18px ${CARD_FONTS.body}`;
    ctx.fillText(L.low, x0, ty + 34); ctx.textAlign = "right"; ctx.fillText(L.high, x1, ty + 34); ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(23, 32, 43, 0.15)"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x1, ty); ctx.stroke(); ctx.lineCap = "butt";
    ctx.globalAlpha = 0.5; ctx.fillStyle = famColor(top);
    ctx.fill(new Path2D(shapePath(styleOf(top).shape, px(top.scores[i]), ty, 9))); ctx.globalAlpha = 1;
    const ux = px(you[i]);
    ctx.fillStyle = CARD.surface; ctx.strokeStyle = CARD.ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ux, ty, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CARD.ink; ctx.beginPath(); ctx.arc(ux, ty, 4, 0, Math.PI * 2); ctx.fill();
  }

  // Footer.
  ctx.fillStyle = "rgba(23, 32, 43, 0.12)"; ctx.fillRect(PAD, H - 108, W - PAD * 2, 2);
  ctx.fillStyle = CARD.ink; ctx.font = `500 24px ${CARD_FONTS.mono}`;
  ctx.fillText("TAKE THE TEST", PAD, H - 56);
  ctx.textAlign = "right"; ctx.fillText(site.toUpperCase(), W - PAD, H - 56); ctx.textAlign = "left";
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
    // A light wash of the top match's family color.
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = FAMILIES[styleOf(result.ranked[0]).family].card;
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
    const people = (result.people || []).slice(0, 3);
    const mark = (ideo, x, y, r) => {
      ctx.fillStyle = FAMILIES[styleOf(ideo).family].card;
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
      ctx.fillStyle = FAMILIES[styleOf(r).family].card;
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

  const lines = Math.min(SHOWN_LINES, 6);
  const top = result ? result.ranked[0] : null;
  const rowH = (ms - 80) / lines;
  for (let i = 0; i < lines; i++) {
    const L = lineInfo(i);
    const y0 = my + 64 + i * rowH;
    const x0 = mx + 36, x1 = mx + ms - 36;
    const vals = model.ideologies.map((d) => d.scores[i]).concat(result ? [result.you[i]] : []);
    const lim = Math.max(...vals.map(Math.abs)) * 1.05 || 1;
    const px = (v) => x0 + ((v / lim) + 1) / 2 * (x1 - x0);
    const ty = y0 + rowH * 0.55;

    ctx.fillStyle = CARD.ink;
    ctx.font = `600 ${lines > 4 ? 17 : 19}px ${CARD_FONTS.display}`;
    ctx.fillText(L.name, x0, y0 + 14);
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
        ctx.fillStyle = FAMILIES[styleOf(d).family].card;
        ctx.fill(new Path2D(shapePath(styleOf(d).shape, px(d.scores[i]), ty, 6)));
      }
      ctx.globalAlpha = 1;
      continue;
    }
    // Your top match, faint, for comparison; then you, as a dark ring.
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = FAMILIES[styleOf(top).family].card;
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
    ctx.fillStyle = FAMILIES[styleOf(top).family].card;
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
  onPick: (ideo) => pickCard($("ideo-pick"), ideo) },
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

const CATEGORY_ORDER = ["Radical Left", "Left", "Center", "Right", "Far-Right", "Third Position", "Libertarian", "Anarchist"];
let exploreCategory = null;

function renderExplore() {
  const query = $("explore-search").value.trim().toLowerCase();
  const shown = model.ideologies.filter((i) =>
    (!exploreCategory || i.category === exploreCategory) &&
    (!query || i.name.toLowerCase().includes(query) || (i.summary || "").toLowerCase().includes(query)));
  const groups = CATEGORY_ORDER.concat([...new Set(model.ideologies.map((i) => i.category))].filter((c) => !CATEGORY_ORDER.includes(c)))
    .map((c) => [c, shown.filter((i) => i.category === c).sort((a, b) => a.name.localeCompare(b.name))])
    .filter(([, list]) => list.length);
  $("explore-count").textContent = shown.length === model.ideologies.length
    ? `${shown.length} ideologies`
    : `${shown.length} of ${model.ideologies.length} ideologies`;
  $("explore-list").innerHTML = groups.map(([c, list]) => `
    <div class="stack">
      <h3>${swatch(c, 16)}${esc(c)} <span class="muted small">${list.length}</span></h3>
      <ul class="matches">${list.map(ideologyRow).join("")}</ul>
    </div>`).join("") || `<p class="muted">No ideologies match “${esc(query)}”.</p>`;
}


const categories = [...new Set(model.ideologies.map((i) => i.category))]
  .sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99));
$("explore-cats").innerHTML = [["", "All"], ...categories.map((c) => [c, c])]
  .map(([v, label]) => `<button class="chip-btn" data-cat="${esc(v)}" aria-pressed="${v === ""}">${v ? swatch(v, 12) : ""}${esc(label)}</button>`).join("");
$("explore-cats").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  exploreCategory = b.dataset.cat || null;
  for (const x of $("explore-cats").children) x.setAttribute("aria-pressed", String(x === b));
  renderExplore();
});
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

function personBody(p) {
  const links = [p.wikipedia && `<a href="${esc(p.wikipedia)}" target="_blank" rel="noopener">Wikipedia</a>`,
    `<a href="${REPO}/blob/main/audits/people/${esc(p.id)}.json" target="_blank" rel="noopener">How this profile was researched</a>`].filter(Boolean);
  return `<div class="person-head">${avatar(p, 72)}<div class="stack">
    <p class="muted small">${esc(p.role || "")}${p.role ? " · " : ""}${esc(p.region)} · ${p.living ? `born ${p.born}` : `born ${p.born}, historical`}</p>
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

// Where `scores` sits on each shown dividing line, with every ideology as a faint marker.
function lineStrips(scores, { selfId = null } = {}) {
  return Array.from({ length: SHOWN_LINES }, (_, i) => {
    const L = lineInfo(i);
    const vals = model.ideologies.map((d) => d.scores[i]).concat(scores[i]);
    const lim = Math.max(...vals.map(Math.abs)) * 1.05;
    const pos = (v) => 6 + (50 + (v / lim) * 50) * 5.88;
    return `<div class="axis">
      <div class="axis-head"><h3>${esc(L.name)}</h3><span class="muted small">${pct(model.components[i].share)} of the differences</span></div>
      <div class="axis-ends"><span>${esc(L.low)}</span><span>${esc(L.high)}</span></div>
      <svg viewBox="0 0 600 34" style="width:100%;height:auto;display:block" aria-hidden="true">
        <line x1="6" x2="594" y1="17" y2="17" stroke="var(--line)" stroke-width="2"></line>
        ${model.ideologies.filter((d) => d.id !== selfId).map((d) => `<path d="${shapePath(styleOf(d).shape, pos(d.scores[i]), 17, 4)}" fill="${colorOf(d)}" opacity="0.35"><title>${esc(d.name)}</title></path>`).join("")}
        <circle cx="${pos(scores[i])}" cy="17" r="8" fill="var(--surface)" stroke="var(--ink)" stroke-width="3"></circle>
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
        ${a && a.rationale ? `<p class="muted small">${esc(a.rationale)}
          <span class="conf">${esc(a.confidence)} confidence${a.sources && a.sources.length ? ` · sources ${a.sources.map(sourceLink).join(", ")}` : ""}</span></p>` : ""}
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
  <span class="match-name">${swatch(r.category)}${esc(r.name)}</span>
  ${r.similarity != null ? `<span class="mono small">${pct(r.similarity)}</span>` : `<span class="muted small">${esc(r.category || "")}</span>`}
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
      <div class="detail-head stack tinted" style="--fam: ${colorOf(ideo)}">
        <div class="tag-row">${categoryTag(ideo)}${flagSwatch(ideo)}</div>
        <h1>${esc(ideo.name)}</h1>
        ${aboutIdeology(ideo)}
        ${audit && audit.scope ? `<p class="muted small"><strong>Scope:</strong> ${esc(audit.scope)}</p>` : ""}
        ${yourMatchLine(yours, ideo.name)}
      </div>
      <section class="stack"><h2>What it stands for</h2>${beliefList(ideo, 6)}</section>
      ${keyFiguresSection(ideo)}
      <section class="stack"><h2>Where it sits</h2>${lineStrips(ideo.scores, { selfId: ideo.id })}</section>
      <section class="stack"><h2>Closest ideologies</h2><ul class="matches">${neighbors.map(ideologyRow).join("")}</ul></section>
      ${people.length ? `<section class="stack"><h2>People closest to it</h2><ul class="matches">${people.map(personRow).join("")}</ul></section>` : ""}
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
          <span class="eyebrow">${esc(p.region)} · ${p.living ? `born ${p.born}` : `born ${p.born}, historical`}</span>
          <h1>${esc(p.name)}</h1>
          ${p.role ? `<p class="muted">${esc(p.role)}</p>` : ""}
          ${imageCredit(p)}
        </div>
      </div>
      ${p.summary ? `<p class="lede">${esc(p.summary)}</p>` : ""}
      <p class="read-more small"><span class="muted">Read more:</span> ${p.wikipedia ? `<a href="${esc(p.wikipedia)}" target="_blank" rel="noopener">Wikipedia</a> · ` : ""}<a href="${REPO}/blob/main/audits/people/${esc(p.id)}.json" target="_blank" rel="noopener">The full audit</a></p>
      ${yourMatchLine(yours, p.name)}
      <section class="stack"><h2>Closest ideologies</h2>
        <p class="muted small">Based on the ${profile.filter((x) => x != null).length} statements where ${esc(p.name)} has a known position.</p>
        <ul class="matches">${closest.map(ideologyRow).join("")}</ul></section>
      <section class="stack"><h2>Where they sit</h2>${lineStrips(project(model, profile))}</section>
      ${similar.length ? `<section class="stack"><h2>Similar people</h2><ul class="matches">${similar.map(personRow).join("")}</ul></section>` : ""}
      <section class="stack"><h2>Key positions</h2>${positionsList(profile, audit, `${REPO}/blob/main/audits/people/${p.id}.json`)}</section>
      ${sourcesList(audit)}`;
  };
  draw(null);
  loadAudit("people", p.id).then((a) => { if (a && $("page-person").dataset.id === id) draw(a); });
  $("page-person").dataset.id = id;
  return p.name;
}

// ---------- Menu and routing ----------

function closeMenu() {
  $("nav-links").classList.remove("open");
  $("menu-btn").setAttribute("aria-expanded", "false");
}
$("menu-btn").addEventListener("click", () => {
  const open = $("nav-links").classList.toggle("open");
  $("menu-btn").setAttribute("aria-expanded", String(open));
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

// Routes: #/ (home), #/how, #/test, #/results, #/ideologies[/<id>], #/about.
// A shared result (?r=…) opens on the results page.
function route() {
  const [page = "", arg] = location.hash.replace(/^#\/?/, "").split("/");
  const shared = decodeAnswers(new URLSearchParams(location.search).get("r"));
  $("resume").hidden = !load();

  if (page === "test") {
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
