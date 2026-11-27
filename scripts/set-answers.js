// Writes answers into an audit draft, checked as they go in (Brandon, 2026-11-27: every lane session wrote its own
// script for this, apply2.js, fill.py, patch.js and the like, and fixed its mistakes in later turns).
//   node scripts/set-answers.js <draft.json> <answers-file | ->
// The answers file (or stdin, "-") holds one answer per line, tab-separated:
//   <statement id> <TAB> <value: -2..2, or null> <TAB> <source ids, comma-separated> <TAB> <rationale>
// or a JSON object {"<statement id>": {"value": 1, "sources": ["s3"], "rationale": "..."}}. Blank lines and lines
// starting with # are skipped. Each answer replaces the draft's answer for that statement. Nothing is written if any
// line fails: an unknown statement id, a value outside -2..2, a source id the draft doesn't list, a known answer with
// no source, or a rationale under 20 characters. A null answer needs no source or rationale.
// Each statement written, null included (searched, nothing found), leaves the lane's statements file beside the draft
// (<id>.statements.txt), so that file always lists what is left to search (Brandon, 2026-11-27: sessions printed the
// draft to see which statements were still open).
const fs = require("fs");
const lib = require("./lib");
const [draftPath, input] = process.argv.slice(2);
if (!draftPath || !input) { console.error("usage: node scripts/set-answers.js <draft.json> <answers-file | ->"); process.exit(1); }
const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
const raw = fs.readFileSync(input === "-" ? 0 : input, "utf8");
const statements = new Set(lib.allStatements().map((s) => s.id));
const sourceIds = new Set((draft.sources || []).map((s) => s.id));

let entries;
if (/^\s*\{/.test(raw)) {
  entries = Object.entries(JSON.parse(raw)).map(([sid, a], i) => ({ where: `"${sid}"`, sid, ...a, line: i + 1 }));
} else {
  entries = raw.split("\n").map((l, i) => [l, i + 1]).filter(([l]) => l.trim() && !l.startsWith("#")).map(([l, n]) => {
    const [sid, value, sources = "", ...rest] = l.split("\t");
    return { where: `line ${n}`, sid: sid.trim(), value: value === undefined ? undefined : value.trim(), sources: sources.split(",").map((s) => s.trim()).filter(Boolean), rationale: rest.join("\t").trim() };
  });
}

const errors = [], answers = {};
for (const e of entries) {
  const value = e.value === "null" || e.value === null || e.value === "" ? null : Number(e.value);
  const sources = Array.isArray(e.sources) ? e.sources : String(e.sources || "").split(",").map((s) => s.trim()).filter(Boolean);
  const rationale = String(e.rationale || "").trim();
  const bad = [];
  if (!statements.has(e.sid)) bad.push(`no statement "${e.sid}"`);
  if (e.value === undefined) bad.push("no value (a line needs at least id <TAB> value)");
  else if (value !== null && ![-2, -1, 0, 1, 2].includes(value)) bad.push(`value "${e.value}" is not -2..2 or null`);
  const unknown = sources.filter((s) => !sourceIds.has(s));
  if (unknown.length) bad.push(`source(s) ${unknown.join(", ")} not in the draft's sources (add them there first)`);
  if (value !== null) {
    if (!sources.length) bad.push("a known answer needs at least one source");
    if (rationale.length < 20) bad.push("rationale missing or under 20 characters");
  }
  if (answers[e.sid]) bad.push(`"${e.sid}" given twice`);
  if (bad.length) errors.push(`${e.where}: ${bad.join("; ")}`);
  else answers[e.sid] = { value, rationale, sources };
}
if (errors.length) { console.error(`nothing written; fix these and run again:\n${errors.join("\n")}`); process.exit(1); }
if (!entries.length) { console.error("no answers in the input"); process.exit(1); }
draft.answers = { ...(draft.answers || {}), ...answers };
fs.writeFileSync(draftPath, lib.formatAudit(draft));
const listFile = draftPath.replace(/\.json$/, ".statements.txt");
let left = "";
if (listFile !== draftPath && fs.existsSync(listFile)) {
  const lines = fs.readFileSync(listFile, "utf8").split("\n").filter((l) => !(/^[\w-]+: /.test(l) && answers[l.split(":")[0]]));
  // Theme headings with no statement left under them go too.
  const kept = lines.filter((l, i) => !/^## /.test(l) || lines.slice(i + 1).find((x) => /^(## |[\w-]+: )/.test(x))?.startsWith("## ") === false);
  const n = kept.filter((l) => /^[\w-]+: /.test(l)).length;
  kept[0] = `${n} statements, by theme.`;
  fs.writeFileSync(listFile, kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
  left = `; ${n} left to search in ${require("path").basename(listFile)}`;
}
console.log(`set ${entries.length} answer(s) (${Object.values(answers).filter((a) => a.value !== null).length} known)${left}`);
