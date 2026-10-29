# How statements are chosen

The test is for entertainment, so the bar for a statement is light, but it is a bar: a statement
has to be a real political question that ideologies actually disagree on. "I like cabbage" doesn't
qualify, and neither does "Corruption is bad".

## The standard

A statement is **asked in the test** only when it meets all three:

1. **Real position.** At least one ideology's audit documents a stance on it, with a source. New
   statements enter this way, through an audit's `missingStatements` (see below).
2. **Contested.** Among audited ideologies, at least one states agreement and at least one states
   disagreement (high or medium confidence, not inferred).
3. **Well-formed.** One claim, read literally, in neutral words that both sides would accept as a
   fair statement of the question.

`node scripts/statements-check.js` reports test 2 for every statement and lists the candidates
the audits have proposed. A statement that fails test 2 stays in the bank as a `candidate`
(answered by audits, not asked) until audits show it is contested.

Niche statements are welcome. The test asks whichever statement best separates the ideologies
still in contention, so "The invention of agriculture was a mistake" only comes up when
Anarcho-primitivism is a live match, and it doesn't make the test longer for anyone else.

## Adding statements

1. An ideology audit lists its defining positions that no statement captures in
   `missingStatements` (see `audits/PROMPT.md`). New ideologies are the main source.
2. Merge candidates that say the same thing, check the wording rule, and add the statement to
   `statements.json` with `"status": "candidate"`.
3. Backfill: existing audits answer only the new statement (`node scripts/pending.js` lists them
   as incomplete, not stale). Other answers stay valid.
4. Once test 2 passes, change the status to `active` (or remove the field) and rebuild.

Rewording a statement changes what was answered, so a reworded statement gets a new id.

## Explanations

Each statement's `agree` and `disagree` sentences are shown as "If you agree / If you disagree" and
describe the position of any ideology or person who answers that way. So each must be true of
everyone who answers that way, whatever their reason: not the opposite extreme, no added reason or
second policy. Disagreeing that "the rules of the international economy should be restructured in
favour of developing countries" is not "the rules are broadly fair" (an economic nationalist wants
them restructured for their own country); it is "international economic rules should not be
reshaped to favour developing countries". Explanations are display text: fixing one doesn't change
what was answered, so the id stays.

## Reference

`coverage.json` maps the statements onto the Manifesto Project's issue categories
(`manifesto-categories.json`) as a rough check of which mainstream issue areas the bank covers. It
is a reference, not a requirement.
