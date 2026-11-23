#!/usr/bin/env node
// For auditors: take a source that can't be tied to the subject out of an audit's current answers (validate.js's
// "isn't tied to the ideology" error, once none of the three ties it names works). Brandon, 2026-11-23.
//   node scripts/drop-source.js <id> <source id> [--people] [--dir <folder>] [--none-fit]
// It first runs scripts/tie-source.js and, if that finds anything, shows it and stops; --none-fit goes on once the
// auditor has read what it found and none of it ties the source.
// For each current answer that cites it:
//   - other sources left: the source leaves "sources"; value, confidence and rationale stay as they are.
//   - it was the only source: the answer is nulled, citing it in the nulling's reviewHistory entry, and the pass's
//     "nulling" review counts it.
// In a later pass each change is a reviewHistory reply signed by the pass (the last "passes" entry); a version this
// pass already wrote is amended in place instead. The source stays listed while a history entry cites it, and goes
// when nothing does. Its claims are what the script can't remove: it lists every rationale that still names it, to
// rewrite from the sources the answer cites (validate.js errors on one left word for word).
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const lib = require("./lib");
const { namesLeft } = require("./coatrack-check");

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i > -1 ? args.splice(i, 2)[1] : null; };
const DIR = opt("--dir");
const PEOPLE = args.includes("--people");
const NONE_FIT = args.includes("--none-fit");
const [id, sid] = args.filter((a) => a !== "--people" && a !== "--none-fit");
if (!id || !sid) { console.error("usage: node scripts/drop-source.js <id> <source id> [--people] [--dir <folder>] [--none-fit]"); process.exit(1); }
const file = DIR ? path.resolve(DIR, `${id}.json`) : (PEOPLE ? lib.personPath : lib.profilePath)(id);
const text = fs.readFileSync(file, "utf8"), a = JSON.parse(text);
const src = (a.sources || []).find((s) => s.id === sid);
if (!src) { console.error(`${id} has no source ${sid}`); process.exit(1); }
// First the search for a tie (scripts/tie-source.js): what it finds is shown, and nothing is dropped until the auditor
// has read it and found none fits.
if (!NONE_FIT) {
  const tie = require("./tie-source");
  const r = tie.findTies(id, sid, { people: PEOPLE, dir: DIR });
  if (tie.candidates(r)) {
    console.log(tie.report(r, sid));
    console.log(`\nNothing dropped. Read these first: if one ties ${sid}, add the tie as audits/PROMPT.md says. If none does, run again with --none-fit.`);
    process.exit(2);
  }
}
const indent = (text.match(/^\{\n([ \t]+)"/) || [, 2])[1];

const passes = Array.isArray(a.passes) ? a.passes : [];
const pass = passes[passes.length - 1];
const laterPass = passes.length > 1 || (a.reviews || []).some((r) => r && r.kind === "nulling");
if (laterPass && !(pass && pass.auditor && pass.auditedAt)) { console.error('a later pass signs its changes: the last "passes" entry needs "auditor" and "auditedAt"'); process.exit(1); }
const sign = laterPass ? { author: pass.auditor, date: pass.auditedAt } : null;
const subject = PEOPLE ? "the person" : "the ideology";

// Who wrote a version with no history yet: the pass of the first commit whose copy of the audit has its rationale
// (that version was never replaced, so it is the original). Falls back to the first pass.
const rel = path.relative(lib.ROOT, (PEOPLE ? lib.personPath : lib.profilePath)(id));
function writtenBy(rationale) {
  const git = (...g) => { try { return cp.execFileSync("git", g, { cwd: lib.ROOT, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 }).toString(); } catch { return ""; } };
  const first = git("log", "--reverse", "--format=%H", "-S", rationale, "--", rel).split("\n")[0];
  let p = null;
  if (first) { try { const old = JSON.parse(git("show", `${first}:${rel}`)); p = (old.passes || []).slice(-1)[0] || (old.auditor && { auditor: [].concat(old.auditor).slice(-1)[0], auditedAt: old.auditedAt }); } catch {} }
  p = p && p.auditor ? p : passes[0];
  return { author: p.auditor, date: p.auditedAt };
}
const version = (x) => ({ value: x.value, confidence: x.confidence, rationale: x.rationale, sources: [...(x.sources || [])] });
const signed = (e) => !!sign && e.author === sign.author && e.date === sign.date;

let kept = 0, nulled = 0;
const toRewrite = [];
for (const [k, x] of Object.entries(a.answers || {})) {
  if (!x || x.value === null || !(x.sources || []).includes(sid)) continue;
  const rest = x.sources.filter((s) => s !== sid);
  const next = rest.length ? { ...version(x), sources: rest }
    : { value: null, confidence: "low", rationale: `Nulled: its only source, ${sid} (${src.title}), isn't tied to ${subject}.`, sources: [sid] };
  if (!laterPass) {
    // A first audit is the original text: no history. A null with nothing left found nothing, so it cites nothing.
    Object.assign(x, rest.length ? next : { ...next, rationale: `No source tied to ${subject} states a position on this.`, sources: [] });
  } else {
    let h = Array.isArray(x.reviewHistory) ? x.reviewHistory.slice() : [{ ...version(x), ...writtenBy(x.rationale) }];
    if (signed(h[h.length - 1])) h[h.length - 1] = { ...next, ...sign }; else h.push({ ...next, ...sign });
    // An amended version that now repeats the one before it isn't a reply: it goes.
    const same = (p, q) => JSON.stringify(version(p)) === JSON.stringify(version(q));
    if (h.length > 1 && same(h[h.length - 1], h[h.length - 2])) h.pop();
    const cur = h[h.length - 1];
    for (const f of ["value", "confidence", "rationale"]) x[f] = cur[f];
    x.sources = cur.value === null ? [] : [...cur.sources];
    if (h.length > 1) x.reviewHistory = h; else delete x.reviewHistory;
  }
  if (rest.length) {
    kept++;
    const cited = rest.map((s) => a.sources.find((y) => y.id === s)).filter(Boolean);
    const left = namesLeft(x.rationale, src, cited);
    toRewrite.push(`  ${k}${left.length ? ` (names "${left.join('", "')}")` : ""}: ${x.rationale}`);
  } else nulled++;
}

// The nulling review counts the nullings in the history, recounted for this pass's signature.
if (laterPass) {
  let n = 0;
  for (const x of Object.values(a.answers || {})) {
    const h = Array.isArray(x.reviewHistory) ? x.reviewHistory : [];
    for (let i = 1; i < h.length; i++) if (h[i - 1].value !== null && h[i].value === null && signed(h[i])) n++;
  }
  a.reviews = (Array.isArray(a.reviews) ? a.reviews : []).filter((r) => !(r && r.kind === "nulling" && r.reviewer === sign.author && r.reviewedAt === sign.date));
  if (n) a.reviews.push({ kind: "nulling", reviewer: sign.author, reviewedAt: sign.date, nulled: n });
  if (!a.reviews.length) delete a.reviews;
}
// The source entry stays while anything cites it (a history entry, a key figure's or alias's quote).
const citesIt = (o) => Array.isArray(o) ? o.some(citesIt) : o && typeof o === "object"
  ? Object.entries(o).some(([key, v]) => ((key === "sources" || key === "source" || key === "work") && [v].flat().includes(sid)) || citesIt(v)) : false;
const stillCited = citesIt({ ...a, sources: undefined });
if (!stillCited) a.sources = a.sources.filter((s) => s.id !== sid);

fs.writeFileSync(file, JSON.stringify(a, null, indent) + (text.endsWith("\n") ? "\n" : ""));
console.log(`${sid} (${src.title}) dropped from ${kept + nulled} answer(s) in ${path.relative(process.cwd(), file)}: ${kept} kept on their other sources, ${nulled} nulled; ${stillCited ? "the source stays listed for the history that cites it" : "nothing cites it now, so it is no longer listed"}`);
const others = ["aliases", "keyFigures", "keyWorks"].filter((k) => citesIt(a[k]));
if (others.length) console.log(`still cited in ${others.join(", ")}: take out the entries that rest on ${sid}`);
if (toRewrite.length) console.log(`Rewrite these rationales from the sources each answer still cites, without ${sid}'s claims (and change the value or confidence if they rested on it):\n${toRewrite.join("\n")}`);
