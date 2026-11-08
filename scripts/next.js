// Prints the single most-viewed item (person or ideology) still needing an audit, as JSON with a
// "kind" field, so audits can run one at a time in order of Wikipedia popularity. Pages getting search traffic
// (audits/search-priority.json) come first when due for a later pass; the JSON then has a "reason".
//   node scripts/next.js [--ideologies | --people] [--by-views]   (--ideologies / --people: only that kind, so two serial
//   runs can split the kinds; default: the kind with fewer live on the site, most viewed first; --skip id,id,...: pass
//   over those, e.g. people waiting for books)
const { execFileSync } = require("child_process");
const path = require("path");
const skipArg = process.argv.indexOf("--skip");
const SKIP = new Set(skipArg > -1 ? process.argv[skipArg + 1].split(",") : []);
const pending = (args) => JSON.parse(execFileSync("node", [path.join(__dirname, "pending.js"), "--limit", String(SKIP.size + 1), ...args]).toString()).filter((e) => !SKIP.has(e.id));
// People in triage order (most likely to pass first, scripts/triage.js; Brandon 2026-11-06), ideologies by views.
const TRIAGE = require("fs").existsSync(path.join(__dirname, "..", "audits", "people-triage.json"));
const { readJson, catalog, peopleCatalog } = require("./lib");
const views = (list, id) => (list.find((x) => x.id === id) || {}).views12m || 0;
const IDEOLOGIES_ONLY = process.argv.includes("--ideologies");
const PEOPLE_ONLY = process.argv.includes("--people");

// Search traffic first (Brandon, 2026-11-08): pages in audits/search-priority.json, most clicks first, and right after
// a person their 3 closest ideologies. Those are worked out once and saved in the file ("closest"), so they stay put
// until the next pasted list: re-audits change the model, and recomputing them each time kept the loop on one person. One is due when its audit predates the shared rules (no "rules" field) and
// the re-audit gap has passed; it then gets a later pass (audits/AUDIT_RULES.md section 6).
function searchPriority() {
  const fs = require("fs"), lib = require("./lib");
  const file = path.join(__dirname, "..", "audits", "search-priority.json");
  if (!fs.existsSync(file)) return null;
  const { nextPassFrom } = require("./validate");
  const today = new Date().toISOString().slice(0, 10);
  const pca = require(path.join(__dirname, "..", "pca.js"));
  const data = require(path.join(__dirname, "..", "data.js"));
  const shownPeople = require(path.join(__dirname, "..", "people.js")).PEOPLE;
  let model = null;
  const list = readJson(file);
  let saved = false;
  for (const page of list.pages.filter((x) => x.kind === "person" && !x.closest)) {
    const p = shownPeople.find((x) => x.id === page.id);
    if (!p) { page.closest = []; continue; }
    model = model || pca.modelFromParts(data.IDEOLOGIES, data.MODEL, data.PLACEMENT);
    page.closest = pca.match(model, p.profile.slice(0, data.QUESTIONS.length)).ranked.slice(0, 3).map((r) => r.id);
    saved = true;
  }
  if (saved) fs.writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
  const nameOf = (id) => (peopleCatalog().find((x) => x.id === id) || {}).name || id;
  const closest = (page) => (page.closest || []).map((id) => ({ kind: "ideology", id, via: nameOf(page.id) }));
  const due = ({ kind, id }) => {
    if (SKIP.has(id) || (kind === "person" ? IDEOLOGIES_ONLY : PEOPLE_ONLY)) return false;
    const f = kind === "person" ? lib.personPath(id) : lib.profilePath(id);
    if (!fs.existsSync(f)) return false;
    const a = readJson(f);
    return a.rules == null && !a.notAnIdeology && nextPassFrom(a) <= today;
  };
  for (const page of list.pages) {
    for (const c of [page, ...(page.kind === "person" ? closest(page) : [])]) {
      if (!due(c)) continue;
      const entry = (c.kind === "person" ? peopleCatalog() : catalog()).find((x) => x.id === c.id);
      if (!entry) continue;
      const { name, wikipedia, wikipediaMatch, born, living, scopeNote } = entry;
      return { kind: c.kind, id: c.id, name, wikipedia, wikipediaMatch, born, living, scopeNote,
        views12m: entry.views12m || 0, reason: c.via ? `search traffic: closest ideology of ${c.via}, pre-rules later pass` : `search traffic (${page.clicks} clicks), pre-rules later pass` };
    }
  }
  return null;
}
// Then audits queued because they applied a rule since found misapplied (audits/reaudit-queue.json, AUDIT_RULES.md
// section 6), in the order listed. One is due once the re-audit gap allows and done once it has a pass dated on or
// after its group's queuedAt (Brandon, 2026-11-08).
function reauditQueue() {
  const fs = require("fs"), lib = require("./lib");
  const file = path.join(__dirname, "..", "audits", "reaudit-queue.json");
  if (!fs.existsSync(file) || PEOPLE_ONLY) return null;
  const { nextPassFrom } = require("./validate");
  const today = new Date().toISOString().slice(0, 10);
  for (const g of readJson(file).groups) for (const id of g.ids) {
    const f = lib.profilePath(id);
    if (SKIP.has(id) || !fs.existsSync(f)) continue;
    const a = readJson(f);
    const last = (Array.isArray(a.passes) && a.passes.length ? a.passes.map((p) => p.auditedAt) : [a.auditedAt]).filter(Boolean).sort().pop() || "";
    if (a.notAnIdeology || last >= g.queuedAt || nextPassFrom(a) > today) continue;
    const entry = catalog().find((x) => x.id === id);
    if (!entry) continue;
    const { name, wikipedia, wikipediaMatch, scopeNote } = entry;
    return { kind: "ideology", id, name, wikipedia, wikipediaMatch, scopeNote, views12m: entry.views12m || 0, reason: `queued later pass: ${g.reason}` };
  }
  return null;
}
const priority = searchPriority() || reauditQueue();
if (priority) { console.log(JSON.stringify(priority)); process.exit(0); }

const [person] = IDEOLOGIES_ONLY ? [] : pending(["--people", TRIAGE ? "--triage" : "--by-views"]);
const [ideology] = PEOPLE_ONLY ? [] : pending(["--by-views"]);
const p = person && { kind: "person", ...person, views12m: views(peopleCatalog(), person.id) };
const i = ideology && { kind: "ideology", ...ideology, views12m: views(catalog(), ideology.id) };
// Default (Brandon, 2026-11-05): the most-viewed pending entry of whichever kind has fewer live on the
// site (data.js IDEOLOGIES vs people.js PEOPLE without AI models), so the two grow together; if that kind
// has nothing pending, the other. --by-views: the most viewed of either kind, as before.
let pick;
if (process.argv.includes("--by-views")) pick = [p, i].filter(Boolean).sort((a, b) => b.views12m - a.views12m)[0];
else {
  const live = { ideology: require(path.join(__dirname, "..", "data.js")).IDEOLOGIES.length,
    person: require(path.join(__dirname, "..", "people.js")).PEOPLE.filter((x) => x.kind !== "model").length };
  const order = live.person < live.ideology ? [p, i] : [i, p];
  pick = order.find(Boolean);
}
console.log(JSON.stringify(pick || null));
