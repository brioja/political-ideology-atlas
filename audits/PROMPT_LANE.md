# Audit lane

`scripts/lane.js` runs this file in one session per subject. A lane writes audit drafts.

Follow the driver's instructions (subject, report) when it sends them; they take precedence over
this file.

## Which subject

Audit the id the driver gives you, person or ideology.

## For each subject

1. Follow `audits/AUDIT_RULES.md` and `audits/PROMPT_IDEOLOGIES.md` (ideology) or `audits/PROMPT_PEOPLE.md`
   (person) exactly, with `{{id}}`, `{{name}}` and the other fields taken from the next.js output
   or the catalog. Answer the statements the driver's message lists, from the texts it names.
2. `rules`, `auditedAt`, `auditor` and `passes` are the driver's: leave them as they are.
3. Sources go in `scratchpad/sources/<id>/`; helper scripts in `scratchpad/helpers-<id>/`.
4. Write to the file the driver's message names; the driver moves the audit into `audits/` once it
   validates, and sends back what to fix. A source you can't tie to the subject leaves the audit
   with everything taken from it: its id in the answers' `sources` and its claims in their rationales.
5. Edit no other file. Do not build, test, commit or push.

## Tools

- `node scripts/passages.js <id> <regex> [--in <dir | file | s2,s5>]` prints the paragraphs that match in the
  subject's saved sources and downloaded books (and in each `--in` path, such as a corpus folder), with source id or
  file, line and, in a book, the page; a page of output at a time (`--page 2`). `--in s2,s5` or `--in <file>` searches
  only those. `--brief` gives one line per match, five per file (`--brief 20` for more); `--files` counts matches
  per file. `--lines 120-180 <s4 | file>` reads a stretch of a text. Use these instead of reading whole texts.
  In `.jsonl` records (speech dumps) `--from`/`--to YYYY` keep a date range. `--counts <file>` takes one
  `label: regex` per line (one per statement, say) and prints how often each matches, to choose what to search first.
- `node scripts/check-quotes.js <draft> <file | ->` checks quotes, one per line `s4<TAB>quote`, against the saved
  copies the way validate.js does, and says where a quote that fails stops matching.
- `node scripts/set-fields.js <draft> <file | ->` sets the draft's other fields from a JSON object: `scope`,
  `aliases`, `keyFigures`, `keyWorks` and the like replace the draft's; `sources` entries are added or replaced by id
  (`{"id": "s4", "remove": true}` removes one). It runs validate.js on the result and writes nothing if that shows an
  error the draft didn't have.
- `node scripts/wiki.js --redirects "<article>"` lists the redirects to an article with their categories
  (alternative name, subtopic and so on).
- `node scripts/set-answers.js <draft> <file | ->` writes answers into the draft, one per line:
  `id<TAB>value<TAB>s1,s2<TAB>rationale` (value -2..2 or null). It checks each line and writes nothing if one fails.
  Each statement it writes, null included, leaves the statements file, so that file lists what is left to search.

An `excluded:` line or a `notIdeasOfWhatSocietyShouldBe` record from validate.js is a result, not an
error. The `DONE.txt` files in `scratchpad/lane-out/` are the driver's: don't write to them.
