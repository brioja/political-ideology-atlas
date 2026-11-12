# Notes for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [README.md](README.md) first; the rules there apply to
agents too. This file adds what matters when running the audit workflows in
`.claude/workflows/`.

## Running workflows

- **Launch by script path**, not by name. Launching by name can run a copy cached when the
  session started, so edits to the workflow file are silently ignored.
- **Name the audit model:** `{"model": "sonnet"}` in the args. Without it the audit agents inherit the session's
  model; a PreToolUse hook (`.claude/hooks/serial-audits-model.js`) denies a launch without one, or with Haiku.
- **One `serial-audits` workflow at a time** (two at once, split by kind in separate checkouts, was tried
  2026-11-06 and dropped: agents wrote into the wrong checkout). Alternate `{"kind": "people"}` and
  `{"kind": "ideologies"}` runs instead.
- **Parallel runs:** more sessions (Codex, or other Claude sessions; web search's hourly ceiling is
  per session) run as lanes following [audits/PROMPT_LANE.md](audits/PROMPT_LANE.md): each writes
  only its own drafts, in `scratchpad/lane-out/<lane>/`, never into `audits/`. The integrator (the
  session running `serial-audits`) reviews each draft, moves it into `audits/`, builds, tests and
  pushes, and tells lanes which subjects to take.
- **Give each agent its own scratchpad folder** (`scratchpad/<id>/`). Agents sharing one folder
  overwrite each other's helper scripts.
- **Rate-limited sites go through cached tools:** Wikipedia/Wikidata `node scripts/wiki.js`, YouTube
  `node scripts/yt.js` (captions and search, 20 s apart, stops an hour after a 429 or captcha), Project
  Gutenberg `node scripts/gutenberg.js` (official catalog + mirror). A PreToolUse hook
  (`.claude/hooks/no-direct-fetch.js`) denies direct fetches of those hosts and direct yt-dlp; scripts use
  `lib.cachedJson`.
- **Launch prompts should hold only the task.** Workflow agents may echo the launching message and
  act on unrelated instructions in it.

## Audit rules

- Rules on evidence (sources, answers, confidence, uncertainty, research to the end) live once, in
  `audits/AUDIT_RULES.md`, for ideologies and people alike. `PROMPT.md` and `PROMPT_PEOPLE.md` add
  only what is specific to their subject. Put a new evidence rule in AUDIT_RULES.md so both get it.

## New statements

- **The bank is frozen** (Brandon, 2026-11-04): audit runs never edit `statements.json`; they only record
  missing statements (`missingStatements`), reviewed later with the statement-pass process below.

- **Statement wording review:** a reviewer session follows `audits/PROMPT_STATEMENT_REVIEW.md`, taking the
  statements that fail the wording check in quiz order (`node scripts/statement-review.js next`) and writing
  proposals to `scratchpad/statement-review/`. It edits nothing else; the maintainer approves each proposal.

- New ideologies get a statement pass before their audits: `audits/PROMPT_STATEMENTS.md` (Opus builds
  the source library and proposes missing statements, each worded from at least two source quotes from separate places). Batches of
  about 20 proposed statements go to one Codex review; statements Claude and Codex both approve go into
  `statements.json` as candidates without asking the maintainer. Check wording with
  `node scripts/statements-check.js --wording <files>`.

## Backlog

- Discussed-but-not-started ideology work, and ideas ruled out, live in `backlog/`, one file per
  topic. Add new ideas there, and check `backlog/decided-against.md` before proposing something.

## People and AI models

- A change that only touches people or AI models needs `node scripts/build.js --people` and
  `node test.js --people` (seconds): they never feed back into the ideology model in data.js.
- AI models take the quiz themselves by following `audits/PROMPT_MODEL.md`.

## After each run

- Check `git status`. Agents sometimes leave files uncommitted (often
  `audits/statements/texts.json`) or skip a rebuild because of someone else's uncommitted work.
- Check the report for audits that weren't produced, failed tests and new `notAnIdeology` records.
  Judgment calls go to the maintainer rather than being fixed silently. Who the uncertainty rule
  includes or excludes is not one: it follows from the data, so shifts are never flagged.
- Don't pad rationales by script. `validate.js` rejects high-confidence answers that share a
  rationale; a stock phrase is at most medium confidence.
- Promote a candidate once it carries signal on the real lines (test 2 in
  `audits/statements/STANDARD.md`; `node scripts/statements-check.js` lists them as Ready), and
  demote an active statement that loses it (`node scripts/statement-signal.js`). Brandon, 2026-11-05.
  An audit written before a promotion counts that statement as null until its next pass. Every audit
  run ends with `statement-signal.js --apply` (the Signal phase).
