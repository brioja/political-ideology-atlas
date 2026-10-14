# Ideology audit instructions

You are auditing one ideology for Political Ideology Atlas, a political ideology test. Your job is to work
out how a committed adherent of this ideology would answer each test statement, and to show your
evidence. Each answer you give becomes one coordinate of the ideology's profile, which test takers
are matched against. Getting it wrong puts real people into the wrong ideology.

Inputs (filled in by the runner):
- Ideology: `{{name}}` (id `{{id}}`, broad category `{{category}}`)
- Statements: `statements.json` in the repo root. Answer every statement.
- Statements version: `{{statementsVersion}}`

Output: write `audits/profiles/{{id}}.json` in the format below. Then run
`node scripts/validate.js {{id}}` and fix every error it reports until it passes.

## 0. Standard

Follow a Wikipedia-style standard: describe the ideology neutrally and as its own adherents and
reliable sources document it, however controversial it is. Don't editorialize, soften or omit
positions because they are objectionable; attribute them to sources instead.

## 1. Pin down what the ideology is

Many names cover several strands. Before answering, decide which one the profile represents, and
record it in `scope`:
- If there is a canonical core (founding texts, a defining thinker, a party program), use it.
- If the name covers a family, use the mainstream of the family as it exists today, or as it
  existed at its peak if it is historical. Name the thinkers, texts or movements you based it on.
- If the name is a philosophy rather than a political program (for example Stoicism or Platonism),
  answer as its political implications are usually drawn by its scholars and modern adherents. Say
  so in `scope`, and expect many low-confidence answers.

The category given is only a hint for disambiguation. Do not let it override the evidence.

## 2. Research with real sources

- Use web search and fetch tools to read actual sources. Cite only pages you opened in this
  session, using the URL you actually visited. Never cite from memory, and never construct a URL
  you did not visit.
- Use at least 3 sources, including at least one `primary` source (a founding text, manifesto,
  party program, or major work by a defining thinker) and at least one `scholarly` or `reference`
  source (an encyclopedia such as the Stanford or Internet Encyclopedia of Philosophy or
  Britannica, academic work, or a well-sourced Wikipedia article). Wikipedia may be used, but it
  must not be the only kind of source.
- Do not use political-quiz sites (12axes, 8values, Political Compass, IDRlabs, the polcompball
  wiki, and similar) as sources or as a reference for answers. This audit must be independent.

## 3. Answer every statement

Use the scale -2 (strongly disagree), -1 (disagree), 0 (neutral or genuinely split),
+1 (agree), +2 (strongly agree).

- Answer as a typical committed adherent would, not a fringe member or a critic.
- Use ±2 only when the position is central to the ideology or stated explicitly and forcefully.
- Use 0 only when adherents are genuinely split or the ideology is truly indifferent. Do not use
  it to avoid a hard call.
- If the ideology never addressed the issue (for example nuclear power for a 19th-century
  ideology), infer the answer from its stated principles, mark it `low` confidence, and say in the
  rationale what you inferred it from.
- Read each statement literally. "Free trade benefits everyone in the long run" is about free
  trade, not about markets in general.

Confidence:
- `high`: stated directly in a primary source or settled in the scholarship.
- `medium`: clearly implied by core principles, or the documented majority view.
- `low`: inferred, contested among adherents, or anachronistic.

Inferred answers are fine, but be honest about them: only `high` and `medium` answers count as the
ideology's stated positions. If too few are stated, the ideology can't be placed as precisely as a
test-taker and is left out of the test (the salience check), so never upgrade an inference's
confidence to get it included.

Each rationale is one or two plain sentences that explain the answer, not restate it. Each answer
cites at least one source id from your `sources` list.

## 4. Further reading for test takers

The results page links each ideology to further reading for curious, non-specialist readers.
- `wikipedia`: the English Wikipedia article that is actually about this ideology. The catalog
  entry may suggest one (`{{wikipedia}}`, found automatically as `{{wikipediaMatch}}`). Open it and
  confirm it is about this ideology, not a broader or different topic. Use a better article if one
  exists, or `null` if none covers it.
- `furtherReading`: two to four accessible items a curious reader could open next, such as an
  encyclopedia entry, a founding text online, or a good introduction. They may overlap with your
  sources. Only include pages you opened.

## 5. Output format

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
  "category": "{{category}}",
  "statementsVersion": "{{statementsVersion}}",
  "auditedAt": "YYYY-MM-DD",
  "auditor": "<model id that did the research>",
  "summary": "Two to four sentences, in your own words, on what the ideology holds.",
  "scope": "Which strand, period, thinkers and texts this profile represents, and what it excludes.",
  "wikipedia": "https://en.wikipedia.org/wiki/… or null",
  "furtherReading": [
    { "title": "Readable title", "url": "https://…", "note": "One line on why it's worth reading" }
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
    }
  },
  "notes": "Optional: contested points, strands that would answer differently, caveats."
}
```

Write the summary, scope and rationales in your own words. Do not paste long passages from
sources.
