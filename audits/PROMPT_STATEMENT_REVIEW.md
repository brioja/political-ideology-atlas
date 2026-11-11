# Statement review loop

For a reviewer session (Codex, or another Claude session) working through statements whose wording may not
measure one clear claim. Start it with one line:

> Follow audits/PROMPT_STATEMENT_REVIEW.md.

Audits sometimes answered a statement differently from the claim it was meant to ask, mostly where the wording
joins two claims ("and"), contrasts two ("rather than"), hides a condition, or uses jargon. The loop takes them
in quiz order, so the statements most people see come first.

## The loop

1. Run `node scripts/statement-review.js next`. It prints the path of a brief
   (`scratchpad/statement-review/<id>-brief.md`) for the next statement that fails the wording check and has no
   review yet, or `none` when the queue is empty.
2. Read the brief. It has the entry, the flagged words, the answer spread, sample rationales (those weighing two
   things against each other first), related statements and the wording rules.
3. Read more than the samples: the full `answers["<id>"]` in `audits/profiles/*.json` and `audits/people/*.json`,
   and where it matters the sources an audit cites (`scratchpad/sources/<audit id>/`). Find what the audits
   actually answered: which half of a joined claim decided the answer, and how they read a contrast.
4. Check your proposed wording: write it to a JSON file in `scratchpad/statement-review/` as
   `[{"statement": {"id": "x", "text": "..."}}]` and run `node scripts/statements-check.js --wording <file>`.
5. Write `scratchpad/statement-review/<id>-results.md`, as the brief asks. That file marks the statement reviewed.
6. Go back to 1. Stop at the number of reviews you were asked for (default 10), or at `none`.

`node scripts/statement-review.js list` shows the whole queue in quiz order.

## What you may edit

Only files in `scratchpad/statement-review/`. Never edit `statements.json`, `audits/statements/texts.json`, any
audit, or any other repo file. The maintainer reviews every proposal; the integrator applies the approved ones,
updates `texts.json`, nulls the answers named as clear conflicts (with their history kept) and rebuilds.

## What makes a good proposal

These came out of the reviews on 2026-11-10 and are what the maintainer accepted:

- **Keep the claim the audits answered**, so the id and answers stay. Say so plainly when that's impossible
  (a new id). Name the answers your wording would make wrong. Separate **clear conflicts** (the answer's own
  rationale argues against it: "stops short of treating the nation as sacred" with a +1) from **needs evidence**
  (a thin rationale, not shown wrong). Clear conflicts get nulled; the rest wait for the audit's next pass.
- **"Keep as is" is a fine verdict.** Some statements fail the check without a real problem; `sacred-nation`
  kept its wording because its two halves are one idea in every source.
- **Errors are absolute** (Brandon, 2026-11-10): the statement text never keeps an error word ("and",
  "can", "may", "rather", "so", "because", "as well as", "not only", a semicolon), whatever the explanation;
  `statements-check.js` no longer accepts one. Fold a list into a general word, use a colon or a single phrase
  ("kindred peoples"), put the list in the agree text, or say a permission or ability another way ("able
  to"). Only warnings may stand, when test 3 confirms them.
- **One claim, no hidden second one.** Fold a list into one general word ("major industries", not "energy,
  rail and utilities"); move examples to the agree text. Where two halves can come apart, check the rationales
  for which half decided the answers; related statements may already measure the other half.
- **A general word must not hide silence** (Brandon, 2026-11-11). A list, or a general word that stands for
  one, claims a subject supports every part, while an audit often has evidence for only one ("night-watchman
  state": a source limiting the state to protecting property says nothing on defence). Use a general word only
  where the answers' evidence speaks to the general claim itself; otherwise keep the part the audits answered
  and name the answers that rest on the dropped part, or propose a new id.
- **"A rather than B":** ask what the contrast meant. Emphasis becomes "more A than B"; substitution becomes
  "A should replace B"; a redundant contrast is dropped ("Decisions should be made as locally as possible").
- **Plain words.** No jargon ("the political nation", "interlocking"), no figurative verbs ("turn away
  from"), no "should" that could read as a prediction ("should do more" for "should rely more on").
- **The agree text means exactly the statement**, in plainer words or with examples; it never adds a claim the
  statement lacks. The disagree text is the exact negation ("at least as much B as A" for "more A than B").
- **Don't imply everyone is one of two genders** (Brandon, 2026-11-11): "gender balance" and "the sexes"
  are out; name the groups compared ("roughly as many women as men").
- **Check the sources' own terms** before choosing a word ("struggling against", not "fought"; "sacred", not a
  softer word that would also fit ordinary patriotism).

## Reporting

When you stop, reply with one line per statement reviewed: the id, your verdict, and your proposed text.
