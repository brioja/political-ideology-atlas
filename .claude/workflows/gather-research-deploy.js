export const meta = {
  name: 'gather-research-deploy',
  description: 'Audit the next pending people or ideologies one at a time: a Gather agent builds the source library, a Research agent audits from it and commits, a Haiku agent deploys',
  whenToUse: 'The audit loop (replaced serial-audits, 2026-11-16). Args: {"model": "sonnet"} (required: the Gather and Research agents; never Haiku), {"limit": N} audits this run (default 10), {"kind": "people" | "ideologies"} to take only that kind, {"skip": ["id", ...]} to pass over entries (e.g. people waiting for books), {"pauseMinutes": N} between audits, {"root": "<checkout>"} (default the main checkout)',
  phases: [
    { title: 'Books', detail: 'people runs: fetch public-domain books for the next 3x people, list the rest in ~/work/books-wanted.md, refit triage on books on disk', model: 'haiku' },
    { title: 'Gather', detail: 'build scratchpad/sources/<id>/: own works, record, corpus records saved as files; no answers' },
    { title: 'Research', detail: 'read the library, answer, validate, commit' },
    { title: 'Deploy', detail: 'build, test, push; a failure stops the run', model: 'haiku' },
    { title: 'Triage', detail: 'refit the people triage on the new results (people runs)', model: 'haiku' },
    { title: 'Signal', detail: 'promote candidates with signal on the real lines, demote active statements without it', model: 'haiku' },
  ],
}

const opts = args || {}
// One run at a time (AGENTS.md). Scripted steps (books, triage, deploy, signal) run on Haiku (Brandon, 2026-11-16);
// the audit itself (gather, research) on the model named in args, Sonnet or better.
const ROOT = opts.root || '/home/brioja/work/political_ideology_test'
const SKIP = opts.skip && opts.skip.length ? ` --skip ${opts.skip.join(',')}` : ''
const KIND = (opts.kind === 'people' ? ' --people' : opts.kind === 'ideologies' ? ' --ideologies' : '') + SKIP
const LIMIT = opts.limit || 10
const model = opts.model ? { model: opts.model } : {}
const HAIKU = { model: 'haiku', effort: 'low' }
const NO_ATTRIBUTION = 'Commits carry only the repo owner\'s name: no Co-Authored-By or other attribution line.'

const GATHERED = {
  type: 'object',
  properties: {
    done: { type: 'boolean', description: 'true if next.js printed null (nothing left)' },
    kind: { type: 'string', enum: ['person', 'ideology', 'none'] },
    entry: { type: 'string', description: 'the JSON next.js printed, verbatim' },
    id: { type: 'string' }, name: { type: 'string' },
    files: { type: 'integer', description: 'entries in the library index.json' },
    summary: { type: 'string', description: 'one line: what the library holds by kind (own works, record, speeches, corpus records, secondary)' },
  },
  required: ['done', 'kind', 'entry', 'id', 'name', 'files', 'summary'],
}
const RESEARCHED = {
  type: 'object',
  properties: {
    committed: { type: 'boolean' },
    report: { type: 'string', description: 'one line: kind and name, answered statements, validator result, whether the uncertainty rule is met, number of missingStatements (ideologies)' },
  },
  required: ['committed', 'report'],
}
const DEPLOYED = {
  type: 'object',
  properties: {
    deployed: { type: 'boolean' },
    error: { type: 'string', description: 'empty if deployed; otherwise what failed, with the last lines of output' },
  },
  required: ['deployed', 'error'],
}

const gatherPrompt = `Working directory: ${ROOT}. You build the source library for the next audit. You write no audit and no answers.
1. Run \`node scripts/next.js${KIND}\`. If it prints null, reply done=true, kind "none", and stop. Otherwise it prints the next
   entry as JSON with "kind": "person" or "ideology" (and a "reason" if this is a re-audit). Return that JSON verbatim as "entry".
2. Build scratchpad/sources/<id>/ with its index.json. Keep what is already there: an ideology may have a library from its
   statement pass (scratchpad/statement-pass/<id>.json "notes" say which files matter); download only what it lacks.
   Which sources count: audits/AUDIT_RULES.md, plus audits/PROMPT_PEOPLE.md for a person or audits/PROMPT.md for an ideology.
   A person: their own words and their record first (speeches, writings, interviews, votes, laws they passed or blocked,
   programmes they ran on), then scholarship. An ideology: its defining primary texts, then scholarship (open access first:
   SEP/IEP, marxists.org, Gutenberg, party sites; Britannica blocks access).
   Cover every theme of statements.json (economy, society, government, world, liberty, culture, means, ecology, technology,
   globalism): for each, find what exists on it.
   - Local corpora first (~/.cache/political-ideology-atlas/corpora/, README.md lists each tool). Search every corpus that
     could hold the subject. Save each record you find as a file in the library (redirect the tool's output for that record
     into scratchpad/sources/<id>/<corpus>-<record>.txt) and add an index.json entry with the dataset's URL or DOI and the
     record id in "url" and a title naming the corpus.
   - Then the web: node scripts/get.js <id> <url> for pages and documents (it saves and indexes them), node scripts/wiki.js,
     node scripts/gutenberg.js, node scripts/yt.js (at most 5 requests) as AUDIT_RULES.md says. WebSearch to find sources
     (load it with ToolSearch if deferred). A PDF: pdftotext (keeps page breaks for page citations).
   - Delete from the library any file that is not the document (an error page, a bot check, a search-results page) and its
     index entry.
3. Write scratchpad/sources/<id>/GATHER.md: per theme, what the library holds and where you looked; per corpus, searched or
   why not.
Touch no repo file outside scratchpad/. Reply with kind, entry, id, name, number of library files and a one-line summary.`

const PERSON = (g) => `Audit ${g.name} (id ${g.id}, a person) following audits/AUDIT_RULES.md and audits/PROMPT_PEOPLE.md exactly:
answer every statement, candidates included. Write audits/people/${g.id}.json and run \`node scripts/validate.js --people ${g.id}\`:
fix every error except the uncertainty rule. It requires every library file and every local corpus to be cited or declined in
"booksNotUsed" with a reason. \`git add\` only that file and commit as "Audit ${g.name}".`
const IDEOLOGY = (g) => `Audit ${g.name} (id ${g.id}, an ideology) following audits/AUDIT_RULES.md and audits/PROMPT.md exactly: answer
every statement in statements.json (including "status": "candidate" ones), confirm or correct the suggested wikipedia link, 2-4
furtherReading, follow any scopeNote, list missingStatements. Wikipedia-style neutral standard. Write audits/profiles/${g.id}.json
and run \`node scripts/validate.js ${g.id}\`; fix every error except the uncertainty rule. Then add an entry for the ideology to
audits/ideology-colors.json if it has none, following CONTRIBUTING.md "Ideology colors": a documented color tradition where one
exists (cite it in "source"), otherwise a best guess from its imagery with "basis": "guess", a note starting "guess: " and
"verified": false; never only grey, black or white. Copy the format of the neighbouring entries and keep the file's indentation.
The statement bank is FROZEN (Brandon, 2026-11-04): do NOT edit statements.json; leave each missingStatements entry unhandled
(no "addedAs", no "declined"). \`git add\` only the audit file and audits/ideology-colors.json; commit as "Audit ${g.name}".`
const researchPrompt = (g) => `Working directory: ${ROOT}. Today's date is the auditedAt date. A gather step built the source library in
scratchpad/sources/${g.id}/ (index.json, and GATHER.md for what it searched). next.js gave: ${g.entry}
If an audit file for it already exists, it failed validation, or (with a "reason") it is due for a re-audit for that reason: bring it
up to the current rules ("rules" set to the current version, every answer checked against audits/AUDIT_RULES.md, the reason's rule
above all), building on it (AUDIT_RULES.md section 6), never overwriting it from scratch. Add your model to "auditor" (if not there
yet) and to "passes", and keep every committed sourced answer you change in that statement's "reviewHistory".
Research to the end before you commit: read every library file, and search further (corpora, the web via node scripts/get.js,
saving what you download into the library) wherever a statement could still be settled. Never add or strengthen an answer to meet
the uncertainty rule; failing it is an acceptable outcome.
${g.kind === 'person' ? PERSON(g) : IDEOLOGY(g)}
${NO_ATTRIBUTION} Do not build, test or push. Do not touch scripts/candidate-triage.js, scripts/candidate-filter.js or any other
repo file (scratchpad/ is fine). Reply committed=true once the commit is made, and a one-line report.`

const deployPrompt = (kind) => `Working directory: ${ROOT}. Deploy the audit commit at HEAD.
a. \`git fetch origin\` and \`git rebase origin/main\` (an audit commit never conflicts).
b. ${kind === 'person'
    ? 'Run `node scripts/images.js && node scripts/build.js --people` (images.js looks up the photo of anyone added since its last run), then `node test.js --people`.'
    : 'Run `node scripts/build.js`, then `node test.js`.'} If tests fail, do not push: \`git checkout\` the generated files and
   reply deployed=false with the failing lines.
c. \`git add\` the changed generated files (${kind === 'person' ? 'people.js, img/, audits/people-catalog.json' : 'data.js, people.js, img/, audits/lines.json, audits/statements/texts.json'})
   and commit as "${kind === 'person' ? 'Rebuild people data' : 'Rebuild site data'}". ${NO_ATTRIBUTION} Then \`git push origin HEAD:main\`.
d. If the push is rejected: \`git fetch origin\`, \`git rebase origin/main\`; if the rebase stops on a conflict in a generated file
   (data.js, people.js, audits/lines.json, audits/statements/texts.json), \`git rebase --skip\` (drops only the rebuild commit) and go
   back to b. Never resolve a generated file by hand, never force-push.
Touch no other file. Reply deployed=true when the push succeeded; otherwise deployed=false and the error.`

// After the audits: promote candidates that now carry signal on the real lines and demote active statements that lost it
// (test 2, audits/statements/STANDARD.md; Brandon, 2026-11-05). CPU only.
const SIGNAL_PROMPT = `Working directory: ${ROOT}.
1. Run \`node scripts/statement-signal.js --apply\` (several minutes; run it in the background if needed). It edits
   statements.json and prints what it promoted and demoted. If both are "none", reply with that and stop.
2. Run \`node scripts/build.js\` and \`node test.js\`. If tests pass, \`git add\` statements.json data.js people.js img/
   audits/lines.json audits/statements/texts.json audits/share-slots.json (those that changed; a promotion appends share slots),
   commit as "Statements: promote/demote by signal on the real lines" listing the ids in the message (${NO_ATTRIBUTION}), then
   \`git fetch origin\`, \`git rebase origin/main\` and \`git push origin HEAD:main\`; if the rebase stops on a generated file,
   \`git rebase --skip\`, rerun the signal script, build and tests, and commit again. If tests fail, run
   \`git checkout statements.json data.js people.js audits/lines.json audits/share-slots.json\` and say why.
Touch no other file. Reply in one line: promoted ids, demoted ids, deployed or not.`

// People are queued by triage (scripts/triage.js): refit it on this run's results. CPU only (cached Wikidata).
const TRIAGE_PROMPT = `Working directory: ${ROOT}. Run \`node scripts/triage.js\` (a few minutes at most if new catalog people need
Wikidata). If it fails, reply with the error and stop. Otherwise \`git add audits/people-triage.json\`, commit as "Triage: refit on
the latest people audits" (${NO_ATTRIBUTION}), \`git fetch origin\`, \`git rebase origin/main\` and \`git push origin HEAD:main\`.
Touch no other file. Reply in one line: the AUC line it printed, pushed or not.`
// Before a people run: the next people in triage order get their public-domain books into the local corpora, and their other
// works go into the maintainer's books-wanted document. Window three times the run: books first, then triage refitted counting
// books on disk (Brandon, 2026-11-06), then the run takes the top of the queue.
const BOOKS_PROMPT = `Working directory: ${ROOT}. Run \`node scripts/prefetch-books.js --next ${LIMIT * 3}${SKIP}\`
(it can take several minutes: Gutenberg mirror downloads one second apart). It changes no repo file. Reply with the line it printed, or the error.`

const reports = []
if (opts.kind === 'people') {
  phase('Books')
  reports.push(`books: ${await agent(BOOKS_PROMPT, { label: 'books', phase: 'Books', ...HAIKU })}`)
  reports.push(`triage before: ${await agent(TRIAGE_PROMPT, { label: 'triage-before', phase: 'Books', ...HAIKU })}`)
}
let ended = `limit of ${LIMIT} reached`
let ideologies = 0
for (let i = 0; i < LIMIT; i++) {
  phase('Gather')
  const g = await agent(gatherPrompt, { label: `gather-${i + 1}`, phase: 'Gather', schema: GATHERED, ...model })
  if (!g) { ended = 'a gather step failed; check git status before rerunning'; break }
  if (g.done) { ended = 'nothing left to audit'; break }
  log(`gathered ${g.name}: ${g.files} files. ${g.summary}`)
  phase('Research')
  const r = await agent(researchPrompt(g), { label: `research-${i + 1}`, phase: 'Research', schema: RESEARCHED, ...model })
  if (!r || !r.committed) { ended = `research for ${g.name} did not commit: ${r ? r.report : 'agent died'}`; log(ended); break }
  reports.push(r.report)
  log(r.report)
  if (g.kind === 'ideology') ideologies++
  phase('Deploy')
  const d = await agent(deployPrompt(g.kind), { label: `deploy-${i + 1}`, phase: 'Deploy', schema: DEPLOYED, ...HAIKU })
  if (!d || !d.deployed) { ended = `deploy failed after ${g.name}: ${d ? d.error : 'agent died'}`; log(ended); break }
  // {"pauseMinutes": N}: wait between audits to spread usage over the day (Brandon, 2026-11-09: 10 on weekdays).
  if (opts.pauseMinutes && i < LIMIT - 1) {
    const ms = opts.pauseMinutes * 60000
    if (typeof setTimeout === 'function') await new Promise((res) => setTimeout(res, ms))
    else await agent(`Wait ${opts.pauseMinutes} minutes, then reply "ok". Use the Monitor tool (load it with ToolSearch) with an until-loop that ends once ${opts.pauseMinutes * 60} seconds have passed since you started. Do nothing else.`, { label: `pause-${i + 1}`, phase: 'Deploy', ...HAIKU })
  }
}

if (opts.kind !== 'ideologies') {
  phase('Triage')
  reports.push(`triage: ${await agent(TRIAGE_PROMPT, { label: 'triage', phase: 'Triage', ...HAIKU })}`)
}
// Statement signal depends on ideology audits only (AGENTS.md: every run that audited ideologies ends with it).
if (opts.kind !== 'people') {
  phase('Signal')
  reports.push(`signal: ${await agent(SIGNAL_PROMPT, { label: 'signal', phase: 'Signal', ...HAIKU })}`)
}

return { reports, ended, ideologies }
