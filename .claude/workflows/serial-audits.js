export const meta = {
  name: 'serial-audits',
  description: 'Audit the most-viewed pending ideologies one at a time, each in a fresh agent that records its missing statements (bank frozen) and deploys',
  whenToUse: 'The serial audit loop without a long-running session. Optional args: {"limit": N} audits this run (default 10), {"model": "sonnet"} for the audit agents',
  phases: [
    { title: 'Audit', detail: 'one fresh agent per ideology: audit, record missing statements, commit, build, test, push' },
    { title: 'Signal', detail: 'promote candidates with signal on the real lines, demote active statements without it' },
  ],
}

const ROOT = '/home/brioja/work/political_ideology_test'
const opts = args || {}
const LIMIT = opts.limit || 10
const model = opts.model ? { model: opts.model } : {}

const TICK = {
  type: 'object',
  properties: {
    done: { type: 'boolean', description: 'true if next.js printed null (no ideology left)' },
    report: { type: 'string', description: 'one line: name, validator result, stated positions, number of missingStatements, deployed or not' },
    deployed: { type: 'boolean' },
  },
  required: ['done', 'report', 'deployed'],
}

const tickPrompt = `You do one step of a serial ideology audit. Working directory: ${ROOT}. Today's date is the auditedAt date.

1. Run \`node scripts/next.js --ideologies\`. If it prints null, reply with done=true and do nothing else.
2. Audit that ideology yourself. Read audits/PROMPT.md and follow it exactly: answer every statement in statements.json
   (including "status": "candidate" ones), confirm or correct the suggested wikipedia link, 2-4 furtherReading, follow any
   scopeNote, list missingStatements. Start from the source library the statement pass built, if there is one:
   scratchpad/sources/<id>/index.json and scratchpad/statement-pass/<id>.json (its "notes" say which files matter); read
   those files first and download only what they lack. Use WebSearch/WebFetch (load them with ToolSearch if deferred); cite only pages you
   opened. Audits run one at a time, so there is no limit on sources: research until the record is covered, choosing each
   new source to cover statement areas still unsupported rather than another overview. Prefer open-access sources (SEP/IEP,
   marxists.org, Gutenberg, party sites); Britannica blocks access. Check the local corpora too
   (~/.cache/political-ideology-atlas/corpora/: Marxists, Gutenberg, parliamentary records). Save every source you download beyond the library into scratchpad/sources/<id>/ and add it to its
   index.json (create both if missing), so later passes read local files instead of fetching again:
   a plain-text extract (.txt, the copy you search and read) plus the original, gzipped if it is HTML (.html.gz). Extract a PDF
   with pdftotext (it keeps page breaks for page citations) and keep the PDF only if it yields no text (a scan). List both files in index.json.
   Wikipedia-style neutral standard. Write audits/profiles/<id>.json and run \`node scripts/validate.js <id>\`; fix every error
   except the uncertainty rule.
   If it fails the uncertainty rule (exit code 2), keep researching before you commit: search the lines and themes the
   validator names, and the statements still null, in new sources. Stop when they are covered or when the record really has
   nothing more, and say in "notes" which themes you searched. Exit code 2 after that is an honest result: never raise a
   confidence to pass it.
   Then add an entry for the ideology to audits/ideology-colors.json if it has none, following CONTRIBUTING.md
   "Ideology colors": a documented color tradition where one exists (cite it in "source"), otherwise a best guess from its
   imagery with "basis": "guess", a note starting "guess: " and "verified": false; never only grey, black or white. Copy the
   format of the neighbouring entries and keep the file's indentation.
3. The statement bank is FROZEN (Brandon, 2026-11-04): do NOT edit statements.json. Leave each missingStatements entry
   unhandled (no "addedAs", no "declined"); missing statements are reviewed later, outside this run.
4. \`git add\` only the audit file and audits/ideology-colors.json; commit as "Audit <name>". Commits carry only the repo
   owner's name: add no Co-Authored-By or other attribution line.
5. Run \`node scripts/build.js\` and \`node test.js\`. If tests pass, commit any changed data.js, people.js, audits/lines.json and
   audits/statements/texts.json as "Rebuild site data" (no attribution line) and \`git push\`. If they fail, do not push;
   say why in the report.
Do not touch scripts/candidates.js or any other repo file (scratchpad/ is fine).`

// After the audits: promote candidates that now carry signal on the real lines and demote active
// statements that lost it (test 2, audits/statements/STANDARD.md; Brandon, 2026-11-05). CPU only.
const SIGNAL_PROMPT = `Working directory: ${ROOT}.
1. Run \`node scripts/statement-signal.js --apply\` (several minutes; run it in the background if needed). It edits
   statements.json and prints what it promoted and demoted. If both are "none", reply with that and stop.
2. Run \`node scripts/build.js\` and \`node test.js\`. If tests pass, \`git add\` statements.json data.js people.js
   audits/lines.json audits/statements/texts.json (those that changed), commit as "Statements: promote/demote by signal
   on the real lines" listing the ids in the message (no Co-Authored-By or other attribution line), \`git pull --rebase\`
   and \`git push\`. If tests fail, run \`git checkout statements.json data.js people.js audits/lines.json\` and say why.
Touch no other file. Reply in one line: promoted ids, demoted ids, deployed or not.`

const reports = []
let ended = `limit of ${LIMIT} reached`
for (let i = 0; i < LIMIT; i++) {
  phase('Audit')
  const r = await agent(tickPrompt, { label: `tick-${i + 1}`, phase: 'Audit', schema: TICK, ...model })
  if (!r) { ended = 'a tick failed; check git status before rerunning'; break }
  if (r.done) { ended = 'no ideologies left'; break }
  reports.push(r.report)
  log(r.report)
}

phase('Signal')
reports.push(`signal: ${await agent(SIGNAL_PROMPT, { label: 'signal', phase: 'Signal', effort: 'low' })}`)

return { reports, ended }
