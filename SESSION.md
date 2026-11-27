# What an audit session sees

An audit session is one headless Claude or Codex run that `scripts/lane.js` starts for one subject. It is told only
its task. This file lists what reaches it and what is kept from it. The reasons and their dates are in the code
comments named here. When you change what a session gets, change this file in the same commit.

Check here (or in the draft itself) before saying what a session saw. Don't reason it out from the published audit:
a later pass's draft is not a copy of it.

## What it sees

- **The driver's first message** (`START`):
  - follow `audits/PROMPT_LANE.md`;
  - for an ideology, first do `audits/PROMPT_IDEOLOGIES.md` sections 1 and 2 (scope, sources, aliases, key figure,
    key works);
  - then answer the statements in `<id>.statements.txt`, from the local texts and the web (`SEARCH`).
- **Added to the first message when they apply:**
  - the ideology's other names, to search under, which count as aliases already (`otherNames`);
  - books downloaded on it (`fetchBooks`, `booksAtStart`);
  - the namesake's reference books (`namesakeBooks`);
  - a request for its color (`COLOR`);
  - the validate.js problems no script fixed (`prepNote`).
- **Later messages:**
  - `RESUME` ("go on where you left off");
  - `FIX`, with the validate.js errors left once the session marks the draft done.
- **Its draft**, `scratchpad/lane-out/<lane>/<id>.json`:
  - the audit's sources, aliases, key figure and key works;
  - an empty entry for each open statement, and no other answers.
- **`<id>.statements.txt`**: each open statement's id and text, by theme (`writeStatements`).
- **The files its messages point to**: `audits/PROMPT_LANE.md`, `audits/AUDIT_RULES.md`,
  `audits/PROMPT_IDEOLOGIES.md` or `audits/PROMPT_PEOPLE.md`.
- **For Claude only:**
  - `scripts/lane-system-prompt.md`, in place of Claude Code's own system prompt;
  - the hooks in `.claude/hooks/`, which refuse some actions and add notes (the tool to use, a local corpus to search).

## What it doesn't see

- **Answers that pass today's rules.** They are kept aside in `.settled/<id>.json` while the session runs and put
  back afterwards (`hideSettled`, `restoreSettled`). The session neither reads nor rechecks them; only validate.js
  does. A fault validate.js has no check for passes through every later pass unchanged.
- **From the published audit, in a later pass** (`seedLaterPass`):
  - its scope, notes and the reasons for its nulls, which are deleted;
  - answers citing Wikipedia, which are nulled (`cleanup.js dropWikipedia`).
- **Answers that fail a check before the session** (`prepare`). Each is nulled, so it reaches the session as an open
  statement:
  - an answer citing a source validate.js can't tie to the subject, whatever else it cites (`cleanup.js dropFailing`,
    `drop-source.js --null-all`);
  - an answer validate.js fails for any other reason (`cleanup.js nullFailing`), for example a rationale naming a
    source the answer doesn't cite.
- **The site's agree/disagree explanations and notes for each statement.**
  `.claude/hooks/statement-text-only.js` refuses `statements.json` and `data.js` (Claude only; Codex doesn't read
  hooks).
- **The maintainer's context** (`ISOLATED`, `session`):
  - memory, `AGENTS.md` and `CLAUDE.md` (Codex keeps its global `~/.codex/AGENTS.md`);
  - Claude Code's default system prompt, and the "hasn't heard from you" reminder;
  - the maintainer's effort level (sessions run at high).
- **Anything about other sessions:** what they did or will do, or that other answers exist.
- **What it can't search, and the tools particular sites need.** `get.js` and the fetch hook print the tool to use
  when a session reaches for such a site.
