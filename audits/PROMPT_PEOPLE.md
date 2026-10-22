# Person audit instructions

You are auditing one public figure for Political Ideology Atlas, a political ideology test. Test
takers see the people whose recorded positions are closest to theirs. Many of these people are
alive, so accuracy matters more than completeness: never guess at a real person's views.

Inputs (filled in by the runner):
- Person: `{{name}}` (id `{{id}}`), Wikipedia: `{{wikipedia}}`, born `{{born}}`
- Statements: `statements.json` in the repo root. Answer every statement.

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
- Research theme by theme. Each statement has a `theme` (economy, government, society, world, liberty,
  culture, ecology, technology, means, globalism); a broad overview covers only a few statements per
  theme. After a first pass, count your known positions per theme and search specifically for the
  thin ones ("<name> on <topic>", their votes, platform sections, interviews). A prominent politician
  usually needs 8-12 sources; someone with a thin public record needs fewer, and many nulls are then
  the honest result.
- Stop early for someone without a political record (an artist, athlete or entertainer known for
  other things): if the Wikipedia article and two or three targeted searches ("<name> politics",
  "<name> views on …") turn up no stated political positions, record the few you found, answer the
  rest null, and finish. Failing salience is then the correct outcome, and a long search is wasted.
- Do not use political-quiz sites as sources: a site's guess at where someone stands isn't evidence.
- The exception is the person taking a quiz themselves, answers read aloud, as some streamers and
  pundits have done on camera (search "<name> political test" or "<name> political quiz"). Their
  own answer is direct evidence, so it can be `high` confidence, but only where the quiz item says
  the same thing as our statement; otherwise use it as context. Get the words from the video's
  captions, e.g. `yt-dlp --skip-download --write-auto-subs --sub-langs en-orig --sub-format vtt <url>`,
  cite the video as a `primary` source, and use only answers they clearly give, not jokes or banter.

## 2. Answer every statement

Use -2 (strongly disagree) to +2 (strongly agree) for the position the person actually held or
holds. If their views changed, use their mature or most recent public position and say so.

If there is no reliable evidence of their position, answer `null` ("no known position"). Do not
infer a living person's view from their party or ideology alone. For historical figures, a
position may be inferred only when it follows directly from views they stated, and it must then
be `low` confidence with a rationale that begins "Inferred:" and says what it is inferred from.
Inferred answers count toward matching but not toward salience, so nobody is included on the
strength of inferences.

Confidence:
- `high`: stated directly by the person or shown by their record.
- `medium`: clearly implied by things they said or did.
- `low`: inferred, ambiguous or contested.

**Salience:** the validator checks whether the person's recorded positions place them on the
test's dividing lines precisely enough to tell neighbouring ideologies apart. It depends only on which statements have a recorded
position, not on the answers. Someone with too thin a political record is left out. Do not pad
answers to pass; an honest rejection is the correct outcome.

## 3. Output format

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
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
