# How statements are chosen

The test is for entertainment, so the bar for a statement is light, but it is a bar: a statement
has to be a real political question that ideologies actually disagree on. "I like cabbage" doesn't
qualify, and neither does "Corruption is bad".

## The standard

A statement is **asked in the test** only when it meets all four:

1. **Real position.** At least one ideology's audit documents a stance on it, with a source. New
   statements enter this way, through an audit's `missingStatements` (see below).
2. **Signal on the real lines.** The ideologies' positions on the real dividing lines predict their
   answers to the statement better than the same answers shuffled among them, by the test that
   decides which lines are real (beat 60 shuffles at the 95th percentile;
   `scripts/statement-signal.js`). Matching uses line distance only, so a statement without signal
   changes no match. It also needs enough answers: with few, shuffled answers fit as well as real
   ones, so a new statement waits for more audits.
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
     `node scripts/statements-check.js --wording` marks wording at two levels: errors ("can", "may",
     "rather", "so", "because", "as well as", "not only", "and") are a defect and always reworded (Brandon, 2026-11-10: errors are absolute, no explanation excuses one); warnings
     ("or", "like", "by", "through", "in", "not", "if", "unless", "when", "whenever", "while", "until", "provided", "as long as") are often fine but worth a look ("in economic life"
     is a vague scope; "in war" is just a place; a "not" statement usually has a positive form that
     is easier to answer; an "if", "unless" or "when" condition is hard to negate ("even when" and "even if" only add emphasis and aren't marked; "provided" is marked only as a condition, not as a verb: "provided by"), since a disagree could reject
     the claim or the condition).
   - **No comparison that adds a claim.** "Civilians are legitimate targets, just like its soldiers"
     also asserts that soldiers are; drop the comparison. "X rather than Y" asks two things, so
     disagreeing is ambiguous (against X, or against preferring it to Y?); state X alone when Y is
     just "not X" ("favour some ways of life over others rather than stay neutral between them" ->
     "the state should support the ways of life it judges good").
   - **A position, not a reason.** "So that", "because" and "in order to" add a reason, and people
     who hold the position for another reason would split on it ("working hours should be limited
     by law so that work is shared among more people"). State the position alone.
   - **No means attached.** "Paid work should be shared among more people by cutting everyone's
     working hours" (or "socialism should be achieved through revolutionary war") joins a goal and a means, and a disagree can't say which it rejects. State one.
     (A passive "by", "chosen by voters", names who acts and is fine.)
   - **Not already in the bank.** No existing statement already asks it, even in other words; a
     new candidate that does is merged into that statement instead.
4. **Both sides are positions.** Agreeing and disagreeing should each be a position that people and
   ideologies actually hold and could answer to. Write the `disagree` sentence as a positive position
   wherever one is true of every audited ideology that disagrees (check their rationales) and means
   exactly "not the statement"; otherwise keep the plain negation (see Explanations). A statement
   whose disagree side can only be a hard-to-read negation (a double negative, or two claims bundled)
   is flagged for rewording.

`node scripts/statements-check.js` reports test 2 for the candidates and lists the audits' open
missing statements; `node scripts/statement-signal.js` checks the active statements too (minutes).
A candidate that passes test 2 is promoted (asked); an active statement that fails it is demoted
to `candidate` (still answered by audits, not asked) until audits show signal again.

Niche statements are welcome. The test asks whichever statement best separates the ideologies
still in contention, so "The invention of agriculture was a mistake" only comes up when
Anarcho-primitivism is a live match, and it doesn't make the test longer for anyone else.

## Adding statements

1. An ideology audit lists its defining positions that no statement captures in
   `missingStatements` (see `audits/PROMPT.md`). New ideologies are the main source.
2. Merge candidates that say the same thing, check the wording rule, and add the statement to
   `statements.json` with `"status": "candidate"`.
3. New audits answer it; an older audit answers it at its next completing pass, and until then a
   missing answer counts as null. Other answers stay valid.
4. Once test 2 passes it is promoted automatically: every audit run ends with
   `node scripts/statement-signal.js --apply`, which also demotes active statements that fail it.

A rewording that changes the meaning changes what was answered, so it gets a new id. A rewording that
only fixes how readers parse a statement, keeping the claim the audits answered, keeps its id and
answers; record the new text in `audits/statements/texts.json` (Brandon, 2026-11-09).

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
