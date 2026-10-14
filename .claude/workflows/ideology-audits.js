export const meta = {
  name: 'ideology-audits',
  description: 'Research and write sourced audits for every ideology that lacks a valid one, then rebuild data.js',
  whenToUse: 'Run the ideology audits (expensive: roughly 75k tokens per ideology). Optional args: {"limit": N} or {"ids": ["id", ...]}',
  phases: [
    { title: 'Find', detail: 'list ideologies with missing, stale or invalid audits' },
    { title: 'Audit', detail: 'one researcher per ideology writes audits/profiles/<id>.json' },
    { title: 'Build', detail: 'validate all audits, rebuild data.js, run tests' },
  ],
}

const ROOT = '/home/brioja/work/political_ideology_test'
const opts = args || {}

const PENDING = {
  type: 'object',
  properties: {
    ideologies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' }, name: { type: 'string' }, category: { type: 'string' },
          wikipedia: { type: ['string', 'null'] }, wikipediaMatch: { type: 'string' },
          scopeNote: { type: 'string', description: 'copy verbatim when present' },
        },
        required: ['id', 'name', 'category'],
      },
    },
    statementsVersion: { type: 'string' },
  },
  required: ['ideologies', 'statementsVersion'],
}

const AUDIT = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    validatorPassed: { type: 'boolean' },
    lowConfidenceCount: { type: 'integer' },
    concerns: { type: 'string', description: 'anything a human should double-check, or empty' },
  },
  required: ['id', 'validatorPassed', 'lowConfidenceCount', 'concerns'],
}

phase('Find')
const found = await agent(
  `In ${ROOT}, run \`node scripts/pending.js${opts.limit ? ` --limit ${opts.limit}` : ''}\` and ` +
  `\`node -e 'console.log(require("./scripts/lib").statementsVersion())'\`. ` +
  `Return the parsed JSON array as "ideologies" and the version string as "statementsVersion". Do nothing else.`,
  { label: 'find-pending', phase: 'Find', schema: PENDING, effort: 'low' },
)
let todo = found.ideologies
if (opts.ids) todo = todo.filter((i) => opts.ids.includes(i.id))
log(`${todo.length} ideologies to audit`)

const auditPrompt = (i) => `You are auditing one ideology for a political ideology test.

Working directory: ${ROOT}
Read ${ROOT}/audits/PROMPT.md first and follow it exactly. Fill its placeholders with:
- name: ${i.name}
- id: ${i.id}
- category: ${i.category}
- statementsVersion: ${found.statementsVersion}
- wikipedia (suggested, confirm it): ${i.wikipedia || 'none found'} (found as: ${i.wikipediaMatch || 'none'})${i.scopeNote ? `\n- scope note (follow it): ${i.scopeNote}` : ''}
- auditedAt: today's date (YYYY-MM-DD)

The statements are in ${ROOT}/statements.json. Write your audit to ${ROOT}/audits/profiles/${i.id}.json.
Use WebSearch and WebFetch (load them with ToolSearch if they are deferred) to read real sources, and cite only pages you opened.
Be economical: 4-6 well-chosen sources are enough. Prefer open-access sources (Stanford or Internet Encyclopedia of Philosophy,
marxists.org and similar text archives, party sites, Wikipedia); Britannica and many magazines block automated access.
Then run \`node ${ROOT}/scripts/validate.js ${i.id}\` and fix every error until it passes.
Only write that one file. Do not modify any other file in the repo.`

phase('Audit')
const results = await pipeline(todo, (i) =>
  agent(auditPrompt(i), { label: `audit:${i.id}`, phase: 'Audit', schema: AUDIT }))

const done = results.filter(Boolean)
const failed = todo.filter((i, n) => !results[n] || !results[n].validatorPassed).map((i) => i.id)
log(`${done.length - failed.length} audits passed, ${failed.length} need another run`)

phase('Build')
const build = await agent(
  `In ${ROOT}, run \`node scripts/validate.js\`, then \`node scripts/build.js\`, then \`node test.js\`. ` +
  `Report each command's final summary lines and any failures, briefly. Do not edit any files yourself.`,
  { label: 'build', phase: 'Build', effort: 'low' },
)

return {
  audited: done.length,
  failed,
  concerns: done.filter((r) => r.concerns).map((r) => `${r.id}: ${r.concerns}`),
  build,
}
