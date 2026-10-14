// UI: intro map, one-statement-at-a-time quiz, results.
const model = buildModel(IDEOLOGIES);
const CHOICES = [
  { label: "Strongly disagree", value: -2 },
  { label: "Disagree", value: -1 },
  { label: "Neutral", value: 0 },
  { label: "Agree", value: 1 },
  { label: "Strongly agree", value: 2 },
];
const STORAGE_KEY = "eigencompass-progress";
const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

// Questions are shown in a shuffled order; answers are always stored by question index.
let order = [];
let answers = [];
let position = 0;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, answers, position })); } catch {}
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && s.answers.length === QUESTIONS.length) return s;
  } catch {}
  return null;
}
function clearSaved() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function shuffle(n) {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function axisName(i) {
  const ax = describeAxis(model, i, QUESTIONS);
  return `${ax.lowEnd[0]} ↔ ${ax.highEnd[0]}`;
}
const pct = (x) => `${Math.round(x * 100)}%`;

// ---------- Map ----------

function el(tag, attrs, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

function drawMap(svg, xi, yi, { you = null, highlight = null } = {}) {
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
  const ex = describeAxis(model, xi, QUESTIONS), ey = describeAxis(model, yi, QUESTIONS);
  svg.append(
    el("text", { x: 10, y: H - 10 }, `← ${ex.lowEnd[0]}`),
    el("text", { x: W - 10, y: H - 10, "text-anchor": "end" }, `${ex.highEnd[0]} →`),
    el("text", { x: W / 2 + 6, y: pad - 18 }, `↑ ${ey.highEnd[0]}`),
    el("text", { x: W / 2 + 6, y: H - pad + 28 }, `↓ ${ey.lowEnd[0]}`)
  );

  // Greedy label placement: try right, left, then nudged up/down until a label clears the others.
  const placed = [];
  if (you) placed.push({ x0: sx(you[xi]) - 16, x1: sx(you[xi]) + 16, y0: sy(you[yi]) - 26, y1: sy(you[yi]) + 10 });
  const hits = (b) => placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  for (const ideo of model.ideologies) {
    const x = sx(ideo.scores[xi]), y = sy(ideo.scores[yi]);
    const hot = ideo.name === highlight;
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
    const g = el("g", {});
    g.append(el("title", {}, ideo.name));
    g.append(el("circle", { cx: x, cy: y, r: hot ? 6 : 4, fill: hot ? "var(--accent-2)" : "var(--muted)" }));
    g.append(el("text", { class: "lbl", x: spot.lx, y: spot.ly, "text-anchor": spot.right ? "start" : "end",
      style: hot ? "fill: var(--accent-2); font-weight: 700" : "" }, ideo.name));
    svg.append(g);
  }
  if (you) {
    const x = sx(you[xi]), y = sy(you[yi]);
    svg.append(
      el("circle", { cx: x, cy: y, r: 9, fill: "none", stroke: "var(--accent)", "stroke-width": 2.5 }),
      el("circle", { cx: x, cy: y, r: 3.5, fill: "var(--accent)" }),
      el("text", { class: "you-lbl", x: x, y: y - 14, "text-anchor": "middle" }, "You")
    );
  }
}

// ---------- Quiz ----------

function show(id) {
  for (const s of ["intro", "quiz", "results"]) $(s).hidden = s !== id;
  window.scrollTo(0, 0);
}

function renderQuestion() {
  const q = order[position];
  $("counter").textContent = `Statement ${position + 1} of ${QUESTIONS.length}`;
  $("bar").style.width = pct(position / QUESTIONS.length);
  $("statement").textContent = QUESTIONS[q];
  $("back").disabled = position === 0;
  $("finish-early").hidden = answers.filter((a) => a !== undefined).length < 15;
  for (const [i, b] of [...$("likert").children].entries()) {
    b.classList.toggle("chosen", answers[q] === CHOICES[i].value);
  }
}

function answer(value) {
  answers[order[position]] = value;
  position++;
  save();
  if (position >= QUESTIONS.length) showResults();
  else renderQuestion();
}

function startQuiz(saved) {
  if (saved) ({ order, answers, position } = saved);
  else { order = shuffle(QUESTIONS.length); answers = Array(QUESTIONS.length).fill(undefined); position = 0; }
  show("quiz");
  if (position >= QUESTIONS.length) showResults();
  else renderQuestion();
}

for (const [i, c] of CHOICES.entries()) {
  const b = document.createElement("button");
  b.id = `choice-${i}`;
  b.innerHTML = `<span>${c.label}</span><span class="key">${i + 1}</span>`;
  b.addEventListener("click", () => answer(c.value));
  $("likert").append(b);
}
$("skip").addEventListener("click", () => answer(null));
$("back").addEventListener("click", () => { if (position > 0) { position--; save(); renderQuestion(); } });
$("finish-early").addEventListener("click", showResults);
$("start").addEventListener("click", () => startQuiz(null));
$("resume").addEventListener("click", () => startQuiz(load()));
document.addEventListener("keydown", (e) => {
  if ($("quiz").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 5) answer(CHOICES[n - 1].value);
  else if (e.key === "Backspace") $("back").click();
});

// ---------- Results ----------

function showResults() {
  const given = answers.map((a) => (a === undefined ? null : a));
  const { you, ranked } = match(model, given);
  const top = ranked[0];
  const answered = given.filter((a) => a !== null).length;
  const k = model.kept;
  const keptShare = model.components.slice(0, k).reduce((s, c) => s + c.share, 0);
  const R = $("results");

  // Statements where you and the top match agree or differ the most.
  const diffs = given
    .map((a, q) => (a === null ? null : { q, a, t: top.profile[q], gap: Math.abs(a - top.profile[q]) }))
    .filter(Boolean);
  const agree = diffs.filter((d) => d.gap === 0 && d.a !== 0).sort((x, y) => Math.abs(y.a) - Math.abs(x.a)).slice(0, 4);
  const disagree = diffs.filter((d) => d.gap >= 2).sort((x, y) => y.gap - x.gap).slice(0, 4);
  const word = (v) => CHOICES.find((c) => c.value === v).label.toLowerCase();

  const closeCall = ranked[1].similarity > top.similarity - 0.05;

  R.innerHTML = `
    <div class="verdict">
      <span class="eyebrow">Your closest match · ${answered} of ${QUESTIONS.length} statements answered</span>
      <h1 class="name">${top.name}</h1>
      <p>${closeCall
        ? `It's close. You sit nearly as near to <strong>${ranked[1].name}</strong>, so read the two together.`
        : `Your next nearest is <strong>${ranked[1].name}</strong>.`}</p>
    </div>

    <section>
      <h2>Nearest ideologies</h2>
      <ul class="matches">${ranked.slice(0, 6).map((r) => `
        <li><span>${r.name}</span><div class="bar"><div style="width:${pct(r.similarity)}"></div></div><span class="mono">${pct(r.similarity)}</span></li>`).join("")}
      </ul>
      <p class="muted" style="font-size:0.9rem">Closeness is measured across the ${k} axes below, where 100% means the same position and 0% means as far apart as the two most distant reference ideologies.</p>
    </section>

    <section>
      <h2>Where you stand</h2>
      <p>The analysis found ${model.components.length} independent directions in the reference data. The first ${k} explain ${pct(keptShare)} of how the ideologies differ, so those are the ones used. The rest separate the ideologies so little that they mostly add noise.</p>
      <div id="axes"></div>
    </section>

    <section>
      <h2>The map</h2>
      <figure>
        <div class="row" style="font-size:0.9rem">
          <label for="x-axis">Across</label><select id="x-axis"></select>
          <label for="y-axis">Up</label><select id="y-axis"></select>
        </div>
        <svg id="result-map" class="chart" viewBox="0 0 640 440" role="img" aria-label="Your position among the reference ideologies"></svg>
      </figure>
    </section>

    <section>
      <h2>Why ${top.name}?</h2>
      <div class="diffs">
        <div class="stack"><h3>You agree on</h3><ul>${agree.map((d) => `<li>${QUESTIONS[d.q]} <span class="mono">both ${word(d.a)}</span></li>`).join("") || "<li class='muted'>No exact matches on strong views.</li>"}</ul></div>
        <div class="stack"><h3>You part ways on</h3><ul>${disagree.map((d) => `<li>${QUESTIONS[d.q]} <span class="mono">you: ${word(d.a)} · them: ${word(d.t)}</span></li>`).join("") || "<li class='muted'>No major disagreements.</li>"}</ul></div>
      </div>
    </section>

    <section>
      <h2>How much each axis matters</h2>
      <figure>
        <svg id="scree" class="chart" viewBox="0 0 640 220" role="img" aria-label="Share of variance explained by each axis"></svg>
        <figcaption>Each bar is an eigenvalue of the covariance matrix: the share of disagreement between ideologies that one axis captures. Filled bars are the axes used for matching.</figcaption>
      </figure>
    </section>

    <div class="row"><button class="primary" id="retake">Take it again</button></div>
  `;

  const axesBox = $("axes");
  for (let i = 0; i < k; i++) {
    const ax = describeAxis(model, i, QUESTIONS);
    const vals = model.ideologies.map((d) => d.scores[i]).concat(you[i]);
    const lim = Math.max(...vals.map(Math.abs)) * 1.05;
    const pos = (v) => 50 + (v / lim) * 50;
    const div = document.createElement("div");
    div.className = "axis";
    div.innerHTML = `
      <div class="axis-head"><h3>Axis ${i + 1}</h3><span class="mono muted" style="font-size:0.8rem">${pct(model.components[i].share)} of variance</span></div>
      <svg viewBox="0 0 600 34" style="width:100%;height:auto;display:block" aria-hidden="true">
        <line x1="6" x2="594" y1="17" y2="17" stroke="var(--line)" stroke-width="2"></line>
        ${model.ideologies.map((d) => `<circle cx="${6 + pos(d.scores[i]) * 5.88}" cy="17" r="${d.name === top.name ? 6 : 4}" fill="${d.name === top.name ? "var(--accent-2)" : "var(--muted)"}" opacity="${d.name === top.name ? 1 : 0.5}"><title>${d.name}</title></circle>`).join("")}
        <circle cx="${6 + pos(you[i]) * 5.88}" cy="17" r="8" fill="var(--accent)"><title>You</title></circle>
      </svg>
      <div class="axis-ends"><span>← ${ax.lowEnd.join(", ")}</span><span>${ax.highEnd.join(", ")} →</span></div>
      <details><summary>Statements that define this axis</summary>
        <ul>${ax.positive.map((p) => `<li>Agreeing moves you right: ${p.text}</li>`).join("")}
            ${ax.negative.map((p) => `<li>Agreeing moves you left: ${p.text}</li>`).join("")}</ul>
      </details>`;
    axesBox.append(div);
  }

  const xs = $("x-axis"), ys = $("y-axis");
  const options = model.components.slice(0, Math.max(k, 4)).map((c, i) => `<option value="${i}">Axis ${i + 1} (${pct(c.share)})</option>`).join("");
  xs.innerHTML = options; ys.innerHTML = options;
  xs.value = "0"; ys.value = "1";
  const redraw = () => drawMap($("result-map"), Number(xs.value), Number(ys.value), { you, highlight: top.name });
  xs.addEventListener("change", redraw); ys.addEventListener("change", redraw);
  redraw();

  drawScree($("scree"));
  $("retake").addEventListener("click", () => { clearSaved(); startQuiz(null); });
  show("results");
}

function drawScree(svg) {
  const W = 640, H = 220, left = 40, bottom = 30, top = 14;
  const comps = model.components;
  const max = Math.ceil(comps[0].share * 10) / 10;
  const bw = (W - left - 10) / comps.length;
  const y = (v) => H - bottom - (v / max) * (H - bottom - top);
  for (let t = 0; t <= max + 1e-9; t += 0.1) {
    svg.append(el("line", { x1: left, x2: W - 10, y1: y(t), y2: y(t), stroke: "var(--line)" }));
    svg.append(el("text", { x: left - 6, y: y(t) + 4, "text-anchor": "end" }, pct(t)));
  }
  comps.forEach((c, i) => {
    const x = left + i * bw + 3;
    const used = i < model.kept;
    svg.append(el("rect", { x, y: y(c.share), width: bw - 6, height: H - bottom - y(c.share),
      fill: used ? "var(--accent)" : "var(--line)", rx: 2 }));
    svg.append(el("text", { x: x + (bw - 6) / 2, y: H - bottom + 16, "text-anchor": "middle" }, i + 1));
  });
}

// ---------- Intro ----------

drawMap($("intro-map"), 0, 1);
$("intro-caption").textContent =
  `The 19 reference ideologies on the two strongest axes, which together explain ${pct(model.components[0].share + model.components[1].share)} of how they differ. You'll be placed on this map at the end.`;
if (load()) $("resume").hidden = false;
