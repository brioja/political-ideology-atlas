// UI: intro map, one-statement-at-a-time quiz, results.
const model = buildModel(IDEOLOGIES);
const CHOICES = [
  { label: "Strongly disagree", value: -2 },
  { label: "Disagree", value: -1 },
  { label: "Neutral", value: 0 },
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
const MIN_ANSWERS = 10;

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
  const ex = describeAxis(model, xi, QUESTIONS), ey = describeAxis(model, yi, QUESTIONS);
  svg.append(
    el("text", { x: 10, y: H - 10 }, `← ${ex.lowEnd[0]}`),
    el("text", { x: W - 10, y: H - 10, "text-anchor": "end" }, `${ex.highEnd[0]} →`),
    el("text", { x: W / 2 + 6, y: pad - 18 }, `↑ ${ey.highEnd[0]}`),
    el("text", { x: W / 2 + 6, y: H - pad + 12 }, `↓ ${ey.lowEnd[0]}`)
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
    g.append(el("circle", { cx: x, cy: y, r: hot ? 6 : 4, fill: hot ? "var(--accent-2)" : "var(--muted)", opacity: !labels || labels.has(ideo.name) ? 1 : 0.35 }));
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
      style: hot ? "fill: var(--accent-2); font-weight: 700" : "" }, ideo.name));
  }
  if (you) {
    const x = sx(you[xi]), y = sy(you[yi]);
    svg.append(
      el("circle", { cx: x, cy: y, r: 9, fill: "none", stroke: "var(--accent)", "stroke-width": 2.5 }),
      el("circle", { cx: x, cy: y, r: 3.5, fill: "var(--accent)" }),
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
    const ring = el("circle", { cx: x, cy: y, r: 9, fill: "none", stroke: "var(--accent-2)", "stroke-width": 2.5 });
    const label = el("text", { class: "pick-lbl", x, y: y - 16, "text-anchor": "middle" }, ideo.name);
    const box = el("rect", { rx: 4, fill: "var(--surface)", stroke: "var(--accent-2)" });
    pickLayer.append(ring, box, label);
    const b = label.getBBox();
    const shift = Math.min(0, W - 6 - (b.x + b.width)) + Math.max(0, 6 - b.x);
    label.setAttribute("x", x + shift);
    if (b.y < 4) label.setAttribute("y", y + 26);
    const nb = label.getBBox();
    for (const [k, v] of Object.entries({ x: nb.x - 6, y: nb.y - 3, width: nb.width + 12, height: nb.height + 6 })) box.setAttribute(k, v);
    if (onPick) onPick(ideo);
  };
  svg.onclick = (e) => {
    const dot = e.target.closest(".dot");
    if (dot) pick(dot.dataset.id);
  };
  return pick;
}

// ---------- Quiz ----------

function show(id) {
  for (const s of ["intro", "quiz", "results"]) $(s).hidden = s !== id;
  window.scrollTo(0, 0);
}

function renderQuestion() {
  const q = order[position];
  const asked = new Set(order);
  const answered = answers.filter((a) => a !== null).length;
  const sure = certainty(model, answers, asked);
  const settled = answered >= MIN_ANSWERS && sure >= 0.9;
  $("counter").textContent = `Statement ${position + 1}`;
  $("bar").style.width = pct(sure);
  $("certainty").textContent = answered < 3 ? "Most telling statements first" : `Result ${pct(sure)} settled`;
  $("statement").textContent = QUESTIONS[q].text;
  $("back").disabled = position === 0;
  $("finish-early").hidden = answered < MIN_ANSWERS;
  $("finish-early").classList.toggle("primary", settled);
  $("settled-note").hidden = !settled;
  for (const [i, b] of [...$("likert").children].entries()) {
    b.classList.toggle("chosen", answers[q] === CHOICES[i].value);
  }
}

function answer(value) {
  answers[order[position]] = value;
  position++;
  if (position === order.length) {
    const next = nextQuestion(model, answers, new Set(order));
    if (!next) { save(); showResults(); return; }
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
  show("quiz");
  renderQuestion();
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
$("finish-early").addEventListener("click", () => showResults());
$("start").addEventListener("click", () => startQuiz(null));
$("resume").addEventListener("click", () => startQuiz(load()));
document.addEventListener("keydown", (e) => {
  if ($("quiz").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 5) answer(CHOICES[n - 1].value);
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

function beliefList(ideo, n = 4) {
  return `<ul class="beliefs">${keyBeliefs(ideo, n).map((b) =>
    `<li><span class="chip ${b.p > 0 ? "agree" : "disagree"}">${word(b.p)}</span><span>${QUESTIONS[b.q].text}</span></li>`).join("")}</ul>`;
}

// The card shown under a map when a dot is picked.
function pickCard(container, ideo, { similarity = null, showInList = false } = {}) {
  container.hidden = false;
  container.innerHTML = `
    <div class="pick-head"><h3>${esc(ideo.name)}</h3>${ideo.category ? `<span class="muted small">${esc(ideo.category)}</span>` : ""}
      ${similarity != null ? `<span class="mono small">${pct(similarity)} match</span>` : ""}</div>
    ${aboutIdeology(ideo)}
    <h4>What it stands for</h4>
    ${beliefList(ideo, 3)}
    ${showInList ? `<button class="link" data-show="${esc(ideo.id)}">Show it in the list below</button>` : ""}`;
  const btn = container.querySelector("[data-show]");
  if (btn) btn.addEventListener("click", () => openInExplore(ideo.id));
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
  const given = shared || answers.map((a) => (a === undefined ? null : a));
  const { you, ranked } = match(model, given);
  const top = ranked[0];
  const answered = given.filter((a) => a !== null).length;
  const k = model.kept;
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

  const others = ranked.slice(1, 7).map((r) => {
    const apart = answeredDiffs(r).filter((d) => d.gap >= 2).sort((x, y) => y.gap - x.gap).slice(0, 2);
    return `
      <li><details>
        <summary><span class="match-name">${r.name}</span><span class="bar"><span style="width:${pct(r.similarity)}"></span></span><span class="mono">${pct(r.similarity)}</span></summary>
        <div class="match-body">
          ${aboutIdeology(r)}
          <h4>What it stands for</h4>
          ${beliefList(r)}
          ${apart.length ? `<h4>Where ${you_} differ most</h4><ul class="plain">${apart.map((d) =>
            `<li>${QUESTIONS[d.q].text} <span class="mono small">${you_}: ${word(d.a).toLowerCase()} · it: ${word(d.t).toLowerCase()}</span></li>`).join("")}</ul>` : ""}
        </div>
      </details></li>`;
  }).join("");

  R.innerHTML = `
    ${shared ? `<div class="shared-banner"><span>You're viewing someone's shared result.</span><button class="primary" id="own-test">Take the test yourself</button></div>` : ""}
    <div class="verdict">
      <span class="eyebrow">${your} closest match · ${pct(top.similarity)} · based on ${answered} answers</span>
      <h1 class="name">${top.name}</h1>
      ${aboutIdeology(top)}
      <p class="muted">${closeCall
        ? `It's close: ${you_} ${shared ? "are" : "are"} almost as near to <strong>${ranked[1].name}</strong>, so it's worth reading both.`
        : `${You}r next closest match is <strong>${ranked[1].name}</strong>.`}</p>
    </div>

    <section>
      <h2>What ${top.name} stands for</h2>
      ${beliefList(top)}
    </section>

    <section>
      <h2>Why ${you_} matched</h2>
      <div class="diffs">
        <div class="stack"><h3>${You} agree on</h3><ul class="plain">${agree.map((d) => `<li>${QUESTIONS[d.q].text} <span class="mono small">both ${word(d.a).toLowerCase()}</span></li>`).join("") || "<li class='muted'>No exact matches on strong views.</li>"}</ul></div>
        <div class="stack"><h3>${You} part ways on</h3><ul class="plain">${disagree.map((d) => `<li>${QUESTIONS[d.q].text} <span class="mono small">${you_}: ${word(d.a).toLowerCase()} · it: ${word(d.t).toLowerCase()}</span></li>`).join("") || "<li class='muted'>No major disagreements.</li>"}</ul></div>
      </div>
    </section>

    <section>
      <h2>Other close matches</h2>
      <p class="muted small">Tap one to see what it stands for and where ${you_} differ.</p>
      <ul class="matches">${others}</ul>
    </section>

    <section>
      <h2>Where ${you_} stand</h2>
      <p>Most disagreement between ideologies comes down to a few big dividing lines. The test found them by looking at how the ideologies answer, rather than deciding them in advance. Here is where ${you_} fall on the ${k} biggest.</p>
      <div id="axes"></div>
    </section>

    <section>
      <h2>The map</h2>
      <figure>
        <svg id="result-map" class="chart" viewBox="0 0 640 440" role="img" aria-label="Your position among the ideologies"></svg>
        <figcaption>Each dot is an ideology, placed on the two biggest dividing lines. Ideologies close together tend to answer alike. Tap any dot to see which one it is.</figcaption>
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
        <canvas id="card" class="card-preview" width="1200" height="630" aria-label="Shareable image of your result"></canvas>
        <figcaption>Save the image to post alongside your link.</figcaption>
      </figure>
    </section>`}

    <details class="how">
      <summary>How this test works</summary>
      <div class="stack">
        <p><strong>The ideologies.</strong> Each of the ${model.ideologies.length} ideologies has an answer to every statement, worked out from its own writings and from scholarly sources. Every profile, with its sources and reasoning, is <a href="${REPO}/tree/main/audits" target="_blank" rel="noopener">public on GitHub</a>.</p>
        <p><strong>The dividing lines.</strong> Most tests pick their axes up front, like left vs. right. This one finds them from the data, using a method called principal component analysis. It looks for the directions in which the ideologies' answers differ the most. The chart below shows how much of the total disagreement each line accounts for. The first few cover most of it, so those are the ones shown above.</p>
        <figure>
          <svg id="scree" class="chart" viewBox="0 0 640 220" role="img" aria-label="How much of the disagreement between ideologies each dividing line accounts for"></svg>
        </figure>
        <p><strong>The questions.</strong> Statements are picked one at a time. The first ones are those ideologies disagree about most. After that, each statement is the one that best separates the ideologies ${you_} are still close to. That's why ${you_} can stop early.</p>
        <p><strong>The match percentage.</strong> It compares ${your} answers with each ideology's on the statements ${you_} answered. 100% means identical answers, and 0% means as far apart as the two most opposite ideologies.</p>
      </div>
    </details>

    <div class="row"><button class="${shared ? "" : "primary"}" id="retake">${shared ? "Take the test yourself" : "Take it again"}</button></div>
  `;

  const axesBox = $("axes");
  for (let i = 0; i < k; i++) {
    const ax = describeAxis(model, i, QUESTIONS);
    const vals = model.ideologies.map((d) => d.scores[i]).concat(you[i]);
    const lim = Math.max(...vals.map(Math.abs)) * 1.05;
    const pos = (v) => 6 + (50 + (v / lim) * 50) * 5.88;
    const div = document.createElement("div");
    div.className = "axis";
    div.innerHTML = `
      <div class="axis-ends"><span>${ax.lowEnd[0]}</span><span>${ax.highEnd[0]}</span></div>
      <svg viewBox="0 0 600 34" style="width:100%;height:auto;display:block" aria-hidden="true">
        <line x1="6" x2="594" y1="17" y2="17" stroke="var(--line)" stroke-width="2"></line>
        ${model.ideologies.map((d) => `<circle cx="${pos(d.scores[i])}" cy="17" r="${d.name === top.name ? 6 : 4}" fill="${d.name === top.name ? "var(--accent-2)" : "var(--muted)"}" opacity="${d.name === top.name ? 1 : 0.4}"><title>${d.name}</title></circle>`).join("")}
        <circle cx="${pos(you[i])}" cy="17" r="8" fill="var(--accent)"><title>${shared ? "Them" : "You"}</title></circle>
      </svg>
      <details><summary>What this line is about</summary>
        <ul class="plain">${ax.negative.map((p) => `<li>Agreeing moves you toward ${ax.lowEnd[0]}: ${p.text}</li>`).join("")}
            ${ax.positive.map((p) => `<li>Agreeing moves you toward ${ax.highEnd[0]}: ${p.text}</li>`).join("")}</ul>
      </details>`;
    axesBox.append(div);
  }

  const near = new Set(ranked.slice(0, 8).map((r) => r.name));
  const simById = new Map(ranked.map((r) => [r.id, r.similarity]));
  drawMap($("result-map"), 0, 1, { you, highlight: top.name, labels: model.ideologies.length > 25 ? near : null,
    onPick: (ideo) => pickCard($("result-pick"), ideo, { similarity: simById.get(ideo.id) }) });
  drawScree($("scree"));

  const fresh = () => {
    if (shared) history.replaceState(null, "", location.pathname);
    else clearSaved();
    startQuiz(null);
  };
  $("retake").addEventListener("click", fresh);
  if (shared) $("own-test").addEventListener("click", fresh);
  else setUpSharing(given, ranked, you);
  show("results");
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
    const used = i < model.kept;
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
  drawCard(canvas, { ranked, you });
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
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = CARD.muted;
  ctx.font = `500 18px ${CARD_FONTS.mono}`;
  ctx.fillText(result ? `${SITE_NAME.toUpperCase()} · CLOSEST MATCH` : SITE_NAME.toUpperCase(), 60, 84);

  if (result) {
    const { ranked } = result;
    ctx.fillStyle = CARD.accent2;
    fitText(ctx, ranked[0].name, 540, 68, 700, CARD_FONTS.display);
    ctx.fillText(ranked[0].name, 60, 160);
    ranked.slice(0, 5).forEach((r, i) => {
      const y = 232 + i * 64;
      ctx.fillStyle = CARD.ink;
      ctx.font = `${i === 0 ? 600 : 400} 24px ${CARD_FONTS.body}`;
      ctx.fillText(r.name, 60, y);
      ctx.fillStyle = CARD.muted;
      ctx.font = `400 20px ${CARD_FONTS.mono}`;
      ctx.textAlign = "right";
      ctx.fillText(pct(r.similarity), 600, y);
      ctx.textAlign = "left";
      ctx.fillStyle = CARD.line;
      ctx.fillRect(60, y + 14, 540, 10);
      ctx.fillStyle = i === 0 ? CARD.accent2 : CARD.muted;
      ctx.fillRect(60, y + 14, 540 * r.similarity, 10);
    });
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

  // Map of the two strongest axes.
  const mx = 660, my = 50, ms = 490, c = ms / 2;
  ctx.fillStyle = CARD.surface;
  ctx.strokeStyle = CARD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(mx, my, ms, ms, 14);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mx + 30, my + c); ctx.lineTo(mx + ms - 30, my + c);
  ctx.moveTo(mx + c, my + 30); ctx.lineTo(mx + c, my + ms - 30);
  ctx.stroke();

  const pts = model.ideologies.map((i) => [i.scores[0], i.scores[1]]);
  if (result) pts.push([result.you[0], result.you[1]]);
  const lim = Math.max(...pts.flat().map(Math.abs)) * 1.12;
  const px = (v) => mx + c + (v / lim) * (c - 40);
  const py = (v) => my + c - (v / lim) * (c - 40);

  const ex = describeAxis(model, 0, QUESTIONS), ey = describeAxis(model, 1, QUESTIONS);
  ctx.fillStyle = CARD.muted;
  ctx.font = `400 15px ${CARD_FONTS.mono}`;
  ctx.fillText(`← ${ex.lowEnd[0]}`, mx + 14, my + ms - 14);
  ctx.textAlign = "right";
  ctx.fillText(`${ex.highEnd[0]} →`, mx + ms - 14, my + ms - 14);
  ctx.textAlign = "left";
  ctx.fillText(`↑ ${ey.highEnd[0]}`, mx + 14, my + 26);

  const topName = result ? result.ranked[0].name : null;
  for (const ideo of model.ideologies) {
    if (ideo.name === topName) continue;
    ctx.fillStyle = CARD.muted;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(px(ideo.scores[0]), py(ideo.scores[1]), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (result) {
    const top = result.ranked[0];
    const tx = px(top.scores[0]), ty = py(top.scores[1]);
    ctx.fillStyle = CARD.accent2;
    ctx.beginPath(); ctx.arc(tx, ty, 9, 0, Math.PI * 2); ctx.fill();
    const ux = px(result.you[0]), uy = py(result.you[1]);
    ctx.strokeStyle = CARD.accent; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ux, uy, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = CARD.accent;
    ctx.beginPath(); ctx.arc(ux, uy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = `700 22px ${CARD_FONTS.display}`;
    ctx.textAlign = "center";
    ctx.fillText("You", ux, uy - 24);
    ctx.textAlign = "left";
  }
}

// ---------- Intro ----------

const extremes = new Set([0, 1].flatMap((i) => { const ax = describeAxis(model, i, QUESTIONS); return [...ax.lowEnd, ...ax.highEnd]; }));
drawMap($("intro-map"), 0, 1, { labels: model.ideologies.length > 25 ? extremes : null,
  onPick: (ideo) => pickCard($("intro-pick"), ideo, { showInList: true }) });
$("intro-caption").textContent =
  `Each dot is one of the ${model.ideologies.length} ideologies, placed on the two biggest dividing lines between them. You'll see where you land at the end.`;
if (load()) $("resume").hidden = false;

const sharedAnswers = decodeAnswers(new URLSearchParams(location.search).get("r"));
if (sharedAnswers) showResults(sharedAnswers);
$("ideology-count").textContent = `${model.ideologies.length}`;
$("intro-eyebrow").textContent = `Up to ${QUESTIONS.length} statements · stop when your result settles`;

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
      <h3>${esc(c)} <span class="muted small">${list.length}</span></h3>
      <ul class="matches">${list.map((i) => `
        <li><details id="ideo-${esc(i.id)}">
          <summary><span class="match-name">${esc(i.name)}</span></summary>
          <div class="match-body">
            ${aboutIdeology(i)}
            <h4>What it stands for</h4>
            ${beliefList(i)}
          </div>
        </details></li>`).join("")}
      </ul>
    </div>`).join("") || `<p class="muted">No ideologies match “${esc(query)}”.</p>`;
}

function openInExplore(id) {
  const ideo = model.ideologies.find((i) => i.id === id);
  $("explore-search").value = "";
  exploreCategory = null;
  for (const b of $("explore-cats").children) b.setAttribute("aria-pressed", String(b.dataset.cat === ""));
  renderExplore();
  const d = document.getElementById(`ideo-${id}`);
  if (!d || !ideo) return;
  d.open = true;
  d.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  d.querySelector("summary").focus({ preventScroll: true });
}

const categories = [...new Set(model.ideologies.map((i) => i.category))]
  .sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99));
$("explore-cats").innerHTML = [["", "All"], ...categories.map((c) => [c, c])]
  .map(([v, label]) => `<button class="chip-btn" data-cat="${esc(v)}" aria-pressed="${v === ""}">${esc(label)}</button>`).join("");
$("explore-cats").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  exploreCategory = b.dataset.cat || null;
  for (const x of $("explore-cats").children) x.setAttribute("aria-pressed", String(x === b));
  renderExplore();
});
$("explore-search").addEventListener("input", renderExplore);
renderExplore();
