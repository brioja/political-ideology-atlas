# Ideology audit instructions

You are auditing one ideology for Political Ideology Atlas, a political ideology test: record its positions on
each statement as its own sources state them, with your evidence. Each answer is one coordinate of the profile
test takers are matched against; getting it wrong puts real people into the wrong ideology.

Inputs (filled in by the runner): ideology `{{name}}` (id `{{id}}`). Answer every statement in `statements.json`.
Write `audits/profiles/{{id}}.json` in the format below, then run `node scripts/validate.js {{id}}` and fix every
error. `audits/AUDIT_RULES.md` applies in full; this file adds only what is specific to ideologies.

## First check: is this an ideology the test can place?

Open the suggested Wikipedia article (full criteria in `audits/IDEOLOGY_STANDARD.md`). Skip the full audit if
the entry is:
- something with ideas but not a set of ideas: a person (`PERSON`), party (`PARTY`), organization
  (`ORGANIZATION`), state (`STATE`), government body (`GOVERNMENT_BODY`; a form of government such as
  totalitarianism is a set of ideas), or event (`EVENT`); or
- not a set of political ideas (`DOES_NOT_INCLUDE_IDEAS`): decide by trying, not by its label. Go through the
  statements looking for answers in its sources; only if fewer than two can be answered is it this, and say what
  you looked through. The validator rejects this reason where the Wikipedia article says "ideas".

Then write only this and stop:

```json
{
  "id": "{{id}}", "name": "{{name}}", "auditedAt": "YYYY-MM-DD", "auditor": "<model id>",
  "notAnIdeology": { "reason": "PERSON | PARTY | ORGANIZATION | STATE | GOVERNMENT_BODY | EVENT | DOES_NOT_INCLUDE_IDEAS", "explanation": "One or two sentences on why." },
  "sources": [{ "id": "s1", "kind": "reference", "title": "…", "url": "https://… (a page you opened)" }]
}
```

When in doubt, audit it: a thin ideology is excluded later by the uncertainty rule, on evidence.

## 1. Pin down what the ideology is

The sources decide the scope, not you. Find the reference and scholarly works that define the name (encyclopedia
and dictionary entries, scholarship on the term): what it is, which strand it names when the name covers several,
and which texts, thinkers or programmes they name as its own. Record that in `scope`, citing them. A text counts
only as far as they tie it to the ideology.

**Every source has to discuss the ideology** (the coatrack check, run by validate.js). A defining source
(`reference` or `scholarly`) names the ideology, by name or alias; a `primary` or `program` source names it too,
or is named (by title or author) in a defining source that does. Record, each with evidence
`{ "source": "<id>", "quote": "<verbatim passage from that source's saved copy>" }`:
- `aliases`: other names the defining sources use for it, liberally (spellings, the eponym of an "-ism" named after
  a person). An alias is never another ideology's name, and its quote must name the ideology too. Find it from the
  alias's side: a dictionary entry for the alias usually defines it by the ideology's name. Wikidata never connects
  an alias; Wikipedia's redirects count automatically.
- `authors`: its own thinkers as its defining sources name them, only where they present the ideology as that
  person's body of thought, never for a doctrine named after someone (the Monroe Doctrine: tie its texts by title).
- a source's `titles`: where a defining source names a primary text differently from its title.

Save every source you cite in `scratchpad/sources/<id>/` with its URL in `index.json`, so the check can read it.

Answer from what the defining sources say the ideology holds: the texts they make canonical, and their own account
of its tenets. Where no text is canonical (fascism, left-wing), the defining sources are the scholarship that defines
the name (Payne, Paxton or Griffin for fascism; Bobbio for left and right) and data on what the label means.
Movements and offshoots under the name answer only where the defining sources make them the ideology's own. A
remark that its content varies answers nothing (`null`).

## 2. Sources and answers for an ideology

- `primary` sources are its founding texts, manifestos, party programmes and its defining thinkers' major works;
  its scholarship is `scholarly` or `reference`.
- Answer from the ideology's own sources, not adherents, member organisations or critics. Opposite positions in its
  own sources are a split: 0 at `low`. Silence is `null`.
- A stated position settles a statement only where the statement couldn't be true without contradicting it: a
  19th-century view on industry doesn't settle nuclear power, but rule by competence settles hereditary office.
- Its record, for "record over words", is that of regimes where it was the official doctrine of the state or
  ruling party (Juche, Kemalism, Ba'athism, Marxism-Leninism in power): their sustained practice answers from the
  practice. One regime's lapse is not the ideology's position, and parties governing among others are not its record.
- Keep to its `scope` while researching: what the ideology itself states, not a related movement's positions.

## 3. Further reading for test takers

- `wikipedia`: the English Wikipedia article actually about this ideology (suggested: `{{wikipedia}}`, matched as
  `{{wikipediaMatch}}`). Confirm it; use a better one, or `null` if none covers it.
- `furtherReading`: two to four accessible items you opened (an encyclopedia entry, a founding text, a good
  introduction).
- `keyFigures`: one to three people most associated with it (founder, defining thinker, best-known leader) as your
  sources identify them, each with a one-line `role`, their Wikipedia article and a source id. `[]` only if none.

## 4. Positions the statements miss

List in `missingStatements` the positions that **define** this ideology (stated in its primary sources or central in
the scholarship) but that no statement captures, even loosely; an empty list if none, never padded.
- Word each as one claim, read literally, in neutral words adherents and opponents would both accept, held to test 3
  of `audits/statements/STANDARD.md`, preferably one other ideologies could take a side on.
- Give its `value` (-2 to +2, never 0), a one-sentence rationale and a source id.
- **Rule of two:** at least two verbatim passages stating it, from separate places (`quotes`); word the statement as
  their common core (see `audits/PROMPT_STATEMENTS.md` section 2).
- Run `node scripts/statements-check.js --wording audits/profiles/<id>.json` and reword every error, and every
  warning test 3 confirms.

## 5. Output format

```json
{
  "id": "{{id}}", "name": "{{name}}", "auditedAt": "YYYY-MM-DD", "auditor": "<model id>", "rules": 7,
  "summary": "Two to four sentences, in your own words, on what the ideology holds.",
  "scope": "Which strand, period, thinkers and texts this profile represents, and what it excludes.",
  "aliases": [{ "name": "Another name", "source": "s3", "quote": "verbatim passage from s3 that uses it" }],
  "authors": [{ "first": "Chantal", "last": "Mouffe", "source": "s3", "quote": "verbatim passage naming them" }],
  "notFound": [{ "work": "…", "tried": [{ "where": "…", "how": "…" }, { "where": "…", "how": "…" }] }],
  "wikipedia": "https://en.wikipedia.org/wiki/… or null",
  "furtherReading": [{ "title": "…", "url": "https://…", "note": "One line on why it's worth reading" }],
  "keyFigures": [{ "name": "…", "role": "Founder of …", "wikipedia": "https://en.wikipedia.org/wiki/…", "sources": ["s1"] }],
  "sources": [{ "id": "s1", "kind": "primary | scholarly | reference | program", "evidence": "action | words", "title": "…", "author": "…", "url": "https://… (the page you opened)", "usedFor": "…" }],
  "answers": {
    "<statement id>": { "value": 2, "confidence": "high | medium | low", "rationale": "What its own sources state.", "sources": ["s1"] },
    "<statement id>": { "value": null, "confidence": "low", "rationale": "The sources record no position on this.", "sources": [] }
  },
  "missingStatements": [{ "text": "…", "value": 2, "rationale": "…", "sources": ["s1"], "quotes": [{ "text": "verbatim passage", "source": "s1", "where": "page or section" }] }],
  "notes": "Optional: contested points, caveats, themes searched."
}
```
