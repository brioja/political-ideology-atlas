// Unit tests for the audit rules validate.js enforces on people audits under "rules": 4 (Brandon, 2026-11-07):
// action/words tags, nothing-found nulls, the talk-page reviewHistory (WP:BRD), nulling reviews, and edits
// checked against the committed file. The same code runs for ideologies.
//   node tests/validate-rules.test.js        (also run by test.js)
// Each case writes a fixture audit to a temp file for a catalog person who has no audit yet, so no real
// audit is read or changed; the "committed" copy is supplied through setCommittedForTests.
"use strict";
process.argv.push("--people");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("../scripts/lib");

const subject = lib.peopleCatalog().find((e) => !fs.existsSync(lib.personPath(e.id)));
assert(subject, "needs one catalog person without an audit to use as the fixture id");
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "validate-rules-")), `${subject.id}.json`);
const personPath = lib.personPath;
lib.personPath = (id) => (id === subject.id ? tmp : personPath(id));
const { validate, setCommittedForTests, setLibraryForTests, setTextsForTests, nextPassFrom, reauditGap } = require("../scripts/validate");

const st = lib.activeStatements().map((s) => s.id);
const [A, B, C, D] = st; // A: answered from an action, B: answered from words, C and D: nothing found

function base() {
  const answers = {};
  for (const id of st) answers[id] = { value: null, confidence: "low", rationale: "No recorded position found.", sources: [] };
  answers[A] = { value: 1, confidence: "medium", rationale: "Voted for the bill that settles this statement directly.", sources: ["s1"] };
  answers[B] = { value: -1, confidence: "medium", rationale: "Said in a 2020 interview that this statement is wrong.", sources: ["s2"] };
  return {
    id: subject.id, name: subject.name, auditedAt: "2026-11-07", auditor: "claude-sonnet-5-5", rules: 4, living: true,
    role: "Fixture subject", summary: "A fixture audit for the validator's rule tests.", wikipedia: null,
    sources: [
      { id: "s1", kind: "primary", evidence: "action", title: "Roll call on the bill", url: "https://example.org/roll-call" },
      { id: "s2", kind: "primary", evidence: "words", title: "2020 interview transcript", url: "https://example.org/interview" },
      { id: "s3", kind: "primary", evidence: "words", title: "2021 speech", url: "https://example.org/speech" },
      { id: "s4", kind: "primary", evidence: "action", title: "Second roll call", url: "https://example.org/roll-call-2" },
      { id: "s5", kind: "reference", evidence: "words", title: "A biography", url: "https://example.org/biography" },
    ],
    answers,
  };
}
// A later pass: two passes and, for nullings, a nulling review.
function laterPass(a, nulled = 0) {
  a.auditor = ["claude-sonnet-5-5", "claude-opus-5-5"];
  a.passes = [{ auditor: "claude-sonnet-5-5", auditedAt: "2026-11-01" }, { auditor: "claude-opus-5-5", auditedAt: "2026-11-07" }];
  if (nulled) a.reviews = [{ kind: "nulling", reviewer: "claude-opus-5-5", reviewedAt: "2026-11-07", nulled }];
  return a;
}
const version = (x, author, date) => ({ value: x.value, confidence: x.confidence, rationale: x.rationale, sources: x.sources, author, date });
// The current answer, recorded as the last talk-page entry.
function withHistory(a, id, earlier) {
  a.answers[id].reviewHistory = [...earlier, version(a.answers[id], "claude-opus-5-5", "2026-11-07")];
  return a;
}

function errorsFor(a, committed = null) {
  fs.writeFileSync(tmp, JSON.stringify(a, null, 2));
  setCommittedForTests(() => committed);
  return validate(subject.id).errors.filter((e) => !e.startsWith("uncertainty:"));
}
let n = 0;
function ok(name, a, committed) {
  const errs = errorsFor(a, committed);
  assert.deepStrictEqual(errs, [], `${name}: expected no errors, got:\n  ${errs.join("\n  ")}`);
  n++;
}
function fails(name, a, pattern, committed) {
  const errs = errorsFor(a, committed);
  assert(errs.some((e) => pattern.test(e)), `${name}: expected an error matching ${pattern}, got:\n  ${errs.join("\n  ") || "(none)"}`);
  n++;
}

// The fixture itself is valid.
ok("base fixture", base());

// Sources are tagged as the subject's actions or words.
{ const a = base(); delete a.sources[0].evidence; fails("untagged source", a, /"evidence" must be one of action, words/); }
{ const a = base(); a.sources[0].evidence = "deeds"; fails("unknown evidence tag", a, /"evidence" must be one of/); }

// Record over words: an answer never cites both kinds.
{ const a = base(); a.answers[A].sources = ["s1", "s2"]; fails("answer mixes action and words", a, /cites actions \(s1\) and words \(s2\)/); }
{ const a = base(); a.answers[A].sources = ["s1", "s4"]; ok("answer from two actions", a); }

// Silence isn't an answer: a nothing-found null cites nothing.
{ const a = base(); a.answers[C].sources = ["s2"]; fails("nothing-found null cites words", a, /a null found nothing, so it cites nothing/); }
{ const a = base(); a.answers[C].sources = ["s1"]; fails("nothing-found null cites an action", a, /null cites an action \(s1\)/); }

// A first audit has no talk page.
{ const a = withHistory(base(), A, [version({ value: -1, confidence: "low", rationale: "An earlier reading of the roll call.", sources: ["s1"] }, "claude-sonnet-5-5", "2026-11-01")]);
  fails("history in a first audit", a, /"reviewHistory" in a first audit/); }

// The talk page: at least 2 sourced versions, starting at the first answer, the last one the current answer.
const earlierA = version({ value: -1, confidence: "low", rationale: "An earlier reading of the roll call.", sources: ["s1"] }, "claude-sonnet-5-5", "2026-11-01");
ok("history with an earlier version", withHistory(laterPass(base()), A, [earlierA]));
{ const a = laterPass(base()); a.answers[A].reviewHistory = []; fails("empty history", a, /2 or more entries/); }
{ const a = laterPass(base()); a.answers[A].reviewHistory = [version(a.answers[A], "claude-opus-5-5", "2026-11-07")]; fails("one-entry history", a, /2 or more entries/); }
{ const a = withHistory(laterPass(base()), A, [{ ...earlierA, sources: [] }]); fails("unsourced version in history", a, /signed, sourced version/); }
{ const a = withHistory(laterPass(base()), A, [{ ...earlierA, author: undefined }]); fails("unsigned version in history", a, /signed, sourced version/); }
{ const a = withHistory(laterPass(base()), A, [version({ value: null, confidence: "low", rationale: "No recorded position found.", sources: ["s1"] }, "claude-sonnet-5-5", "2026-11-01")]);
  fails("history starting with a null", a, /starts at the first answer/); }
{ const a = withHistory(laterPass(base()), A, [earlierA]); a.answers[A].rationale = "A different current wording of the answer."; fails("last entry differs from the answer", a, /last reviewHistory entry is the current answer/); }

// Nullings: words never null an action; the reason cites its source; reviews count them.
function nulled(reasonSources) {
  const a = laterPass(base(), 1);
  const was = version(a.answers[A], "claude-sonnet-5-5", "2026-11-01");
  a.answers[A] = { value: null, confidence: "low", rationale: "The vote was on a different question than this statement.", sources: reasonSources };
  return withHistory(a, A, [was]);
}
ok("action nulled on an action (the vote itself)", nulled(["s1"]));
fails("action nulled on words", nulled(["s2"]), /words \(s2\) can't null an action \(s1\)/);
fails("nulling without a reason source", nulled([]), /signed, sourced version|a nulling cites the source behind its reason/);
{ const a = nulled(["s1"]); delete a.reviews; fails("nulling without a nulling review", a, /"reviews" count 0 nulled answer\(s\) but "reviewHistory" holds 1/); }
{ const a = nulled(["s1"]); a.reviews[0].nulled = 2; fails("nulling count mismatch", a, /"reviews" count 2 nulled answer\(s\) but "reviewHistory" holds 1/); }

// Reverts are allowed under the same rules: back on the same action passes, back on words fails.
function restored(sources, rationale) {
  const a = nulled(["s1"]);
  const x = a.answers[A];
  a.answers[A] = { value: 1, confidence: "medium", rationale, sources };
  a.answers[A].reviewHistory = [...x.reviewHistory, version(a.answers[A], "claude-opus-5-5", "2026-11-08")];
  return a;
}
ok("revert on the same action", restored(["s1"], "Voted for the bill that settles this statement directly, after all."));
ok("back on a new action", restored(["s4"], "Voted again for a later bill that settles this statement."));
fails("back on words after an action was nulled", restored(["s3"], "Said in a 2021 speech that he supports this statement."), /needs an action too/);

// Against the committed file: history is append-only, reviews too, and no sourced answer is edited away.
{ const committed = withHistory(laterPass(base()), A, [earlierA]);
  const a = JSON.parse(JSON.stringify(committed)); a.answers[A].reviewHistory[0].rationale = "Rewritten history.";
  fails("history entry rewritten", a, /"reviewHistory" was changed or shortened/, committed);
  const b = JSON.parse(JSON.stringify(committed)); delete b.answers[A].reviewHistory;
  fails("history dropped", b, /"reviewHistory" was changed or shortened/, committed); }
{ const committed = nulled(["s1"]); const a = JSON.parse(JSON.stringify(committed)); a.reviews = [];
  fails("nulling review dropped", a, /committed "nulling" review was changed or dropped/, committed); }
{ const committed = base(); const a = laterPass(base()); a.answers[B].value = -2; a.answers[B].rationale = "Changed by a later pass with no record kept.";
  fails("sourced answer changed without history", a, /changed without a talk-page record/, committed); }
{ const committed = base(); const a = laterPass(base()); delete a.answers[B];
  fails("sourced answer removed", a, /a sourced answer was removed/, committed); }
{ const committed = base(); const a = laterPass(base()); const was = version(a.answers[B], "claude-sonnet-5-5", "2026-11-01");
  a.answers[B] = { value: -2, confidence: "medium", rationale: "Said in a 2021 speech that this statement is badly wrong.", sources: ["s3"] };
  ok("sourced answer changed with its committed version kept", withHistory(a, B, [was]), committed); }
{ const committed = base(); const a = laterPass(base()); a.answers[C] = { value: 1, confidence: "medium", rationale: "Voted for the second bill, which settles this.", sources: ["s4"] };
  ok("nothing-found null replaced freely", a, committed); }

// ---- The rest of the people rules (audits/AUDIT_RULES.md, audits/PROMPT_PEOPLE.md) ----
const E = (a, f) => { f(a); return a; };
const warningsFor = (a) => { fs.writeFileSync(tmp, JSON.stringify(a, null, 2)); setCommittedForTests(() => null); return validate(subject.id).warnings; };
// Identity and required fields.
fails("id mismatch", E(base(), (a) => { a.id = "someone-else"; }), /"id" is 'someone-else'/);
for (const f of ["name", "auditedAt", "summary", "role"]) fails(`missing ${f}`, E(base(), (a) => { a[f] = ""; }), new RegExp(`"${f}" must be a non-empty string`));
fails("auditor missing", E(base(), (a) => { delete a.auditor; }), /"auditor" must be a model id/);
fails("auditor list empty", E(base(), (a) => { a.auditor = []; }), /"auditor" must be a model id/);
fails("passes malformed", E(laterPass(base()), (a) => { a.passes[1].auditedAt = "yesterday"; }), /"passes" must list every audit pass/);
fails("passes missing an auditor", E(laterPass(base()), (a) => { a.passes.pop(); }), /"passes" has no pass by claude-opus-5-5/);
fails("wikipedia not an article URL", E(base(), (a) => { a.wikipedia = "https://example.org/x"; }), /"wikipedia" must be an en\.wikipedia\.org article URL or null/);
ok("wikipedia article URL", E(base(), (a) => { a.wikipedia = "https://en.wikipedia.org/wiki/Example"; }));
// Sources.
fails("fewer than 3 sources", E(base(), (a) => { a.sources = a.sources.slice(0, 2); a.answers[A].sources = ["s1"]; }), /needs at least 3 sources, has 2/);
fails("duplicate source id", E(base(), (a) => { a.sources[2].id = "s1"; }), /duplicate source id s1/);
fails("unknown source kind", E(base(), (a) => { a.sources[2].kind = "blog"; }), /source s3: kind must be one of/);
fails("source url not http", E(base(), (a) => { a.sources[2].url = "ftp://example.org/x"; }), /source s3: url must be an http\(s\) URL/);
fails("political-quiz site", E(base(), (a) => { a.sources[2].url = "https://www.politicalcompass.org/x"; }), /political-quiz sites are not allowed/);
fails("source title missing", E(base(), (a) => { delete a.sources[2].title; }), /source s3: missing title/);
fails("Wikipedia as primary", E(base(), (a) => { a.sources[2].url = "https://en.wikipedia.org/wiki/Example"; }), /a Wikipedia article is a "reference" source/);
ok("no primary-source requirement (one rule for every subject, 2026-11-08)", E(base(), (a) => { for (const x of a.sources) x.kind = "reference"; }));
fails("no scholarly or reference source", E(base(), (a) => { a.sources[4].kind = "primary"; }), /needs at least one scholarly or reference source/);
fails("only Wikipedia sources", E(base(), (a) => { a.sources.forEach((x, i) => { x.kind = "reference"; x.url = `https://en.wikipedia.org/wiki/Page_${i}`; }); }), /Wikipedia cannot be the only kind of source/);
// Answers.
fails("active statement unanswered", E(base(), (a) => { delete a.answers[D]; }), new RegExp(`no answer for '${D}'`));
fails("null without a rationale", E(base(), (a) => { a.answers[C].rationale = ""; }), new RegExp(`${C}: say why there is no known position`));
fails("value out of range", E(base(), (a) => { a.answers[A].value = 3; }), /value must be an integer from -2 to 2 or null/);
fails("confidence not in the list", E(base(), (a) => { a.answers[A].confidence = "certain"; }), /confidence must be high, medium or low/);
fails("rationale too short", E(base(), (a) => { a.answers[A].rationale = "Voted yes."; }), /rationale missing or too short/);
fails("answer cites nothing", E(base(), (a) => { a.answers[A].sources = []; }), /cite at least one source/);
fails("answer cites an unknown source", E(base(), (a) => { a.answers[A].sources = ["s9"]; }), /unknown source 's9'/);
fails("high answers share one rationale", E(base(), (a) => { a.answers[A].confidence = "high"; a.answers[C] = { ...a.answers[A] }; }), /high-confidence answers share one rationale/);
fails("medium answer that calls itself contested", E(base(), (a) => { a.answers[A].rationale = "His record on this is contested among historians and writers."; }), /so the confidence is low/);
ok("'not contested' is not self-low", E(base(), (a) => { a.answers[A].rationale = "His vote here is not contested by anyone who studied it."; }));
fails("answer with no evidence", E(base(), (a) => { a.answers[A].rationale = "There is no record of his view, but the bill he voted for fits."; }), /no evidence of this position/);
{ const a = base(); a.living = false; a.answers[A].rationale = "No record of his view, but the bill he voted for fits."; fails("historical person's answer with no evidence (every subject)", a, /no evidence of this position/); }
fails("historical person: 'no record of' fails like anyone's (state the evidence)", E(base(), (a) => { a.living = false; a.answers[A].rationale = "Voted for the bill; there is no record of a later change of view."; }), /no evidence of this position/);
fails("high answer the sources don't address", E(base(), (a) => { a.answers[A].confidence = "high"; a.answers[A].rationale = "The sources do not address this, but the vote settles it."; }), /at most medium/);
fails("rules 2: unmarked inference", E(base(), (a) => { a.rules = 2; a.answers[A].confidence = "low"; a.answers[A].rationale = "By inference from the bill he voted for on this statement."; for (const x of a.sources) delete x.evidence; }), /an inferred answer's rationale begins "Inferred:"/);
fails("rules 3: no inferences at all", E(base(), (a) => { a.answers[A].confidence = "low"; a.answers[A].rationale = "Inferred: from the bill he voted for on this statement."; }), /rules 3 has no inferences/);
fails("answer resting only on Wikipedia", E(base(), (a) => { a.sources.push({ id: "s6", kind: "reference", evidence: "words", title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Example" }); a.answers[B].sources = ["s6"]; }), /Wikipedia is only a way to find evidence/);
fails("answer resting only on OnTheIssues", E(base(), (a) => { a.sources.push({ id: "s6", kind: "reference", evidence: "words", title: "OnTheIssues", url: "https://www.ontheissues.org/x.htm" }); a.answers[B].sources = ["s6"]; }), /OnTheIssues is only a way to find evidence/);
// Uncertainty: a thin audit fails the rule (filtered from the other cases, checked here).
{ fs.writeFileSync(tmp, JSON.stringify(base(), null, 2)); setCommittedForTests(() => null);
  assert(validate(subject.id).errors.some((e) => e.startsWith("uncertainty:")), "thin fixture: expected the uncertainty rule to fail"); n++; }
// Review history details.
fails("nulling review malformed", E(nulled(["s1"]), (a) => { a.reviews[0].reviewedAt = "today"; }), /a "nulling" review is/);
fails("history entry cites an unknown source", withHistory(laterPass(base()), A, [{ ...earlierA, sources: ["s9"] }]), /reviewHistory\[0\]: unknown source 's9'/);
// Warnings.
{ const w = warningsFor(E(base(), (a) => { const ids = st.slice(4, 4 + Math.ceil(st.length * 0.31)); for (const id of ids) a.answers[id] = { value: 0, confidence: "low", rationale: `Mixed record on this statement (${id}).`, sources: ["s1"] }; }));
  assert(w.some((x) => /neutral answers \(over 30%\)/.test(x)) && w.some((x) => /low-confidence answers \(over 50%\)/.test(x)) || w.some((x) => /neutral answers/.test(x)), `expected the neutral-answers warning, got ${w}`); n++; }

// Rules 5: every one of the person's own books in the local library is cited (a source with "library") or declined
// in "booksNotUsed" with a reason. A stand-in library: one reference book with their full name, one critic's book
// naming them, one Gutenberg book by them (catalog author "Surname, First, born-") and one by someone else.
{
  const parts = subject.name.split(/\s+/), surname = parts[parts.length - 1], first = parts[0];
  const own = `${subject.name} - My Memoir.txt`, critic = `The Case Against ${subject.name} - Someone Else.txt`;
  const surnameFirst = `${surname}, ${parts.slice(0, -1).join(" ")} - ${surname}, ${parts.slice(0, -1).join(" ")} - Essays (1990).txt`;
  const gut = `99999 ${surname} - Collected Speeches.txt`;
  setLibraryForTests({ reference: [own, critic, surnameFirst, "Unrelated Author - Another Book.txt"],
    gutenberg: [{ file: gut, authors: `${surname}, ${first}, ${subject.born || 1900}-` }, { file: "88888 Other - A Book.txt", authors: "Other, Person, 1800-1850" }] });
  const r5 = () => E(base(), (a) => { a.rules = 5; });
  const cite = (a, file, id) => { a.sources.push({ id, kind: "primary", evidence: "words", title: file, url: `https://example.org/${id}`, library: file }); };
  fails("rules 5: own book neither cited nor declined", r5(), new RegExp(`book in the local library not used: "${own.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  fails("rules 5: Gutenberg book by them not accounted for", r5(), /book in the local library not used: "99999 /);
  fails("rules 5: a 'Surname, First' library file is theirs too", r5(), new RegExp(`book in the local library not used: "${surname},`));
  ok("rules 5: every book cited or declined", E(r5(), (a) => { cite(a, own, "b1"); cite(a, gut, "b2"); cite(a, surnameFirst, "b3");
    a.booksNotUsed = [{ file: critic, reason: "A critic's polemic that only names them; not evidence of their views." }]; }));
  fails("rules 5: decline without a reason", E(r5(), (a) => { cite(a, own, "b1"); cite(a, gut, "b2"); cite(a, surnameFirst, "b3"); a.booksNotUsed = [{ file: critic, reason: "critic" }]; }), /"booksNotUsed" entries are/);
  ok("rules 4: no book check", base());
  setLibraryForTests(null);
}

// Rules 6: texts known to exist by them (Gutenberg catalog, Miller Center speeches, Voteview membership) are cited or
// declined, and a work the notes call unavailable is in "notFound" with two places tried (Brandon, 2026-11-12).
{
  setLibraryForTests({ reference: [], gutenberg: [] });
  const speech = "https://millercenter.org/the-presidency/presidential-speeches/fixture";
  setTextsForTests({ gutenberg: [{ id: "77777", title: "Collected Letters" }], miller: [{ url: speech, title: "Fixture Address" }], voteview: true });
  const r6 = (f) => E(base(), (a) => { a.rules = 6; if (f) f(a); });
  const all = (a) => { a.sources.push({ id: "g1", kind: "primary", evidence: "words", title: "Collected Letters", url: "https://www.gutenberg.org/ebooks/77777", usedFor: "letters" },
    { id: "m1", kind: "primary", evidence: "words", title: "Fixture Address", url: speech }, { id: "v1", kind: "primary", evidence: "action", title: "Roll calls (Voteview)", url: "https://voteview.com/person/1" }); };
  fails("rules 6: Gutenberg text by them not accounted for", r6(), /Project Gutenberg has 1 text by them not cited or declined: 77777/);
  fails("rules 6: Miller Center speech not accounted for", r6(), /1 Miller Center speech by them not cited or declined: Fixture Address/);
  fails("rules 6: Voteview member without roll calls", r6(), /Voteview lists them/);
  ok("rules 6: every known text cited", r6(all));
  ok("rules 6: known texts declined with reasons", r6((a) => { a.booksNotUsed = [
    { gutenberg: ["77777"], reason: "Private family letters with no political content at all." },
    { urls: [speech], reason: "A ceremonial address that takes no position on any statement." },
    { corpus: "voteview", reason: "Served one month in an era with no recorded roll calls by them." }]; }));
  fails("rules 6: notes call a work unavailable, no notFound", r6((a) => { all(a); a.notes = "His Senate speeches were not available, so many lines stay wide."; }), /notes call a source unavailable/);
  fails("rules 6: notFound with one place tried", r6((a) => { all(a); a.notes = "His Senate speeches were not available."; a.notFound = [{ work: "Senate speeches 1827-1836", tried: [{ where: "local corpora", how: "crec.js and voteview.js by name" }] }]; }), /1 place tried; try a second place/);
  ok("rules 6: notFound with two places tried", r6((a) => { all(a); a.notes = "His Senate speeches were not available."; a.notFound = [{ work: "Senate speeches 1827-1836", tried: [
    { where: "local corpora", how: "crec.js and voteview.js by name" }, { where: "Library of Congress, A Century of Lawmaking", how: "searched the Register of Debates index for him" }] }]; }));
  ok("rules 5: no rules-6 checks", E(base(), (a) => { a.rules = 5; }));
  fails("rules 7: a 0 on one source", r6((a) => { all(a); a.rules = 7; a.answers[C] = { value: 0, confidence: "low", rationale: "Pushed both ways on this in the one interview cited.", sources: ["s2"] }; }), /0 on fewer than two sources/);
  ok("rules 7: a 0 on two sources", r6((a) => { all(a); a.rules = 7; a.answers[C] = { value: 0, confidence: "low", rationale: "Voted for it in one roll call and against it in the second.", sources: ["s1", "s4"] }; }));
  setTextsForTests(null); setLibraryForTests(null);
}

// A later pass comes at least half the project's age after the previous one (from 2026-11-08; earlier passes stand).
{
  const two = (d1, d2) => E(base(), (a) => { a.auditor = ["claude-sonnet-5-5", "claude-opus-5-5"]; a.auditedAt = d2;
    a.passes = [{ auditor: "claude-sonnet-5-5", auditedAt: d1 }, { auditor: "claude-opus-5-5", auditedAt: d2 }]; });
  // 2026-11-12: the project is 29 days old, so the gap is 14.5 days, i.e. 15 whole days.
  fails("later pass two days after the previous one", two("2026-11-10", "2026-11-12"), /a later pass comes at least 15 days \(half the project's age\) after the previous one \(2026-11-10\)/);
  // A pass on 2026-11-10 (project 27 days old) allows the next from 2026-12-07 (gap 27 = half of 54).
  fails("later pass one day short of half the project's age", two("2026-11-10", "2026-12-06"), /at least 27 days/);
  { const a = two("2026-11-10", "2026-12-06"); a.passes[1].gapException = "Merged early as a rule test (Brandon, 2026-12-06)"; ok("early pass the maintainer merged with a recorded gapException", a); }
  ok("later pass at half the project's age", two("2026-11-10", "2026-12-07"));
  ok("close passes before the rule stand", two("2026-10-27", "2026-10-31"));
  assert.strictEqual(reauditGap("2026-11-07"), 12, "gap today: half of 24 days"); n++;
  assert.strictEqual(reauditGap("2026-11-13"), 15, "gap a week later: half of 30 days"); n++;
  assert.strictEqual(nextPassFrom({ passes: [{ auditedAt: "2026-11-10" }, { auditedAt: "2026-11-01" }] }), "2026-12-07", "next pass date from the latest pass"); n++;
  assert.strictEqual(nextPassFrom({ auditedAt: "2026-11-08" }), "2026-12-03", "next pass date from a single audit"); n++;
}

// Rules 3 has no inferences, so a rationale doesn't mention one, not even to deny it (Brandon, 2026-11-08).
{ const a = base(); a.answers[B].rationale = "His own stated rule rather than an inference from law enforcement."; fails("rationale denies an inference", a, /mentions inference; rules 3 has none/); }
{ const a = base(); a.answers[B].rationale = "Said so in a 2020 interview; not inferred."; fails("'not inferred' is no exception", a, /mentions inference/); }
{ const a = base(); a.answers[B].confidence = "high"; a.answers[B].rationale = "Said in a 2020 interview that this statement is wrong."; ok("rationale that states the evidence", a); }
{ const a = base(); a.rules = 2; a.answers[B].rationale = "Said so; not inferred."; fails("older audits: no 'not inferred' exception either", a, /so the confidence is low/); }

setCommittedForTests(null);
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
console.log(`validate rules: ${n} cases passed`);
