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
- **Ranking people by how certain their placement is** (2026-10-29). Proposed after a thin record
  (Jared Kushner, 49 positions) was a taker's top match while sharing no views with them. Matching
  people on all real dividing lines instead of the 8 drawn ones moved him from #1 to #4 on that link;
  a thin record lower in the top five isn't a problem, and more people in the catalog push it down.

- **Matching changes against sparse-overlap wins** (2026-10-30, measured with scripts/regression.js on the
  simulated suites and real links). Since null-left-out matching (60a48c3), an honestly re-audited, sparse
  ideology can top a light taker on a tiny overlap (Georgism 81% on 8 of 21 answers; Stoicism 100% on 2).
  Rejected: (1) ranking ideologies by distance on the real lines, as people are: pulls mild and light
  takers to the most central ideologies (Pan-nationalism, Procedural democracy), adherents first 38/39 ->
  19/39, two-ideology takers 0/18 with either in the top 5. (2) mean gap plus its standard error: two
  exactly agreeing statements have zero spread, so Stoicism still wins. (3) a minimum overlap (8, or the
  number of real lines): best on simulated suites, but a light taker then almost never reaches an honest
  (rules-3) ideology (0 of 9 for a 14-answer taker), so it penalises honest audits more the more of them
  there are. Brandon: "test takers who are told to see the results would never get many ideologies".
  Also rejected: (4) a special rule in the next-question selector (pca.js nextQuestion) that singles out the leading
  sparse ideology and steers questions toward its positions (Brandon: "sounds like a hack": it hand-selects
  which ideology gets tested). The selector itself is not off limits. (5) counting an ideology's blanks as distance (silence is
  never scored; the old 'Neither' bias). Matching stays as is; the bias shrinks as more audits become honest.

## Statement counts or "% likely your closest" as the match number (2026-10-30)

- Same-side counts on shared statements ("41 of 52"): statements are sparse for ideologies, people and
  takers alike, which is why matching moved to the lines.
- The chance each ideology is the closest (plausibility weights): that is uncertainty, not likeness;
  uncertainty, if shown, is a range around the % match (see results.md).
- Uncertainty from simulated answers to unasked statements: scores silence.
