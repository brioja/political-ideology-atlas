// Unit tests for the rules validate.js and source-check.js enforce on ideology audits only (the rules shared with
// people, rules 4 included, are covered by tests/validate-rules.test.js and run the same code).
//   node tests/validate-ideology-rules.test.js        (also run by test.js)
// The fixture is a catalog ideology with no audit and no source library yet; its audit is a temp file and its
// source library a temporary scratchpad/sources/<id>/ folder, removed at the end.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("../scripts/lib");

const LIBDIR = path.join(lib.ROOT, "scratchpad", "sources");
const subject = lib.catalog().find((e) => !fs.existsSync(lib.profilePath(e.id)) && !fs.existsSync(path.join(LIBDIR, e.id))
  && !lib.duplicateOf(e.id) && lib.notable(e.id) && /^[A-Za-z]+( [A-Za-z]+)?$/.test(e.name));
assert(subject, "needs one catalog ideology without an audit or source library to use as the fixture");
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "validate-ideology-")), `${subject.id}.json`);
const profilePath = lib.profilePath;
lib.profilePath = (id) => (id === subject.id ? tmp : profilePath(id));
const { validate, setCommittedForTests } = require("../scripts/validate");
setCommittedForTests(() => null);

// The saved source texts the source check reads.
const libDir = path.join(LIBDIR, subject.id);
const N = subject.name;
const TEXTS = {
  "https://example.org/encyclopedia": `${N} is a political doctrine. Its founders set out ${N} in several works.`,
  "https://example.org/manifesto": `The manifesto of ${N}. We hold that ${N} is the way forward for all.`,
  "https://example.org/study": `A study of ${N} and its history, written for students of ${N}.`,
  "https://example.org/unrelated": "A text about something else entirely, with no mention of the subject.",
};
function writeLibrary() {
  fs.mkdirSync(libDir, { recursive: true });
  const index = Object.entries(TEXTS).map(([url, text], i) => { fs.writeFileSync(path.join(libDir, `t${i}.txt`), text); return { file: `t${i}.txt`, url }; });
  fs.writeFileSync(path.join(libDir, "index.json"), JSON.stringify(index));
}
writeLibrary();

const st = lib.activeStatements().map((s) => s.id);
const [A] = st;
function base() {
  const answers = {};
  for (const id of st) answers[id] = { value: null, confidence: "low", rationale: "The sources record no position on this.", sources: [] };
  answers[A] = { value: 1, confidence: "medium", rationale: "The manifesto states this position in its first section.", sources: ["s2"] };
  return {
    id: subject.id, name: N, auditedAt: "2026-11-07", auditor: "claude-sonnet-5-5", rules: 4,
    summary: `A fixture audit of ${N} for the validator's rule tests.`, scope: "The doctrine as its defining sources set it out.",
    aliases: [], authors: [], wikipedia: null,
    furtherReading: [{ title: "An introduction", url: "https://example.org/intro" }, { title: "A history", url: "https://example.org/history" }],
    keyFigures: [], missingStatements: [],
    sources: [
      { id: "s1", kind: "reference", evidence: "words", title: "Encyclopedia entry", url: "https://example.org/encyclopedia" },
      { id: "s2", kind: "primary", evidence: "words", title: "Manifesto", url: "https://example.org/manifesto" },
      { id: "s3", kind: "scholarly", evidence: "words", title: "A study", url: "https://example.org/study" },
    ],
    answers,
  };
}
const E = (a, f) => { f(a); return a; };
function result(a) { fs.writeFileSync(tmp, JSON.stringify(a, null, 2)); return validate(subject.id); }
const errorsOf = (a) => result(a).errors.filter((e) => !e.startsWith("uncertainty:"));
let n = 0;
function ok(name, a) { const e = errorsOf(a); assert.deepStrictEqual(e, [], `${name}: expected no errors, got:\n  ${e.join("\n  ")}`); n++; }
function fails(name, a, re) { const e = errorsOf(a); assert(e.some((x) => re.test(x)), `${name}: expected an error matching ${re}, got:\n  ${e.join("\n  ") || "(none)"}`); n++; }
function warns(name, a, re) { const w = result(a).warnings; assert(w.some((x) => re.test(x)), `${name}: expected a warning matching ${re}, got:\n  ${w.join("\n  ") || "(none)"}`); n++; }

try {
  ok("base fixture", base());
  // Catalog and required fields.
  { const a = base(); a.id = "no-such-ideology-xyz"; fails("id mismatch", a, /"id" is 'no-such-ideology-xyz'/); }
  fails("scope missing", E(base(), (a) => { a.scope = ""; }), /"scope" must be a non-empty string/);
  fails("aliases missing", E(base(), (a) => { delete a.aliases; }), /"aliases" is required/);
  // Further reading: 2 to 4 items with a title and an http(s) url.
  fails("too little further reading", E(base(), (a) => { a.furtherReading.pop(); }), /"furtherReading" needs 2 to 4 items, has 1/);
  fails("too much further reading", E(base(), (a) => { for (let i = 0; i < 3; i++) a.furtherReading.push({ title: `More ${i}`, url: `https://example.org/more${i}` }); }), /"furtherReading" needs 2 to 4 items, has 5/);
  fails("further reading without a url", E(base(), (a) => { a.furtherReading[0].url = "not a url"; }), /furtherReading item needs a title and an http\(s\) url/);
  // An ideology's null is low confidence.
  fails("null at medium confidence", E(base(), (a) => { a.answers[st[1]].confidence = "medium"; }), /a "no known position" answer is low confidence/);
  // Key figures: at most 3, each with a name, role, Wikipedia article and a source.
  warns("key figures missing", E(base(), (a) => { delete a.keyFigures; }), /no "keyFigures"/);
  const fig = (i) => ({ name: `Figure ${i}`, role: "Founder", wikipedia: `https://en.wikipedia.org/wiki/Figure_${i}`, sources: ["s1"] });
  ok("three key figures", E(base(), (a) => { a.keyFigures = [fig(1), fig(2), fig(3)]; }));
  fails("four key figures", E(base(), (a) => { a.keyFigures = [fig(1), fig(2), fig(3), fig(4)]; }), /"keyFigures" must be a list of at most 3/);
  fails("key figure without a role", E(base(), (a) => { a.keyFigures = [{ ...fig(1), role: "" }]; }), /keyFigures\[0\]: needs a name and a role/);
  fails("key figure without a Wikipedia article", E(base(), (a) => { a.keyFigures = [{ ...fig(1), wikipedia: "https://example.org/x" }]; }), /keyFigures\[0\]: wikipedia must be an en\.wikipedia\.org article URL/);
  fails("key figure without a source", E(base(), (a) => { a.keyFigures = [{ ...fig(1), sources: [] }]; }), /keyFigures\[0\]: needs at least one source/);
  fails("key figure with an unknown source", E(base(), (a) => { a.keyFigures = [{ ...fig(1), sources: ["s9"] }]; }), /keyFigures\[0\]: unknown source 's9'/);
  // Missing statements: text, value, rationale, sources, and the rule of two quotes.
  warns("missing statements absent", E(base(), (a) => { delete a.missingStatements; }), /no "missingStatements"/);
  const ms = () => ({ text: "Workers should elect their managers.", value: 2, rationale: "The manifesto demands this in its second and fourth sections.", sources: ["s2"],
    quotes: [{ source: "s2", text: `We hold that ${N} is the way forward for all` }, { source: "s3", text: `A study of ${N} and its history` }] });
  ok("missing statement with two quotes from separate places", E(base(), (a) => { a.missingStatements = [ms()]; }));
  fails("missing statements not a list", E(base(), (a) => { a.missingStatements = {}; }), /"missingStatements" must be a list/);
  fails("missing statement text too short", E(base(), (a) => { a.missingStatements = [{ ...ms(), text: "Short." }]; }), /missingStatements\[0\]: text missing or too short/);
  fails("missing statement value 0", E(base(), (a) => { a.missingStatements = [{ ...ms(), value: 0 }]; }), /missingStatements\[0\]: value must be -2, -1, 1 or 2/);
  fails("missing statement rationale too short", E(base(), (a) => { a.missingStatements = [{ ...ms(), rationale: "Demanded." }]; }), /missingStatements\[0\]: rationale missing or too short/);
  fails("missing statement without a source", E(base(), (a) => { a.missingStatements = [{ ...ms(), sources: [] }]; }), /missingStatements\[0\]: needs at least one source/);
  fails("missing statement with an unknown source", E(base(), (a) => { a.missingStatements = [{ ...ms(), sources: ["s9"] }]; }), /missingStatements\[0\]: unknown source 's9'/);
  fails("missing statement with one quote", E(base(), (a) => { a.missingStatements = [{ ...ms(), quotes: [{ source: "s2", text: `We hold that ${N} is the way forward for all` }] }]; }), /missingStatements\[0\]: 1 quote\(s\); the rule of two/);
  warns("missing statement without quotes", E(base(), (a) => { const m = ms(); delete m.quotes; a.missingStatements = [m]; }), /missingStatements\[0\]: no "quotes"/);
  // "Not an ideology": a reason from the list, a sentence of explanation, a source; the "ideas" test.
  const nai = (n) => ({ id: subject.id, name: N, auditedAt: "2026-11-07", auditor: "claude-sonnet-5-5", notAnIdeology: n,
    sources: [{ id: "s1", kind: "reference", title: "Article", url: "https://example.org/encyclopedia" }] });
  { const e = result(nai({ reason: "PARTY", explanation: "It is a political party, not a set of political ideas." })).errors;
    assert(e.length === 1 && /^not an ideology: PARTY/.test(e[0]), `valid notAnIdeology record: got ${e}`); n++; }
  fails("notAnIdeology reason not in the list", nai({ reason: "CLUB", explanation: "It is a club, not a set of political ideas at all." }), /"notAnIdeology\.reason" must be one of/);
  fails("notAnIdeology explanation too short", nai({ reason: "PARTY", explanation: "A party." }), /"notAnIdeology\.explanation" needs at least a sentence/);
  fails("notAnIdeology legacy text too short", nai("A party."), /"notAnIdeology" needs a reason of at least a sentence/);
  fails("notAnIdeology without an http source", E(nai({ reason: "PARTY", explanation: "It is a political party, not a set of political ideas." }), (a) => { a.sources[0].url = "none"; }), /"notAnIdeology" needs at least one source with an http\(s\) url/);
  // Source check: defining sources must discuss the ideology; every source needs a saved copy.
  fails("defining source never names the ideology", E(base(), (a) => { a.sources[2].url = "https://example.org/unrelated"; }), /source s3 \(scholarly\) never names/);
  fails("defining source with no saved copy", E(base(), (a) => { a.sources[2].url = "https://example.org/not-saved"; }), /sources: s3 have no saved copy/);
  // Aliases, authors and titles need evidence quoted from a saved source.
  fails("alias as a bare string", E(base(), (a) => { a.aliases = [`${N} Doctrine`]; }), /alias ".*" needs evidence/);
  fails("alias quote not in the source", E(base(), (a) => { a.aliases = [{ name: `${N}ists`, source: "s1", quote: `${N}ists believe in ${N} entirely` }]; }), /the quote isn't in s1's saved copy|its quote doesn't contain it/);
  fails("alias from a source not in the audit", E(base(), (a) => { a.aliases = [{ name: `${N}ists`, source: "s9", quote: `${N}ists and ${N}` }]; }), /source "s9" is not in the audit/);
  fails("author not named twice in the defining sources", E(base(), (a) => { a.authors = [{ first: "Imaginary", last: "Zorblatt", source: "s1", quote: "Zorblatt wrote it" }]; }), /author "Imaginary Zorblatt"/);
  fails("author without first and last", E(base(), (a) => { a.authors = [{ name: "Zorblatt", source: "s1", quote: "Zorblatt wrote it" }]; }), /needs "first" and "last"/);
  // Rules 4 is shared with people: one case to show it runs for ideologies too.
  fails("ideology answer mixes action and words", E(base(), (a) => { a.sources.push({ id: "s4", kind: "primary", evidence: "action", title: "Regime decree", url: "https://example.org/manifesto" }); a.answers[A].sources = ["s2", "s4"]; }), /cites actions \(s4\) and words \(s2\)/);
} finally {
  setCommittedForTests(null);
  fs.rmSync(libDir, { recursive: true, force: true });
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}
console.log(`validate ideology rules: ${n} cases passed (fixture ${subject.id})`);
