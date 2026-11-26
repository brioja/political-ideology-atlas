// Drops sources an audit lists but never uses.
//   node scripts/cleanup.js [--people] <id> [...]   committed audits (audits/profiles, or audits/people)
//   node scripts/cleanup.js [--people] --all        every committed audit
//   add --dir <folder> to clean the audits in that folder instead (a lane's drafts)
// A source is used when its id appears anywhere else in the audit: an answer's "sources", a key figure's or key work's
// "source"/"work", another source's fields, or free text such as a rationale's "(s1, Introductory)". Ids are kept as they
// are (no renumbering), so every reference still resolves. A drop that would give validate.js an error the audit didn't
// have is undone: an unused source can still be what ties another source to the ideology. scripts/lane.js runs this on
// each draft after validate.js passes and before integrating it, so sessions never spend a fix round deleting them
// (Brandon, 2026-11-25: books downloaded by the books step were listed as sources that no answer cited).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const lib = require("./lib");

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Ids of the sources in audit `a` that nothing else in it mentions.
function unusedSources(a) {
  if (!Array.isArray(a.sources)) return [];
  const unused = [];
  let sources = a.sources;
  // Repeat: a source mentioned only by an unused one is unused too.
  for (let changed = true; changed;) {
    changed = false;
    for (const s of sources) {
      if (!s || typeof s.id !== "string" || !s.id) continue;
      const rest = JSON.stringify({ ...a, sources: sources.filter((x) => x !== s) });
      if (new RegExp(`(?<![\\w-])${escape(s.id)}(?![\\w-])`).test(rest)) continue;
      sources = sources.filter((x) => x !== s);
      unused.push(s.id);
      changed = true;
      break;
    }
  }
  return unused;
}

// validate.js's error lines for audit `id` in `dir`, as a Set.
function errors(dir, id, people) {
  let out;
  try { out = execFileSync("node", [path.join(__dirname, "validate.js"), ...(people ? ["--people"] : []), "--dir", dir, id], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { out = (e.stdout || "") + (e.stderr || ""); }
  return new Set(out.split("\n").filter((l) => /^\s*error:/.test(l)).map((l) => l.trim()));
}

// Cleans `<dir>/<id>.json` in place (lib.formatAudit). Returns { dropped, kept }: ids dropped, and unused ids
// kept because dropping them adds a validate.js error.
function clean(dir, id, people = false) {
  const file = path.join(dir, `${id}.json`), text = fs.readFileSync(file, "utf8"), a = JSON.parse(text);
  const unused = unusedSources(a);
  if (!unused.length) return { dropped: [], kept: [] };
  const write = (ids) => fs.writeFileSync(file, lib.formatAudit({ ...a, sources: a.sources.filter((s) => !ids.includes(s && s.id)) }));
  const before = errors(dir, id, people);
  const ok = () => [...errors(dir, id, people)].every((e) => before.has(e));
  try {
    write(unused);
    if (ok()) return { dropped: unused, kept: [] };
    // Something unused still matters: drop the rest one at a time.
    const dropped = [];
    for (const sid of unused) { write([...dropped, sid]); if (ok()) dropped.push(sid); }
    write(dropped);
    if (!dropped.length) fs.writeFileSync(file, text);
    return { dropped, kept: unused.filter((x) => !dropped.includes(x)) };
  } catch (e) { fs.writeFileSync(file, text); throw e; }
}

module.exports = { unusedSources, clean };

if (require.main === module) {
  const args = process.argv.slice(2), people = args.includes("--people");
  const dir = args.includes("--dir") ? path.resolve(args[args.indexOf("--dir") + 1]) : people ? lib.PEOPLE_DIR : lib.PROFILES_DIR;
  const ids = args.includes("--all") ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
    : args.filter((x, i) => !x.startsWith("--") && args[i - 1] !== "--dir");
  if (!ids.length) { console.error("usage: node scripts/cleanup.js [--people] [--dir <folder>] <id> [...] | --all"); process.exit(1); }
  let total = 0;
  for (const id of ids) {
    const { dropped, kept } = clean(dir, id, people);
    total += dropped.length;
    if (dropped.length || kept.length) console.log(`${id}: dropped ${dropped.length ? dropped.join(", ") : "none"}${kept.length ? `; kept ${kept.join(", ")} (dropping adds a validate.js error)` : ""}`);
  }
  console.log(`${ids.length} audit(s) checked; ${total} unused source(s) dropped`);
}
