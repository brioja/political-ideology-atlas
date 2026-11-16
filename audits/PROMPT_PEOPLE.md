# Person audit instructions

You are auditing one public figure for Political Ideology Atlas, a political ideology test. Test takers see the
people whose recorded positions are closest to theirs. Many are alive, so accuracy matters more than
completeness: never guess at a real person's views.

Inputs (filled in by the runner): person `{{name}}` (id `{{id}}`), Wikipedia `{{wikipedia}}`, born `{{born}}`.
Answer every statement in `statements.json`, candidates included. Write `audits/people/{{id}}.json` (or the path
the runner gives) in the format below, run the validator the runner gives, and fix every error except the
uncertainty rule.

`audits/AUDIT_RULES.md` applies in full; this file adds only what is specific to people.

## 1. Research

- A person's `primary` sources are their own words (books, speeches, interviews, programmes they led, official
  statements) and their record (votes, laws signed, policies enacted).
- For a thin theme, search "<name> on <topic>", their votes, platform sections and interviews. A prominent
  politician usually needs 8-12 sources; someone with a thin public record needs fewer, and many nulls are then
  the honest result. Every theme should have answers wherever the person said or did anything relevant.
- For people whose output is mostly video (streamers, podcasters, commentators), search their channels by theme
  and read captions with `node scripts/yt.js "<url>"` (`--search "<words>"` to find videos). Captions rarely label
  speakers: use a passage only when context shows the person is speaking.
- A maintainer-supplied text has a date: check later positions on the web.
- Someone without a political record (an artist, athlete or entertainer): if the Wikipedia article and two or
  three targeted searches turn up no stated positions, record what you found, answer the rest null, and finish.
- A quiz site's placement of someone is not evidence, but the person answering a quiz themselves on camera is
  their own words: it answers our statement where the quiz item says the same thing. Cite the video as `primary`
  and use only answers they clearly give.

## 2. Answering

- A statement is answered only where the person's own stated position or record settles it, never from their
  party or ideology. A general principle they voiced doesn't answer a specific statement it never addressed.
- The record answers even where they were silent: what a ruler did with power (keeping office within a family,
  a cult of their own portraits, arming groups abroad) answers the matching statement. A repudiation in court,
  exile or late life is words and doesn't change a record. For someone who governed, their time in office answers
  the statement and campaign pledges are left out; a pledge alone is never `high`.
- A state's use of force (war, counter-insurgency, executions) is not "political violence":
  `political-violence-never` is about violence outside lawful authority (coups, insurrections, assassinations,
  terrorism). Ordering state force answers it only where they spoke to political violence as such.
- Words delivered as their own count as theirs, whoever drafted them. Endorsing a candidate, attending a march
  or hosting an event is not a position. A relative's or employer's positions are never theirs.
- Contested or mixed evidence is still evidence: `low` (or 0 if it points both ways), never null. Their
  best-known positions and controversies (a policy of segregation, a military intervention, a signature law)
  must be answered wherever the record exists. Before finishing, check every statement still null once against
  the evidence gathered; before deciding a topic matches no statement, `grep -i <word> statements.json`. For a
  living person, "suggests" or "seems to" is not evidence.

**Source priority.** Answer from the highest tier that has evidence; where tiers disagree, the higher wins.
1. **Primary record:** laws signed, votes, orders, official acts, court records, cited from the document. Can be `high`.
2. **Own words:** speeches, interview transcripts, books, letters, op-eds, posts, programmes they led. Can be
   `high`. Used only where tiers 1 and 3 have no record on the statement.
3. **Secondhand report of the record:** a press, NGO or scholarly report that an act happened; also a scholarly
   reference work or biography stating their views. `medium` at most.
4. **Ancient or attributed accounts**, for figures whose own words and records don't survive: the oldest
   surviving source reporting what they said or did. `medium` at most, `low` where late or disputed.
5. **Secondhand accounts of views and compilations** (a reporter's paraphrase, Wikipedia, OnTheIssues): never
   evidence; follow them to tiers 1-4. If nothing better turns up, the answer is null.

`high` is tier 1 or 2 on that specific statement. Cosponsoring or voting for a bill alone is `medium`.

## 3. Output format

```json
{
  "id": "{{id}}", "name": "{{name}}", "auditedAt": "YYYY-MM-DD",
  "auditor": "<full exact model id, e.g. claude-sonnet-5-5>", "rules": 7, "living": true,
  "role": "e.g. 'German chancellor (2005–2021)'",
  "summary": "Two or three neutral sentences on their political outlook, in your own words.",
  "wikipedia": "https://en.wikipedia.org/wiki/…",
  "sources": [
    { "id": "s1", "kind": "primary | scholarly | reference | program", "evidence": "action | words", "title": "…", "author": "…", "url": "https://…", "usedFor": "…" },
    { "id": "s2", "kind": "primary", "evidence": "words", "title": "<their book>", "url": "https://…", "library": "<file in the local library>", "usedFor": "…" }
  ],
  "booksNotUsed": [{ "file": "<file>", "reason": "…" }, { "gutenberg": ["<id>"], "reason": "…" }, { "urls": ["<Miller Center URL>"], "reason": "…" }, { "corpus": "voteview", "reason": "…" }],
  "notFound": [{ "work": "…", "tried": [{ "where": "…", "how": "…" }, { "where": "…", "how": "…" }] }],
  "answers": {
    "<statement id>": { "value": 1, "confidence": "high | medium | low", "rationale": "…", "sources": ["s1"] },
    "<statement id>": { "value": null, "confidence": "low", "rationale": "No recorded position found.", "sources": [] }
  },
  "notes": "Optional: changes of view over time, contested points."
}
```
