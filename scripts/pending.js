// Prints, as JSON, the catalog entries that still need an audit: missing or failing validation.
// Used by the audit workflow; also handy on its own.
//   node scripts/pending.js [--limit N] [--people] [--by-views [--reverse] | --triage]
//   --triage (people) orders by estimated chance of passing the audit (audits/people-triage.json, scripts/triage.js)
//   --by-views orders by Wikipedia page views (most viewed first), for auditing in order of prominence
//   --reverse with --by-views lists least viewed first, so a second lane can work from the other end
const fs = require("fs");
const lib = require("./lib");
const { readJson } = lib;
const PEOPLE = process.argv.includes("--people");
const catalog = PEOPLE ? lib.peopleCatalog : lib.catalog;
const profilePath = PEOPLE ? lib.personPath : lib.profilePath;

const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

// Validated in this process, not one validate.js run per audit: the uncertainty judge takes seconds
// to compute and is cached per process. validate.js reads --people from this command line too.
const { validate, excludedOnly, nextPassFrom } = require("./validate");
const today = new Date().toISOString().slice(0, 10);
const pending = catalog().filter((entry) => {
  if (!PEOPLE && lib.duplicateOf(entry.id)) return false; // another entry owns its Wikipedia article
  if (!PEOPLE && !lib.notable(entry.id)) return false; // no Wikipedia article of its own
  if (!fs.existsSync(profilePath(entry.id))) return true;
  const { errors } = validate(entry.id);
  if (!(errors.length > 0 && !excludedOnly(errors))) return false; // complete but excluded: don't redo it
  // A later pass waits at least a week after the previous one (validate.js): not pending until then.
  return nextPassFrom(readJson(profilePath(entry.id))) <= today;
});

if (process.argv.includes("--by-views")) pending.sort((a, b) => (b.views12m || 0) - (a.views12m || 0));
if (process.argv.includes("--reverse")) pending.reverse();
if (process.argv.includes("--triage")) {
  const scores = readJson(require("path").join(lib.ROOT, "audits", "people-triage.json")).scores;
  // People added to the catalog since the last fit have no score yet: after the scored ones, by views.
  pending.sort((a, b) => (scores[b.id] ?? -1) - (scores[a.id] ?? -1) || (b.views12m || 0) - (a.views12m || 0));
}
console.log(JSON.stringify(pending.slice(0, limit).map(({ id, name, wikipedia, wikipediaMatch, born, living, scopeNote }) =>
  ({ id, name, wikipedia, wikipediaMatch, born, living, scopeNote }))));
