export const meta = {
  name: 'statement-backfill',
  description: 'Answer newly added (candidate) statements in existing ideology audits, a few audits per agent',
  whenToUse: 'After adding statements to statements.json. Cheaper than re-auditing: only the new statements are answered. Optional args: {"batch": N} audits per agent (default 4), {"ids": ["id", ...]}',
  phases: [
    { title: 'Find', detail: 'list audits missing answers for new statements' },
    { title: 'Backfill', detail: 'answer only the missing statements, a few audits per agent' },
    { title: 'Check', detail: 'validate and report which candidates are now contested' },
  ],
}

const ROOT = '/home/brioja/work/political_ideology_test'
const opts = args || {}
const BATCH = opts.batch || 4

const TODO = {
  type: 'object',
  properties: {
    audits: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, name: { type: 'string' }, statements: { type: 'array', items: { type: 'string' } } },
        required: ['id', 'statements'],
      },
    },
  },
  required: ['audits'],
}

const RESULT = {
  type: 'object',
  properties: {
    done: { type: 'array', items: { type: 'string' }, description: 'audit ids now answering every listed statement' },
    concerns: { type: 'string', description: 'anything a human should double-check, or empty' },
  },
  required: ['done', 'concerns'],
}

phase('Find')
const found = await agent(
  `In ${ROOT}, run \`node scripts/pending.js --backfill\` and return the parsed JSON array as "audits". Do nothing else.`,
  { label: 'find-backfill', phase: 'Find', schema: TODO, effort: 'low' },
)
let todo = found.audits
if (opts.ids) todo = todo.filter((a) => opts.ids.includes(a.id))
log(`${todo.length} audits need answers for new statements`)

const batches = []
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH))

phase('Backfill')
const results = await pipeline(batches, (batch) => agent(
  `Working directory: ${ROOT}
Read ${ROOT}/audits/BACKFILL.md and follow it exactly. The new statements are in ${ROOT}/statements.json.
Use WebSearch and WebFetch (load them with ToolSearch if they are deferred) only when an audit's own sources don't settle an answer.

Audits and the statement ids each one needs:
${batch.map((a) => `- ${a.id}: ${a.statements.join(', ')}`).join('\n')}

Only edit those audit files. Do not modify any other file in the repo.`,
  { label: `backfill:${batch.map((a) => a.id).join(',')}`, phase: 'Backfill', schema: RESULT },
))

phase('Check')
const check = await agent(
  `In ${ROOT}, run \`node scripts/validate.js\` and \`node scripts/statements-check.js\`. ` +
  `Report the validator's summary line and any errors other than the uncertainty rule, and the "Candidates" section of the check, briefly. Do not edit any files.`,
  { label: 'check', phase: 'Check', effort: 'low' },
)

const done = results.filter(Boolean).flatMap((r) => r.done)
return {
  backfilled: done.length,
  missed: todo.map((a) => a.id).filter((id) => !done.includes(id)),
  concerns: results.filter((r) => r && r.concerns).map((r) => r.concerns),
  check,
}
