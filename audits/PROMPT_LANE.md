# Audit lane

`scripts/lane.js` runs this file in one session per subject. A lane writes audit drafts.

Follow the driver's instructions (subject, report) when it sends them; they take precedence over
this file.

## Which subject

Audit the id the driver gives you, person or ideology.

## For each subject

1. Follow `audits/AUDIT_RULES.md` and `audits/PROMPT.md` (ideology) or `audits/PROMPT_PEOPLE.md`
   (person) exactly, with `{{id}}`, `{{name}}` and the other fields taken from the next.js output
   or the catalog. Answer the statements the driver's message lists, from the texts it names.
2. `rules`, `auditedAt`, `auditor` and `passes` are the driver's: leave them as they are.
3. Sources go in `scratchpad/sources/<id>/`; helper scripts in `scratchpad/helpers-<id>/`.
4. Write to the file the driver's message names; the driver moves the audit into `audits/` once it
   validates, and sends back what to fix. A source you can't tie to the subject leaves the audit
   with everything taken from it: its id in the answers' `sources` and its claims in their rationales.
5. Edit no other file. Do not build, test, commit or push.

## Tools

- `node scripts/passages.js <id> <regex> [--in <dir-or-file>]` prints the paragraphs that match in the subject's
  saved sources and downloaded books (and in each `--in` path, such as a corpus folder), with file and line, a page
  at a time (`--page 2`); `--files` counts matches per file. Use it to find passages instead of reading whole texts.
- `node scripts/set-answers.js <draft> <file | ->` writes answers into the draft, one per line:
  `id<TAB>value<TAB>s1,s2<TAB>rationale` (value -2..2 or null). It checks each line and writes nothing if one fails.

An `excluded:` line or a `notIdeasOfWhatSocietyShouldBe` record from validate.js is a result, not an
error. The `DONE.txt` files in `scratchpad/lane-out/` are the driver's: don't write to them.
