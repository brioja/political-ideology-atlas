# What counts as an ideology

The catalog is built generously from data, and the bar for reaching the test is set by evidence,
not by anyone's judgement of which ideologies matter. An entry has to clear four gates in order.

## 1. Notable: in the catalog

An entry is in `audits/catalog.json` only if it meets both:

- **Its own English Wikipedia article.** A redirect counts only when it is another spelling or
  name for the article's subject (Anarcho-Communism → Anarchist communism, Tridemism → Three
  Principles of the People). A redirect to a broader or different topic (a parent ideology, a
  section, a person) means Wikipedia doesn't treat the entry as independently notable. An article
  about an ideology in one place, its history, or a list ("Feminism in India", "History of
  democracy") isn't an ideology's own article either.
- **A source names it as an ideology.** Either Wikipedia's
  [List of political ideologies](https://en.wikipedia.org/wiki/List_of_political_ideologies)
  links it and Wikidata classes it as an ideology, political ideology or political philosophy, or
  as a direct subclass of one (Ecofeminism, a social movement under feminism); or a contributor
  suggests it.

One exception: a redirect to a broader article counts when that article covers branches with
opposite positions, so it can't be audited as one ideology (Left and Right-wing accelerationism,
both covered by Accelerationism). Otherwise, entries that land on the same article are one
ideology.

The article is required because a quiz-taker matched to an ideology needs somewhere to learn more
about it. `scripts/ideology-candidates.js` applies this gate, and 12-month page views set the
audit order.

## 2. An ideology: passes the audit's first check

The audit (`audits/PROMPT.md`) records `notAnIdeology` instead of answers if the entry is:

- **not a set of political beliefs:** an organisation, party, movement as a group, event, period,
  office, person, place, prejudice or field of study;
- **a duplicate** of another audited ideology under another name (an entry with its own
  Wikipedia article, not a redirect, is distinct, even when it overlaps heavily with another:
  Arab nationalism and Pan-Arabism, Socialist democracy and Democratic socialism); or
- **undocumented:** no reliable source describes its positions.

When in doubt, the entry is audited, and gate 3 decides on the evidence.

## 3. Comparable: shown in the test

An audited ideology is shown in the results, and helps define the axes, only if it **takes stated
positions on the questions the other ideologies answer**. That means enough stated answers (not `null`, and not
the marked inferences older audits hold) across the statements to place it on every one of the
test's dividing lines, each more known than unknown. This is the same uncertainty rule people get
(`uncertainty` in `pca.js`; see the README).

An ideology that only speaks to one issue, or whose sources are silent on most statements, stays in the
audits but is left out of the test. Its distinctive positions can still enter the statement bank
through `missingStatements` (see `audits/statements/STANDARD.md`). Once statements that cover it
exist, it may pass.

## 4. Distinguishable: its own place in the results

Two ideologies are **indistinguishable** when they sit closer together on the dividing lines than
the placement uncertainty of someone who answered every statement: no set of answers could say
which of the two a quiz-taker is closer to. The one with more Wikipedia views stays in the test,
and the other is listed on its page ("Holds the same positions as …") with a link to its
Wikipedia article. `scripts/build.js` checks this on every build, so a new statement that
separates them brings both back.

