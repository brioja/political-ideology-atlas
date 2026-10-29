# Ideology audit instructions

You are auditing one ideology for Political Ideology Atlas, a political ideology test. Your job is to work
out how a committed adherent of this ideology would answer each test statement, and to show your
evidence. Each answer you give becomes one coordinate of the ideology's profile, which test takers
are matched against. Getting it wrong puts real people into the wrong ideology.

Inputs (filled in by the runner):
- Ideology: `{{name}}` (id `{{id}}`)
- Statements: `statements.json` in the repo root. Answer every statement.

Output: write `audits/profiles/{{id}}.json` in the format below. Then run
`node scripts/validate.js {{id}}` and fix every error it reports until it passes.

Read `audits/AUDIT_RULES.md` first. Its rules (sources, answers, confidence, salience, deepening)
apply to every audit, ideologies and people alike, and apply here in full; this file adds only what
is specific to ideologies.

## First check: is this an ideology the test can place?

The catalog is built generously from loose sources (Wikipedia's list of political ideologies and an
older hand-made list), so some entries aren't ideologies. Before researching, open the suggested
Wikipedia article and check (the full criteria are in `audits/IDEOLOGY_STANDARD.md`). Skip the
full audit if the entry is:
- not a set of political beliefs: an organisation, party, movement as a group, event, period,
  office, person, place, prejudice or field of study (for example the Muslim Brotherhood, the
  Progressive Era, ethics);
- a duplicate: another file in `audits/profiles/` already covers the same ideology under another
  name (for example Maoism and Maoist Communism); or
- too obscure to document: it has no English Wikipedia article of its own, or no reliable source
  describes its positions. A redirect counts only if it is another name for the article's subject,
  not a broader topic (unless that topic holds branches with opposite positions, like
  Accelerationism).

Then write only this to `audits/profiles/{{id}}.json` and stop (the validator accepts it):

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
  "auditedAt": "YYYY-MM-DD",
  "auditor": "<model id>",
  "notAnIdeology": "One or two sentences on why, naming the duplicate's id if it is one.",
  "sources": [{ "id": "s1", "kind": "reference", "title": "…", "url": "https://… (a page you opened)" }]
}
```

When in doubt, audit it: a thin ideology is excluded later by the salience check, on evidence.

## 1. Pin down what the ideology is

Many names cover several strands. Before answering, decide which one the profile represents, and
record it in `scope`:
- If there is a canonical core (founding texts, a defining thinker, a party program), use it.
- If the name covers a family, use the mainstream of the family as it exists today, or as it
  existed at its peak if it is historical. Name the thinkers, texts or movements you based it on.
- If the name is a philosophy rather than a political program (for example Stoicism or Platonism),
  answer as its political implications are usually drawn by its scholars and modern adherents. Say
  so in `scope`, and expect many low-confidence answers.

## 2. Sources for an ideology

- An ideology's `primary` sources are its founding texts, manifestos, party programmes and the
  major works of its defining thinkers. Its scholarship (the Stanford or Internet Encyclopedia of
  Philosophy, Britannica, academic work) is a `scholarly` or `reference` source. Wikipedia only
  helps you find these (audits/AUDIT_RULES.md, section 2).
- For a thin theme, search the ideology's programme sections and what its thinkers wrote on that
  topic.

## 3. Answering for an ideology

- Answer as a typical committed adherent would, not a fringe member or a critic.
- A documented split among its strands or adherents (Labor Zionism's cooperatives against
  Revisionist Zionism's private enterprise) is 0 at `low`, a real position. Silence is `null`.
- The ideology's stated position settles a statement only where the statement couldn't be true
  without contradicting it: a 19th-century ideology's stated view on industry doesn't settle nuclear
  power (`null`), but a doctrine of rule by competence settles hereditary office.
- Its own record, for "record over words", is that of regimes where it was the official doctrine of
  the state or ruling party (Juche, Kemalism, Ba'athism, Marxism-Leninism in power): their
  sustained, documented practice is part of the ideology. Where it consistently contradicts the
  doctrine's words (one-party rule alongside praise of popular democracy, a leader cult alongside
  collective leadership), answer from the practice. A lapse of one regime or one period is not the
  ideology's position, and parties that governed as one party among others are not the ideology's
  record.
- Audits written before the shared rules (no `"rules"`) recorded silence as 0 and inferences without
  the "Inferred:" mark, so their salience still counts only `medium` and `high` answers until they
  are re-audited. Audits under rules 2 may hold marked inferences ("Inferred:"); salience leaves
  them out, and the next pass makes each stated or `null`.

## 4. Further reading for test takers

The results page links each ideology to further reading for curious, non-specialist readers.
- `wikipedia`: the English Wikipedia article that is actually about this ideology. The catalog
  entry may suggest one (`{{wikipedia}}`, found automatically as `{{wikipediaMatch}}`). Open it and
  confirm it is about this ideology, not a broader or different topic. Use a better article if one
  exists, or `null` if none covers it.
- `furtherReading`: two to four accessible items a curious reader could open next, such as an
  encyclopedia entry, a founding text online, or a good introduction. They may overlap with your
  sources. Only include pages you opened.
- `keyFigures`: one to three people most associated with the ideology, such as its founder,
  defining thinker or best-known leader, as your sources identify them. Each needs a one-line
  `role` saying how they are associated, their English Wikipedia article, and at least one source
  id. Pick by documented association, not by fame or by how much you like them. Use `[]` only if
  the ideology has no identifiable figures.

## 5. Positions the statements miss

The statements are chosen by the standard in `audits/statements/STANDARD.md`, and audits are how
gaps get found. After answering, list in `missingStatements` the positions that **define** this
ideology (stated in its primary sources or central in the scholarship) but that no statement
captures, even loosely. Leave it as an empty list if there are none, and don't pad it.

- Write each as a candidate statement in the bank's form: one claim, read literally, in neutral
  words that adherents and opponents would both accept as a fair statement of the question.
- Prefer wording that other ideologies could also take a side on ("Laws should follow Islamic
  sharia"), not one that only names this ideology ("Zionism is right").
- Give this ideology's answer (`value`, -2 to +2, never 0), a one-sentence rationale, and at least
  one source id. These are positions you found, not guesses: cite where they are stated.

## 6. Output format

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
  "auditedAt": "YYYY-MM-DD",
  "auditor": "<model id that did the research>",
  "rules": 3,
  "summary": "Two to four sentences, in your own words, on what the ideology holds.",
  "scope": "Which strand, period, thinkers and texts this profile represents, and what it excludes.",
  "wikipedia": "https://en.wikipedia.org/wiki/… or null",
  "furtherReading": [
    { "title": "Readable title", "url": "https://…", "note": "One line on why it's worth reading" }
  ],
  "keyFigures": [
    { "name": "Full name", "role": "Founder of …", "wikipedia": "https://en.wikipedia.org/wiki/…", "sources": ["s1"] }
  ],
  "sources": [
    {
      "id": "s1",
      "kind": "primary | scholarly | reference | program",
      "title": "Title of the work or page",
      "author": "Author or publisher",
      "url": "https://… (the page you actually opened)",
      "usedFor": "What this source supported"
    }
  ],
  "answers": {
    "<statement id>": {
      "value": 2,
      "confidence": "high | medium | low",
      "rationale": "Why an adherent answers this way.",
      "sources": ["s1"]
    },
    "<statement id>": {
      "value": null,
      "confidence": "low",
      "rationale": "The sources record no position on this, and no stated principle bears on it.",
      "sources": ["s1"]
    }
  },
  "missingStatements": [
    {
      "text": "A candidate statement in the bank's form.",
      "value": 2,
      "rationale": "Why this defines the ideology and how it answers.",
      "sources": ["s1"]
    }
  ],
  "notes": "Optional: contested points, strands that would answer differently, caveats."
}
```

## 7. Deepening an existing audit

Follow audits/AUDIT_RULES.md, section 6. For an ideology, keep its `scope`: research what the
ideology itself states (its programmes, defining thinkers, organisations and the scholarship on
them), not a related movement's positions.
