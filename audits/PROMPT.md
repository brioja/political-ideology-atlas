# Ideology audit instructions

You are auditing one ideology for Political Ideology Atlas, a political ideology test. Your job is to record
the ideology's positions on each test statement as its own sources state them, and to show your
evidence. Each answer you give becomes one coordinate of the ideology's profile, which test takers
are matched against. Getting it wrong puts real people into the wrong ideology.

Inputs (filled in by the runner):
- Ideology: `{{name}}` (id `{{id}}`)
- Statements: `statements.json` in the repo root. Answer every statement.

Output: write `audits/profiles/{{id}}.json` in the format below. Then run
`node scripts/validate.js {{id}}` and fix every error it reports until it passes.

Read `audits/AUDIT_RULES.md` first. Its rules (sources, answers, confidence, uncertainty, research to the end)
apply to every audit, ideologies and people alike, and apply here in full; this file adds only what
is specific to ideologies.

## First check: is this an ideology the test can place?

The catalog is built generously from loose sources (Wikipedia's list of political ideologies and an
older hand-made list), so some entries aren't ideologies. Before researching, open the suggested
Wikipedia article and check (the full criteria are in `audits/IDEOLOGY_STANDARD.md`). Skip the
full audit if the entry is:
- something that has ideas but isn't a set of ideas: a person (`PERSON`), a political party (`PARTY`),
  an organization (`ORGANIZATION`), a state (`STATE`), a government body such as "the Government of
  France" (`GOVERNMENT_BODY`; a form of government such as totalitarianism is a set of ideas), or an event
  such as a war, revolution, election, battle or protest (`EVENT`); or
- not a set of political ideas for how to run a society (`DOES_NOT_INCLUDE_IDEAS`): its content holds
  none. It must also pass a code check: if the entry's Wikipedia article says "ideas" anywhere,
  `scripts/validate.js` rejects the reason (Brandon, 2026-11-06), and you audit the entry in full.
  Notability and duplicates are also checked in code before an entry reaches you.

Then write only this to `audits/profiles/{{id}}.json` and stop (the validator accepts it):

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
  "auditedAt": "YYYY-MM-DD",
  "auditor": "<model id>",
  "notAnIdeology": { "reason": "PERSON | PARTY | ORGANIZATION | STATE | GOVERNMENT_BODY | EVENT | DOES_NOT_INCLUDE_IDEAS", "explanation": "One or two sentences on why." },
  "sources": [{ "id": "s1", "kind": "reference", "title": "…", "url": "https://… (a page you opened)" }]
}
```

When in doubt, audit it: a thin ideology is excluded later by the uncertainty rule, on evidence.

## 1. Pin down what the ideology is

The sources decide the scope, not you (Brandon, 2026-11-05). Before answering, find the reference
and scholarly works that define the name itself (encyclopedia and dictionary entries, scholarship
on the term): what they say it is, which strand it names when the name covers several, and which
texts, thinkers or programs they name as its own. Record that in `scope`, citing those sources. A
text counts for the subject only as far as they tie it to the subject; don't choose a scope that
no defining source states.

**Every source has to discuss the ideology** (`scripts/source-check.js`, run by validate.js). A
defining source (`reference` or `scholarly`) must name the ideology, by its name or an alias. A
`primary` or `program` source must name it too, or be named (by title or author) in a defining source
that does. List in `aliases` the other names the defining sources use for it, liberally (spelling variants,
"Salafi jihadism" / "jihadi-Salafism", the eponym of an "-ism" named after a person: "Fortuyn" for
Fortuynism). The check exists to stop an audit leaning on a broader ideology's sources ("communism"
for World communism), so an alias may never be another ideology's name or alias. List in `authors`
the ideology's own thinkers as its defining sources name them (each named at least twice there, and
no other ideology's defining author): a primary text by one of them is tied to the ideology. List a
defining author only when the defining sources present the ideology as that person's body of thought;
never for a single doctrine, policy or programme named after someone (the Monroe Doctrine), whose
namesake's other views aren't part of it: tie its texts by title instead (Monroe's 1823 annual message). When a
defining source names a primary text differently from its title ("the 1856 Imperial Rescript" for the
"Rescript of Reform"), record those names in the source's `titles`. Give each alias, author and title its evidence:
`{ "name" (an author: "first" and "last", or "organisation"; a title: "title"), "source": "<source id>",
"quote": "<verbatim passage>" }`, a passage from that
source's saved copy that uses the name; validate.js checks the quote is there and contains it. An
alias's quote must name the ideology too, showing the source equating the two ("'trans-exclusionary
radical feminism', or TERFism"). To find that source, look the alias up from its own side
(a reverse lookup): a dictionary, glossary or encyclopedia entry for the alias ("TERF") usually defines it
by the ideology's name ("trans-exclusionary radical feminist"). An alias that Wikidata lists for this ideology's item and for no
other catalog item may instead be given as `{ "name": "TERF", "wikidata": true }` (one to one; Wikidata
connects names only, never scope or answers). Save every source
you cite in `scratchpad/sources/<id>/` with its URL in `index.json`, so the check can read it.
- Answer from what the defining sources say the ideology holds: the texts they make canonical
  (founding texts, a defining thinker, a party programme) where they name any, and their own account
  of its tenets. Where no text is canonical (fascism, left-wing), the defining sources are the
  scholarship that defines the name (Payne, Paxton or Griffin for fascism; Bobbio for left and right)
  and data on what the label means (surveys asking what "left" stands for). Movements and offshoots
  under the name are other subjects: their texts answer only where the defining sources make them the
  ideology's own (no coatracks, AUDIT_RULES.md section 3). A general remark that its content varies
  answers no particular statement (`null`).

## 2. Sources for an ideology

- An ideology's `primary` sources are its founding texts, manifestos, party programmes and the
  major works of its defining thinkers. Its scholarship (the Stanford or Internet Encyclopedia of
  Philosophy, Britannica, academic work) is a `scholarly` or `reference` source. Wikipedia only
  helps you find these (audits/AUDIT_RULES.md, section 2).
- For a thin theme, search the ideology's programme sections and what its thinkers wrote on that
  topic.

## 3. Answering for an ideology

- Answer from the ideology's own sources (section 1), not from adherents, member organisations or
  critics. Where its own sources take opposite positions on a statement, it is a split: 0 at `low`, a
  real position. Silence is `null`.
- The ideology's stated position settles a statement only where the statement couldn't be true
  without contradicting it: a 19th-century ideology's stated view on industry doesn't settle nuclear
  power (`null`), but a doctrine of rule by competence settles hereditary office.
- Its own record, for "record over words", is that of regimes where it was the official doctrine of
  the state or ruling party (Juche, Kemalism, Ba'athism, Marxism-Leninism in power): their
  sustained, documented practice is part of the ideology. Where that practice answers a statement,
  answer from the practice and leave the doctrine's words on it out (one-party rule alongside praise
  of popular democracy, a leader cult alongside collective leadership). A lapse of one regime or one period is not the
  ideology's position, and parties that governed as one party among others are not the ideology's
  record.
- Audits written before the shared rules (no `"rules"`) recorded silence as 0 and inferences without
  the "Inferred:" mark, so their uncertainty still counts only `medium` and `high` answers until they
  are re-audited. Audits under rules 2 may hold marked inferences ("Inferred:"); the rule leaves
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

## 6. Output format

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
  "auditedAt": "YYYY-MM-DD",
  "auditor": "<model id that did the research>",
  "rules": 7,
  "summary": "Two to four sentences, in your own words, on what the ideology holds.",
  "notFound": [{ "work": "<a source looked for and not found>", "tried": [{ "where": "<place 1>", "how": "<what you searched>" }, { "where": "<place 2>", "how": "…" }] }],
  "scope": "Which strand, period, thinkers and texts this profile represents, and what it excludes.",
  "aliases": [{ "name": "Another name for it", "source": "s3", "quote": "verbatim passage from s3 that uses it" }],
  "authors": [{ "first": "Chantal", "last": "Mouffe", "source": "s3", "quote": "verbatim passage from s3 that names them" }],
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
      "evidence": "action | words",
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
      "rationale": "What the ideology's own sources state on this.",
      "sources": ["s1"]
    },
    "<statement id>": {
      "value": null,
      "confidence": "low",
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

## 7. Research to the end

Follow audits/AUDIT_RULES.md, section 6. For an ideology, keep its `scope`: research what the
ideology itself states (its programmes, defining thinkers, organisations and the scholarship on
them), not a related movement's positions.
