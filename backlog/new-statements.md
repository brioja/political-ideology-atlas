# New statements

**Low priority** (2026-10-29): every new statement has to be backfilled across every ideology and
every person audit, for little improvement on the site. Collect candidates here, but don't start a
batch unless that trade-off changes.

- **Mainstream statements for the unity-across-borders line** (2026-10-31; the line anchored on
  civilizational-union, kin-peoples-union, pool-sovereignty and common-currency). Its core statements
  are ones mainstream politicians rarely address, so their error bars there stay wide (it had a 60%
  allowance until the rule moved to error bars on 2026-11-01). Drafts: free movement within a
  regional union; membership of a regional economic union; developing countries acting together
  (BRICS) for a bigger say in the IMF, World Bank and Security Council; closer ties with countries
  sharing a language or history (a commonwealth); and, for US politicians, staying in trade
  agreements with neighbours (USMCA) and paying into the UN and the WHO. Where each lands is decided by
  the ideologies' answers, so sample ~100 ideologies before a full backfill. The secession line
  (right-to-secede, minority-territorial-autonomy, minority-language-support) has the same gap: it is
  the widest bar for many politicians removed on 2026-11-01.

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


- **Split `state-arms-monopoly`** (tester feedback, 2026-10-30 plain-language pass). "Only the state's army
  and police should be allowed to bear arms; all other armed groups should be disarmed" is read two ways:
  a state monopoly of organised force (no militias or private armies: laissez-faire, economic liberalism,
  Benazir Bhutto agree) or no private gun ownership ("bear arms": American conservatism and Black
  conservatism disagree as gun-rights defenders). A clean replacement is a statement on militias and
  private armies only; `limit-guns` already covers private guns.
- **Split `shared-human-nature`** (tester couldn't follow it, 2026-10-30). It bundles three claims (a shared
  human nature exists; it grounds dignity and rights; it should not be redesigned). Audits read it as
  natural law (Catholic traditions agree) and as anti-redesign (transhumanists and "new man" movements
  disagree). Two statements would carry each cleanly: rights rest on a shared human nature; human nature
  should not be altered by technology.

## Proposed by the 2026-10-30 honest re-audits (rules 3)

Each re-audit lists defining positions no statement captures (`missingStatements` in its audit file).
Several ideologies that left the site fell just short of the bar for want of these (Stoicism 1.02x,
Egalitarianism 1.12x, Right-wing antiglobalism 1.31x). Not added: each would need a backfill across
every ideology and person. Candidates worth weighing first, because more than one ideology would answer
them: citizens' political influence independent of money (egalitarianism; likely many), tax havens
dismantled (alter-globalization), migration governed by national law only and no international court
jurisdiction over citizens (right-wing antiglobalism, national conservatives), encryption back doors
(technolibertarianism, civil libertarians), weight as a protected ground (fat feminism), one community of
reason (Stoicism, cosmopolitans), the difference principle (egalitarianism, Rawlsian liberals).
Full lists: soviet-anti-zionism, budapest-school, valencian-nationalism, fat-feminism,
right-wing-antiglobalism, alter-globalization, technolibertarianism, indigenismo, blaverism,
slovenian-nationalism, stoicism, egalitarianism, georgism (audits/profiles/<id>.json).

- **Positive disagree sentences (statement standard test 4, cf8461ac).** 418 of the 490 `disagree`
  sentences are the statement with "not" added. Draft a positive position for each, true of every
  audited ideology that disagrees (from their rationales), keeping the plain negation where no exact
  positive exists; flag statements whose disagree side can only be a hard-to-read negation for
  rewording (new id, re-answer: decide each). Display text only (ids stay), but visible copy: a
  before/after doc before pushing. Parked 2026-11-03 for tokens (about 10 agents of ~50 statements).
  New statements follow test 4 from now on.

- **`abolish-central-banks` bundles two claims** (2026-11-03, statement pass pilot): "Central banks
  should be abolished and money left to the market." Jacksonian democracy holds the first half (no
  national bank) and rejects the second (gold and silver money, an independent treasury), so it
  can't answer cleanly, and the disagree side fails test 3/4. Fix: a single-claim candidate
  ("There should be no central bank") answered by every audit, then retire the bundled one. It
  rides along with the new-ideology statements' backfill or deepen.

- **No asylum statement** (2026-11-04, Identitarian movement statement pass): the bank has nothing
  on asylum or on turning back migrant boats (Defend Europe). Not proposed because the library had
  the campaign only through scholarly paraphrase, no primary statement of a principle. Propose it
  when an ideology's own texts state one.

- **`central-bank-independence` bundles who and what** (2026-11-04, Social market economy pass):
  it joins who controls monetary policy with what policy aims at. Erhard's texts state the aim
  (price stability first, proposed as `price-stability-first`) but never independence. Consider a
  split if audits show ideologies holding one half only.

- **Coverage gaps Codex found in batch 2** (2026-11-04, `scratchpad/statement-pass/codex-review-batch2.json`,
  `missedPosition` entries). None drafted: each needs a primary passage first.
  - Natural aristocracy should rule (esoteric neo-Nazism): "Some people are naturally better suited to
    rule than others." states aptitude, not a claim to rule.
  - Spreading property to poorer people (social market economy): "Property should be spread widely
    among small owners rather than concentrated in corporations or the state." bundles a condition the
    social market economy doesn't hold (Düsseldorf principle 10 is a lead).
  - Counter-cyclical safeguards against crises (social market economy): only the negation of "Governments
    should avoid running large budget deficits to stimulate the economy." carries it (Düsseldorf 13).
  - Metapolitics, the battle of ideas before power (identitarian movement; Nouvelle Droite too, 11-04): "Cultural renewal of a nation
    should come before building its state." is about statehood, not taking power in an existing state.

- **`end-foreign-alliances` bundles two claims** (2026-11-04, isolationism statement pass): "My country
  should end its permanent military alliances and bring its troops home from abroad." joins alliances
  with overseas troops; Lindbergh-style hemispheric defence keeps outposts while refusing alliances.
  Single-claim candidate `avoid-permanent-military-alliances` added; retire the bundle once audits
  answer it.

- **Obedience to a flawed ruler** (2026-11-04, Madkhalism statement pass): the bank has only the
  negations ("Subjects may lawfully resist or remove a ruler who breaks the constitutional laws and
  the trust placed in him."), no positive "subjects must obey their ruler even when he rules badly".
  Madkhalism's defining position; not proposed because Codex couldn't obtain primary ruler-obedience
  texts outside movement sites (Sunarwoto 2020 is the lead). Also fits divine-right monarchism.
