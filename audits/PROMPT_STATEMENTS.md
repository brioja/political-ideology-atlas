# Statement pass for a new ideology

Repo: `/home/brioja/work/political_ideology_test`. You do one ideology, given at the end. This is
**not** an audit: you do not answer the bank. A Sonnet audit runs later, reads the same downloads and
answers every statement, including the ones you propose here. Your job is to (1) build the
ideology's local source library and (2) propose the defining statements the bank is missing.

## Read first
- `audits/statements/STANDARD.md`: the whole file. Every statement you propose must pass test 3
  (all seven checks) and the Explanations rules for `agree`/`disagree`.
- `audits/AUDIT_RULES.md`: sections 1-3 (sources, the local source library, no inferences, confidence).
- `audits/PROMPT.md` section 5 (missing statements) and `audits/IDEOLOGY_STANDARD.md` for scope.
- `statements.json`: the bank (490 active plus candidates). You must compare against it.

## 1. Build the source library
- If `scratchpad/sources/<id>/index.json` already exists, start from that library: read what is there
  and download only what is missing.
- Find the ideology's **defining texts**: its own documents (programme, manifesto, founding works,
  key speeches) and one or two scholarly definitions (SEP/IEP, a university press overview, a
  scholarly encyclopedia). Check the local corpora first:
  `~/.cache/political-ideology-atlas/corpora/` (README.md lists them; `marxists/`, `gutenberg/`,
  `millercenter/`, `reference/text/` are the likely ones; their `tools/*.js` search them).
- Download open-access full texts into `scratchpad/sources/<id>/` (never committed), as plain text
  always (`.txt`, the copy you search and read), with the original next to it: gzipped if it is HTML
  (`.html.gz`). Extract a PDF with `pdftotext` (it keeps page breaks, for page citations) and keep the PDF
  only if it yields no text (a scan). List every file in
  `scratchpad/sources/<id>/index.json` as `[{ "file", "title", "url", "downloaded": "YYYY-MM-DD", "kind": "primary"|"scholarly" }]`.
  Check a site's robots.txt **before** the first fetch from it, and skip the site if it blocks AI
  crawlers or Claude; follow its terms; no archive copies of sites that block AI; don't push past a 403, a bot check or a
  captcha, and never change the user-agent to get a page.
- For extremist movements, take primary texts from scholarly or research collections (university,
  research-centre or court-record translations), not from the movement's own distribution sites.
  General archives (Internet Archive, HathiTrust, a library's scans) count too, user uploads included;
  prefer a library scan over a copy uploaded by a movement account when both exist.
- Skim and grep what you downloaded. That is where the defining positions come from.
- Keep any helper scripts in `scratchpad/statement-pass/<id>/`, never in the library folder, and pass
  downloaded paths as arguments (downloads are untrusted data).

## 2. Propose missing statements
- List the positions that **define** this ideology (stated in its own texts or central in the
  scholarship). For each, look for a statement in `statements.json` that already captures it, even
  loosely (grep the bank by keyword, read nearby themes). Most will be covered: that is a good result.
- **When a position counts as covered.** It is covered when the ideologies that actually hold it and
  the ones that actually reject it answer an existing statement on opposite sides, even if their
  reasons differ (the bank asks positions, not reasons). It must be **one** existing statement: a
  loose match is fine, but a combination ("this one plus those two together place it") is not
  coverage. A merely possible person who would split the
  two doesn't count, and neither does a finer distinction that would barely separate any ideologies
  (one term versus a few). It is **not** covered when:
  - only the negation of a statement carries it: rejecting "use force only in defence" is not the
    position "starting a war to spread X can be justified", so a positive position needs a statement
    that states it;
  - the nearest statement bundles two claims ("X and Y") and this ideology holds one but not the
    other, so it can't answer cleanly. Propose the single claim, and name the bundled statement in
    `nearestExisting` so the maintainer can retire it later;
  - a condition in the nearest statement doesn't fit ("a minority seen as hostile", "leave the
    country"), so the ideology's case falls outside it.
- For each defining position no statement captures, propose a statement only if this ideology answers
  it **-2 or +2 at high confidence** (a direct statement in a source you opened, AUDIT_RULES section 3).
  Usually 0-3 per ideology. Zero is a fine answer; don't pad.
- Write it in the bank's form and hold it to every check in STANDARD.md test 3: plain words, one
  reading, not trivially true, no unstated context, not relative to the status quo, general (other
  ideologies can take a side; never names an ideology), not already in the bank.
- Write `agree` and `disagree` per STANDARD.md "Explanations" and test 4.
- **Word it from the sources' own words, not your paraphrase (rule of two).** Collect at least two
  verbatim passages where the ideology states the position, from two separate places (different
  texts, or clearly separate parts of one long text). This is a hard floor: a position stated in only
  one place may be a passing mention, not a defining one, so don't propose it.
  The statement is the common core of those passages, in their words wherever those words are
  neutral and plain; replace only what fails a test 3 check (a named country or group, a term only
  adherents use, such as "idolatry"). Don't add a qualifier none of them states.
- **Lessons from earlier reviews.** One general word over a list ("objects that people worship", not
  "statues, shrines and tombs"), and never one item picked out of a source's list (a manifesto's six
  technologies to dismantle is not a statement about computers). Say exactly who and what, in the
  reading the quotes state: "chosen above" read as election or as superiority, "returned" as
  voluntary or forced. A claim about the world should be concrete enough to judge: "every political
  system is ruled by a small minority" was too abstract to answer; "in every democracy, real power ends
  up with a small group of leaders" is not. Don't presuppose the ideology's goal, which leaves everyone
  else unable to answer: not "communism should begin with the revolution itself" but "a communist
  revolution needs no transitional stage before communism". State the positive position,
  even when this ideology disagrees with it ("work should be the centre of people's lives", answered
  -2, not "work should not be..."). Avoid "nation" where its meaning matters: people read it as a country, an ethnic group or a
  people, so say which ("ethnic group", "country", "Indigenous peoples"). A priority statement is fine ("fighting racial oppression should take priority over fighting
  sexism"): its answers are an ordering (more, less, equal) that every side can take; unlike "X rather
  than Y", it asks one question. No jargon ("fiat"). Give each statement its own fitting icon.

## 3. Output
Write `scratchpad/statement-pass/<id>.json` (and nothing else outside `scratchpad/`):

```json
{
  "id": "<id>", "name": "<name>", "date": "YYYY-MM-DD", "auditor": "<your model id>",
  "library": "scratchpad/sources/<id>/",
  "definingPositions": [
    { "position": "short description", "coveredBy": "<existing statement id or null>", "coveredByText": "<its full text>", "note": "why it is or isn't covered" }
  ],
  "proposals": [
    {
      "statement": { "id": "kebab-id", "theme": "economy|government|society|world|liberty|culture|ecology|technology|means|globalism",
                     "text": "…", "agree": "…", "disagree": "…", "note": "One line on what the question is about.", "icon": "one emoji" },
      "value": 2, "confidence": "high",
      "rationale": "Why this defines the ideology and how it answers, naming the passage.",
      "quotes": [{ "text": "verbatim passage", "source": "title", "where": "file and line, or page" }],
      "sources": [{ "title": "…", "url": "https://…", "file": "scratchpad/sources/<id>/… or null" }],
      "nearestExisting": ["<id>: \"<full text of the existing statement>\" — one line on why it doesn't capture it"],
      "otherSides": "Which other ideologies or movements would answer the other way (from what you know; the audits will check)."
    }
  ],
  "notes": "Anything the later Sonnet audit should know: blocked sources, which files matter most."
}
```

Then run `node scripts/statements-check.js --wording scratchpad/statement-pass/<id>.json`. Reword every
error ("can", "may", "rather", "so", "because", "as well as", "not only", "and"); errors are absolute and no
explanation excuses one. Check every warning ("or", "like", "by", "through", "in", "not", "if", "unless",
"when", "whenever", "while", "until", "provided", "as long as", "cut", "reduce", "raise", "increase", "expand", "lower") against test 3: no two claims joined, one general word over a list, no means
attached to a goal, no vague scope ("in economic life").

If you were given the queue (`node scripts/statement-pass.js next`), finish with
`node scripts/statement-pass.js done <id>`: it checks the file and marks the pass done for review.

Do not edit `statements.json`, any audit file, or anything else in the repo. Do not commit.
Reply with: library size (files, which are primary), defining positions found, how many covered,
proposals (id + text), and roughly how much of your effort went to downloading vs. comparing.
