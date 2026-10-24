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
- When the person's own writing is available as full text (a book, manifesto, platform or speech
  collection), download it into your scratch folder and search it for each theme's topics rather than
  reading summaries: it covers far more statements, in their own words.
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
holds. If their views changed, use their mature or most recent public position and say so. When
sources from different times disagree (two runs of the same quiz, an old interview and a new one),
the more recent clear statement wins; leave it null only if the recent position itself is unclear.

If there is no reliable evidence of their position, answer `null` ("no known position"). Do not
infer a living person's view from their party or ideology alone. For historical figures, a
position may be inferred only when it follows directly from views they stated, and it must then
be `low` confidence with a rationale that begins "Inferred:" and says what it is inferred from.
Inferred answers count toward matching but not toward salience, so nobody is included on the
strength of inferences.

A general principle they voiced ("freedom of religion", "equal rights for all") does not answer a
specific statement it never addressed (apostasy laws, covering laws, blasphemy): those stay null
unless they spoke to them. Absence of evidence is null, never a negative answer ("no
rehabilitative aim recorded" is not a position on prisons). A position on a narrower case does not
answer a broader statement either: cannabis is not all drugs (`legalize-drugs`), unauthorized
migration is not immigration levels (`reduce-immigration`), refugee relief is not development aid.
Opponents' characterizations and interest-group ratings (a lobby's scorecard grade) are not
evidence of a position.

A monarch's or head of state's formal assent is not their position. Laws, constitutions and
policies they only signed or proclaimed on ministers' or parliament's advice don't count, nor does a
speech from the throne setting out the government's programme; use only views they expressed
themselves and measures they personally drove. Likewise, what a government did under someone
(executions, a state policy) is their position only where they drove it or spoke to it.

When the person's own record directly contradicts their words on a statement (elections they
rigged or cancelled, term limits they wrote themselves out of, a single party they kept in power
while praising pluralism), the record wins. If the evidence is genuinely mixed, answer 0 at `low`.
Rhetoric alone is never `high`. This applies at every confidence level, including `low` answers, and
it applies where they were silent: what a ruler did with power themselves (inheriting and keeping
office within a family, a cult of their own portraits, arming groups abroad, a security apparatus
drawn from one sect) answers the matching statement from the record even if they never spoke to it.
A repudiation made under pressure (in court, in exile) does not cancel a lifetime's record; weigh it
as mixed at most. The same goes for campaign promises: for someone who then governed, a pledge
their time in office contradicted (balanced budgets with debt tripled, free trade with new
tariffs, civil liberties with indefinite detention signed into law) is mixed at most, and a pledge
alone is never `high`.

A state's use of force (war, counter-insurgency, executions) is not "political violence":
`political-violence-never` is about violence for political ends outside lawful authority (coups,
insurrections, assassinations, terrorism). Leading or ordering state force answers it only where
they said something about political violence as such.

Words someone delivered as their own count as theirs, whoever drafted them (a speechwriter, a
ghostwritten book). Later reports of what they said or did (a biographer, an ancient historian,
collected sayings) are secondhand: `medium` at most, `low` where the report is late or disputed.
Endorsing a candidate, attending a march or hosting an event is not a position on any statement.
A relative's or employer's positions are never theirs.

Contested or mixed evidence is still evidence: answer it at `low` confidence (or 0 if it points
both ways), never null. A person's best-known positions and controversies (what their record is
famous or criticised for, e.g. a policy of segregation, a military intervention, a signature law)
must be answered whenever the record exists; check them before finishing. Read the whole statement
list, not just its first part: before finishing, go through every statement still null once and
check it against the evidence you gathered. Before deciding a topic "matches no statement", search
the statement texts for its keywords (`grep -i <word> statements.json`). For a living person,
"suggests" or "seems to" is not evidence: answer only from what they said or did.

Confidence:
- `high`: stated directly by the person on that specific statement, or shown by their record. A
  close inference from a stated view is `medium` at most. Cosponsoring or voting for a bill
  alone is `medium`: it shows support for the bill, not for every way a statement could be read.
- `medium`: clearly implied by things they said or did.
- `low`: inferred, ambiguous or contested.

**Salience:** the validator checks whether the person's recorded positions place them on the
test's dividing lines precisely enough to tell neighbouring ideologies apart. It depends only on which statements have a recorded
position, not on the answers. Someone with too thin a political record is left out. Do not pad
answers to pass; an honest rejection is the correct outcome.

When the validator rejects an answer, fix the answer, not the wording: if it says contested
evidence must be `low`, lower the confidence; never rephrase a rationale to slip past a check.

## 3. Output format

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
  "auditedAt": "YYYY-MM-DD",
  "auditor": "<full exact model id, e.g. claude-sonnet-5-5 or gpt-6.1-sol, not just gpt-6>",
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

A merged audit (two models researched independently, combined by the integrator) lists both
model ids in `auditor`, e.g. `["claude-sonnet-5-5", "claude-haiku-5-5"]`, and tags each answer
with the `auditor` that found it. A single-model audit uses one id and no per-answer tag.
A merged audit also lists every independent pass in `passes`, e.g.
`[{ "auditor": "claude-sonnet-5-5", "auditedAt": "2026-10-23" }, { "auditor": "claude-haiku-5-5", "auditedAt": "2026-10-24" }]`;
the same model appears twice if it audited the person twice. Before re-auditing someone, check
`passes` (or `auditor`) and use a model that hasn't audited them yet.

Write the summary and rationales neutrally and in your own words.
