export const meta = {
  name: 'people-audits',
  description: 'Audit the next people one at a time: Haiku sets up (books, triage, next person), Sonnet researches one statement at a time, Haiku tests and pushes',
  whenToUse: 'People audits (Brandon, 2026-11-16). Args: {"limit": N} people this run (default 1), {"skip": ["id", ...]} people to pass over. New audits only: people with an audit are skipped.',
  phases: [
    { title: 'Setup', detail: 'books for the next people, triage refit (once a day), pick the next person without an audit', model: 'haiku' },
    { title: 'Research', detail: 'fresh Sonnet sessions through next_question.js / search.js / answer.js until every statement is answered', model: 'sonnet' },
    { title: 'Push', detail: 'move the draft into audits/people/, validate, commit, rebuild, test, push; a failure stops the run', model: 'haiku' },
  ],
}

const opts = args || {}
const ROOT = '/home/brioja/work/political_ideology_test'
const LIMIT = opts.limit || 1
const SKIP = opts.skip || []
const HAIKU = { model: 'haiku', effort: 'low' }
const MAX_SESSIONS = 30 // a guard against research that makes no progress, not a target
const NO_ATTRIBUTION = 'Commits carry only the repo owner\'s name: no Co-Authored-By or other attribution line.'

const PICKED = {
  type: 'object',
  properties: { done: { type: 'boolean', description: 'true if no person is left' }, id: { type: 'string' }, name: { type: 'string' }, report: { type: 'string' } },
  required: ['done', 'id', 'name', 'report'],
}
const PROGRESS = {
  type: 'object',
  properties: { answered: { type: 'integer', description: 'statements answered in the draft' }, finished: { type: 'boolean', description: 'next_question.js said every statement is answered and role and summary are recorded' } },
  required: ['answered', 'finished'],
}
const PUSHED = {
  type: 'object',
  properties: { pushed: { type: 'boolean' }, report: { type: 'string', description: 'one line: validator result, uncertainty rule met or not, commits pushed; or what failed, with the last lines of output' } },
  required: ['pushed', 'report'],
}

const setupPrompt = (skip) => `Working directory: ${ROOT}.
1. Run \`node scripts/prefetch-books.js --next ${LIMIT * 3}${skip.length ? ` --skip ${skip.join(',')}` : ''}\` (several minutes; it changes no repo file).
2. Run \`node scripts/triage.js\`. If it says it already refitted today, go to 3. Otherwise \`git add audits/people-triage.json\`, commit as
   "Triage: refit on the latest people audits", \`git fetch origin\`, \`git rebase origin/main\`, \`git push origin HEAD:main\`. ${NO_ATTRIBUTION}
3. Run \`node scripts/next.js --people${skip.length ? ` --skip ${skip.join(',')}` : ''}\`. If it prints null, reply done=true. If it names a person who
   already has audits/people/<id>.json, add that id to --skip and run it again, until it names a person without one.
Touch no other repo file. Reply with the person's id and name, and a one-line report of steps 1-2.`

const researchPrompt = (p) => `Audit ${p.name} (id ${p.id}, a person) following audits/AUDIT_RULES.md and audits/PROMPT_PEOPLE.md. ` +
  `Working directory: ${ROOT}. Run node scripts/next_question.js ${p.id}; search with node scripts/search.js "<terms>"; answer with ` +
  `node scripts/answer.js (each script explains itself in its header). Continue until a script tells you to stop. ` +
  `Reply with how many statements the draft has answered, and whether it is finished.`

const pushPrompt = (p) => `Working directory: ${ROOT}. Publish the finished audit of ${p.name}.
a. Copy scratchpad/lane-out/qa/${p.id}.json to audits/people/${p.id}.json. Run \`node scripts/validate.js --people ${p.id}\`. If it reports any
   error other than the uncertainty rule, delete audits/people/${p.id}.json and reply pushed=false with the errors.
b. \`git add audits/people/${p.id}.json\` and commit as "Audit ${p.name}". ${NO_ATTRIBUTION}
c. \`git fetch origin\` and \`git rebase origin/main\`. Run \`node scripts/images.js && node scripts/build.js --people\`, then \`node test.js --people\`.
   If tests fail, \`git checkout\` the generated files and reply pushed=false with the failing lines.
d. \`git add\` the changed people.js, img/ and audits/people-catalog.json, commit as "Rebuild people data", and \`git push origin HEAD:main\`.
   If the push is rejected: fetch, rebase; if the rebase stops on a generated file, \`git rebase --skip\` and go back to c. Never resolve a
   generated file by hand, never force-push.
Touch no other file. Reply pushed=true when the push succeeded, with a one-line report.`

const reports = []
let ended = `limit of ${LIMIT} reached`
const skip = [...SKIP]
for (let i = 0; i < LIMIT; i++) {
  phase('Setup')
  const p = await agent(setupPrompt(skip), { label: `setup-${i + 1}`, phase: 'Setup', schema: PICKED, ...HAIKU })
  if (!p) { ended = 'setup failed; check git status'; break }
  if (p.done) { ended = 'nobody left to audit'; break }
  log(`${p.name}: ${p.report}`)
  skip.push(p.id)

  phase('Research')
  let last = -1, finished = false
  for (let n = 1; n <= MAX_SESSIONS && !finished; n++) {
    const r = await agent(researchPrompt(p), { label: `research-${i + 1}.${n}`, phase: 'Research', schema: PROGRESS, model: 'sonnet' })
    if (!r) { ended = `research on ${p.name} failed`; break }
    log(`${p.name}: ${r.answered} answered${r.finished ? ', finished' : ''}`)
    finished = r.finished
    if (!finished && r.answered <= last) { ended = `research on ${p.name} made no progress at ${r.answered} answered`; break }
    last = r.answered
  }
  if (!finished) { if (ended.startsWith('limit')) ended = `research on ${p.name} hit the ${MAX_SESSIONS}-session guard`; log(ended); break }

  phase('Push')
  const d = await agent(pushPrompt(p), { label: `push-${i + 1}`, phase: 'Push', schema: PUSHED, ...HAIKU })
  if (!d || !d.pushed) { ended = `push of ${p.name} failed: ${d ? d.report : 'agent died'}`; log(ended); break }
  reports.push(`${p.name}: ${d.report}`)
  log(d.report)
}
return { reports, ended }
