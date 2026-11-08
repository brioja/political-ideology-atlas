export const meta = {
  name: 'serial-audits',
  description: 'Audit the next pending person or ideology (whichever kind has fewer live on the site; people most likely to pass first, ideologies most viewed first) one at a time, each in a fresh agent, and deploy',
  whenToUse: 'The serial audit loop without a long-running session. Optional args: {"limit": N} audits this run (default 10), {"model": "sonnet"} for the audit agents, {"kind": "people" | "ideologies"} to take only that kind (two runs at once must split the kinds and use separate checkouts), {"root": "<checkout>"} (default the main checkout), {"skip": ["id", ...]} to pass over entries (e.g. people waiting for books)',
  phases: [
    { title: 'Books', detail: 'people runs: fetch public-domain books for the next 3x people, list the rest in ~/work/books-wanted.md, refit triage on books on disk' },
    { title: 'Audit', detail: 'one fresh agent per person or ideology: audit, commit, build, test, push' },
    { title: 'Triage', detail: 'refit the people triage on the new results (people runs)' },
    { title: 'Signal', detail: 'promote candidates with signal on the real lines, demote active statements without it' },
  ],
}

const opts = args || {}
// Two serial runs may run at once only if they split the kinds (kind: people / ideologies) and each has its
// own checkout (root), e.g. a git worktree for the ideology run (Brandon, 2026-11-06).
const ROOT = opts.root || '/home/brioja/work/political_ideology_test'
const KIND = (opts.kind === 'people' ? ' --people' : opts.kind === 'ideologies' ? ' --ideologies' : '')
  + (opts.skip && opts.skip.length ? ` --skip ${opts.skip.join(',')}` : '')
const LIMIT = opts.limit || 10
const model = opts.model ? { model: opts.model } : {}

const TICK = {
  type: 'object',
  properties: {
    done: { type: 'boolean', description: 'true if next.js printed null (no ideology left)' },
    report: { type: 'string', description: 'one line: kind and name, validator result, stated positions, number of missingStatements (ideologies), deployed or not' },
    deployed: { type: 'boolean' },
  },
  required: ['done', 'report', 'deployed'],
}

const tickPrompt = `You do one step of a serial audit. Working directory: ${ROOT}. Today's date is the auditedAt date.

1. Run \`node scripts/next.js${KIND}\`. It prints the next entry as JSON with "kind": "ideology" or "person". If it prints null, reply with done=true and do nothing else.
   If an audit file for it already exists (audits/people/<id>.json or audits/profiles/<id>.json), it failed validation,
   or (when the JSON has a "reason") it gets search traffic and predates the shared rules, so this pass brings it up to them
   ("rules" set to the current version, every answer checked against audits/AUDIT_RULES.md). Either way,
   build on it as a later pass (audits/AUDIT_RULES.md section 6), never overwrite it from scratch. Use a model not yet in its
   "auditor", add yours to "auditor" and "passes", and keep every committed sourced answer you change in that statement's
   "reviewHistory" (scripts/validate.js explains it); validate.js checks this against the committed file.
   If "kind" is "person": audit that person yourself following audits/AUDIT_RULES.md and audits/PROMPT_PEOPLE.md exactly
   (answer every statement, candidates included; no source limit; research to the end within the audit, since no later pass fills gaps; local corpora first; save every
   source in scratchpad/sources/<id>/; YouTube at most 5 requests). Write audits/people/<id>.json, run
   \`node scripts/validate.js --people <id>\` and fix every error except the uncertainty rule (never raise a confidence to pass
   it). \`git add\` only that file and commit as "Audit <name>" (no Co-Authored-By or other attribution line), then
   DEPLOY (below) with \`node scripts/images.js && node scripts/build.js --people\` and \`node test.js --people\` (images.js
   looks up the photo of anyone added since its last run), committing people.js, img/ and audits/people-catalog.json as
   "Rebuild people data". Then skip to the end (steps 2-5 are for ideologies).
2. If "kind" is "ideology": audit that ideology yourself. Read audits/PROMPT.md and follow it exactly: answer every statement in statements.json
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
5. DEPLOY (below) with \`node scripts/build.js\` and \`node test.js\`, committing any changed data.js, people.js,
   img/, audits/lines.json and audits/statements/texts.json as "Rebuild site data".
Do not touch scripts/candidates.js or any other repo file (scratchpad/ is fine).

DEPLOY (another serial run may be pushing to origin main from its own checkout at the same time):
a. \`git fetch origin\` and \`git rebase origin/main\` (your audit commit never conflicts).
b. Run the build and the tests named above. If tests fail, do not push: \`git checkout\` the generated files and say why in
   the report.
c. Commit the changed generated files (no attribution line) and \`git push origin HEAD:main\`.
d. If the push is rejected: \`git fetch origin\` and \`git rebase origin/main\`. If the rebase stops on a conflict in a
   generated file (data.js, people.js, audits/lines.json, audits/statements/texts.json), run \`git rebase --skip\` (drops only
   your rebuild commit), then go back to b. Never resolve a generated file by hand, never force-push.`

// After the audits: promote candidates that now carry signal on the real lines and demote active
// statements that lost it (test 2, audits/statements/STANDARD.md; Brandon, 2026-11-05). CPU only.
const SIGNAL_PROMPT = `Working directory: ${ROOT}.
1. Run \`node scripts/statement-signal.js --apply\` (several minutes; run it in the background if needed). It edits
   statements.json and prints what it promoted and demoted. If both are "none", reply with that and stop.
2. Run \`node scripts/build.js\` and \`node test.js\`. If tests pass, \`git add\` statements.json data.js people.js img/
   audits/lines.json audits/statements/texts.json (those that changed), commit as "Statements: promote/demote by signal
   on the real lines" listing the ids in the message (no Co-Authored-By or other attribution line), then \`git fetch origin\`,
   \`git rebase origin/main\` and \`git push origin HEAD:main\`; if the rebase stops on a generated file, \`git rebase --skip\`,
   rerun the signal script, build and tests, and commit again. If tests fail, run \`git checkout statements.json data.js people.js audits/lines.json\` and say why.
Touch no other file. Reply in one line: promoted ids, demoted ids, deployed or not.`

// Before a people run: the next people in triage order get their public-domain books into the local corpora, and
// their other works go into the maintainer's books-wanted document (audits with own books pass more often).
// People are queued by triage (scripts/triage.js): refit it on this run's results. CPU only (cached Wikidata).
const TRIAGE_PROMPT = `Working directory: ${ROOT}. Run \`node scripts/triage.js\` (a few minutes at most if new catalog people need
Wikidata). If it fails, reply with the error and stop. Otherwise \`git add audits/people-triage.json\`, commit as "Triage: refit on
the latest people audits" (no Co-Authored-By or other attribution line), \`git fetch origin\`, \`git rebase origin/main\` and
\`git push origin HEAD:main\`. Touch no other file. Reply in one line: the AUC line it printed, pushed or not.`
// Window three times the run: books are fetched first, then triage is refitted counting books on disk (Brandon,
// 2026-11-06), then the run takes the top of the queue.
const BOOKS_PROMPT = `Working directory: ${ROOT}. Run \`node scripts/prefetch-books.js --next ${LIMIT * 3}${opts.skip && opts.skip.length ? ` --skip ${opts.skip.join(',')}` : ''}\`
(it can take several minutes: Gutenberg mirror downloads one second apart). It changes no repo file. Reply with the line it printed, or the error.`

const reports = []
if (opts.kind === 'people') {
  phase('Books')
  reports.push(`books: ${await agent(BOOKS_PROMPT, { label: 'books', phase: 'Books', effort: 'low' })}`)
  reports.push(`triage before: ${await agent(TRIAGE_PROMPT, { label: 'triage-before', phase: 'Books', effort: 'low' })}`)
}
let ended = `limit of ${LIMIT} reached`
for (let i = 0; i < LIMIT; i++) {
  phase('Audit')
  const r = await agent(tickPrompt, { label: `tick-${i + 1}`, phase: 'Audit', schema: TICK, ...model })
  if (!r) { ended = 'a tick failed; check git status before rerunning'; break }
  if (r.done) { ended = 'no ideologies left'; break }
  reports.push(r.report)
  log(r.report)
}

if (opts.kind !== 'ideologies') {
  phase('Triage')
  reports.push(`triage: ${await agent(TRIAGE_PROMPT, { label: 'triage', phase: 'Triage', effort: 'low' })}`)
}

// Statement signal depends on ideology audits only, so a people-only run skips it.
if (opts.kind !== 'people') {
phase('Signal')
reports.push(`signal: ${await agent(SIGNAL_PROMPT, { label: 'signal', phase: 'Signal', effort: 'low' })}`)
}

return { reports, ended }
