// Prints the single most-viewed item (person or ideology) still needing an audit, as JSON with a
// "kind" field, so audits can run one at a time in order of Wikipedia popularity.
//   node scripts/next.js [--ideologies]   (--ideologies: only ideologies, which the people's lines depend on)
const { execFileSync } = require("child_process");
const path = require("path");
const pending = (args) => JSON.parse(execFileSync("node", [path.join(__dirname, "pending.js"), "--by-views", "--limit", "1", ...args]).toString());
const { readJson, catalog, peopleCatalog } = require("./lib");
const views = (list, id) => (list.find((x) => x.id === id) || {}).views12m || 0;
const IDEOLOGIES_ONLY = process.argv.includes("--ideologies");
const [person] = IDEOLOGIES_ONLY ? [] : pending(["--people"]);
const [ideology] = pending([]);
const candidates = [
  person && { kind: "person", ...person, views12m: views(peopleCatalog(), person.id) },
  ideology && { kind: "ideology", ...ideology, views12m: views(catalog(), ideology.id) },
].filter(Boolean).sort((a, b) => b.views12m - a.views12m);
console.log(JSON.stringify(candidates[0] || null));
