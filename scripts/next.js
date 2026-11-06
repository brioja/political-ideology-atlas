// Prints the single most-viewed item (person or ideology) still needing an audit, as JSON with a
// "kind" field, so audits can run one at a time in order of Wikipedia popularity.
//   node scripts/next.js [--ideologies] [--by-views]   (--ideologies: only ideologies; default: the kind with fewer live
//   on the site, most viewed first)
const { execFileSync } = require("child_process");
const path = require("path");
const pending = (args) => JSON.parse(execFileSync("node", [path.join(__dirname, "pending.js"), "--by-views", "--limit", "1", ...args]).toString());
const { readJson, catalog, peopleCatalog } = require("./lib");
const views = (list, id) => (list.find((x) => x.id === id) || {}).views12m || 0;
const IDEOLOGIES_ONLY = process.argv.includes("--ideologies");
const [person] = IDEOLOGIES_ONLY ? [] : pending(["--people"]);
const [ideology] = pending([]);
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
