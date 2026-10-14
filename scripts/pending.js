// Prints, as JSON, the catalog entries that still need an audit: missing, stale, or failing
// validation. Used by the audit workflow; also handy on its own.
//   node scripts/pending.js [--limit N] [--people]
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const { readJson, statementsVersion } = lib;
const PEOPLE = process.argv.includes("--people");
const catalog = PEOPLE ? lib.peopleCatalog : lib.catalog;
const profilePath = PEOPLE ? lib.personPath : lib.profilePath;

const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const version = statementsVersion();

const pending = catalog().filter((entry) => {
  const p = profilePath(entry.id);
  if (!fs.existsSync(p)) return true;
  try {
    if (readJson(p).statementsVersion !== version) return true;
    execFileSync("node", [path.join(__dirname, "validate.js"), entry.id, ...(PEOPLE ? ["--people"] : [])], { stdio: "ignore" });
    return false;
  } catch (e) {
    return e.status !== 2; // 2 = complete but excluded by the salience rule: don't redo it
  }
});

console.log(JSON.stringify(pending.slice(0, limit).map(({ id, name, category, wikipedia, wikipediaMatch, born, living }) =>
  ({ id, name, category, wikipedia, wikipediaMatch, born, living }))));
