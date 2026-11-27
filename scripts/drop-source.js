#!/usr/bin/env node
// For auditors: take a source that can't be tied to the subject out of an audit's current answers (validate.js's
// "isn't tied to the ideology" error, once none of the three ties it names works). Brandon, 2026-11-23.
//   node scripts/drop-source.js <id> <source id> [--people] [--dir <folder>] [--none-fit] [--null-all]
// It first runs scripts/tie-source.js and, if that finds anything, shows it and stops; --none-fit goes on once the
// auditor has read what it found and none of it ties the source.
// For each current answer that cites it:
//   - other sources left: the source leaves "sources"; value and rationale stay as they are.
//   - it was the only source: the answer is nulled (a null cites nothing and carries no reason).
// Missing statements and key figures that rest on it alone go too.
// --null-all (scripts/cleanup.js dropFailing, before a lane session): every answer citing it is nulled and every
// missing statement citing it goes, other sources or not, for the session to research afresh (Brandon, 2026-11-27:
// kept on its other sources, an answer kept a value and rationale nothing checked those sources carry).
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
const NONE_FIT = args.includes("--none-fit"), NULL_ALL = args.includes("--null-all");
const [id, sid] = args.filter((a) => !["--people", "--none-fit", "--null-all"].includes(a));
if (!id || !sid) { console.error("usage: node scripts/drop-source.js <id> <source id> [--people] [--dir <folder>] [--none-fit] [--null-all]"); process.exit(1); }
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
    console.log(`\nNothing dropped. Read these first: if one ties ${sid}, add the tie as audits/PROMPT_IDEOLOGIES.md says. If none does, run again with --none-fit.`);
    process.exit(2);
  }
}
let kept = 0, nulled = 0;
const toRewrite = [];
for (const [k, x] of Object.entries(a.answers || {})) {
  if (!x || x.value === null || !(x.sources || []).includes(sid)) continue;
  const rest = NULL_ALL ? [] : x.sources.filter((s) => s !== sid);
  if (rest.length) x.sources = rest;
  else Object.assign(x, { value: null, sources: [], rationale: "" });
  if (rest.length) {
    kept++;
    const cited = rest.map((s) => a.sources.find((y) => y.id === s)).filter(Boolean);
    const left = namesLeft(x.rationale, src, cited);
    toRewrite.push(`  ${k}${left.length ? ` (names "${left.join('", "')}")` : ""}: ${x.rationale}`);
  } else nulled++;
}

// Missing statements and key figures rest on the subject's sources too (Brandon, 2026-11-26): the source leaves a
// missing statement's "sources", and the request goes once none are left; a key figure resting on it goes (key figures
// come from the defining sources, so one that cites an untied text isn't one). Aliases and key
// works aren't touched: one that cites the source is what ties it.
let requests = 0, figures = 0;
if (Array.isArray(a.missingStatements)) a.missingStatements = a.missingStatements.filter((m) => {
  if (!m || !Array.isArray(m.sources) || !m.sources.includes(sid)) return true;
  m.sources = NULL_ALL ? [] : m.sources.filter((x) => x !== sid);
  if (m.sources.length) return true;
  requests++; return false;
});
// A key figure with "evidence" loses the passages from the source and goes once none are left (validate.js then asks for
// a second passage if one is left).
if (Array.isArray(a.keyFigures)) a.keyFigures = a.keyFigures.filter((f) => {
  if (f && Array.isArray(f.evidence)) { f.evidence = f.evidence.filter((e) => !(e && e.source === sid)); return f.evidence.length > 0 || (figures++, false); }
  return !(f && f.source === sid) || (figures++, false);
});

// The source entry stays while anything cites it (a key figure's or alias's quote).
const citesIt = (o) => Array.isArray(o) ? o.some(citesIt) : o && typeof o === "object"
  ? Object.entries(o).some(([key, v]) => ((key === "sources" || key === "source" || key === "work") && [v].flat().includes(sid)) || citesIt(v)) : false;
const stillCited = citesIt({ ...a, sources: undefined });
if (!stillCited) a.sources = a.sources.filter((s) => s.id !== sid);

fs.writeFileSync(file, lib.formatAudit(a));
console.log(`${sid} (${src.title}) dropped from ${kept + nulled} answer(s) in ${path.relative(process.cwd(), file)}: ${kept} kept on their other sources, ${nulled} nulled; ${stillCited ? "the source stays listed for what still cites it" : "nothing cites it now, so it is no longer listed"}`);
// During a lane session the answers not being worked on are kept aside in <dir>/.settled/<id>.json (scripts/lane.js),
// so the file above shows only part of what cites the source (2026-11-26: two scope sessions dropped sources that 58
// and 79 kept-aside answers cited, after this script reported "dropped from 0 answer(s)").
if (DIR) {
  let aside = {};
  try { aside = JSON.parse(fs.readFileSync(path.resolve(DIR, ".settled", `${id}.json`), "utf8")); } catch {}
  const cite = Object.values(aside).filter((x) => x && x.value !== null && (x.sources || []).includes(sid));
  const alone = cite.filter((x) => x.sources.length === 1).length;
  if (cite.length) console.log(`${cite.length} more answer(s) cite ${sid}: they are kept aside while you work, and lose it when they come back (${alone} rest on it alone and become null)`);
}
if (requests || figures) console.log(`also dropped: ${requests} missing statement(s) and ${figures} key figure(s) that rested on ${sid} alone`);
const others = ["aliases", "keyFigures", "keyWorks"].filter((k) => citesIt(a[k]));
if (others.length) console.log(`still cited in ${others.join(", ")}: take out the entries that rest on ${sid}`);
if (toRewrite.length) console.log(`Rewrite these rationales from the sources each answer still cites, without ${sid}'s claims (and change the value if it rested on them):\n${toRewrite.join("\n")}`);
