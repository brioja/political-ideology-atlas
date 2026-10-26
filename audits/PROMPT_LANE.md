# Second people-audit lane

For running people audits from another agent (e.g. Codex) alongside the main lane. The main lane
works from the most-viewed end of the queue and integrates; this lane works from the other end and
only writes audit files. Start it with one line:

> Follow audits/PROMPT_LANE.md.

## Which people

If you were given a list of ids, audit those first (skip any that already have a file in
`audits/people/`). Then cycle: run

    node scripts/pending.js --people --by-views --reverse --limit 1

and audit the person it prints. Repeat until told to stop. The least-viewed people come first, so
many will have a thin political record; the early-exit rule makes those quick.

## For each person

1. Read `audits/PROMPT_PEOPLE.md` and follow it exactly, including its early-exit rule. Take name,
   wikipedia, born and living from the pending output or `audits/people-catalog.json`. Set
   `auditedAt` to today's date and `auditor` to your full, exact model id
   including version and variant (e.g. `gpt-6.1-sol`, `claude-haiku-5-5`), not a family name like
   `gpt-6`, so audits can be revisited by model later.
2. **Depth:** cover the person's whole career, not only recent speeches. Go theme by theme through
   the statement themes and look for their best-known positions and controversies in each before
   finishing. Prefer full texts of their own words (books, speeches, transcripts, laws they
   signed), downloaded and searched, over summaries.
3. **Confidence:** `high` only when the person states the position directly; `medium` when it is
   clearly implied by what they said or did; `low` when ambiguous or contested. When their record
   directly contradicts their words (rigged elections, term limits they exempted themselves from),
   the record wins; genuinely mixed evidence is 0 at `low`. Rhetoric alone is never `high`.
4. **Inference:** living people, none at all; no evidence means null. Historical figures, only when
   it follows directly from views they stated, `low`, rationale starting "Inferred:". Never infer
   from party, label or theme. The most recent clear position wins. Answers must match each
   statement's actual wording; if the evidence is about something nearby, answer null.
5. Put downloads and helper scripts in `scratchpad/<lane>-<id>/` (e.g. `scratchpad/codex-<id>/`).
6. Write only `audits/people/<id>.json`, and only once it is finished: build it in your scratch
   folder and move it into `audits/people/` as the last step, so the main lane never picks up a
   half-written file. Run `node scripts/validate.js --people <id>` and fix every
   error except salience. Never add or strengthen an answer to clear the salience gate; failing
   salience is an acceptable outcome. A "loosely placed" warning (only for people on the
   legacy bar, `audits/people-legacy-bar.json`) means the audit passes but the thinnest themes
   need more searching; do that, then accept what the record gives. If the warning goes away, say
   so in your report line so the main lane removes the id from the list.
7. Do not edit any other file. Do not build, test, commit or push: the main lane reviews each file,
   rebuilds and pushes.

After each person, print one line: id, known answers out of 490, how many inferred, whether
salience passed, and whether it was loosely placed.
