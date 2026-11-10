// Prints the single most-viewed item (person or ideology) still needing an audit, as JSON with a
// "kind" field, so audits can run one at a time in order of Wikipedia popularity. Pages getting search traffic
// (audits/search-priority.json) come first when due for a later pass; the JSON then has a "reason".
//   node scripts/next.js [--ideologies | --people] [--by-views]   (--ideologies / --people: only that kind, so two serial
//   runs can split the kinds; default: the kind with fewer live on the site, most viewed first; --skip id,id,...: pass
//   over those, e.g. people waiting for books). Later passes and new audits alternate (see lastWasNew below).
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

// Search traffic first (Brandon, 2026-11-08): pages in audits/search-priority.json, most clicks first, each page itself
// and right after it the 5 its page lists as closest: a person's 5 closest ideologies, an ideology's 5 closest people
// (Brandon, 2026-11-09: visitors read those lists, so they should be accurate too). The closest are recomputed on every
// call (when a later pass moves someone into a page's top 5, they get their pass too); each one is passed once and then
// waits out the re-audit gap, so the loop moves on once a page's top 5 are all up to date. One is due when its audit is under an
// older rules version than the current one (or none) and the re-audit gap since its last pass has passed; an audit
// already under the current rules is up to date (Brandon, 2026-11-09). It then gets a later pass (audits/AUDIT_RULES.md
// section 6).
function searchPriority() {
  const fs = require("fs"), lib = require("./lib");
  const file = path.join(__dirname, "..", "audits", "search-priority.json");
  if (!fs.existsSync(file)) return null;
  const { nextPassFrom, CURRENT_RULES } = require("./validate");
  const today = new Date().toISOString().slice(0, 10);
  const pca = require(path.join(__dirname, "..", "pca.js"));
  const data = require(path.join(__dirname, "..", "data.js"));
  const shownPeople = require(path.join(__dirname, "..", "people.js")).PEOPLE;
  let model = null;
  const list = readJson(file);
  const nameOf = (id) => (peopleCatalog().find((x) => x.id === id) || {}).name || id;
  const TOP = 5; // as many as the page lists (scripts/pages.js)
  const Q = data.QUESTIONS.length;
  const closest = (page) => {
    model = model || pca.modelFromParts(data.IDEOLOGIES, data.MODEL, data.PLACEMENT);
    if (page.kind === "person") {
      const p = shownPeople.find((x) => x.id === page.id);
      if (!p) return [];
      return pca.match(model, p.profile.slice(0, Q)).ranked.slice(0, TOP)
        .map((r) => ({ kind: "ideology", id: r.id, via: nameOf(page.id) }));
    }
    const i = data.IDEOLOGIES.find((x) => x.id === page.id);
    if (!i) return [];
    return pca.matchPeople(model, i.profile, shownPeople.map((p) => ({ ...p, profile: p.profile.slice(0, Q) }))).slice(0, TOP)
      .map((r) => ({ kind: "person", id: r.id, via: i.name }));
  };
  const due = ({ kind, id }) => {
    if (SKIP.has(id) || (kind === "person" ? IDEOLOGIES_ONLY : PEOPLE_ONLY)) return false;
    const f = kind === "person" ? lib.personPath(id) : lib.profilePath(id);
    if (!fs.existsSync(f)) return false;
    const a = readJson(f);
    return (a.rules || 0) < CURRENT_RULES && !a.notAnIdeology && nextPassFrom(a) <= today;
  };
  for (const page of list.pages) {
    for (const c of [page, ...closest(page)]) {
      if (!due(c)) continue;
      const entry = (c.kind === "person" ? peopleCatalog() : catalog()).find((x) => x.id === c.id);
      if (!entry) continue;
      const { name, wikipedia, wikipediaMatch, born, living, scopeNote } = entry;
      return { kind: c.kind, id: c.id, name, wikipedia, wikipediaMatch, born, living, scopeNote,
        views12m: entry.views12m || 0, reason: c.via ? `search traffic: ${c.kind === "person" ? "among the closest people" : "among the closest ideologies"} of ${c.via}, later pass to current rules` : `search traffic (${page.clicks} clicks), later pass to current rules` };
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
// Then any audit under an older rules version whose re-audit gap has passed: oldest rules first, then most viewed.
function olderRules() {
  const fs = require("fs"), lib = require("./lib");
  const { nextPassFrom, CURRENT_RULES } = require("./validate");
  const today = new Date().toISOString().slice(0, 10);
  const due = [];
  for (const kind of ["person", "ideology"]) {
    if (kind === "person" ? IDEOLOGIES_ONLY : PEOPLE_ONLY) continue;
    for (const entry of kind === "person" ? peopleCatalog() : catalog()) {
      if (SKIP.has(entry.id) || (kind === "ideology" && (lib.duplicateOf(entry.id) || !lib.notable(entry.id)))) continue;
      const f = kind === "person" ? lib.personPath(entry.id) : lib.profilePath(entry.id);
      if (!fs.existsSync(f)) continue;
      const a = readJson(f);
      if (a.notAnIdeology || (a.rules || 0) >= CURRENT_RULES || nextPassFrom(a) > today) continue;
      due.push({ kind, entry, rules: a.rules || 0 });
    }
  }
  due.sort((a, b) => a.rules - b.rules || (b.entry.views12m || 0) - (a.entry.views12m || 0));
  if (!due.length) return null;
  const { kind, entry, rules } = due[0];
  const { id, name, wikipedia, wikipediaMatch, born, living, scopeNote } = entry;
  return { kind, id, name, wikipedia, wikipediaMatch, born, living, scopeNote, views12m: entry.views12m || 0,
    reason: `audit under rules v${rules}, later pass to current rules` };
}
// Later passes and new audits take turns (Brandon, 2026-11-10: "reaudit then someone new"). Stateless: if the last
// "Audit <name>" commit added its audit file it was a new audit, so a later pass is next; if it modified one, a new
// audit is next. Either kind falls back to the other when it has nothing due.
function lastWasNew() {
  try {
    const out = execFileSync("git", ["-C", path.join(__dirname, ".."), "log", "-1", "--format=", "--name-status",
      "--grep=^Audit ", "--", "audits/people", "audits/profiles"]).toString().trim();
    return !out || out.startsWith("A");
  } catch { return true; }
}
const reaudit = () => searchPriority() || reauditQueue() || olderRules();
if (lastWasNew()) {
  const priority = reaudit();
  if (priority) { console.log(JSON.stringify(priority)); process.exit(0); }
}

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
console.log(JSON.stringify(pick || (lastWasNew() ? null : reaudit()) || null));
