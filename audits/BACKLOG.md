# Ideology-side backlog

Work on the ideology catalog, statements and audits that has been discussed but not started. Each
item says what would decide it. Add new ideas here, not only in conversation, and move an item to
"Decided against" when it is ruled out so it isn't proposed again.

## New statements

Statements are the only way to tell apart ideologies the test can barely separate, and each one
costs a backfill across every audit, so they are chosen together in one batch.

- **Confused pairs.** `node scripts/separation.js` lists neighbouring ideologies with fewer than 3
  statements that separate them (2+ notches apart, at least one side firmly held). For each pair, an
  agent reads both audits and proposes a general, sourced, contested statement on their real divide,
  never naming either ideology. Then pick the set that splits the most pairs (an estimated 10-40
  statements, not one per pair), hold each to the bar in `audits/statements/STANDARD.md`, backfill
  with the statement-backfill workflow, and promote only those that firmly split their targets. Some
  pairs are synonyms or subsets instead (Marxism / Classical Marxism, African socialism / Ujamaa):
  those are a catalog decision, not a statement.
- **From Jewish secularism's audit** (it left the site after an honest re-audit: 59 stated
  positions, just short of the bar). Its own missing statements, in general wording so other
  ideologies can take a side; Jewish-specific wording would likely fail the bar:
  1. "A person can fully belong to a religious people or culture without believing in its god."
     Yes: Jewish secularism, cultural Muslims, Hindutva (Savarkar). No or split: Islamism,
     Christian nationalism, Religious Zionism. The strongest of the four.
  2. "Membership in a religious or ethnic community should be open to anyone who chooses to identify
     with it, without formal conversion or descent." Splits ethnic and civic nationalists and
     religious traditionalists.
  3. "The state should offer civil marriage and divorce to everyone, whatever religious courts
     allow." Contested in Israel, Lebanon, India's personal-law debate and much of the Muslim world.
  4. Weaker: "Religious students should serve in the military or national service on the same terms
     as everyone else." (Public transport on the Sabbath is too local to pass.)
- **Wording feedback from a tester** (Discord, 2026-10-28): `monarchy-legitimate` "can" should be
  "may" (any ruler can be good); `preserve-national-culture` and `profit-exploitation` are too
  context-dependent to answer flatly. Rewording changes a statement's id (audits/statements/texts.json).
- **Near-duplicates:** "Religion and government should have nothing to do with each other" and
  "Religion should stay a private matter, out of government" both lead Quebec nationalism's list;
  review whether both are needed.

## Catalog

- **Taoism:** not linked from Wikipedia's List of political ideologies; Wikidata classes it as a
  religion or philosophy.
- **Confucianism** is a carry-over from an older list that today's Wikipedia-only rule would drop;
  decide one way for both.
- **The Wikidata class filter** drops linked entries: Buddhist anarchism, Engaged Buddhism, Buddhist
  modernism, Mormon fundamentalism, Political aspects of Islam. Dry-run a looser filter (religious
  movement, school of thought) first.

## Audits

- **Remaining silence.** `scripts/silence-to-null.js` turned 56,931 "no doctrine" zeros into "no
  known position"; about 47,000 zeros remain, most of them real splits but roughly a third silence
  written with a "but" clause. Re-audits under `audits/AUDIT_RULES.md` (`"rules": 2`) pick these up.
- **Inference review** (parked 2026-10-29: it changes only which ideologies pass salience, nothing a
  taker sees). Medium/high answers deduced from a general value should be low. Prepared in
  `scratchpad/inference-pass/` (jobs, brief, apply and status scripts); the method was two
  independent reviews, lowering only where both agree.
- **Loosely placed shown ideologies.** After any re-audit wave, deepen the shown ideologies left close
  to the salience bar, the most viewed first (Democracy, Hindutva, Christian nationalism, the
  Alt-right). Single-cause and national movements usually fail honestly; don't deepen those as a
  campaign.

## Decided against

- **Scoring silence** in matching, as "Neither", as an average answer or as an expected distance.
  Silence is never scored unless the maintainer reopens it for an explicit reason (2026-10-29).
- **Tuned weights** in matching (distance or confidence weights; reverted 2026-10-28) and
  **adjusting a bar to include or exclude one person or ideology.**
- **Grouping place twins** (Quebec / Catalan nationalism) on the page, **ideology families**, and
  **breaking near-ties by Wikipedia views**.
- **Fixing mild takers.** A taker who answers mildly lands on a softer ideology on the same sides
  (`scripts/regression.js --sides`); correcting it would override their answers.
- **Naming dividing lines the page doesn't draw.**
