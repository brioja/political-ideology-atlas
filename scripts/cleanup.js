// Makes the fixes that need no judgment (tidy below: null reasons and sources, retired fields and answers, Wikipedia
// listed as primary) and drops sources an audit lists but never uses (and, with --failing, first takes the sources validate.js fails out
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

// Empties the rationale of every null in audit `a` (Brandon, 2026-11-26: a null carries no reason, since a reason for
// one is a claim about silence that the next pass reads as settled). Returns how many it emptied.
function emptyNullReasons(a) {
  let n = 0;
  for (const ans of Object.values(a.answers || {})) if (ans && ans.value === null && ans.rationale) { ans.rationale = ""; n++; }
  return n;
}

// The fixes that need no judgment, done in place on audit `a` instead of failing validate.js (Brandon, 2026-11-26:
// a session would spend a fix round on each). Returns how many of each it made:
// - reasons: nulls' reasons emptied (emptyNullReasons).
// - nullSources: a null's sources emptied. A null cites nothing: a source next to it reads as evidence of silence. A
//   null citing a person's action is left to validate.js, since the action usually answers the statement.
// - confidence, reviewHistory: fields answers no longer have (no confidence: it changed no result; no history: git keeps it).
// - strays: answers to statements no longer in the bank (as scripts/drop-answers.js does across the repo).
// - wikiKind: a Wikipedia article listed as "primary" or "program" made "reference": it is about a document, never the document.
function tidy(a, people = false) {
  const t = { reasons: emptyNullReasons(a), nullSources: 0, confidence: 0, reviewHistory: 0, strays: 0, wikiKind: 0 };
  const answers = a.answers && typeof a.answers === "object" ? a.answers : {};
  const inBank = new Set(lib.allStatements().map((s) => s.id));
  for (const k of Object.keys(answers)) if (!inBank.has(k)) { delete answers[k]; t.strays++; }
  const action = new Set(people ? (a.sources || []).filter((s) => s && s.evidence === "action").map((s) => s.id) : []);
  for (const ans of Object.values(answers)) {
    if (!ans || typeof ans !== "object") continue;
    if ("confidence" in ans) { delete ans.confidence; t.confidence++; }
    if ("reviewHistory" in ans) { delete ans.reviewHistory; t.reviewHistory++; }
    if (ans.value === null && Array.isArray(ans.sources) && ans.sources.length && !ans.sources.some((sid) => action.has(sid))) { ans.sources = []; t.nullSources++; }
  }
  for (const s of Array.isArray(a.sources) ? a.sources : []) {
    if (s && (s.kind === "primary" || s.kind === "program") && /wikipedia\.org/i.test(s.url || "")) { s.kind = "reference"; t.wikiKind++; }
  }
  return t;
}

// tidy()'s counts as a log line ("" when it changed nothing).
function describe(t) {
  const parts = [[t.reasons, "null reason(s) emptied"], [t.nullSources, "null(s) cleared of sources"], [t.confidence, "confidence field(s) removed"],
    [t.reviewHistory, "reviewHistory field(s) removed"], [t.strays, "answer(s) to statements not in the bank removed"],
    [t.wikiKind, "Wikipedia source(s) made \"reference\""]].filter(([n]) => n).map(([n, what]) => `${n} ${what}`);
  return parts.join("; ");
}

// Cleans `<dir>/<id>.json` in place (lib.formatAudit): tidy() first, then unused sources go (a null's reason or sources
// may have been all that mentioned one). Returns { tidied, dropped, kept }: tidy()'s description ("" for none), ids
// dropped, and unused ids kept because dropping them adds a validate.js error.
function clean(dir, id, people = false) {
  const file = path.join(dir, `${id}.json`);
  let text = fs.readFileSync(file, "utf8"), a = JSON.parse(text);
  const tidied = describe(tidy(a, people));
  if (tidied) { text = lib.formatAudit(a); fs.writeFileSync(file, text); }
  const unused = unusedSources(a);
  if (!unused.length) return { tidied, dropped: [], kept: [] };
  const write = (ids) => fs.writeFileSync(file, lib.formatAudit({ ...a, sources: a.sources.filter((s) => !ids.includes(s && s.id)) }));
  const before = errors(dir, id, people);
  const ok = () => [...errors(dir, id, people)].every((e) => before.has(e));
  try {
    write(unused);
    if (ok()) return { tidied, dropped: unused, kept: [] };
    // Something unused still matters: drop the rest one at a time.
    const dropped = [];
    for (const sid of unused) { write([...dropped, sid]); if (ok()) dropped.push(sid); }
    write(dropped);
    if (!dropped.length) fs.writeFileSync(file, text);
    return { tidied, dropped, kept: unused.filter((x) => !dropped.includes(x)) };
  } catch (e) { fs.writeFileSync(file, text); throw e; }
}

const known = (ans) => ans && ans.value !== null && ans.value !== undefined;
// Before a later pass (Brandon, 2026-11-26): answers lose their Wikipedia citations, which validate.js refuses
// (Wikipedia is a tertiary source, audits/AUDIT_RULES.md section 2) and only a new source can fix. An answer citing
// Wikipedia is nulled even when it cites other sources too, so the session researches it like any open statement
// (Brandon, 2026-11-27: kept on its other sources, its value and rationale stayed, and nothing checked that those
// sources alone carry it). Missing statements are treated the same way (Brandon, 2026-11-26), since a request added to
// the candidate bank seeds that statement's answer: a request citing Wikipedia is dropped.
// The source entries stay (an alias or a key figure may cite them); the final cleanup drops unused ones.
const isWikipedia = (u) => { try { return /(^|\.)wikipedia\.org$/.test(new URL(u).host); } catch { return false; } };
function dropWikipedia(audit) {
  const wiki = new Set((audit.sources || []).filter((s) => isWikipedia(s.url)).map((s) => s.id));
  let nulled = 0;
  for (const ans of Object.values(audit.answers || {})) {
    if (!known(ans) || !(ans.sources || []).some((s) => wiki.has(s))) continue;
    Object.assign(ans, { value: null, sources: [], rationale: "" }); nulled++;
  }
  let requests = 0;
  if (Array.isArray(audit.missingStatements)) {
    audit.missingStatements = audit.missingStatements.filter((m) => {
      if (!(m.sources || []).some((s) => wiki.has(s))) return true;
      requests++; return false;
    });
  }
  return { nulled, requests };
}

// Takes out of the answers the sources validate.js fails and only a new source could fix (Brandon, 2026-11-26):
// Wikipedia citations (a tertiary source; dropWikipedia above) and sources not tied to the subject
// (scripts/drop-source.js --none-fit --null-all). An answer citing them is nulled, other sources or not; then unused
// sources go (clean).
// scripts/lane.js runs it on a draft before its session.
// Returns { untied, wikipedia: { nulled, requests }, dropped, kept }.
// Coatracks too (coatrack-check.js: a defining source that "never names" the subject; Brandon, 2026-11-26). With
// keepUnused, sources nothing cites stay (defining sources no answer cites yet).
function dropFailing(dir, id, people = false, keepUnused = false) {
  const errs = [...errors(dir, id, people, true)].join("\n"); // under today's rules, whatever the draft's "rules" says
  const untied = [...new Set([...errs.matchAll(/source (s\d+) \([^)]*\) (?:doesn't name|never names)/g)].map((m) => m[1]))];
  for (const sid of untied) {
    execFileSync("node", [path.join(__dirname, "drop-source.js"), id, sid, "--dir", dir, "--none-fit", "--null-all", ...(people ? ["--people"] : [])], { stdio: "ignore" });
  }
  let wikipedia = { nulled: 0, requests: 0 };
  if (/, a Wikipedia article: Wikipedia is a tertiary source/.test(errs)) {
    const file = path.join(dir, `${id}.json`), a = JSON.parse(fs.readFileSync(file, "utf8"));
    wikipedia = dropWikipedia(a);
    fs.writeFileSync(file, lib.formatAudit(a));
  }
  return { untied, wikipedia, ...(keepUnused ? { tidied: "", dropped: [], kept: [] } : clean(dir, id, people)) };
}

// Nulls every answer validate.js fails under today's rules (an error line that starts with its statement id), so
// the next session answers it afresh rather than repairing it (Brandon, 2026-11-26). Returns the ids nulled.
function nullFailing(dir, id, people = false) {
  const bank = new Set(lib.allStatements().map((s) => s.id)), failing = new Map();
  for (const line of errors(dir, id, people, true)) {
    const m = /^error:\s*([^:\s][^:]*):/.exec(line);
    const ids = m ? m[1].split(/,\s*/) : [];
    if (ids.length && ids.every((x) => bank.has(x))) ids.forEach((x) => failing.set(x, line.replace(/^error:\s*/, "")));
  }
  const file = path.join(dir, `${id}.json`), a = JSON.parse(fs.readFileSync(file, "utf8")), nulled = [];
  // The validator's error for each nulled answer is kept as nulled.reasons, so the log says why.
  nulled.reasons = {};
  for (const [sid, why] of failing) {
    const ans = (a.answers || {})[sid];
    if (ans && ans.value !== null && ans.value !== undefined) { a.answers[sid] = { value: null, sources: [], rationale: "" }; nulled.push(sid); nulled.reasons[sid] = why; }
  }
  if (nulled.length) fs.writeFileSync(file, lib.formatAudit(a));
  return nulled;
}

module.exports = { unusedSources, emptyNullReasons, tidy, describe, clean, dropWikipedia, dropFailing, nullFailing };

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
      if (f.untied.length || f.wikipedia.nulled + f.wikipedia.requests) console.log(`${id}: untied sources out of the answers: ${f.untied.join(", ") || "none"}; Wikipedia citations dropped: ${f.wikipedia.nulled} answer(s) nulled, ${f.wikipedia.requests} missing statement(s) dropped`);
    }
    const { tidied, dropped, kept } = clean(dir, id, people);
    total += dropped.length;
    if (tidied) console.log(`${id}: ${tidied}`);
    if (dropped.length || kept.length) console.log(`${id}: dropped ${dropped.length ? dropped.join(", ") : "none"}${kept.length ? `; kept ${kept.join(", ")} (dropping adds a validate.js error)` : ""}`);
  }
  console.log(`${ids.length} audit(s) checked; ${total} unused source(s) dropped`);
}
