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
