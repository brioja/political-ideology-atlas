# Decided against

Ideas that were considered and ruled out, so they aren't proposed again. Reopening one needs an
explicit decision from the maintainer.

- **Scoring silence** in matching, as "Neither", as an average answer or as an expected distance.
  Silence is never scored unless the maintainer reopens it for an explicit reason (2026-10-29).
- **Tuned weights** in matching (distance or confidence weights; reverted 2026-10-28) and
  **adjusting a bar to include or exclude one person or ideology.**
- **Grouping place twins** (Quebec / Catalan nationalism) on the page, **ideology families**, and
  **breaking near-ties by Wikipedia views**.
- **Fixing mild takers.** A taker who answers mildly lands on a softer ideology on the same sides
  (`scripts/regression.js --sides`); correcting it would override their answers.
- **Naming dividing lines the page doesn't draw.**
- **Rewording the 17 statements whose text bundles two claims** (found 2026-10-29: `unions-good`,
  `cut-welfare`, `abolish-money-wages`, `democracy-best`, `political-elite-corrupt`,
  `equal-moral-worth`, `head-commands-forces`, `end-foreign-alliances`, `abolish-rental-housing`,
  `sex-ed-in-schools`, `encourage-eccentricity`, `central-bank-independence`,
  `economic-self-sufficiency`, `labor-aristocracy`, `democratic-peace`, `religion-illusion`,
  `left-right-obsolete`). Rewording a text means a new statement and a backfill of every audit; not
  worth it for these.
- **Ordering "What it stands for" by how *defining* a position is** (2026-10-29). It stays ordered by
  how unusual each strongly held stated position is among all ideologies: that can be checked against
  the data, while "defining" is interpretive. So a broad label like Liberalism or Trumpism may lead
  with positions that set its camp apart rather than its best-known slogans; that is expected.

