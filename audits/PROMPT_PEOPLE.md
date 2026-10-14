# Person audit instructions

You are auditing one public figure for Political Ideology Atlas, a political ideology test. Test
takers see the people whose recorded positions are closest to theirs. Many of these people are
alive, so accuracy matters more than completeness: never guess at a real person's views.

Inputs (filled in by the runner):
- Person: `{{name}}` (id `{{id}}`), Wikipedia: `{{wikipedia}}`, born `{{born}}`
- Statements: `statements.json` in the repo root. Answer every statement.
- Statements version: `{{statementsVersion}}`

Output: write `audits/people/{{id}}.json` (or the path the runner gives) in the format below, then
run the validator command the runner gives and fix every error except salience.

## 0. Standard

Follow a Wikipedia-style standard: describe the person's documented positions neutrally, however
controversial they are. Don't editorialize, soften or omit positions because they are
objectionable; attribute them to sources instead.

## 1. Research with real sources

- Use web search and fetch tools and cite only pages you opened in this session, by the URL you
  visited. Never cite from memory or construct a URL.
- Use at least 3 sources, including at least one `primary` source: the person's own words (books,
  speeches, interviews, party programs they led, official statements) or their record (votes,
  laws signed, policies enacted). Add at least one `reference` or `scholarly` source.
- Prefer what the person said or did over what others say about them. Opponents' characterizations
  are not evidence of a position.
- Do not use political-quiz sites as sources.

## 2. Answer every statement

Use -2 (strongly disagree) to +2 (strongly agree) for the position the person actually held or
holds. If their views changed, use their mature or most recent public position and say so.

If there is no reliable evidence of their position, answer `null` ("no known position"). Do not
infer a living person's view from their party or ideology alone. For historical figures, a
position may be inferred only when it follows directly from views they stated, and it must then
be `low` confidence.

Confidence:
- `high`: stated directly by the person or shown by their record.
- `medium`: clearly implied by things they said or did.
- `low`: inferred, ambiguous or contested.

**Salience:** the validator checks whether the person's recorded positions place them on the
test's dividing lines at least as precisely as a typical test-taker's settled result. It depends only on which statements have a recorded
position, not on the answers. Someone with too thin a political record is left out. Do not pad
answers to pass; an honest rejection is the correct outcome.

## 3. Output format

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
  "statementsVersion": "{{statementsVersion}}",
  "auditedAt": "YYYY-MM-DD",
  "auditor": "<model id>",
  "living": true,
  "role": "Short description, e.g. 'German chancellor (2005–2021)'",
  "summary": "Two or three neutral sentences on their political outlook, in your own words.",
  "wikipedia": "https://en.wikipedia.org/wiki/…",
  "sources": [
    { "id": "s1", "kind": "primary | scholarly | reference | program", "title": "…", "author": "…", "url": "https://…", "usedFor": "…" }
  ],
  "answers": {
    "<statement id>": { "value": 1, "confidence": "high | medium | low", "rationale": "…", "sources": ["s1"] },
    "<statement id>": { "value": null, "confidence": "low", "rationale": "No recorded position found.", "sources": [] }
  },
  "notes": "Optional: changes of view over time, contested points."
}
```

Write the summary and rationales neutrally and in your own words.
