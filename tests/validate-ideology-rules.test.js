// Unit tests for the rules validate.js and coatrack-check.js enforce on ideology audits only (the rules shared with
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
const { validate, setCommittedForTests, CURRENT_RULES } = require("../scripts/validate");
const coatrack = require("../scripts/coatrack-check");
setCommittedForTests(() => null);

// The saved source texts the coatrack check reads.
const libDir = path.join(LIBDIR, subject.id);
const N = subject.name;
const TEXTS = {
  "https://example.org/encyclopedia": `${N} is a political doctrine. Its founders set out ${N} in several works, first in the Founding Rescript; the Founding Rescript is its canon.`,
  "https://example.org/manifesto": `The manifesto of ${N}. We hold that ${N} is the way forward for all.`,
  "https://example.org/study": `A study of ${N} and its history, written for students of ${N}. Quentin Vexmoor wrote its founding text; Vexmoor led it for years.`,
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
  for (const { id } of lib.allStatements()) answers[id] = { value: null, rationale: "", sources: [] };
  answers[A] = { value: 1, rationale: "The manifesto states this position in its first section.", sources: ["s2"] };
  return {
    id: subject.id, name: N, auditedAt: "2026-11-07", auditor: "claude-sonnet-5-5", rules: 4,
    summary: `A fixture audit of ${N} for the validator's rule tests.`, scope: "The doctrine as its defining sources set it out.",
    aliases: [], wikipedia: null,
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
const errorsOf = (a) => result(a).errors;
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
  // Key figures: no limit, people only, each with a Wikipedia article URL when given (and a role and article in a pass).
  ok("key figures left out", E(base(), (a) => { delete a.keyFigures; }));
  ok("a secondary source stands in for a reference one", E(base(), (a) => { a.sources[0].kind = "secondary"; }));
  const fig = () => ({ first: "Quentin", last: "Vexmoor", role: "Founder", wikipedia: "https://en.wikipedia.org/wiki/Quentin_Vexmoor", source: "s3", quote: "Quentin Vexmoor wrote its founding text" });
  fails("key figures not a list", E(base(), (a) => { a.keyFigures = "Quentin Vexmoor"; }), /"keyFigures" must be a list/);
  fails("key figure with a bad Wikipedia article", E(base(), (a) => { a.keyFigures = [{ ...fig(), wikipedia: "https://example.org/x" }]; }), /keyFigures\[0\]: wikipedia must be an en\.wikipedia\.org article URL/);
  fails("organisation as a key figure", E(base(), (a) => { a.keyFigures = [{ organisation: "Vexmoor League", source: "s3", quote: "Quentin Vexmoor wrote its founding text" }]; }), /an organisation isn't a key figure/);
  // A person a key figure's quote names (from the people catalog) is likely a missed key figure: a warning.
  { const person = lib.peopleCatalog().find((p) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(p.name) && !coatrack.reservedFor(p.name).length);
    const pair = (q) => E(base(), (a) => { a.keyFigures = [{ ...fig(), quote: q }]; });
    warns("person named in a key figure's quote", pair(`Quentin Vexmoor and ${person.name} wrote its founding text`), new RegExp(`keyFigures: ${person.name} is named in a key figure's quote`));
    const quiet = (name, a) => { const w = result(a).warnings.filter((x) => /named in a key figure's quote/.test(x)); assert.deepStrictEqual(w, [], `${name}: ${w.join("; ")}`); n++; };
    quiet("person in the quote who is a key figure", E(pair(`Quentin Vexmoor and ${person.name} wrote its founding text`), (a) => { const [first, last] = person.name.split(" "); a.keyFigures.push({ ...fig(), first, last, wikipedia: person.wikipedia }); }));
    quiet("name only in lower case", pair(`Quentin Vexmoor and ${person.name.toLowerCase()} wrote its founding text`)); }
  // --stage scope (a lane draft before answering): only section 2's checks, so a draft without answers, further
  // reading or summary still gets the key-figure warning and no errors for what it hasn't written yet.
  { const person = lib.peopleCatalog().find((p) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(p.name) && !coatrack.reservedFor(p.name).length);
    const draft = E(base(), (a) => { delete a.answers; delete a.furtherReading; delete a.summary; delete a.missingStatements; a.keyFigures = [{ ...fig(), quote: `Quentin Vexmoor and ${person.name} wrote its founding text` }]; });
    fs.writeFileSync(tmp, JSON.stringify(draft, null, 2));
    const out = require("child_process").spawnSync("node", [path.join(lib.ROOT, "scripts", "validate.js"), "--dir", path.dirname(tmp), "--stage", "scope", subject.id], { encoding: "utf8" }).stdout;
    const errs = out.split("\n").filter((l) => /^\s+error:/.test(l)).filter((l) => !/the quote isn't in s3's saved copy/.test(l));
    assert.deepStrictEqual(errs, [], `--stage scope: expected no errors for unwritten parts, got:\n${errs.join("\n")}`);
    assert(out.includes(`keyFigures: ${person.name} is named in a key figure's quote`), `--stage scope: expected the key-figure warning, got:\n${out}`); n++; }
  // Key works: a title with its evidence; "work" is the cited text itself, which the title then ties to the ideology.
  const work = (extra = {}) => ({ title: "Founding Rescript", source: "s1", quote: "first in the Founding Rescript", ...extra });
  const unnamed = (a) => { a.sources.push({ id: "s4", kind: "primary", evidence: "words", title: "Imperial edict", url: "https://example.org/unrelated" }); a.answers[A].sources.push("s4"); };
  fails("primary text not tied", E(base(), unnamed), /source s4 \(primary\) doesn't name/);
  ok("primary text tied by its key work title", E(base(), (a) => { unnamed(a); a.keyWorks = [work({ work: "s4" })]; }));
  ok("key work not cited as a source", E(base(), (a) => { a.keyWorks = [work()]; }));
  fails("key work quote not in the source", E(base(), (a) => { a.keyWorks = [work({ quote: "the Founding Rescript, a forgery" })]; }), /key work "Founding Rescript": the quote isn't in s1's saved copy/);
  fails("key work whose work is unknown", E(base(), (a) => { a.keyWorks = [work({ work: "s9" })]; }), /keyWorks\[0\]: unknown source 's9'/);
  ok("key work with its author and no article", E(base(), (a) => { a.keyWorks = [work({ author: "Quentin Vexmoor", wikipedia: null, authorWikipedia: "https://en.wikipedia.org/wiki/Quentin_Vexmoor" })]; }));
  fails("key work with a bad Wikipedia article", E(base(), (a) => { a.keyWorks = [work({ author: "Quentin Vexmoor", wikipedia: "https://example.org/x" })]; }), /keyWorks\[0\]: wikipedia must be an en\.wikipedia\.org article URL/);
  fails("key work with a bad author article", E(base(), (a) => { a.keyWorks = [work({ author: "Quentin Vexmoor", wikipedia: null, authorWikipedia: "Quentin Vexmoor" })]; }), /keyWorks\[0\]: authorWikipedia must be an en\.wikipedia\.org article URL/);
  // A lane draft (--dir) gives a key work it doesn't cite its author and article (or null), for the page to show.
  { const errsFor = (w) => { fs.writeFileSync(tmp, JSON.stringify(E(base(), (a) => { a.keyWorks = [w]; }), null, 2));
      return require("child_process").spawnSync("node", [path.join(lib.ROOT, "scripts", "validate.js"), "--dir", path.dirname(tmp), subject.id], { encoding: "utf8" }).stdout.split("\n").filter((l) => /keyWorks\[0\]/.test(l)); };
    const bare = errsFor(work());
    assert(bare.some((l) => /needs its "author"/.test(l)) && bare.some((l) => /needs "wikipedia"/.test(l)), `--dir: expected a bare key work to need its author and article, got:\n${bare.join("\n")}`);
    assert.deepStrictEqual(errsFor(work({ author: "Quentin Vexmoor", wikipedia: null })), [], "--dir: an author and a null article are enough"); n += 2; }
  fails("key work whose work is scholarship", E(base(), (a) => { a.keyWorks = [work({ work: "s3" })]; }), /keyWorks\[0\]: "work" must be the work itself/);
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
  // notIdeasOfWhatSocietyShouldBe: a reason from the list, a sentence of explanation, a source; the "ideas" test.
  const nai = (n) => ({ id: subject.id, name: N, auditedAt: "2026-11-07", auditor: "claude-sonnet-5-5", notIdeasOfWhatSocietyShouldBe: n,
    sources: [{ id: "s1", kind: "reference", title: "Article", url: "https://example.org/encyclopedia" }] });
  { const r = result(nai({ reason: "PARTY", explanation: "It is a political party, not a set of political ideas." }));
    assert(r.errors.length === 0 && r.excluded.length === 1 && /^not ideas of what society should be: PARTY/.test(r.excluded[0]),
      `valid notIdeasOfWhatSocietyShouldBe record: excluded, not an error; got errors ${r.errors}, excluded ${r.excluded}`); n++; }
  fails("notIdeasOfWhatSocietyShouldBe reason not in the list", nai({ reason: "CLUB", explanation: "It is a club, not a set of political ideas at all." }), /"notIdeasOfWhatSocietyShouldBe\.reason" must be one of/);
  fails("notIdeasOfWhatSocietyShouldBe explanation too short", nai({ reason: "PARTY", explanation: "A party." }), /"notIdeasOfWhatSocietyShouldBe\.explanation" needs at least a sentence/);
  fails("notIdeasOfWhatSocietyShouldBe as free text", nai("It is a political party, not a set of political ideas."), /"notIdeasOfWhatSocietyShouldBe\.reason" must be one of/);
  fails("notIdeasOfWhatSocietyShouldBe without an http source", E(nai({ reason: "PARTY", explanation: "It is a political party, not a set of political ideas." }), (a) => { a.sources[0].url = "none"; }), /"notIdeasOfWhatSocietyShouldBe" needs at least one source with an http\(s\) url/);
  // Source check: defining sources must discuss the ideology; every source needs a saved copy.
  fails("defining source never names the ideology", E(base(), (a) => { a.sources[2].url = "https://example.org/unrelated"; }), /source s3 \(scholarly\) never names/);
  fails("defining source with no saved copy", E(base(), (a) => { a.sources[2].url = "https://example.org/not-saved"; }), /sources: s3 have no saved copy/);
  // Aliases, key figures and key works need evidence quoted from a saved source.
  fails("alias as a bare string", E(base(), (a) => { a.aliases = [`${N} Doctrine`]; }), /alias ".*" needs evidence/);
  fails("alias quote not in the source", E(base(), (a) => { a.aliases = [{ name: `${N}ists`, source: "s1", quote: `${N}ists believe in ${N} entirely` }]; }), /the quote isn't in s1's saved copy|its quote doesn't contain it/);
  {
    // A redirect has one target: another catalog entry's Wikipedia redirect is that entry's name, not this one's alias.
    const own = new Set([...lib.wikipediaOtherNames(subject.id), ...lib.catalog().map((e) => e.name)].map((t) => t.toLowerCase()));
    const other = lib.catalog().filter((e) => e.id !== subject.id).map((e) => [e, lib.wikipediaOtherNames(e.id)
      .find((t) => !/\(/.test(t) && /^[A-Za-z][A-Za-z -]+$/.test(t) && t.includes(" ") && !own.has(t.toLowerCase()))]).find(([, t]) => t);
    const [e, t] = other;
    fails("alias that redirects to another entry's article", E(base(), (a) => { a.aliases = [{ name: t, reason: "SUPPORTED", source: "s1", quote: `${t}, or ${N}` }]; }),
      new RegExp(`"${t}" is a Wikipedia redirect to the article of ${e.id}`));
  }
  // A SUPPORTED alias Wikipedia files under another topic is refused; a redirect to the subject's own article
  // (a section included) or a name with no page is fine.
  {
    const own = lib.articleTitle({ id: subject.id }), al = `${N}ists`;
    const sup = () => E(base(), (a) => { a.aliases = [{ name: al, reason: "SUPPORTED", source: "s1", quote: `${al}, or ${N}` }]; });
    const page = (title, extra = {}) => ({ [al]: { query: { pages: [{ title, ...extra }], ...(extra.redirect ? { redirects: [{ from: al, to: title, tofragment: extra.redirect }] } : {}) } } });
    try {
      coatrack.setAliasPagesForTests(page("Zorblatt Committee"));
      fails("SUPPORTED alias with its own Wikipedia article", sup(), new RegExp(`alias "${al}": Wikipedia files it as its own article`));
      coatrack.setAliasPagesForTests(page(al, { pageprops: { disambiguation: "" } }));
      fails("SUPPORTED alias that is a disambiguation page", sup(), /Wikipedia files it as a disambiguation page/);
      coatrack.setAliasPagesForTests(page("Zorblatt", { redirect: "Politics" }));
      fails("SUPPORTED alias redirecting to a section of another article", sup(), /Wikipedia files it as a redirect to "Zorblatt#Politics"/);
      coatrack.setAliasPagesForTests(page(own, { redirect: "History" }));
      assert.ok(!coatrack.check(subject.id, sup(), { strict: true }).problems.some((p) => /Wikipedia files it/.test(p)), "a redirect to a section of the subject's own article is fine"); n++;
      coatrack.setAliasPagesForTests({ [al]: { query: { pages: [{ title: al, missing: true }] } } });
      assert.ok(!coatrack.check(subject.id, sup(), { strict: true }).problems.some((p) => /Wikipedia files it/.test(p)), "a name with no Wikipedia page is fine"); n++;
      // A SPELLING alias too ("modern liberalism", two letters off "Modern U.S. liberalism", is a disambiguation page).
      const sp = N.toLowerCase(), spAudit = E(base(), (a) => { a.aliases = [{ name: sp, reason: "SPELLING", source: "s1", quote: sp }]; });
      coatrack.setAliasPagesForTests({ [sp]: { query: { pages: [{ title: sp, pageprops: { disambiguation: "" } }] } } });
      fails("SPELLING alias that is a disambiguation page", spAudit, new RegExp(`alias "${sp}": Wikipedia files it as a disambiguation page`));
      coatrack.setAliasPagesForTests({ [sp]: { query: { pages: [{ title: own }], redirects: [{ from: sp, to: own }] } } });
      assert.ok(!coatrack.check(subject.id, spAudit, { strict: true }).problems.some((p) => /Wikipedia files it/.test(p)), "a SPELLING alias redirecting to the subject's own article is fine"); n++;
    } finally { coatrack.setAliasPagesForTests(null); }
  }
  // A TRANSLATION alias is a name Wikipedia gives the ideology in another language (a language link, or a
  // language-tagged name in its lead), romanizations and small spelling differences included; it needs no quote.
  {
    const tr = (name) => E(base(), (a) => { a.aliases = [{ name, reason: "TRANSLATION" }]; });
    const trProblems = (name) => coatrack.check(subject.id, tr(name), { strict: true }).problems.filter((p) => p.includes(`"${name}"`));
    try {
      coatrack.setAliasPagesForTests({});
      coatrack.setTranslationNamesForTests({ [subject.id]: ["Zorblattismus", "佐布拉特", "Zuǒbùlātè zhǔyì", "tsʼorblatʼyun"] });
      for (const name of ["Zorblattismus", "zuobulate zhuyi", "tsorblatyun"]) { assert.deepStrictEqual(trProblems(name), [], `TRANSLATION "${name}" with no quote`); n++; }
      fails("TRANSLATION that isn't a Wikipedia name in another language", tr("Zorblattisme Nouveau"), /alias "Zorblattisme Nouveau": not a name Wikipedia gives the ideology in another language/);
      coatrack.setAliasPagesForTests({ Zorblattismus: { query: { pages: [{ title: "Zorblattismus (band)" }] } } });
      fails("TRANSLATION Wikipedia files under another topic", tr("Zorblattismus"), /alias "Zorblattismus": Wikipedia files it as its own article/);
    } finally { coatrack.setAliasPagesForTests(null); coatrack.setTranslationNamesForTests(null); }
  }
  fails("alias from a source not in the audit", E(base(), (a) => { a.aliases = [{ name: `${N}ists`, source: "s9", quote: `${N}ists and ${N}` }]; }), /source "s9" is not in the audit/);
  fails("key figure not named twice in the defining sources", E(base(), (a) => { a.keyFigures = [{ first: "Imaginary", last: "Zorblatt", source: "s1", quote: "Zorblatt wrote it" }]; }), /key figure "Imaginary Zorblatt"/);
  fails("key figure without a last name", E(base(), (a) => { a.keyFigures = [{ name: "Zorblatt", source: "s1", quote: "Zorblatt wrote it" }]; }), /needs "last"/);
  // A key figure belongs to one ideology; the one named after them (Vexmoorism) takes them from any other,
  // which is an error at once, committed or not.
  {
    const vex = () => ({ first: "Quentin", last: "Vexmoor", source: "s3", quote: "Quentin Vexmoor wrote its founding text" });
    const listedBy = (id, name, auditedAt) => coatrack.setProfilesForTests(new Map([[id, { name, auditedAt, keyFigures: [vex()] }]]), {});
    const withVex = (auditedAt) => E(base(), (a) => { a.keyFigures = [vex()]; a.auditedAt = auditedAt; });
    try {
      coatrack.setProfilesForTests(new Map(), {});
      ok("key figure named twice", withVex("2026-11-07"));
      listedBy("other-ideology", "Other ideology", "2026-11-01");
      fails("key figure of another ideology", withVex("2026-11-07"), /key figure "Quentin Vexmoor" is also a key figure of other-ideology/);
      const authorProblems = (name) => coatrack.check(subject.id, { ...withVex("2026-11-07"), name }, { strict: true }).problems.filter((p) => /key figure "Quentin Vexmoor"/.test(p));
      assert.deepStrictEqual(authorProblems("Vexmoorism"), [], "the namesake lists its author whatever other ideologies do"); n++;
      // A namesake reserves its author with a bare name until its next pass gives the quote.
      coatrack.setProfilesForTests(new Map([["vexmoorism", { name: "Vexmoorism", auditedAt: "2026-10-16", keyFigures: ["Quentin Vexmoor"] }]]), {});
      fails("namesake took the author: an error on the committed audit too", withVex("2026-11-12"), /key figure "Quentin Vexmoor" belongs to vexmoorism/);
      const inPass = coatrack.check(subject.id, withVex("2026-11-07"), { strict: true, pass: true });
      assert.ok(inPass.problems.some((p) => /key figure "Quentin Vexmoor" belongs to vexmoorism/.test(p)), "a pass's draft must take the author out"); n++;
      // An unaudited ideology named after the author's given name, in any word order, reserves them (audits/namesakes.json).
      coatrack.setProfilesForTests(new Map(), { quentinismo: "Vexmoor Quentin" });
      fails("namesakes.json reserves the author for an unaudited eponym", withVex("2026-11-12"), /key figure "Quentin Vexmoor" belongs to quentinismo/);
      assert.ok(coatrack.isNamesake(vex(), "quentinismo", "Quentinismo") && !coatrack.isNamesake(vex(), "other-ideology", "Other ideology"), "namesakes.json decides the namesake"); n++;
      // The reserved person is matched by name in any order, or by surname and first initial; not another Vexmoor.
      coatrack.setProfilesForTests(new Map(), { quentinismo: "Quentin Vexmoor" });
      assert.ok(coatrack.isNamesake("Q. Vexmoor", "quentinismo", "Quentinismo") && !coatrack.isNamesake("Ralph Vexmoor", "quentinismo", "Quentinismo"), "same surname and first initial"); n++;
      // A numeral or Jr./Sr. is no surname: "Quentin II" is not "Quincy II", and Sr. is not Jr.
      coatrack.setProfilesForTests(new Map(), { quentinismo: "Quentin II", vexmoorism: "Quentin Vexmoor Sr." });
      assert.ok(coatrack.isNamesake("Quentin II", "quentinismo", "Quentinismo") && !coatrack.isNamesake("Quincy Ralph II", "quentinismo", "Quentinismo"), "a regnal name counts only whole"); n++;
      assert.ok(coatrack.isNamesake("Quentin Vexmoor", "vexmoorism", "Vexmoorism") && !coatrack.isNamesake("Q. Vexmoor Jr.", "vexmoorism", "Vexmoorism"), "Jr. is not Sr."); n++;
      // Key figure claims (audits/key-figure-claims.json): a person another ideology lists is claimed, not listed.
      const quotes = (second = "Vexmoor led it for years") => [{ source: "s3", quote: "Quentin Vexmoor wrote its founding text" }, { source: "s3", quote: second }];
      const claim = (extra = {}) => E(base(), (a) => { a.keyFigureClaims = [{ first: "Quentin", last: "Vexmoor", heldBy: "other-ideology", role: "Founder of the movement", wikipedia: "https://en.wikipedia.org/wiki/Quentin_Vexmoor", evidence: quotes(), ...extra }]; });
      listedBy("other-ideology", "Other ideology", "2026-11-01");
      ok("claim on another ideology's key figure", claim());
      fails("claim on an ideology that doesn't list them", claim({ heldBy: "third-ideology" }), /key figure claim "Quentin Vexmoor": third-ideology doesn't list them; other-ideology does/);
      fails("claim with one passage", claim({ evidence: quotes("Quentin Vexmoor wrote its founding text") }), /needs two quotes or more in "evidence"/);
      fails("claim quoting a primary text", claim({ evidence: [...quotes(), { source: "s2", quote: "The manifesto of Vexmoor" }] }), /s2 is a primary source; the evidence comes from defining sources/);
      fails("claim on an influence", claim({ role: "An undisputed influence on the movement" }), /key figure claim "Quentin Vexmoor": its role or a quote presents them as an influence/);
      coatrack.setProfilesForTests(new Map(), {});
      fails("claim on a person no one lists", claim(), /no other ideology lists them, so list them in "keyFigures" instead/);
      // The holder is warned of a claim, and loses at once a person its own evidence makes an influence.
      coatrack.setClaimsForTests([{ first: "Quentin", last: "Vexmoor", claimedBy: "other-ideology", heldBy: subject.id, date: "2026-11-26" }]);
      warns("key figure another ideology claims", withVex("2026-11-07"), /key figure "Quentin Vexmoor" is claimed by other-ideology/);
      fails("claimed key figure presented as an influence", E(withVex("2026-11-07"), (a) => { a.keyFigures[0].role = "An influence on the movement"; }), /key figure "Quentin Vexmoor" is claimed by other-ideology .*influence on the ideology/);
      coatrack.setClaimsForTests([{ first: "Quentin", last: "Vexmoor", claimedBy: subject.id, heldBy: "other-ideology", date: "2026-11-26" }]);
      warns("claimed person the holder dropped", base(), /key figure claim "Quentin Vexmoor" .*other-ideology no longer lists them/);
    } finally { coatrack.setProfilesForTests(null); coatrack.setClaimsForTests(null); }
  }
  // A source behind a stated answer is tied to the ideology like any other.
  fails("a source behind a stated answer is tied", E(base(), (a) => {
    a.sources.push({ id: "s4", kind: "primary", evidence: "words", title: "An unrelated old text", url: "https://example.org/unrelated" });
    a.answers[st[1]] = { value: 1, rationale: "Answered from the unrelated old text.", sources: ["s4"] };
  }), /source s4 \(primary\)/);
  // Rules 4 is shared with people: one case to show it runs for ideologies too.
  // Only people have a record: an ideology's sources need no "evidence" tag, and the record checks don't apply.
  { const e = errorsOf(E(base(), (a) => { for (const s of a.sources) delete s.evidence; a.sources.push({ id: "s4", kind: "primary", evidence: "action", title: "Regime decree", url: "https://example.org/manifesto" }); a.answers[A].sources = ["s2", "s4"]; }));
    assert(!e.some((x) => /"evidence"|cites actions/.test(x)), `ideology: no record checks, got:\n  ${e.join("\n  ")}`); n++; }
  // One rule for every ideology (Brandon, 2026-11-08): no "family" exemption, so no primary-source requirement; an
  // audit cites its defining sources, whatever kind they are.
  ok("defining scholarship alone, no primary source", E(base(), (a) => { a.sources[1].kind = "scholarly"; }));
  // A rationale states the evidence; it never mentions inference, not even to deny it.
  fails("ideology rationale denies an inference", E(base(), (a) => { a.answers[A].rationale = "The manifesto states it, rather than an inference from its aims."; }), /mentions inference/);
  // An audit under an older rules version says so, with the date its later pass may carry.
  warns("old rules version", E(base(), (a) => { a.rules = 3; a.auditedAt = "2026-10-30"; }), /^old audit: written under rules 3 \(current \d+\).*from 2026-11-15/);
  // The current version is the one the prompts tell audits to write.
  for (const f of ["audits/AUDIT_RULES.md", "audits/PROMPT.md", "audits/PROMPT_PEOPLE.md"]) {
    const v = [...fs.readFileSync(path.join(lib.ROOT, f), "utf8").matchAll(/"rules": (\d+)/g)].map((m) => +m[1]);
    assert(v.length && v.every((x) => x === CURRENT_RULES), `${f} writes "rules" ${v.join(", ")}; validate.js CURRENT_RULES is ${CURRENT_RULES}`); n++;
  }
} finally {
  setCommittedForTests(null);
  fs.rmSync(libDir, { recursive: true, force: true });
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}
console.log(`validate ideology rules: ${n} cases passed (fixture ${subject.id})`);
