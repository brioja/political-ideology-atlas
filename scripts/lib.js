// Shared helpers for the audit scripts.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PROFILES_DIR = path.join(ROOT, "audits", "profiles");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const allStatements = () => readJson(path.join(ROOT, "statements.json")).statements;
const catalog = () => readJson(path.join(ROOT, "audits", "catalog.json")).ideologies;

// Changes whenever a statement is added, removed or reworded, which marks
// every older audit as stale.
function statementsVersion() {
  const basis = JSON.stringify(allStatements().map((s) => [s.id, s.text]));
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 12);
}

const profilePath = (id) => path.join(PROFILES_DIR, `${id}.json`);

module.exports = { ROOT, PROFILES_DIR, readJson, allStatements, catalog, statementsVersion, profilePath };
