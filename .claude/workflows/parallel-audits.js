export const meta = {
  name: 'parallel-audits',
  description: 'Audit the most-viewed pending ideologies in parallel lanes, then one integrator merges proposals, builds, tests and deploys per wave',
  phases: [
    { title: 'Pick', detail: 'list the next N pending ideologies by views' },
    { title: 'Audit', detail: 'one agent per ideology, writing only its own audit file' },
    { title: 'Integrate', detail: 'merge proposals into statements.json, commit, build, test, push' },
    { title: 'Backfill', detail: 'when 10+ new statements are pending, answer them and promote contested candidates' },
  ],
}

const ROOT = '/home/brioja/work/political_ideology_test'
const LANES = (args && args.lanes) || 5
const WAVES = (args && args.waves) || 2
const model = args && args.model ? { model: args.model } : {}

const PICK = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id', 'name'] } } },
  required: ['items'],
}
const LANE = {
  type: 'object',
  properties: { id: { type: 'string' }, ok: { type: 'boolean', description: 'audit file written and validator has no errors other than salience' }, report: { type: 'string' } },
  required: ['id', 'ok', 'report'],
}
const INTEGRATE = {
  type: 'object',
  properties: { report: { type: 'string' }, deployed: { type: 'boolean' }, pendingStatements: { type: 'integer', description: 'distinct statement ids across `node scripts/pending.js --backfill`' } },
  required: ['report', 'deployed', 'pendingStatements'],
}
const BACKFILL_TODO = {
  type: 'object',
  properties: { audits: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, statements: { type: 'array', items: { type: 'string' } } }, required: ['id', 'statements'] } } },
  required: ['audits'],
}

const lanePrompt = (it) => `You audit one ideology, in parallel with other agents auditing other ideologies in the same working tree. Working directory: ${ROOT}. Today's date is the auditedAt date.

Your ideology: ${it.name} (id: ${it.id}).
1. Read audits/PROMPT.md and follow it exactly: answer every statement in statements.json
   (including "status": "candidate" ones), confirm or correct the suggested wikipedia link, 2-4 furtherReading, follow any
   scopeNote, list missingStatements. Use WebSearch/WebFetch (load them with ToolSearch if deferred); cite only pages you
   opened. Use 3-4 well-chosen sources, choosing later ones to cover statement areas still unsupported rather than another
   overview. Prefer open-access sources (SEP/IEP, marxists.org, Gutenberg, party sites, Wikipedia); Britannica blocks access.
   Wikipedia-style neutral standard.
2. Write audits/profiles/${it.id}.json and run \`node scripts/validate.js ${it.id}\`; fix every error except salience
   (exit code 2 is an honest result: never raise a confidence to pass it). Write each rationale yourself, specific to its
   statement; never pad or generate rationales by script to pass a length check.
3. Leave missingStatements entries as proposals: do NOT set addedAs or declined, and do NOT edit statements.json.
   An integrator handles proposals from all lanes together.
Edit no file other than audits/profiles/${it.id}.json. Do not run build.js or test.js. Do not git add, commit or push.
Report in 1-3 lines: validator result, stated positions, number of missingStatements proposals.`

const integratePrompt = (items) => `You integrate a wave of ideology audits written in parallel. Working directory: ${ROOT}.
Audits in this wave: ${items.map((i) => `${i.name} (${i.id})`).join(', ')}.
1. For each audit in audits/profiles/<id>.json, handle each missingStatements entry that has neither "addedAs" nor "declined".
   Look across ALL the wave's proposals together first: proposals from different audits that mean the same thing become one statement.
   Prefer merging: if an existing statement in statements.json already captures it, even loosely, set "addedAs" to that id
   (the audit's answer to it must agree; fix the answer only if it is missing). Only if none does, append a new statement to
   statements.json in the same one-line format as the others (id, theme, text, agree, disagree, note, icon,
   "status": "candidate"), in neutral wording other ideologies could also take a side on, and set "addedAs" to the new id
   in every audit that proposed it; if a wave audit proposed it, that audit must also answer the new statement in its answers,
   following audits/PROMPT.md's answer format. Or set "declined" with a reason. Keep the bank lean: every statement added must be answered by every future audit.
   Keep each file's own JSON indentation.
2. Run \`node scripts/validate.js <id>\` for each wave audit; fix every error except salience (never raise a confidence to pass it).
3. Commit each audit separately as "Audit <name>" (git add only that audit file; statements.json goes with the first commit).
   Commits carry only the repo owner's name: add no Co-Authored-By or other attribution line.
4. Run \`node scripts/build.js\` and \`node test.js\`. If tests pass, commit any changed data.js, people.js and
   audits/statements/texts.json as "Rebuild site data" (no attribution line) and \`git push\`. If they fail, do not push; say why.
5. Run \`node scripts/pending.js --backfill\` and report how many distinct statement ids appear across it as pendingStatements.
Do not touch any other file; leave uncommitted changes you didn't make alone.
Report: per audit, proposals added/merged/declined (with new statement ids), then tests and deploy status.`

async function backfill() {
  const found = await agent(`In ${ROOT}, run \`node scripts/pending.js --backfill\` and return the parsed JSON array as "audits". Do nothing else.`,
    { label: 'find-backfill', phase: 'Backfill', schema: BACKFILL_TODO, effort: 'low' })
  const batches = []
  for (let i = 0; i < found.audits.length; i += 4) batches.push(found.audits.slice(i, i + 4))
  await parallel(batches.map((batch) => () => agent(`Working directory: ${ROOT}
Read audits/BACKFILL.md and follow it exactly. The statements are in statements.json.
Other agents are backfilling other audit files at the same time.
Audits and the statement ids each one needs:
${batch.map((a) => `- ${a.id}: ${a.statements.join(', ')}`).join('\n')}
Only edit those audit files. Do not commit, build or test.`, { label: `backfill:${batch.map((a) => a.id).join(',')}`, phase: 'Backfill', ...model })))
  return agent(`Working directory: ${ROOT}
1. Run \`node scripts/statements-check.js\`. For every candidate it lists under "Ready" (contested), remove its "status" field in statements.json, keeping the one-line format.
2. Run \`node scripts/build.js\` and \`node test.js\`. If tests pass, \`git add\` audits/profiles statements.json data.js people.js audits/statements/texts.json, commit as "Backfill new statements and promote contested ones" (no Co-Authored-By or other attribution line), and \`git push\`. If they fail, don't push.
Reply in one line: how many audits were backfilled, which candidates were promoted, deployed or not.`,
    { label: 'promote', phase: 'Backfill', effort: 'low' })
}

const reports = []
let ended = `${WAVES} waves of ${LANES} done`
for (let w = 0; w < WAVES; w++) {
  const picked = await agent(`In ${ROOT}, run \`node scripts/pending.js --by-views --limit ${LANES}\` and return its array as "items" (id and name only). Do nothing else.`,
    { label: `pick-${w + 1}`, phase: 'Pick', schema: PICK, effort: 'low' })
  if (!picked || !picked.items.length) { ended = 'no ideologies left'; break }
  const lanes = (await parallel(picked.items.map((it) => () =>
    agent(lanePrompt(it), { label: `audit:${it.id}`, phase: 'Audit', schema: LANE, ...model })))).filter(Boolean)
  lanes.forEach((l) => { reports.push(`${l.id}: ${l.report}`); log(`${l.id}: ${l.report}`) })
  const done = picked.items.filter((it) => lanes.some((l) => l.id === it.id))
  const missing = picked.items.filter((it) => !done.includes(it))
  if (missing.length) log(`lanes failed (no audit): ${missing.map((m) => m.id).join(', ')}`)
  if (!done.length) { ended = 'every lane in a wave failed; check git status'; break }
  const r = await agent(integratePrompt(done), { label: `integrate-${w + 1}`, phase: 'Integrate', schema: INTEGRATE, ...model })
  if (!r) { ended = 'integrator failed; check git status'; break }
  reports.push(`integrate wave ${w + 1}: ${r.report}`)
  log(r.report)
  if (!r.deployed) { ended = 'wave not deployed (tests failed?); stopping'; break }
  if (r.pendingStatements >= 10) reports.push(`backfill: ${await backfill()}`)
}
return { reports, ended }
