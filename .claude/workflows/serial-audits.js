export const meta = {
  name: 'serial-audits',
  description: 'Audit the most-viewed pending ideologies one at a time, each in a fresh agent that also merges its proposed statements and deploys',
  whenToUse: 'The serial audit loop without a long-running session. Optional args: {"limit": N} audits this run (default 10), {"model": "sonnet"} for the audit agents',
  phases: [
    { title: 'Audit', detail: 'one fresh agent per ideology: audit, merge proposals, commit, build, test, push' },
    { title: 'Backfill', detail: 'when 10+ audits need answers for new statements, answer them and promote contested candidates' },
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
    report: { type: 'string', description: 'one line: name, validator result, stated positions, proposals added/merged/declined, deployed or not' },
    deployed: { type: 'boolean' },
    pendingStatements: { type: 'integer', description: 'number of distinct statement ids across the array printed by `node scripts/pending.js --backfill`' },
  },
  required: ['done', 'report', 'deployed', 'pendingStatements'],
}

const tickPrompt = `You do one step of a serial ideology audit. Working directory: ${ROOT}. Today's date is the auditedAt date.

1. Run \`node scripts/next.js --ideologies\`. If it prints null, reply with done=true and do nothing else.
2. Audit that ideology yourself. Read audits/PROMPT.md and follow it exactly: answer every statement in statements.json
   (including "status": "candidate" ones), confirm or correct the suggested wikipedia link, 2-4 furtherReading, follow any
   scopeNote, list missingStatements. Use WebSearch/WebFetch (load them with ToolSearch if deferred); cite only pages you
   opened. Use 3-4 well-chosen sources, choosing later ones to cover statement areas still unsupported rather than another
   overview. Prefer open-access sources (SEP/IEP, marxists.org, Gutenberg, party sites, Wikipedia); Britannica blocks access.
   Wikipedia-style neutral standard. Write audits/profiles/<id>.json and run \`node scripts/validate.js <id>\`; fix every error
   except salience (exit code 2 is an honest result: never raise a confidence to pass it).
3. Handle each missingStatements entry. Prefer merging: if an existing statement in statements.json already captures it,
   even loosely, set "addedAs" to that id (your answer to it must agree). Only if none does, append a new statement to
   statements.json in the same one-line format as the others (id, theme, text, agree, disagree, note, icon,
   "status": "candidate"), in neutral wording other ideologies could also take a side on, and set "addedAs" to the new id.
   Or set "declined" with a reason. Keep the bank lean: every statement added must be answered by every future audit.
4. \`git add\` only the audit file and statements.json; commit as "Audit <name>" ending with the line
   "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".
5. Run \`node scripts/build.js\` and \`node test.js\`. If tests pass, commit any changed data.js, people.js and
   audits/statements/texts.json as "Rebuild site data" (same co-author line) and \`git push\`. If they fail, do not push;
   say why in the report.
6. Run \`node scripts/pending.js --backfill\` and report how many distinct statement ids appear across it as pendingStatements.
Do not touch scripts/candidates.js or any other file.`

const BACKFILL_TODO = {
  type: 'object',
  properties: { audits: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, statements: { type: 'array', items: { type: 'string' } } }, required: ['id', 'statements'] } } },
  required: ['audits'],
}

async function backfill() {
  const found = await agent(`In ${ROOT}, run \`node scripts/pending.js --backfill\` and return the parsed JSON array as "audits". Do nothing else.`,
    { label: 'find-backfill', phase: 'Backfill', schema: BACKFILL_TODO, effort: 'low' })
  const batches = []
  for (let i = 0; i < found.audits.length; i += 4) batches.push(found.audits.slice(i, i + 4))
  for (const batch of batches) {
    await agent(`Working directory: ${ROOT}
Read audits/BACKFILL.md and follow it exactly. The statements are in statements.json.
Audits and the statement ids each one needs:
${batch.map((a) => `- ${a.id}: ${a.statements.join(', ')}`).join('\n')}
Only edit those audit files. Do not commit.`, { label: `backfill:${batch.map((a) => a.id).join(',')}`, phase: 'Backfill', ...model })
  }
  return agent(`Working directory: ${ROOT}
1. Run \`node scripts/statements-check.js\`. For every candidate it lists under "Ready" (contested), remove its "status" field in statements.json, keeping the one-line format.
2. Run \`node scripts/build.js\` and \`node test.js\`. If tests pass, \`git add\` audits/profiles statements.json data.js people.js audits/statements/texts.json, commit as "Backfill new statements and promote contested ones" ending with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>", and \`git push\`. If they fail, don't push.
Reply in one line: how many audits were backfilled, which candidates were promoted, deployed or not.`,
    { label: 'promote', phase: 'Backfill', effort: 'low' })
}

const reports = []
let ended = `limit of ${LIMIT} reached`
for (let i = 0; i < LIMIT; i++) {
  phase('Audit')
  const r = await agent(tickPrompt, { label: `tick-${i + 1}`, phase: 'Audit', schema: TICK, ...model })
  if (!r) { ended = 'a tick failed; check git status before rerunning'; break }
  if (r.done) { ended = 'no ideologies left'; break }
  reports.push(r.report)
  log(r.report)
  // Backfill once 10 new statements have built up. Every new statement makes every earlier audit
  // pending at once, so counting audits instead would backfill after nearly every audit.
  if (r.pendingStatements >= 10) {
    phase('Backfill')
    reports.push(`backfill: ${await backfill()}`)
  }
}

return { reports, ended }
