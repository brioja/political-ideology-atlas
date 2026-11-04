# How statements are chosen

The test is for entertainment, so the bar for a statement is light, but it is a bar: a statement
has to be a real political question that ideologies actually disagree on. "I like cabbage" doesn't
qualify, and neither does "Corruption is bad".

## The standard

A statement is **asked in the test** only when it meets all four:

1. **Real position.** At least one ideology's audit documents a stance on it, with a source. New
   statements enter this way, through an audit's `missingStatements` (see below).
2. **Contested.** Among audited ideologies, at least one states agreement and at least one states
   disagreement (high or medium confidence, not inferred).
3. **Well-formed.** One claim, read literally, in neutral words that both sides would accept as a
   fair statement of the question. In particular:
   - **Plain words.** A general reader understands it without a glossary or a theory behind it.
   - **One reading.** It can't reasonably be read as two different questions ("bear arms" read as
     private armies by some and private guns by others).
   - **Not trivially true.** Read literally, it isn't something nearly everyone accepts ("a monarch
     can be a good ruler": any ruler can). Don't use "can" or "may": a permission is almost always
     trivially true. State the position itself ("civilians are legitimate targets", not "civilians
     can be legitimate targets").
   - **No unstated context.** It can be answered flatly, without "it depends on the country, the
     case or the circumstances".
   - **Not relative to the status quo.** It states a position, not "more" or "less" than now, which
     means different things in different countries ("the minimum wage should be raised").
   - **General.** It doesn't name an ideology, party or movement, and isn't so local that only one
     country's politics could take a side ("public transport on the Sabbath").
   - **A general word, not a list.** "Objects that people worship", not "statues, shrines and
     tombs": a list invites "what about a fourth thing?" and its "and"/"or" can hide two claims.
     `node scripts/statements-check.js --wording` marks every "and", "or", "can", "may", "like", "as
     well as" and "not only" to check.
   - **No comparison that adds a claim.** "Civilians are legitimate targets, just like its soldiers"
     also asserts that soldiers are; drop the comparison.
   - **Not already in the bank.** No existing statement already asks it, even in other words; a
     new candidate that does is merged into that statement instead.
4. **Both sides are positions.** Agreeing and disagreeing should each be a position that people and
   ideologies actually hold and could answer to. Write the `disagree` sentence as a positive position
   wherever one is true of every audited ideology that disagrees (check their rationales) and means
   exactly "not the statement"; otherwise keep the plain negation (see Explanations). A statement
   whose disagree side can only be a hard-to-read negation (a double negative, or two claims bundled)
   is flagged for rewording.

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
reshaped to favour developing countries". A `disagree` sentence is a clean positive opposite
where one exists and means exactly "not the statement" ("Military service should always be
voluntary"); otherwise the plain negation in the statement's own words ("Corporations should not be
more tightly regulated"). Never an either/or listing the ways to disagree ("Companies face fewer
rules, or the current amount is enough"): an either/or is not a position. For "A rather than B" keep
both sides ("Prisons should not put rehabilitation ahead of punishment"); for a statement that
bundles two claims, "It is not true that ...". An `agree` sentence means exactly the statement, in other words that help a reader
see the position; repeating the statement is the fallback when no faithful rewording exists.
Explanations are display text: fixing one doesn't change what was answered, so the id
stays.

## Reference

`coverage.json` maps the statements onto the Manifesto Project's issue categories
(`manifesto-categories.json`) as a rough check of which mainstream issue areas the bank covers. It
is a reference, not a requirement.
