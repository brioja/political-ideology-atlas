// Writes a static page for every ideology and person, at /ideologies/<id>/ and /people/<id>/, plus
// sitemap.xml listing them, so search engines (which ignore everything after "#") can find them.
// Run at deploy by .github/workflows/pages.yml after the script links are stamped; the output is
// never committed. Each page is index.html with its own title, description and canonical link, the
// script links made absolute, and the page's content as plain HTML for crawlers that don't run
// scripts. Browsers hide that HTML and the app takes over (app.js moves the address to its "#/" route).
//
//   node scripts/pages.js            write the pages and sitemap.xml
//   node scripts/pages.js --stamp    also write the ideology count into index.html (deploy only; the
//                                    app fills it in anyway, but text it changes after load is when
//                                    Lighthouse says the page finished painting)
//   node scripts/pages.js --clean    remove them again (handy after a local preview)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SITE = "https://ideologyatlas.fyi";
const SITE_NAME = "Political Ideology Atlas";
const DIRS = ["ideologies", "people"].map((d) => path.join(ROOT, d));

if (process.argv.includes("--clean")) {
  for (const d of DIRS) fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, "sitemap.xml"), { force: true });
  process.exit(0);
}

// The site's own data and maths, loaded the way the browser loads them.
const ctx = { console, Math };
vm.createContext(ctx);
for (const f of ["data.js", "pca.js", "people.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^(const|let) /gm, "var "), ctx, { filename: f });
}
const { QUESTIONS, IDEOLOGIES, MODEL, PEOPLE = [] } = ctx;
const model = ctx.modelFromParts(IDEOLOGIES, MODEL);
// Every page matches against every person, so remember each profile's place on the lines
// (pca.js looks `place` up on the global object at each call).
const placed = new WeakMap();
const place = ctx.place;
ctx.place = (m, answers) => {
  if (m !== model) return place(m, answers);
  if (!placed.has(answers)) placed.set(answers, place(m, answers));
  return placed.get(answers);
};
const onModel = (profile) => profile.slice(0, QUESTIONS.length);
const people = PEOPLE.map((p) => ({ ...p, profile: onModel(p.profile) }));

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (x) => `${Math.round(x * 100)}%`;
const ideologyUrl = (id) => `/ideologies/${encodeURIComponent(id)}/`;
const personUrl = (id) => `/people/${encodeURIComponent(id)}/`;
// A meta description: the first sentences of the summary, up to about 160 characters.
function describe(text, fallback) {
  const s = String(text || fallback).replace(/\s+/g, " ").trim();
  if (s.length <= 160) return s;
  const cut = s.slice(0, 157);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

// As in app.js: a position in plain words, and the positions that set an ideology apart.
function stance(q, v) {
  if (v === 0) return `Mixed on: ${q.text}`;
  return (v > 0 ? q.agree : q.disagree) || `${v > 0 ? "Agrees" : "Disagrees"}: ${q.text}`;
}
// "What it stands for", as the build picked it (scripts/build.js).
const beliefs = (ideo, n) => `<ul>${(ideo.beliefs || []).slice(0, n).map((q) => `<li>${esc(stance(QUESTIONS[q], ideo.profile[q]))}</li>`).join("")}</ul>`;
// Every known position, strongest first.
function positions(profile) {
  const known = profile.map((v, q) => ({ v, q })).filter((x) => x.v != null && x.v !== 0)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  return `<ul>${known.map((x) => `<li><strong>${Math.abs(x.v) === 2 ? "Strongly" : "Leans"}:</strong> ${esc(stance(QUESTIONS[x.q], x.v))}</li>`).join("")}</ul>`;
}
const ideologyLinks = (ranked) => `<ul>${ranked.map((r) => `<li><a href="${ideologyUrl(r.id)}">${esc(r.name)}</a>${r.similarity != null ? ` (${pct(r.similarity)} match)` : ""}</li>`).join("")}</ul>`;
const personLinks = (list) => `<ul>${list.map((p) => `<li><a href="${personUrl(p.id)}">${esc(p.name)}</a> (${pct(p.similarity)} alike)</li>`).join("")}</ul>`;
const nav = (section, label) => `<p class="small"><a href="/">${SITE_NAME}</a> · <a href="/#/${section}">${label}</a> · <a href="/#/test">Take the test</a></p>`;

function ideologyBody(ideo) {
  const neighbors = ctx.match(model, ideo.profile).ranked.filter((r) => r.id !== ideo.id).slice(0, 5);
  const closest = people.length ? ctx.matchPeople(model, ideo.profile, people).slice(0, 5) : [];
  const figures = ideo.keyFigures || [];
  return `${nav("ideologies", "All ideologies")}
    <h1>${esc(ideo.name)}</h1>
    ${ideo.summary ? `<p>${esc(ideo.summary)}</p>` : ""}
    ${ideo.wikipedia ? `<p class="small"><a href="${esc(ideo.wikipedia)}">Wikipedia</a></p>` : ""}
    <h2>What it stands for</h2>${beliefs(ideo, 6)}
    ${figures.length ? `<h2>Key figures</h2><ul>${figures.map((f) => `<li>${esc(f.name)}${f.role ? `: ${esc(f.role)}` : ""}</li>`).join("")}</ul>` : ""}
    <h2>Closest ideologies</h2>${ideologyLinks(neighbors)}
    ${closest.length ? `<h2>People closest to it</h2>${personLinks(closest)}` : ""}
    <h2>Key positions</h2>${positions(ideo.profile)}`;
}

function personBody(p) {
  const closest = ctx.match(model, p.profile).ranked.slice(0, 5);
  const similar = ctx.matchPeople(model, p.profile, people.filter((x) => x.id !== p.id)).slice(0, 5);
  const life = p.living ? `born ${p.born}` : `born ${p.born}, historical`;
  return `${nav("people", "All people")}
    <p class="small">${esc(p.region)} · ${esc(life)}</p>
    <h1>${esc(p.name)}</h1>
    ${p.role ? `<p>${esc(p.role)}</p>` : ""}
    ${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
    ${p.wikipedia ? `<p class="small"><a href="${esc(p.wikipedia)}">Wikipedia</a></p>` : ""}
    <h2>Closest ideologies</h2>
    <p class="small">Based on the ${p.profile.filter((x) => x != null).length} statements where ${esc(p.name)} has a known position.</p>
    ${ideologyLinks(closest)}
    ${similar.length ? `<h2>Similar people</h2>${personLinks(similar)}` : ""}
    <h2>Known positions</h2>${positions(p.profile)}`;
}

// index.html with this page's head and content. Fails loudly if the template changes shape.
let template = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
if (process.argv.includes("--stamp")) {
  const count = /<span class="ideology-count">[^<]*<\/span>/g;
  if (!count.test(template)) throw new Error("index.html no longer has an ideology-count span");
  template = template.replace(count, `<span class="ideology-count">${model.ideologies.length}</span>`);
  fs.writeFileSync(path.join(ROOT, "index.html"), template);
}
function swap(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`index.html no longer matches ${pattern}`);
  return html.replace(pattern, replacement);
}
function page({ url, title, description, body }) {
  let html = template;
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${esc(title)} · ${SITE_NAME}</title>`);
  html = swap(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`);
  html = swap(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  html = swap(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`);
  html = swap(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${SITE}${url}">`);
  html = swap(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE}${url}">`);
  // Same files as the home page, from any depth.
  html = html.replace(/(src|href)="(?![a-z]+:|\/|#)([^"]+)"/g, '$1="/$2"');
  // Browsers that run the app hide the plain copy before it paints.
  html = swap(html, /<\/head>/, `<script>document.documentElement.classList.add("js")</script>
<style>.js .prerender { display: none; } .prerender { padding-top: 24px; padding-bottom: 48px; }</style>
</head>`);
  html = swap(html, /<body([^>]*)>/, `<body$1>\n<main class="prerender wrap narrow stack">${body}</main>`);
  return html;
}

const urls = ["/"];
function write(url, html) {
  const dir = path.join(ROOT, url);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  urls.push(url);
}
for (const d of DIRS) fs.rmSync(d, { recursive: true, force: true });
for (const ideo of model.ideologies) {
  write(ideologyUrl(ideo.id), page({
    url: ideologyUrl(ideo.id), title: ideo.name, body: ideologyBody(ideo),
    description: describe(ideo.summary, `${ideo.name}: what it stands for, its key positions and the ideologies and people closest to it.`),
  }));
}
for (const p of people) {
  write(personUrl(p.id), page({
    url: personUrl(p.id), title: `${p.name}: political views`, body: personBody(p),
    description: describe(p.summary, `${p.name}'s political views: closest ideologies, similar people and known positions.`),
  }));
}
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}
</urlset>
`);
console.log(`${model.ideologies.length} ideology pages, ${people.length} people pages, sitemap.xml with ${urls.length} URLs`);
