#!/usr/bin/env node
// For auditors: take a source that can't be tied to the subject out of an audit's current answers (validate.js's
// "isn't tied to the ideology" error, once none of the three ties it names works). Brandon, 2026-11-23.
//   node scripts/drop-source.js <id> <source id> [--people] [--dir <folder>] [--none-fit]
// It first runs scripts/tie-source.js and, if that finds anything, shows it and stops; --none-fit goes on once the
// auditor has read what it found and none of it ties the source.
// For each current answer that cites it:
//   - other sources left: the source leaves "sources"; value and rationale stay as they are.
//   - it was the only source: the answer is nulled (a null cites nothing), its rationale giving the reason.
// Missing statements and key figures that rest on it alone go too.
// The source goes from "sources" once nothing cites it; git keeps the earlier versions. Its claims are what the
// script can't remove: it lists every rationale that still names it, to rewrite from the sources the answer cites
// (validate.js errors on one left word for word).
"use strict";
const fs = require("fs");
const path = require("path");
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
const passes = Array.isArray(a.passes) ? a.passes : [];
const laterPass = passes.length > 1;
const subject = PEOPLE ? "the person" : "the ideology";

let kept = 0, nulled = 0;
const toRewrite = [];
for (const [k, x] of Object.entries(a.answers || {})) {
  if (!x || x.value === null || !(x.sources || []).includes(sid)) continue;
  const rest = x.sources.filter((s) => s !== sid);
  if (rest.length) x.sources = rest;
  else Object.assign(x, { value: null, sources: [],
    rationale: laterPass ? `Nulled: its only source, ${src.title}, isn't tied to ${subject}.` : `No source tied to ${subject} states a position on this.` });
  if (rest.length) {
    kept++;
    const cited = rest.map((s) => a.sources.find((y) => y.id === s)).filter(Boolean);
    const left = namesLeft(x.rationale, src, cited);
    toRewrite.push(`  ${k}${left.length ? ` (names "${left.join('", "')}")` : ""}: ${x.rationale}`);
  } else nulled++;
}

// Missing statements and key figures rest on the subject's sources too (Brandon, 2026-11-26): the source leaves a
// missing statement's "sources", and the request goes once none are left; a key figure resting on it goes (key figures
// come from the defining sources, so after the scope phase one that cites an untied text isn't one). Aliases and key
// works aren't touched: one that cites the source is what ties it.
let requests = 0, figures = 0;
if (Array.isArray(a.missingStatements)) a.missingStatements = a.missingStatements.filter((m) => {
  if (!m || !Array.isArray(m.sources) || !m.sources.includes(sid)) return true;
  m.sources = m.sources.filter((x) => x !== sid);
  if (m.sources.length) return true;
  requests++; return false;
});
if (Array.isArray(a.keyFigures)) a.keyFigures = a.keyFigures.filter((f) => !(f && f.source === sid) || (figures++, false));

// The source entry stays while anything cites it (a key figure's or alias's quote).
const citesIt = (o) => Array.isArray(o) ? o.some(citesIt) : o && typeof o === "object"
  ? Object.entries(o).some(([key, v]) => ((key === "sources" || key === "source" || key === "work") && [v].flat().includes(sid)) || citesIt(v)) : false;
const stillCited = citesIt({ ...a, sources: undefined });
if (!stillCited) a.sources = a.sources.filter((s) => s.id !== sid);

fs.writeFileSync(file, lib.formatAudit(a));
console.log(`${sid} (${src.title}) dropped from ${kept + nulled} answer(s) in ${path.relative(process.cwd(), file)}: ${kept} kept on their other sources, ${nulled} nulled; ${stillCited ? "the source stays listed for what still cites it" : "nothing cites it now, so it is no longer listed"}`);
if (requests || figures) console.log(`also dropped: ${requests} missing statement(s) and ${figures} key figure(s) that rested on ${sid} alone`);
const others = ["aliases", "keyFigures", "keyWorks"].filter((k) => citesIt(a[k]));
if (others.length) console.log(`still cited in ${others.join(", ")}: take out the entries that rest on ${sid}`);
if (toRewrite.length) console.log(`Rewrite these rationales from the sources each answer still cites, without ${sid}'s claims (and change the value if it rested on them):\n${toRewrite.join("\n")}`);
