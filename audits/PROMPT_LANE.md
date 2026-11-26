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
   to the current version (`CURRENT_RULES` in scripts/validate.js). Research to the end (section 4).
2. If the subject already has an audit (or next.js gives a "reason"), this is a later pass: start
   from the committed file and follow `audits/AUDIT_RULES.md` section 4 (changed answers, `passes`,
   your model in `auditor`), never rewrite it from scratch. `auditor` is your full model id
   (e.g. `gpt-6.1-sol`, `claude-opus-5-5`), not a family name.
   The driver's first message lists what the committed audit fails under today's rules
   (`node scripts/validate.js [--people] --as-current <id>`): fix each in your draft.
3. Sources go in `scratchpad/sources/<id>/`; helper scripts in `scratchpad/<lane>-<id>/`.
   An audit runs in phases; the driver's messages say when each starts.
   - Ideologies first: scope, sources, aliases, key figures and key works (PROMPT.md sections 1 and 2),
     from the web and local texts, with no answers yet. The driver checks them
     (`node scripts/validate.js --dir scratchpad/lane-out/<lane> --stage scope <id>`) and sends back
     what to fix.
   - Local: answers from local texts only (the corpora, the maintainer's reference library, Gutenberg,
     books downloaded for this audit). A statement they don't settle stays null.
   - Web, in a fresh session: the driver hands over only the statements still open (for a person, also
     those answered from their words alone, to look for a record) in `<id>.web.json`, and merges the
     answers back.
4. Write the audit to `scratchpad/lane-out/<lane>/<id>.json`; the driver moves it into `audits/`
   once it validates. Validate it there:

       node scripts/validate.js [--people] --dir scratchpad/lane-out/<lane> <id>

   and fix every error. A source you can't tie to the subject leaves the audit with everything
   taken from it: its id in the answers' `sources` and its claims in their rationales.
5. Edit no other file. Do not build, test, commit or push.

Once validate.js reports no errors (an `excluded:` line, a `notIdeasOfWhatSocietyShouldBe` record,
is a result, not an error), add one line to
`scratchpad/lane-out/<lane>/DONE.txt`: id, kind and known answers.
