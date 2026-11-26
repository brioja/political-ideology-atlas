// Drops sources an audit lists but never uses (and, with --failing, first takes the sources validate.js fails out
// of the answers: Wikipedia citations and sources not tied to the subject; dropFailing below).
//   node scripts/cleanup.js [--people] <id> [...]   committed audits (audits/profiles, or audits/people)
//   node scripts/cleanup.js [--people] --all        every committed audit
//   add --dir <folder> to clean the audits in that folder instead (a lane's drafts)
//   add --failing to take the sources validate.js fails out of the answers first (dropFailing)
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
function errors(dir, id, people, asCurrent = false) {
  let out;
  try { out = execFileSync("node", [path.join(__dirname, "validate.js"), ...(people ? ["--people"] : []), ...(asCurrent ? ["--as-current"] : []), "--dir", dir, id], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
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

// Takes out of the answers the sources validate.js fails and only a new source could fix (Brandon, 2026-11-26):
// Wikipedia citations (a tertiary source; scripts/phases.js dropWikipedia) and sources not tied to the subject
// (scripts/drop-source.js --none-fit). An answer resting on them alone is nulled; then unused sources go (clean).
// scripts/lane.js runs it after the scope phase and when the local phase leaves validator errors.
// Returns { untied, wikipedia: { kept, nulled }, dropped, kept }.
function dropFailing(dir, id, people = false) {
  const errs = [...errors(dir, id, people, true)].join("\n"); // under today's rules, whatever the draft's "rules" says
  const untied = [...new Set([...errs.matchAll(/source (s\d+) \([^)]*\) doesn't name/g)].map((m) => m[1]))];
  for (const sid of untied) {
    execFileSync("node", [path.join(__dirname, "drop-source.js"), id, sid, "--dir", dir, "--none-fit", ...(people ? ["--people"] : [])], { stdio: "ignore" });
  }
  let wikipedia = { kept: 0, nulled: 0 };
  if (/, a Wikipedia article: Wikipedia is a tertiary source/.test(errs)) {
    const file = path.join(dir, `${id}.json`), a = JSON.parse(fs.readFileSync(file, "utf8"));
    wikipedia = require("./phases").dropWikipedia(a);
    fs.writeFileSync(file, lib.formatAudit(a));
  }
  return { untied, wikipedia, ...clean(dir, id, people) };
}

module.exports = { unusedSources, clean, dropFailing };

if (require.main === module) {
  const args = process.argv.slice(2), people = args.includes("--people");
  const dir = args.includes("--dir") ? path.resolve(args[args.indexOf("--dir") + 1]) : people ? lib.PEOPLE_DIR : lib.PROFILES_DIR;
  const ids = args.includes("--all") ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
    : args.filter((x, i) => !x.startsWith("--") && args[i - 1] !== "--dir");
  if (!ids.length) { console.error("usage: node scripts/cleanup.js [--people] [--dir <folder>] <id> [...] | --all"); process.exit(1); }
  let total = 0;
  for (const id of ids) {
    if (args.includes("--failing")) {
      const f = dropFailing(dir, id, people);
      if (f.untied.length || f.wikipedia.kept + f.wikipedia.nulled) console.log(`${id}: untied sources out of the answers: ${f.untied.join(", ") || "none"}; Wikipedia citations dropped: ${f.wikipedia.nulled} answer(s) nulled, ${f.wikipedia.kept} kept on other sources`);
    }
    const { dropped, kept } = clean(dir, id, people);
    total += dropped.length;
    if (dropped.length || kept.length) console.log(`${id}: dropped ${dropped.length ? dropped.join(", ") : "none"}${kept.length ? `; kept ${kept.join(", ")} (dropping adds a validate.js error)` : ""}`);
  }
  console.log(`${ids.length} audit(s) checked; ${total} unused source(s) dropped`);
}
