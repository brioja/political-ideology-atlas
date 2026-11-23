# Audit lane

`scripts/lane.js` runs this file in one session per subject. A lane writes audit drafts.

Follow the driver's instructions (subject, report) when it sends them; they take precedence over
this file.

## Which subject

Audit the id the driver gives you, person or ideology.

## For each subject

1. Follow `audits/AUDIT_RULES.md` and `audits/PROMPT.md` (ideology) or `audits/PROMPT_PEOPLE.md`
   (person) exactly, with `{{id}}`, `{{name}}` and the other fields taken from the next.js output
   or the catalog. Answer every statement in statements.json, candidates included, and set `rules`
   to the current version (`CURRENT_RULES` in scripts/validate.js). Research to the end (section 6).
2. If the subject already has an audit (or next.js gives a "reason"), this is a later pass: start
   from the committed file and follow `audits/AUDIT_RULES.md` section 6 (reviewHistory, `passes`,
   your model in `auditor`), never rewrite it from scratch. `auditor` is your full model id
   (e.g. `gpt-6.1-sol`, `claude-opus-5-5`), not a family name.
   The driver's first message lists what the committed audit fails under today's rules
   (`node scripts/validate.js [--people] --as-current <id>`): fix each in your draft.
3. Sources go in `scratchpad/sources/<id>/`; helper scripts in `scratchpad/<lane>-<id>/`.
4. Write the audit to `scratchpad/lane-out/<lane>/<id>.json`; the driver moves it into `audits/`
   once it validates. Validate it there:

       node scripts/validate.js [--people] --dir scratchpad/lane-out/<lane> <id>

   and fix every error. A source you can't tie to the subject leaves the audit with everything
   taken from it: its id in the answers' `sources` and its claims in their rationales.
5. Edit no other file. Do not build, test, commit or push.

Once validate.js reports no errors other than the uncertainty rule (or a
`notIdeasOfWhatSocietyShouldBe` record), add one line to
`scratchpad/lane-out/<lane>/DONE.txt`: id, kind, known answers, and whether the uncertainty rule
passed (or the lines it names).
