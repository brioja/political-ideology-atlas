// The web phase of an audit (Brandon, 2026-11-26). An audit's answers come in two phases after an ideology's scope
// phase: first from local texts only (the corpora, the maintainer's library, downloaded books; .claude/hooks/local-only.js
// refuses web searches and fetches in Claude lanes), then a fresh session searches the web for what is still open.
// This script hands the web phase only the open statements and merges its answers back:
//   - an ideology's open statements are those with no answer (null or missing); every answer stays as the local phase
//     left it;
//   - a person's are those plus every answer that cites no `action` source (words only, or untagged): a record found on
//     the web replaces their words (audits/AUDIT_RULES.md, "Record over words"), so the merge takes the web answer for
//     such a statement only when it cites an action source; nulls take whatever the web phase found.
//   node scripts/phases.js strip  <draft.json> <web.json> [--people]   writes the web phase's draft, prints the open count
//   node scripts/phases.js merge  <draft.json> <web.json> [--people]   writes the merged audit over <draft.json>
// The web phase's draft keeps everything but the settled answers (sources, so new ones continue the ids; scope, key
// figures). The merge takes the web draft as the base (its sources, notes, passes) with the local phase's answers.
const fs = require("fs");
const lib = require("./lib");

const actionIds = (audit) => new Set((audit.sources || []).filter((s) => s.evidence === "action").map((s) => s.id));
const citesAction = (ans, actions) => (ans.sources || []).some((s) => actions.has(s));
const known = (ans) => ans && ans.value !== null && ans.value !== undefined;

// Statement ids the web phase gets: unanswered, and for a person answers without a record.
function open(audit, people) {
  const actions = actionIds(audit), answers = audit.answers || {};
  return lib.allStatements().map((s) => s.id).filter((id) => !known(answers[id]) || (people && !citesAction(answers[id], actions)));
}

function strip(audit, people) {
  const ids = open(audit, people), answers = audit.answers || {};
  const web = { ...audit, answers: {} };
  // A statement with no entry at all (added since the audit, or skipped) gets an empty one, so the web phase sees it.
  for (const id of ids) web.answers[id] = answers[id] || { value: null, sources: [], rationale: "" };
  return { web, ids };
}

// The local phase's answers, with the web phase's taken where the rules above allow. Returns the audit and counts.
function merge(local, web, people) {
  const ids = new Set(open(local, people)), actions = actionIds(web);
  const answers = { ...(local.answers || {}) }, taken = [], kept = [], ignored = [];
  for (const [id, ans] of Object.entries(web.answers || {})) {
    if (!ids.has(id)) { ignored.push(id); continue; }
    const before = local.answers && local.answers[id];
    if (!known(before) || citesAction(ans, actions)) { answers[id] = ans; if (JSON.stringify(ans) !== JSON.stringify(before)) taken.push(id); }
    else kept.push(id);
  }
  return { audit: { ...web, answers }, taken, kept, ignored };
}

// Before a later pass (Brandon, 2026-11-26): answers lose their Wikipedia citations, which validate.js refuses
// (Wikipedia is a tertiary source, audits/AUDIT_RULES.md section 2) and only a new source can fix. An answer with other
// sources keeps its value on them; one with none left is nulled, so the phases research it like any open statement.
// Missing statements are treated the same way (Brandon, 2026-11-26), since a request added to the candidate bank seeds
// that statement's answer: a request loses its Wikipedia citations and is dropped when none of its sources is left.
// The source entries stay (an alias or a key figure may cite them); the final cleanup drops unused ones.
const isWikipedia = (u) => { try { return /(^|\.)wikipedia\.org$/.test(new URL(u).host); } catch { return false; } };
function dropWikipedia(audit) {
  const wiki = new Set((audit.sources || []).filter((s) => isWikipedia(s.url)).map((s) => s.id));
  let kept = 0, nulled = 0;
  for (const ans of Object.values(audit.answers || {})) {
    if (!known(ans) || !(ans.sources || []).some((s) => wiki.has(s))) continue;
    const rest = ans.sources.filter((s) => !wiki.has(s));
    if (rest.length) { ans.sources = rest; kept++; }
    else { Object.assign(ans, { value: null, sources: [], rationale: "" }); nulled++; }
  }
  let requests = 0;
  if (Array.isArray(audit.missingStatements)) {
    audit.missingStatements = audit.missingStatements.filter((m) => {
      if (!(m.sources || []).some((s) => wiki.has(s))) return true;
      m.sources = m.sources.filter((s) => !wiki.has(s));
      if (m.sources.length) return true;
      requests++; return false;
    });
  }
  return { kept, nulled, requests };
}

module.exports = { open, strip, merge, dropWikipedia };

if (require.main === module) {
  const [cmd, draftFile, webFile] = process.argv.slice(2), people = process.argv.includes("--people");
  if (!["strip", "merge"].includes(cmd) || !draftFile || !webFile) {
    console.error("usage: node scripts/phases.js strip|merge <draft.json> <web.json> [--people]"); process.exit(1);
  }
  const local = JSON.parse(fs.readFileSync(draftFile, "utf8"));
  if (cmd === "strip") {
    const { web, ids } = strip(local, people);
    fs.writeFileSync(webFile, lib.formatAudit(web));
    console.log(`${ids.length} open statement(s) written to ${webFile}`);
  } else {
    const { audit, taken, kept, ignored } = merge(local, JSON.parse(fs.readFileSync(webFile, "utf8")), people);
    fs.writeFileSync(draftFile, lib.formatAudit(audit));
    console.log(`merged: ${taken.length} answer(s) from the web phase; ${kept.length} kept from words (no record found); ${ignored.length} settled answer(s) ignored`);
  }
}
