// Checks quotes against a draft's saved sources the way validate.js does (Brandon, 2026-11-27: lane sessions wrote
// their own vq.py and quotes.py for this, which could pass a quote validate.js then failed).
//   node scripts/check-quotes.js <draft.json> <quotes-file | ->
// One quote per line: <source id> <TAB> <quote>. Blank lines and lines starting with # are skipped. A quote passes if
// its words, case, accents and punctuation aside, appear in that order in the source's saved copy
// (scratchpad/sources/<id>/, coatrack-check.js sourceText). Prints OK or BAD per line; for a quote not found, how many
// of its first words were found, so the break is easy to see. Exits 1 if any line is BAD.
const fs = require("fs"), path = require("path");
const { norm, sourceText } = require("./coatrack-check");

const [draftPath, input] = process.argv.slice(2);
if (!draftPath || !input) { console.error("usage: node scripts/check-quotes.js <draft.json> <quotes-file | ->"); process.exit(1); }
const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
const id = path.basename(draftPath, ".json");
const texts = new Map();
const textOf = (url) => { if (!texts.has(url)) texts.set(url, sourceText(id, url)); return texts.get(url); };
let bad = 0;
const lines = fs.readFileSync(input === "-" ? 0 : input, "utf8").split("\n");
lines.forEach((l, i) => {
  if (!l.trim() || l.startsWith("#")) return;
  const [sid, ...rest] = l.split("\t"), quote = rest.join("\t").trim(), where = `line ${i + 1} ${sid.trim()}`;
  const src = (draft.sources || []).find((s) => s.id === sid.trim());
  const fail = (why) => { bad++; console.log(`BAD ${where}: ${why}`); };
  if (!src) return fail("not a source in the draft");
  if (quote.length < 10) return fail("quote missing or under 10 characters");
  const t = textOf(src.url);
  if (t == null) return fail(`no saved copy of ${src.url}`);
  const q = norm(quote).trim();
  if (t.includes(q)) return console.log(`OK  ${where}`);
  const words = q.split(" ");
  let n = 0;
  while (n < words.length && t.includes(` ${words.slice(0, n + 1).join(" ")}`)) n++;
  fail(`not in the saved copy; its first ${n} of ${words.length} words are${n < words.length ? `, then "${words.slice(n, n + 6).join(" ")}" doesn't follow` : ""}`);
});
process.exit(bad ? 1 : 0);
