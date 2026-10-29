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

## 0. Standard

Follow a Wikipedia-style standard: describe the ideology neutrally and as its own adherents and
reliable sources document it, however controversial it is. Don't editorialize, soften or omit
positions because they are objectionable; attribute them to sources instead.

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
- Research theme by theme. Each statement has a `theme` (economy, government, society, world, liberty,
  culture, ecology, technology, means, globalism); an overview covers only a few statements per
  theme. After a first pass, count stated positions per theme and search specifically for the thin
  ones (the ideology's programme sections, its thinkers on that topic).
- When a founding text, manifesto or programme is available as full text, download it into your
  scratch folder and search it for each theme's topics rather than reading summaries.
- The runner may hand you a text the maintainer supplied (a book you couldn't fetch yourself). Treat
  it as a primary source and search it the same way. Cite it as the published work, with the url of
  a publisher or library catalog page for it that you opened, never a file path or download site.

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
- A general value (humanism, liberty, equality, democracy, dignity) doesn't answer a specific
  statement on its own. An answer deduced only from one is `low`, however clear the deduction: a
  movement's humanism says nothing it has stated about returning to foraging. An answer resting on
  what the ideology says about the statement's topic can be `medium` or `high`: a movement that
  campaigns for gay rights has a position on criminalising homosexuality.
- A position on a narrower or nearby case doesn't answer a broader or different statement:
  cannabis is not all drugs, and a state's right of defence is not a person's right to kill in
  self-defence. Such an answer is `low`.
- Absence of evidence is not a position. If the sources record nothing on a topic, answer 0 at
  `low` and say the ideology has no doctrine on it, never a firm answer.
- What critics or opponents say about an ideology is not evidence of its position.
- Record over words, for ideologies that were the official doctrine of a state or ruling party
  (Juche, Kemalism, Ba'athism, Marxism-Leninism in power): its regimes' sustained, documented
  practice is part of the ideology. Where that practice consistently contradicts the doctrine's
  words (one-party rule alongside praise of popular democracy, a leader cult alongside collective
  leadership), answer from the practice, and the words alone are never `high`. A lapse of one
  regime or one period is not the ideology's position. This doesn't apply to ideologies whose
  parties governed as one party among others.

Confidence:
- `high`: stated directly in a primary source or settled in the scholarship. Its rationale says what
  that source states about this statement; a stock phrase ("Nationalism rejected.") or a position
  the sources never discuss is at most `medium`.
- `medium`: clearly implied by what the ideology says about this statement's topic, or the
  documented majority view.
- `low`: inferred, contested among adherents, or anachronistic. If the rationale has to say the
  answer is inferred, that adherents or strands are split, or that the question is anachronistic,
  the answer is `low`, however clear the inference seems.

Inferred answers are fine, but be honest about them: only `high` and `medium` answers count as the
ideology's stated positions. If too few are stated, the ideology can't be placed precisely enough
to tell it from its neighbours and is left out of the test (the salience check), so never upgrade an inference's
confidence to get it included.

Each rationale is one or two plain sentences that explain the answer, not restate it. Each answer
cites at least one source id from your `sources` list.

When the validator rejects an answer, fix the answer, not the wording: if it says contested
evidence must be `low`, lower the confidence; never rephrase a rationale to slip past a check.

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

Write the summary, scope and rationales in your own words. Do not paste long passages from
sources.

## 7. Deepening an existing audit

The runner may ask for a deepen pass on an audit that fails the salience check or sits close to
it. Build on the existing audit rather than starting over:
- Read its scope, sources and answers. Count the stated (`medium` and `high`) positions per theme
  and research the thinnest themes for what the ideology itself states: its programmes, defining
  thinkers, organisations and the scholarship on them.
- Keep the scope. Don't widen it to borrow a related movement's positions (secular humanism's for
  secularism, a party's whole platform for one of its causes): those belong to that movement.
- Change an answer or raise its confidence only on evidence you found and cite; never raise an
  inference. Check every answer you touch against the rules in section 3, and lower any you find
  deduced from a general value.
- Add your model id to `auditor` (a list, the original auditor first) and list both passes in
  `passes`, e.g. `[{ "auditor": "<first>", "auditedAt": "<its date>" }, { "auditor": "<you>",
  "auditedAt": "YYYY-MM-DD" }]`. Keep `auditedAt` as the date of your pass.
- If the record really has nothing more, failing salience is the correct outcome. Say in `notes`
  which themes you searched.
