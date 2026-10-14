// Prints, as JSON, the catalog entries that still need an audit: missing, stale, or failing
// validation. Used by the audit workflow; also handy on its own.
//   node scripts/pending.js [--limit N]
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { catalog, profilePath, readJson, statementsVersion } = require("./lib");

const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const version = statementsVersion();

const pending = catalog().filter((entry) => {
  const p = profilePath(entry.id);
  if (!fs.existsSync(p)) return true;
  try {
    if (readJson(p).statementsVersion !== version) return true;
    execFileSync("node", [path.join(__dirname, "validate.js"), entry.id], { stdio: "ignore" });
    return false;
  } catch {
    return true;
  }
});

console.log(JSON.stringify(pending.slice(0, limit).map(({ id, name, category, wikipedia, wikipediaMatch }) =>
  ({ id, name, category, wikipedia, wikipediaMatch }))));
