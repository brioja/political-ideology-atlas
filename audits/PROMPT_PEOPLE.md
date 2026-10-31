# Person audit instructions

You are auditing one public figure for Political Ideology Atlas, a political ideology test. Test
takers see the people whose recorded positions are closest to theirs. Many of these people are
alive, so accuracy matters more than completeness: never guess at a real person's views.

Inputs (filled in by the runner):
- Person: `{{name}}` (id `{{id}}`), Wikipedia: `{{wikipedia}}`, born `{{born}}`
- Statements: `statements.json` in the repo root. Answer every statement.

Output: write `audits/people/{{id}}.json` (or the path the runner gives) in the format below, then
run the validator command the runner gives and fix every error except the uncertainty rule.

Read `audits/AUDIT_RULES.md` first. Its rules (sources, answers, confidence, uncertainty, deepening)
apply to every audit, ideologies and people alike, and apply here in full; this file adds only what
is specific to people.

## 1. Research

- A person's `primary` sources are their own words (books, speeches, interviews, party programs they
  led, official statements) and their record (votes, laws signed, policies enacted). Prefer what the
  person said or did over what others say about them.
- For a thin theme, search "<name> on <topic>", their votes, platform sections and interviews. A
  prominent politician usually needs 8-12 sources; someone with a thin public record needs fewer,
  and many nulls are then the honest result.
- Spread matters as much as count. Each theme feeds different dividing lines, and a person is placed
  only as precisely as their thinnest themes allow: forty answers bunched in economy and society
  with one in government leave several lines guessed, and then they get matched with test-takers
  they share almost nothing with. Before finishing, every theme should have answers wherever the
  person has said or done anything relevant. Government (elections, courts, executive power,
  federalism) and world (wars, alliances, aid, the UN) are the themes most often left thin.
- For people whose output is mostly video (streamers, podcasters, commentators), search their own
  channels and clips by theme ("<name> on NATO", "<name> Supreme Court", "<name> elections") and
  read the captions with yt-dlp. Their reactions to news segments state positions too.
- If a page comes back as an empty JavaScript shell (common on transcript databases), render it with
  headless Chrome: `google-chrome --headless=new --disable-gpu --virtual-time-budget=15000
  --dump-dom <url>`, then strip the tags. Transcripts and captions rarely label speakers: use a
  passage only when context makes clear the person themselves is speaking, not a guest or a bit.
- A maintainer-supplied text (AUDIT_RULES.md, section 2) has a date: check later positions on the
  web.
- Stop early for someone without a political record (an artist, athlete or entertainer known for
  other things): if the Wikipedia article and two or three targeted searches ("<name> politics",
  "<name> views on …") turn up no stated political positions, record the few you found, answer the
  rest null, and finish. Failing the uncertainty rule is then the correct outcome, and a long search is wasted.
- Political-quiz sites are not sources (AUDIT_RULES.md). The exception is the person taking a quiz
  themselves, answers read aloud, as some streamers and
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

If there is no reliable evidence of their position, answer `null` ("no known position"). There
are no inferences, for living or historical people (AUDIT_RULES.md, section 3): a statement is
answered only where their own stated position settles it, never from their party or ideology. A
general principle they voiced ("freedom of religion", "equal rights for all") doesn't answer a specific
statement it never addressed (apostasy laws, covering laws, blasphemy): for a person those stay
null unless they spoke to them.

A monarch's or head of state's formal assent is not their position. Laws, constitutions and
policies they only signed or proclaimed on ministers' or parliament's advice don't count, nor does a
speech from the throne setting out the government's programme; use only views they expressed
themselves and measures they personally drove. Likewise, what a government did under someone
(executions, a state policy) is their position only where they drove it or spoke to it.

When the person's own record directly contradicts their words on a statement (elections they
rigged or cancelled, term limits they wrote themselves out of, a single party they kept in power
while praising pluralism), the record wins. If the evidence is genuinely mixed, answer 0 at `low`.
Where words and record pull apart, rhetoric alone is never `high`. This applies at every confidence level, including `low` answers, and
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
ghostwritten book). Endorsing a candidate, attending a march or hosting an event is not a position on any statement.
A relative's or employer's positions are never theirs.

Contested or mixed evidence is still evidence: answer it at `low` confidence (or 0 if it points
both ways), never null. A person's best-known positions and controversies (what their record is
famous or criticised for, e.g. a policy of segregation, a military intervention, a signature law)
must be answered whenever the record exists; check them before finishing. Read the whole statement
list, not just its first part: before finishing, go through every statement still null once and
check it against the evidence you gathered. Before deciding a topic "matches no statement", search
the statement texts for its keywords (`grep -i <word> statements.json`). For a living person,
"suggests" or "seems to" is not evidence: answer only from what they said or did.

**Source priority.** Every answer must be traceable: a reader can open the cited source and see the
position there. Judging whether a secondhand outlet is reliable or biased is not something to rely
on, so evidence is ranked by kind. Answer from the highest tier that has evidence; where tiers
disagree, the higher tier wins.
1. **Primary record:** laws signed, votes, orders, official acts, court records, cited from the
   document itself. Can be `high`.
2. **Own words:** speeches, interview transcripts, books, letters, op-eds, posts, party programmes
   they led, cited from the original. Can be `high`, unless tier 1 or tier 3 contradicts them (the record wins, above).
3. **Secondhand report of the record:** a press, NGO or scholarly report (a secondary source) stating
   that a vote, law, arrest, election result or other act happened. `medium` at most, but it still overrides tier 2:
   a ruler's pro-democracy speeches don't outweigh reported arrests of opponents. A scholarly
   reference work or biography stating their views (AUDIT_RULES.md, section 2) is tier 3 too.
4. **Ancient or attributed accounts:** for figures whose own words and records don't survive, the
   oldest surviving source reporting what they said or did (Plato, Suetonius, the sutras,
   collected sayings, a contemporary biographer), cited as that source, not a modern summary.
   `medium` at most, `low` where the account is late or disputed.
5. **Secondhand account of views, and tertiary compilations:** a reporter's paraphrase of what
   someone thinks; and Wikipedia, OnTheIssues and similar compilations, for views and record alike.
   Never evidence on its own: use it only to find tiers 1-4 (follow its citations to the report or
   document and cite that, checking the original as AUDIT_RULES.md, section 2 says). If nothing
   better turns up, the answer is null.

Confidence follows AUDIT_RULES.md, section 4: `high` is tier 1 or 2 on that specific statement,
cited from the primary source; tiers 3 and 4 are `medium` at most. Cosponsoring or voting for a bill
alone is `medium`: it shows support for the bill, not for every way a statement could be read.

**Uncertainty** (AUDIT_RULES.md, section 5) counts every recorded position (not `null`). When it
fails, the validator names the dividing lines the record leaves mostly unknown; when deepening, search
those first for stated positions. If the record really has nothing more, stop.

## 3. Output format

```json
{
  "id": "{{id}}",
  "name": "{{name}}",
  "auditedAt": "YYYY-MM-DD",
  "auditor": "<full exact model id, e.g. claude-sonnet-5-5 or gpt-6.1-sol, not just gpt-6>",
  "rules": 3,
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

