# How statements are chosen

The statements in `statements.json` decide what the test can see. An ideology whose defining
positions aren't asked about can't be told apart from its neighbors (Zionism, for example), and a
statement nobody disagrees with adds length without information. So the bank is chosen by the rules
below, and each statement's record in this folder shows how it meets them. Like an ideology audit,
any record can be challenged with a source.

**Status (2026-10-14): draft.** The current 81 statements were written by hand before this standard
existed. They are being re-checked in a calibration round (see the end).

## The question standard

A statement stays in the bank only if it passes all four tests. Each threshold sits at a natural
point, not a tuned number.

1. **Political.** It takes a position on a recognized political issue. That means either:
   - a category of an outside issue frame: the Manifesto Project coding scheme
     (`manifesto-categories.json`, mapped in `coverage.json`); or
   - a defining position of an ideology in the catalog, documented in that ideology's sourced
     audit (most positions outside an electoral frame, such as abolishing the state, enter this way).

   *"I like cabbage" fails: it is in no issue frame and no ideology is defined by it.*
2. **Contested.** Audited ideologies take stated (high or medium confidence) positions on both
   sides of it: at least one agrees and at least one disagrees.

   *"Corruption is bad" fails: it is political, but every ideology agrees.*
3. **Contributes.** Removing it makes at least one pair of ideologies indistinguishable: closer
   together than a typical test-taker's settled placement uncertainty (the same bar as the salience
   check, `settledTakerUncertainty` in `pca.js`).

   *A reworded duplicate of another statement fails: dropping it separates no fewer pairs.*
4. **Well-formed.** One claim, read literally, in neutral words that adherents on both sides
   would accept as a fair statement of the question. No double-barrelled statements and no loaded
   terms.

Tests 2 and 3 need audited ideologies, so they are measured during calibration, not judged.

## Where new statements come from

- **Coverage gaps.** Issue frame categories with no statement are checked first (as of the
  2026-10-14 mapping: education, constitutionalism and the rule of law, human rights, peace,
  corruption, immigrant integration, agriculture, Keynesian demand management, public culture
  funding, supply-side incentives). Many will fail test 2 as valence issues; that is the point of
  measuring.
- **Defining positions.** Each ideology audit lists its sourced defining positions that no
  statement captures (`missingStatements`). Candidates from different ideologies are merged by
  meaning, and the more ideologies raise one, the stronger it is.

Every candidate must then pass the four tests like any existing statement.

## Known limit of the issue frame

The Manifesto Project codes the platforms of parties competing in elections. It has no
categories for regime-level questions (anarchism, revolution, theocracy) and puts all of religion,
family and sexual morality into one category (603 Traditional Morality, which holds 10 current
statements). It therefore marks what the bank covers among mainstream party issues. It does not
show what ideology-defining positions are missing; the `missingStatements` field covers that.

## Calibration round

1. Add `missingStatements` to the ideology audit prompt.
2. Audit a pilot sample: the two most-viewed ideologies in each of the catalog's 8 categories (16),
   counting only entries whose Wikipedia article is an exact title match. Redirect and search
   matches can inherit another article's views (Anarcho-Naturism is credited with Naturism's), so
   they can't be ranked by views. The sample: Communism, Marxism–Leninism, Socialism,
   Postmodernism, Fascism, Falangism, Dark Enlightenment, Feudalism, Zionism, Liberalism,
   Stoicism, Technocracy, Libertarianism, Georgism, Anarchism, Anarcho-primitivism.
3. Measure tests 2 and 3 for every current statement and every merged candidate.
4. Change `statements.json` once, recording each statement's evidence here, and re-audit the
   piloted ideologies on the new statements only.
5. Then audit the remaining ideologies, and the people after them.
