# Explanation review loop

For a reviewer session (Codex, or another Claude session) rewriting the "If you agree / If you disagree"
sentences that only restate their statement. Start it with one line:

> Follow audits/PROMPT_EXPLANATION_REVIEW.md. Do 2.

A quiz taker who tapped "What does this mean?" on `sacred-nation` found the explanation just repeated the
statement (2026-11-15). The loop takes the restating statements in quiz order, so the ones most people see come
first. Only the `agree` and `disagree` sentences change: never the statement text, the note, the id or any answer.

## The loop

1. Run `node scripts/explanation-review.js next`. It prints the path of a brief
   (`scratchpad/explanation-review/<id>-brief.md`) for the next statement whose agree or disagree sentence
   restates it and has no review yet, or `none`.
2. Read the brief: the entry, how much each sentence repeats, the answer spread, sample rationales per side and
   the rules.
3. Read more than the samples: the full `answers["<id>"]` in `audits/profiles/*.json` and `audits/people/*.json`.
   Each sentence must be true of every subject on its side, whatever their reason, so look at the different
   reasons they give, including the milder answers (±1).
4. Write `scratchpad/explanation-review/<id>-results.md`, as the brief asks, with the `**Verdict:**`,
   `**Agree:**` and `**Disagree:**` lines each on one line. That file marks the statement reviewed.
5. Verify it: `node scripts/explanation-review.js check <id>`. It checks the three lines are there, that agree
   shares under 60% and disagree under 90% of its words with the statement, that neither gives a reason or runs
   to a second sentence, that disagree has no either/or, and that disagree shares under 90% of its words with
   agree. Fix what it reports and run it again. It can't
   judge meaning: whether each sentence is exactly the statement and fits every subject on its side is yours.
6. Go back to 1. Stop at the number you were asked for (default 2), or at `none`.

`node scripts/explanation-review.js list` shows the whole queue.

## What you may edit

Only files in `scratchpad/explanation-review/`. Never edit `statements.json`, any audit or any other repo file.
The integrator reviews each proposal and applies the accepted ones.

## What makes a good explanation

- **Help the reader see the position.** Say what it means in practice, in plainer words, or with a typical
  example: "The nation is a sacred, enduring community..." tells a reader little more than the statement; what
  would someone who holds it believe or want?
- **Exactly the statement, nothing added.** No reason ("because..."), no second policy, no stronger or milder
  version. An example must be one every agreeing subject accepts.
- **Disagree is a position, not the far extreme.** A clean positive opposite where one exists ("Military
  service should always be voluntary"); a -1 subject must fit it as well as a -2. If the only true opposite is
  the plain negation, say what disagreeing looks like in practice instead of adding "not" to the agree: the
  check rejects a disagree that repeats the agree (Brandon, 2026-11-15). Ways that work: what disagreeing
  subjects want in its place, stated broadly enough for all of them ("Society needs government of some
  kind"); what they accept that the statement rules out ("A country may let foreign allies keep troops and
  bases on its land"); "at least as much" for a comparison; a "need not" or "may" framed around the
  practical case rather than the agree's words. Where no positive opposite fits, the negation rephrased in
  other words is fine: a rewording still helps a reader see the meaning (Brandon, 2026-11-15).
- **Plain neutral words**, one sentence each, nothing either side would call loaded. Don't imply everyone is
  one of two genders.
- **"Keep" is a fine verdict** when no faithful rewording exists; say why.

## Reporting

When you stop, reply with one line per statement: the id, your verdict, and the two proposed sentences.
