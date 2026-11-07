export const meta = {
  name: 'parallel-audits',
  description: 'Audit the most-viewed pending ideologies in parallel lanes, then one integrator records missing statements, builds, tests and deploys per wave',
  phases: [
    { title: 'Pick', detail: 'list the next N pending ideologies by views' },
    { title: 'Audit', detail: 'one agent per ideology, writing only its own audit file' },
    { title: 'Integrate', detail: 'record missing statements (bank frozen), commit, build, test, push' },
    { title: 'Signal', detail: 'promote candidates with signal on the real lines, demote active statements without it' },
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
  properties: { id: { type: 'string' }, ok: { type: 'boolean', description: 'audit file written and validator has no errors other than the uncertainty rule' }, report: { type: 'string' } },
  required: ['id', 'ok', 'report'],
}
const INTEGRATE = {
  type: 'object',
  properties: { report: { type: 'string' }, deployed: { type: 'boolean' } },
  required: ['report', 'deployed'],
}

const lanePrompt = (it) => `You audit one ideology, in parallel with other agents auditing other ideologies in the same working tree. Working directory: ${ROOT}. Today's date is the auditedAt date.

Your ideology: ${it.name} (id: ${it.id}).
1. Read audits/PROMPT.md and follow it exactly: answer every statement in statements.json
   (including "status": "candidate" ones), confirm or correct the suggested wikipedia link, 2-4 furtherReading, follow any
   scopeNote, list missingStatements. Use WebSearch/WebFetch (load them with ToolSearch if deferred); cite only pages you
   opened. There is no limit on sources: choose each new source to cover statement areas still unsupported rather than
   another overview, and research to the end within the audit, since no later pass fills gaps (audits/AUDIT_RULES.md section 6). Prefer open-access sources (SEP/IEP, marxists.org, Gutenberg, party sites, Wikipedia); Britannica blocks access.
   Wikipedia-style neutral standard. Save every source you download beyond the library into scratchpad/sources/${it.id}/ and add it to its
   index.json (create both if missing), so later passes read local files instead of fetching again:
   a plain-text extract (.txt, the copy you search and read) plus the original, gzipped if it is HTML (.html.gz). Extract a PDF
   with pdftotext (it keeps page breaks for page citations) and keep the PDF only if it yields no text (a scan). List both files in index.json.
   In your report, propose a color for the ideology (the integrator adds it to audits/ideology-colors.json): a documented
   tradition with its source, or a guess from its imagery.
2. Write audits/profiles/${it.id}.json and run \`node scripts/validate.js ${it.id}\`; fix every error it reports
   except the uncertainty rule, and keep researching the lines it names before you finish (audits/AUDIT_RULES.md section 6). Never raise a confidence to make an audit pass the uncertainty rule. Write each rationale yourself, specific to its
   statement; never pad or generate rationales by script to pass a length check.
3. Leave missingStatements entries unhandled: do NOT set addedAs or declined, and do NOT edit statements.json.
   An integrator handles missing statements from all lanes together.
Other lanes share your scratchpad directory: keep every temporary file in its own subdirectory named ${it.id}.
Edit no repo file other than audits/profiles/${it.id}.json (scratchpad/ is fine). Do not run build.js or test.js. Do not git add, commit or push.
Report in 1-3 lines: validator result, stated positions, number of missingStatements, proposed color.`

const integratePrompt = (items) => `You integrate a wave of ideology audits written in parallel. Working directory: ${ROOT}.
Audits in this wave: ${items.map((i) => `${i.name} (${i.id})`).join(', ')}.
1. The statement bank is FROZEN (Brandon, 2026-11-04): do NOT edit statements.json and leave every missingStatements entry
   unhandled (no "addedAs", no "declined"). Keep each file's own JSON indentation.
2. Run \`node scripts/validate.js <id> <id> ...\` once with every wave audit id (one run builds the uncertainty judge once);
   fix every error except the uncertainty rule (never raise a confidence to pass it).
3. For each wave audit without an entry in audits/ideology-colors.json, following CONTRIBUTING.md
     "Ideology colors": a documented color tradition where one exists (cite it in "source"), otherwise a best guess from its
     imagery with "basis": "guess", a note starting "guess: " and "verified": false; never only grey, black or white. Copy the
     format of the neighbouring entries and keep the file's indentation.
   Use the lane's proposed color. Commit each audit separately as "Audit <name>" (git add only that audit file), then the
   colors file as "Ideology colors for the wave".
   Commits carry only the repo owner's name: add no Co-Authored-By or other attribution line.
4. Run \`node scripts/build.js\` (it can take over 2 minutes; run it in the background if needed) and check its output: every wave id must appear in data.js or in the build's excluded / not-an-ideology lists. If any is missing, run the build again (another session may have built at the same time). Then run \`node test.js\`. If tests pass, commit any changed data.js, people.js, audits/lines.json and
   audits/statements/texts.json as "Rebuild site data" (no attribution line) and \`git push\`. If they fail, do not push; say why.
Do not touch any other file; leave uncommitted changes you didn't make alone.
Report: per audit, number of missingStatements, then tests and deploy status.`

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
}
phase('Signal')
reports.push(`signal: ${await agent(SIGNAL_PROMPT, { label: 'signal', phase: 'Signal', effort: 'low' })}`)

return { reports, ended }
