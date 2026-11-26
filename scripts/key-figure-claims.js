#!/usr/bin/env node
// Key figure claims (audits/key-figure-claims.json; Brandon, 2026-11-26). A person is one ideology's key figure (the
// first audit to list them keeps them, scripts/coatrack-check.js). When a pass's defining sources present its ideology
// as the thought of someone another ideology lists, the pass records them in its draft's "keyFigureClaims" (checked by
// coatrack-check.js) and the lane driver moves them here when it integrates the audit (integrate below). The holder's
// next pass is warned and decides: it keeps the person, or drops them and the claimant's next pass lists them. A
// claim leaves the file when the claimant lists the person, or when the holder's next pass keeps them.
//
//   node scripts/key-figure-claims.js        list the open claims
"use strict";
const fs = require("fs");
const C = require("./coatrack-check");

const read = () => { try { return JSON.parse(fs.readFileSync(C.CLAIMS_FILE, "utf8")); } catch { return { claims: [] }; } };
const write = (j) => fs.writeFileSync(C.CLAIMS_FILE, JSON.stringify(j, null, 2) + "\n");
const who = (c) => C.entryName(c);
const lists = (a, c) => (Array.isArray(a.keyFigures) ? a.keyFigures : []).some((x) => C.samePerson(x, who(c)));

// Moves the draft's claims into the file and settles the claims this audit decides. `audit` is the draft, changed
// in place (its "keyFigureClaims" go). Returns lines for the log and the commit message, and whether the file changed.
function integrate(id, audit, today = new Date().toISOString().slice(0, 10)) {
  const j = read(), before = JSON.stringify(j), notes = [];
  const made = Array.isArray(audit.keyFigureClaims) ? audit.keyFigureClaims : [];
  delete audit.keyFigureClaims;
  for (const c of made) {
    // Each quote with its source's title and URL, so the claim reads on its own if the source later leaves the audit.
    const evidence = (c.evidence || []).map((e) => { const src = (audit.sources || []).find((s) => s.id === e.source) || {};
      return { title: src.title, url: src.url, quote: e.quote }; });
    const entry = { first: c.first, last: c.last, role: c.role, wikipedia: c.wikipedia, claimedBy: id, heldBy: c.heldBy, evidence, date: today };
    j.claims = j.claims.filter((o) => !(o.claimedBy === id && o.heldBy === c.heldBy && C.samePerson(o, who(c))));
    j.claims.push(entry);
    notes.push(`claims ${who(c)}, a key figure of ${c.heldBy}`);
  }
  j.claims = j.claims.filter((c) => {
    if (c.claimedBy === id && lists(audit, c)) { notes.push(`lists ${who(c)}, claimed from ${c.heldBy}`); return false; }
    // The holder's pass decided only if it began after the claim was made (it was warned of it).
    if (c.heldBy === id && c.date < audit.auditedAt && lists(audit, c)) { notes.push(`keeps ${who(c)}, claimed by ${c.claimedBy}`); return false; }
    if (c.heldBy === id && c.date < audit.auditedAt && !c.freed) { c.freed = today; notes.push(`drops ${who(c)}, claimed by ${c.claimedBy}`); }
    return true;
  });
  const changed = JSON.stringify(j) !== before;
  if (changed) write(j);
  return { notes, changed };
}

if (require.main === module) {
  const { claims } = read();
  if (!claims.length) console.log("no open key figure claims");
  for (const c of claims) console.log(`${who(c)}: claimed by ${c.claimedBy} (${c.date}) from ${c.heldBy}${c.freed ? `, which dropped them ${c.freed}: free to list` : ""}${(c.evidence || []).map((e) => `\n  "${e.quote}" (${e.title})`).join("")}`);
}

module.exports = { integrate };
