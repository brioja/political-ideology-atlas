// Prints, as JSON, the catalog entries that still need an audit: missing or failing validation.
// Used by the audit workflow; also handy on its own.
//   node scripts/pending.js [--limit N] [--people] [--by-views] [--backfill]
//   --by-views orders by Wikipedia page views (most viewed first), for auditing in order of prominence
//   --backfill instead lists finished audits that still need answers for new (candidate) statements,
//     with the statement ids, for the statement-backfill workflow
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const { readJson, allStatements, unanswered } = lib;
const PEOPLE = process.argv.includes("--people");
const catalog = PEOPLE ? lib.peopleCatalog : lib.catalog;
const profilePath = PEOPLE ? lib.personPath : lib.profilePath;

const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
if (process.argv.includes("--backfill")) {
  const statements = allStatements();
  const todo = catalog().filter((e) => fs.existsSync(profilePath(e.id)))
    .map((e) => ({ id: e.id, name: e.name, audit: readJson(profilePath(e.id)) }))
    .filter((e) => !e.audit.notAnIdeology)
    .map(({ id, name, audit }) => ({ id, name, statements: unanswered(audit.answers, statements) }))
    .filter((e) => e.statements.length);
  console.log(JSON.stringify(todo.slice(0, limit)));
  process.exit(0);
}

const pending = catalog().filter((entry) => {
  const p = profilePath(entry.id);
  if (!fs.existsSync(p)) return true;
  try {
    execFileSync("node", [path.join(__dirname, "validate.js"), entry.id, ...(PEOPLE ? ["--people"] : [])], { stdio: "ignore" });
    return false;
  } catch (e) {
    return e.status !== 2; // 2 = complete but excluded by the salience rule: don't redo it
  }
});

if (process.argv.includes("--by-views")) pending.sort((a, b) => (b.views12m || 0) - (a.views12m || 0));
console.log(JSON.stringify(pending.slice(0, limit).map(({ id, name, category, wikipedia, wikipediaMatch, born, living, scopeNote }) =>
  ({ id, name, category, wikipedia, wikipediaMatch, born, living, scopeNote }))));
