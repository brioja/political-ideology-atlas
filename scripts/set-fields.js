// Sets an audit draft's own fields, checked by validate.js before anything is written (Brandon, 2026-11-27: lane
// sessions wrote their own merge.js, apply_struct.py and the like for this, one per session).
//   node scripts/set-fields.js <draft.json> <patch.json | -> [--people]
// The patch is a JSON object. "sources" is a list merged by id: an entry replaces the draft's source with that id, or
// is added (sources stay sorted s1, s2, ...); {"id": "s4", "remove": true} removes one no answer cites. Any other key
// (scope, aliases, keyFigures, keyWorks, summary, ...) replaces the draft's value; "answers" is refused (set-answers.js
// writes those). The patched draft is checked with validate.js, in a copy: if it shows an error the draft didn't have
// already, nothing is written and the new errors are printed. Errors the draft already had are listed after, as a
// reminder, and don't block the write.
const fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync } = require("child_process");
const lib = require("./lib");

const args = process.argv.slice(2), PEOPLE = args.includes("--people");
const [draftPath, input] = args.filter((a) => !a.startsWith("--"));
if (!draftPath || !input) { console.error("usage: node scripts/set-fields.js <draft.json> <patch.json | -> [--people]"); process.exit(1); }
const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
let patch;
try { patch = JSON.parse(fs.readFileSync(input === "-" ? 0 : input, "utf8")); } catch (e) { console.error(`patch is not JSON: ${e.message}`); process.exit(1); }
if (!patch || typeof patch !== "object" || Array.isArray(patch)) { console.error("the patch must be a JSON object"); process.exit(1); }
if ("answers" in patch) { console.error('"answers" is set with scripts/set-answers.js; nothing written'); process.exit(1); }

const next = JSON.parse(JSON.stringify(draft)), problems = [];
for (const [k, v] of Object.entries(patch)) {
  if (k !== "sources") { next[k] = v; continue; }
  if (!Array.isArray(v)) { problems.push('"sources" must be a list'); continue; }
  const list = Array.isArray(next.sources) ? next.sources : [];
  for (const s of v) {
    if (!s || typeof s.id !== "string" || !/^s\d+$/.test(s.id)) { problems.push(`source ${JSON.stringify(s).slice(0, 80)}: needs an "id" like s4`); continue; }
    const i = list.findIndex((x) => x.id === s.id);
    if (s.remove) {
      const citing = Object.entries(next.answers || {}).filter(([, a]) => a && (a.sources || []).includes(s.id)).map(([sid]) => sid);
      if (citing.length) problems.push(`${s.id}: cited by ${citing.slice(0, 5).join(", ")}${citing.length > 5 ? ", ..." : ""}; not removed`);
      else if (i >= 0) list.splice(i, 1);
      continue;
    }
    if (i >= 0) list[i] = s; else list.push(s);
  }
  next.sources = list.sort((a, b) => +a.id.slice(1) - +b.id.slice(1));
}
if (problems.length) { problems.forEach((p) => console.log(`BAD ${p}`)); console.log("nothing written"); process.exit(1); }

// validate.js on the draft as it is and as patched, each in its own folder (with the draft's color file, if any).
const id = path.basename(draftPath, ".json");
const errorsOf = (audit) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "set-fields-"));
  try {
    fs.writeFileSync(path.join(dir, `${id}.json`), lib.formatAudit(audit));
    const color = path.join(path.dirname(draftPath), `${id}.color.json`);
    if (fs.existsSync(color)) fs.copyFileSync(color, path.join(dir, `${id}.color.json`));
    let out;
    try { out = execFileSync("node", [path.join(__dirname, "validate.js"), id, "--dir", dir, ...(PEOPLE ? ["--people"] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { out = String(e.stdout || ""); }
    return out.split("\n").filter((l) => /^\s+error: /.test(l)).map((l) => l.replace(/^\s+error: /, ""));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
const before = new Set(errorsOf(draft)), after = errorsOf(next);
const added = after.filter((e) => !before.has(e)), still = after.filter((e) => before.has(e));
if (added.length) {
  added.forEach((e) => console.log(`BAD ${e}`));
  console.log("nothing written");
  process.exit(1);
}
fs.writeFileSync(draftPath, lib.formatAudit(next));
console.log(`set ${Object.keys(patch).join(", ")}${still.length ? `; errors the draft still has (${still.length}):` : ""}`);
still.slice(0, 20).forEach((e) => console.log(`  ${e}`));
