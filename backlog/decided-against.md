# Decided against

Ideas that were considered and ruled out, so they aren't proposed again. Reopening one needs an
explicit decision from the maintainer.

- **Scoring silence** in matching, as "Neither", as an average answer or as an expected distance.
  Silence is never scored unless the maintainer reopens it for an explicit reason (2026-10-29).
- **Tuned weights** in matching (distance or confidence weights; reverted 2026-10-28) and
  **adjusting a bar to include or exclude one person or ideology.**
- **Grouping place twins** (Quebec / Catalan nationalism) on the page: no source defines a group
  containing both, so the grouping would be a category of our own. **Ideology families** (retired
  2026-11-08 for the same reason: every ideology is answered from its own defining sources), and
  **breaking near-ties by Wikipedia views**.
- **Fixing mild takers** (2026-10-29), e.g. by amplifying answers by direction (reading a ±1 as a
  firmer position on its side). A taker who answers mildly lands on a softer ideology on the same
  sides; correcting it would override their answers. A mild answer is often a lean the taker could
  flip: the maintainer's own runs gave "Major industries like energy, rail and utilities should be
  publicly owned" +1 on 2026-10-31 and -1 the next day. Taken at face value the flip moves the result
  a little, as the doubt warrants; amplified, a coin-flip would swing it.
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

## Statement counts or "% likely your closest" as the match number (2026-10-30)

- Same-side counts on shared statements ("41 of 52"): statements are sparse for ideologies, people and
  takers alike.
- The chance each ideology is the closest (plausibility weights): that is uncertainty, not likeness;
  uncertainty, if shown, is a range around the % match (see results.md).
- Uncertainty from simulated answers to unasked statements: scores silence.

## Statement-based matching (frozen 2026-10-30)

Matching two records by the statements both answered (average gap over the overlap, per-ideology
spreads) is gone for good: ideologies, people and takers are all sparse, so overlaps are small and
vary, and a sparse record wins on a handful of shared statements. All matching (results, people,
Compare, the next-question selector, "Done") is distance on the 14 real lines. test.js
fails if a statement-matching function, audits/spreads.json or a shipped statement spread returns.
Display lists of shared statements ("why they matched") stay: they explain, they don't rank.

## An absolute uncertainty allowance (2026-10-31)

Allowing every line the same absolute uncertainty (half the average line's spread) instead of 50% of
its own spread would show 604 ideologies and 413 people (controls still fail), but lines 10-14 are
small enough to pass with nothing answered. Brandon: those lines are 1% of the weight but still
meaningful, and records silent on them are how loose matches like Jared Kushner came in. Every
line keeps its own 50%.

## Like-with-like matching (2026-10-31)

At Done, takers whose ideology sits near the edge of the lines are pulled about 10% toward the centre
(the posterior plays safe on lines they answered little), and find their own ideology first 68% of the
time against 89% for central ones. Proposed fix: compare the taker with each ideology as it would be
placed from the taker's answered statements, so both carry the same pull (edge +4 points, top 3 +3-4
in two simulated runs). Brandon: it changes what takers are compared with ("changing question takers'
answers"); matching compares the taker with each ideology's real place. Narrowing the bars by asking
more isn't a practical alternative either: line 13 is still 5% unknown with every statement answered.

## Background artwork on the home page and share card (2026-11-01)

A faint uncolored outline of the globe mark was tried behind the home page hero and the share card
(top right, then bottom right). Brandon: no on the home page; on the card it made the text harder to
read. The home page stays plain. The card later got soft color glows instead (no shapes, so nothing
echoes the dividing lines) and darker grey text; sorting the colors darkest-first (black at the top) was tried and dropped. Grey bars and lines were rejected for clashing
with the line tracks, and a separate white panel for the lines for taking their space.

## Showing all 14 lines on the page (2026-11-01)

Lines 9-14 would need names. End names by movement (e.g. "Social conservatism ↔ Intersectionality")
cast one side as opposing the other's values (Brandon: "saying feminism opposes traditional family is an
issue"); topic names overlap too much with lines 1-8. The page keeps the 8 drawn lines; matching and
inclusion still use all 14. A shared true-width scale across lines was also weighed: each line stays
stretched to its own extremes, since band width relative to the line is what the uncertainty rule measures.
Later the same day lines 9-14 were added unnamed ("Line 9"...) in a collapsed "6 smaller dividing lines"
section on the results, Compare, ideology and person pages, each with its statements per end; not on the share card.

- **Rewording the active bank's "rather than" statements into priority form** (2026-11-04): 62
  active statements use "X rather than Y"; turning them into "X should matter more than Y" would
  need new ids and re-answering in every audit, for little gain to quiz takers (Brandon). New
  statements avoid "rather than" (wording check); existing ones stay.
