// Prints the single most-viewed item (person or ideology) still needing an audit, as JSON with a
// "kind" field, so audits can run one at a time in order of Wikipedia popularity. A later pass has a "reason".
//   node scripts/next.js [--ideologies | --people] [--by-views]   (--ideologies / --people: only that kind, so two serial
//   runs can split the kinds; default: the kind with fewer live on the site, most viewed first; --skip id,id,...: pass
//   over those, e.g. people waiting for books). Later passes and new audits alternate (see lastWasNew below).
const { execFileSync } = require("child_process");
const path = require("path");
const skipArg = process.argv.indexOf("--skip");
const SKIP = new Set(skipArg > -1 ? process.argv[skipArg + 1].split(",") : []);
const pending = (args, limit = SKIP.size + 1) => JSON.parse(execFileSync("node", [path.join(__dirname, "pending.js"), "--limit", String(limit), ...args], { maxBuffer: 64 * 1024 * 1024 }).toString()).filter((e) => !SKIP.has(e.id));
// The new-audit turn takes the first pending entry with no audit file yet. pending.js also lists existing audits
// that fail validation once their gap has passed; those are later passes, so they come only when nothing new is
// left (Brandon, 2026-11-10: the first alternating run drew ten old failing audits and no one new).
const firstNew = (list, kind) => {
  const lib = require("./lib"), file = kind === "person" ? lib.personPath : lib.profilePath;
  return list.find((e) => !require("fs").existsSync(file(e.id))) || list[0];
};
// People in triage order (most likely to pass first, scripts/triage.js; Brandon 2026-11-06), ideologies by views.
const TRIAGE = require("fs").existsSync(path.join(__dirname, "..", "audits", "people-triage.json"));
const { readJson, catalog, peopleCatalog } = require("./lib");
const views = (list, id) => (list.find((x) => x.id === id) || {}).views12m || 0;
const IDEOLOGIES_ONLY = process.argv.includes("--ideologies");
const PEOPLE_ONLY = process.argv.includes("--people");

// Later passes (Brandon, 2026-11-12): the re-audit queue first, then older-rules audits, oldest rules first. Search-traffic
// pages and their closest matches no longer go first: the old audits had more problems.
// Audits queued because they applied a rule since found misapplied (audits/reaudit-queue.json, AUDIT_RULES.md
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
const reaudit = () => reauditQueue() || olderRules();
if (lastWasNew()) {
  const priority = reaudit();
  if (priority) { console.log(JSON.stringify(priority)); process.exit(0); }
}

const person = IDEOLOGIES_ONLY ? null : firstNew(pending(["--people", TRIAGE ? "--triage" : "--by-views"], Infinity), "person");
const ideology = PEOPLE_ONLY ? null : firstNew(pending(["--by-views"], Infinity), "ideology");
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
