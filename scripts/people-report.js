// Prints how balanced the people roster is: gender, region, era, living vs. historical.
//   node scripts/people-report.js
const { readJson } = require("./lib");
const people = readJson(require("path").join(__dirname, "..", "audits", "people-catalog.json")).people;
const tally = (f) => Object.entries(people.reduce((c, p) => ({ ...c, [f(p)]: (c[f(p)] || 0) + 1 }), {}))
  .sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n} (${Math.round((100 * n) / people.length)}%)`).join(" · ");
const era = (p) => (p.born < 1850 ? "born before 1850" : p.born < 1900 ? "1850–1899" : p.born < 1950 ? "1900–1949" : "1950 or later");
console.log(`${people.length} people`);
console.log(`Gender:  ${tally((p) => ({ f: "women", m: "men", nb: "non-binary" })[p.gender])}`);
console.log(`Region:  ${tally((p) => p.region)}`);
console.log(`Born:    ${tally(era)}`);
console.log(`Status:  ${tally((p) => (p.living ? "living" : "historical"))}`);
