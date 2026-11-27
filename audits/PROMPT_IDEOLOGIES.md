# Ideology audit instructions

You are auditing one catalog entry for Political Ideology Atlas, a political ideology test. Here an ideology is any set of political ideas of what society
should be, whatever form it takes (`audits/IDEOLOGY_STANDARD.md`). Your job is to record
the ideology's positions on each test statement as the sources in section 3 state them, and to show your
evidence. Each answer you give becomes one coordinate of the ideology's profile, which test takers
are matched against. Getting it wrong puts real people into the wrong ideology.

Inputs (filled in by the runner):
- Ideology: `{{name}}` (id `{{id}}`)
- Statements: the statements file the runner names (`statements.json` in the repo root if it names none). Answer every statement in it.

Output: write `audits/profiles/{{id}}.json` in the format below. Then run
`node scripts/validate.js {{id}}` and fix every error it reports until it passes.

Read `audits/AUDIT_RULES.md` first. Its rules (sources, answers)
apply to every audit, ideologies and people alike, and apply here in full; this file adds only what
is specific to ideologies.

## First check: does it hold political ideas of what society should be?

The catalog is built generously from loose sources (Wikipedia's list of political ideologies and an
older hand-made list), so some entries hold no political ideas of what society should be. Before researching, open the suggested
Wikipedia article and check (the full criteria are in `audits/IDEOLOGY_STANDARD.md`). Skip the
full audit if the entry is:
- something that has ideas but isn't a set of ideas: a person (`PERSON`), a political party (`PARTY`),
  an organization (`ORGANIZATION`), a state or a group of states such as a bloc or a category of countries (`STATES`), a government body such as "the Government of
  France" (`GOVERNMENT_BODY`; a form of government such as totalitarianism is a set of ideas), or an event
  such as a war, revolution, election, battle or protest (`EVENT`); or
- something with no political ideas of what society should be (`DOES_NOT_INCLUDE_IDEAS`). Decide this by trying:
  go through the statements and look for answers in its defining sources and in its critics, since each view a
  critic argues against is a view it holds. Two answerable statements make a set of
  ideas: record `DOES_NOT_INCLUDE_IDEAS` only below two, and say in the explanation what you looked through.

Then write only this to `audits/profiles/{{id}}.json` and stop (the validator accepts it):

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
  "auditedAt": "YYYY-MM-DD",
  "auditor": "<model id>",
  "rules": 8,
  "notIdeasOfWhatSocietyShouldBe": { "reason": "PERSON | PARTY | ORGANIZATION | STATES | GOVERNMENT_BODY | EVENT | DOES_NOT_INCLUDE_IDEAS", "explanation": "One or two sentences on why." },
  "sources": [{ "id": "s1", "kind": "reference", "title": "…", "url": "https://… (a page you opened)" }]
}
```

When in doubt, audit it: a thin entry is left off the site later, on evidence.

## 1. Sources for an ideology

An ideology's defining sources are the sources that say what it holds, naming it (by its name or an
alias):
- reference works and scholarship on it (Payne, Paxton or Griffin for fascism; Bobbio for left and
  right): `reference` or `scholarly`
- other reliable sources on it (journalism, books from reputable publishers): `secondary`
- a thinker's or organisation's account of its tenets: `secondary`
- data on what the label means (surveys asking what "left" stands for)

Wikipedia only helps you find these (audits/AUDIT_RULES.md, section 2).

## 2. Pin down what the ideology is

The sources decide the scope, not you. Before answering, find its defining sources (section 1):
what they say it is, which strand it names when the name covers several, and which
texts, thinkers or programmes they name as its own. Record that in `scope`, citing those sources. A
text counts for the subject only as far as they tie it to the subject; don't choose a scope that
no defining source states.

### Aliases

**Every source has to discuss the ideology** (the coatrack check, `scripts/coatrack-check.js`, run by
validate.js). A defining source (`reference`, `scholarly` or `secondary`) must name the ideology, by its
name or an alias; primary texts are tied to it as the next subsection says. List in `aliases` the other
names the defining sources use for it, liberally, each with its `reason` (validate.js checks each):
- `REDIRECT`: a Wikipedia redirect to the article; word forms such as "Gaullist" and other names come in
  this way. Every redirect to the article counts automatically, unless Wikipedia files it as a section,
  subtopic, related topic or former name (a related word counts). Needs no quote.
- `SUPPORTED`: a source says they are the same. Quote the passage where it equates them ("often referred
  to as 'green liberalism', 'eco-liberalism', or 'liberal ecology'"). To find that source, look the alias up
  from its own side (a reverse lookup): a dictionary, glossary or encyclopedia entry for the alias usually
  defines it by the ideology's name. An acronym is `SUPPORTED`, never assumed from initials ("ML" can mean
  several things).
- `TRANSLATION`: the name in another language or its romanization, as Wikipedia gives it: the title of the
  article's link to that language's Wikipedia, or a name the article's lead or infobox tags with a language,
  such as "pinyin: Xīn Rújiā". Needs no quote.
- `SPELLING`: the same name spelled differently or its words reordered: "Salafi jihadism" /
  "jihadi-Salafism"; at most two letters differ and the ending stays the same.
- `EPONYM`: the person an "-ism" is named after: "Fortuyn" for Fortuynism.

The check exists to stop an audit leaning on a broader ideology's sources ("communism" for World communism),
so an alias may never be another ideology's name or alias. A name Wikipedia files under another topic (its
own article, a disambiguation page, a redirect to another article or to a section of one: "Committee of Union
and Progress", "radical left") isn't a `SUPPORTED`, `TRANSLATION` or `SPELLING` alias, whatever the quote
("modern liberalism" is a disambiguation page); a redirect to a section of the ideology's own article is fine.
An alias's quote may name the ideology by any of its redirects.

### Key figures and key works

Both lists show on the ideology's page.

`keyFigures`: the people the defining sources present the ideology as the thought or political legacy of
(Clinton for Clintonism).
- People only, no organisations.
- With `evidence` (below): quotes from the defining sources presenting the ideology as theirs; a bare mention of
  the person doesn't.
- No other ideology's key figure or namesake: audits/namesakes.json reserves each person an ideology is named
  after for it (Lenin for Leninism).
- If the defining sources present the ideology as the thought of someone another ideology lists (not as an
  influence on it), claim them instead: `keyFigureClaims`, each `{ "first", "last", "heldBy": "<that ideology's
  id>", "role", "wikipedia", "evidence": [{ "source", "quote" }, ...] }`, with two quotes or more naming them and
  the ideology, from two different defining sources; your defining sources must also name them more often than the holder's do.
  The claim goes to audits/key-figure-claims.json, and their texts aren't tied here.
- If validate.js warns that another ideology claims one of yours, keep them only if your defining sources present
  the ideology as their thought or political legacy; one they present as an influence on it, take out.
- Never for a single doctrine, policy or programme named after someone (the Monroe Doctrine), whose namesake's
  other views aren't part of it: tie their texts by title instead (Monroe's 1823 annual message).
- Give each two fields for the page: `role`, one line on how the sources connect them to the ideology
  ("Theorist of agonistic pluralism"), and `wikipedia`, the URL of their English Wikipedia article.

`keyWorks`: the texts the defining sources make canonical (founding texts, manifestos, programmes, a thinker's
major works).
- By the title those sources use ("the 1856 Imperial Rescript" for the "Rescript of Reform"), with `evidence`
  (below): quotes from the defining sources, or from primary texts that name the ideology themselves, presenting it
  as the ideology's own.
- With `"work": "<source id>"` when you cite the text itself.
- Unless you cite it, give it two fields for the page, as for key figures: `author`, as the sources name it
  ("Pierre-Joseph Proudhon"; an organisation for a programme), and `wikipedia`, the URL of the work's own English
  Wikipedia article, or `null` if it has none. Add `authorWikipedia`, the author's article, when there is one. You needn't
  open the work: the page links the copy you cite, else the work's article, else the author.

Primary texts (`primary` or `program`) are the ideology's own texts: founding documents, manifestos,
programmes, writings and speeches. One is tied to the ideology when it is a key work (with `"work"` and its
quotes), when its author is a key figure, or when it names the ideology itself.

### Evidence

Give each alias its evidence: `{ "name", "source": "<source id>", "quote": "<verbatim passage>" }`, a passage from
that source's saved copy that uses the name. A key figure or key work gives one passage or more instead:
`"evidence": [{ "source": "<source id>", "quote": "<verbatim passage>" }, ...]`; validate.js checks the quote is there and contains it (a `REDIRECT` or `TRANSLATION`
alias needs none). Save every source you cite in `scratchpad/sources/<id>/` with its URL in `index.json`, so
the check can read it.

## 3. What answers for an ideology

These answer for an ideology:

- Its defining sources (section 1).
- Its `keyWorks` and its `keyFigures`' texts (section 2).

Outside key works and key figures' texts, an adherent's or organisation's own platform doesn't answer, since they hold more opinions than
just the ideology; their account of what the ideology holds does (section 1). Critics don't answer. A
general remark that its content varies answers no particular statement (`null`).

## 4. Answering for an ideology

- Where its sources take opposite positions on a statement, it is a split: 0, a
  real position. Silence is `null`.
- The ideology's stated position settles a statement only where the statement couldn't be true
  without contradicting it: a 19th-century ideology's stated view on industry doesn't settle nuclear
  power (`null`), but a doctrine of rule by competence settles hereditary office.

## 5. Further reading for test takers

The results page links each ideology to further reading for curious, non-specialist readers.
- `wikipedia`: the English Wikipedia article that is actually about this ideology. The catalog
  entry may suggest one (`{{wikipedia}}`, found automatically as `{{wikipediaMatch}}`). Open it and
  confirm it is about this ideology, not a broader or different topic. Use a better article if one
  exists, or `null` if none covers it.
- `furtherReading`: two to four accessible items a curious reader could open next, such as an
  encyclopedia entry, a founding text online, or a good introduction. They may overlap with your
  sources. Only include pages you opened.

## 6. Positions the statements miss

The statements are chosen by the standard in `audits/statements/STANDARD.md`, and audits are how
gaps get found. After answering, list in `missingStatements` the positions that **define** this
ideology (stated in its sources, section 3) but that no statement
captures, even loosely. List only those; often there are none, and the list is empty.

- Write each as a candidate statement in the bank's form: one claim, read literally, in neutral
  words that adherents and opponents would both accept as a fair statement of the question. Hold
  it to every check under test 3 in `audits/statements/STANDARD.md`.
- Prefer wording that other ideologies could also take a side on ("Laws should follow Islamic
  sharia"), not one that only names this ideology ("Zionism is right").
- Give this ideology's answer (`value`, -2 to +2, never 0), a one-sentence rationale, and at least
  one source id. These are positions you found, not guesses: cite where they are stated.
- **Rule of two**, while the sources are open: collect at least two verbatim passages where the
  ideology states the position, from two separate places (`quotes`), and word the statement as their
  common core. A hard floor: a position stated in only one place may be a passing mention, so don't
  list it. Two places show the position is held, and the sources' own words keep the statement from
  being your paraphrase.
  Follow the rule and the wording lessons in `audits/PROMPT_STATEMENTS.md` section 2 ("Word it from
  the sources' own words" and "Lessons from earlier reviews").
- Then run `node scripts/statements-check.js --wording audits/profiles/<id>.json` and reword every
  error and every warning that test 3 confirms (two claims joined, a list where one general word
  would do, a means attached to a goal, a vague scope). Errors are absolute: reword every one; no
  explanation excuses it.

## 7. Output format

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
  "auditedAt": "YYYY-MM-DD",
  "auditor": "<model id that did the research>",
  "rules": 8,
  "summary": "Two to four sentences, in your own words, on what the ideology holds.",
  "notFound": [{ "work": "<a source looked for and not found>", "tried": [{ "where": "<place 1>", "how": "<what you searched>" }, { "where": "<place 2>", "how": "…" }] }],
  "scope": "Which strand, period, thinkers and texts this profile represents, and what it excludes.",
  "aliases": [{ "name": "Another name for it", "reason": "SUPPORTED", "source": "s3", "quote": "verbatim passage from s3 that uses it" }],
  "keyFigures": [{ "first": "Chantal", "last": "Mouffe", "role": "Theorist of agonistic pluralism", "wikipedia": "https://en.wikipedia.org/wiki/Chantal_Mouffe", "evidence": [{ "source": "s3", "quote": "verbatim passage from s3 that names them" }, { "source": "s5", "quote": "another passage, from s5 or s3, that names them" }] }],
  "keyWorks": [{ "title": "Hegemony and Socialist Strategy", "work": "s4", "evidence": [{ "source": "s3", "quote": "verbatim passage from s3 that names it" }, { "source": "s3", "quote": "another passage that names it" }] }],
  "wikipedia": "https://en.wikipedia.org/wiki/… or null",
  "furtherReading": [
    { "title": "Readable title", "url": "https://…", "note": "One line on why it's worth reading" }
  ],
  "sources": [
    {
      "id": "s1",
      "kind": "primary | scholarly | reference | program | secondary",
      "title": "Title of the work or page",
      "author": "Author or publisher",
      "url": "https://… (the page you actually opened)",
      "usedFor": "What this source supported"
    }
  ],
  "answers": {
    "<statement id>": {
      "value": 2,
      "rationale": "What the ideology's sources state on this.",
      "sources": ["s1"]
    },
    "<statement id>": {
      "value": null,
      "rationale": "The sources record no position on this, and no stated principle bears on it.",
      "sources": []
    }
  },
  "missingStatements": [
    {
      "text": "A candidate statement in the bank's form.",
      "value": 2,
      "rationale": "Why this defines the ideology and how it answers.",
      "sources": ["s1"],
      "quotes": [{ "text": "verbatim passage", "source": "s1", "where": "page, section or file and line" }]
    }
  ],
  "notes": "Optional: contested points, caveats, themes searched."
}
```

## 8. Research to the end

For an ideology, keep its `scope`: research what the
ideology itself states (its defining sources, key works and key figures' texts: sections 1–3), not a
related movement's positions. For a thin theme, search its key works and key figures' texts for that
topic.
