# New statements

**Low priority** (2026-10-29): every new statement has to be backfilled across every ideology and
every person audit, for little improvement on the site. Collect candidates here, but don't start a
batch unless that trade-off changes.

Candidate statements and the plan for choosing them. Statements are the only way to tell apart
ideologies the test can barely separate, and each one costs a backfill across every audit, so they
are chosen together in one batch and held to the bar in `audits/statements/STANDARD.md`.

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
- **Wording feedback from a tester** (Discord, 2026-10-29): `democracy-best` ("Democracy is best even
  when voters make poor choices") depends on context, e.g. whether the public is manipulated by
  unchecked propaganda. Same kind as below.
- **Wording feedback from a tester** (Discord, 2026-10-28): `monarchy-legitimate` "can" should be
  "may" (any ruler can be good); `preserve-national-culture` and `profit-exploitation` are too
  context-dependent to answer flatly. Rewording changes a statement's id (audits/statements/texts.json).
- **Near-duplicates:** "Religion and government should have nothing to do with each other" and
  "Religion should stay a private matter, out of government" both lead Quebec nationalism's list;
  review whether both are needed.
- **"The means of production should be owned in common rather than privately."** (2026-10-29) The bank
  has no plain statement of common ownership, only niche variants, so the mainstream rejection of
  socialism is carried by `personal-possessions-private` ("Personal belongings should remain private
  while the means of production are held in common"), a bad statement: a communist distinction
  that Centrism, US modern liberalism, Capitalism and others reject only for its second half, yet
  their "What it stands for" shows the whole of it negated (13 lists). The plain statement would
  carry this position cleanly for dozens of ideologies on both sides; worth a backfill. Once it is
  active, consider retiring `personal-possessions-private`.

