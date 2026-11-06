# Catalog

Questions about which ideologies the catalog includes.

- **Taoism:** not linked from Wikipedia's List of political ideologies; Wikidata classes it as a
  religion or philosophy.
- **Confucianism** is a carry-over from an older list that today's Wikipedia-only rule would drop;
  decide one way for both.
- **The Wikidata class filter** drops linked entries: Buddhist anarchism, Engaged Buddhism, Buddhist
  modernism, Mormon fundamentalism, Political aspects of Islam. Dry-run a looser filter (religious
  movement, school of thought) first.
- **Wikipedia backlinks as a second candidate source** (ideology 2.0 idea, 2026-10-30): every article
  linking to "Political ideology" or "Ideology" (2,462 on 2026-10-30), through the same Wikidata
  filter as the list page. Only 46 were new and passed the filter, about half real ideologies; the rest
  of the 2,350 new articles are people, books, parties and general concepts. A top-up of roughly 20-25,
  not a way back for ideologies that left after honest re-audits: those fail for too few stated
  positions, which new statements, deeper sources or pages without matching would address. The
  candidates are triaged in [ideology-candidates.md](ideology-candidates.md). Decide: add backlinks to
  `scripts/ideology-candidates.js` as a second source (union, like the list page), or keep hand-picking
  from the candidates file.

## Re-run the catalog pre-checks under the content test (2026-11-05)

The list and sidebar pre-checks (scratchpad/list-precheck, scratchpad/template-precheck) rejected entries
under the old definition "a set of ideas, not a group, state, event, concept or label" (e.g. McCarthyism:
"a political practice and period"). Since 2026-11-05 the definition is content only: a set of political
ideas for how to run a society (regime types, doctrines, practices, prejudices and critics' names pass).
Re-run both pre-checks with the new definition (same pipeline, `scripts/ideology-candidates.js`) so the
rejected entries are judged the same way; their verdicts then stand as they are. Costs one cheap
agent pass over the rejected articles.

## Entity check in code (agreed with Brandon 2026-11-05; build when Wikidata allows requests)

An entry whose Wikidata item is an entity that HAS ideas but isn't one is excluded in code, before it
reaches an agent: instance of (or subclass of) human, political party, organization, state (country,
sovereign state, historical country), government (a specific body, e.g. "Government of France"; never a
form of government, which stays in), or event (war, revolution, election, battle, protest, occurrence).
An item that Wikidata ALSO files as an ideology, political movement, doctrine or policy is not excluded.
Periods are NOT filtered. Data: Wikidata P31 + P279* (SPARQL or wbgetentities, slowly; 429 on 11-05).
Sits beside scripts/resolve-articles.js (notability) and lib.duplicateOf; agents then judge only content.
