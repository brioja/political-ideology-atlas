# Notes for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [README.md](README.md) first. This file adds what matters when
running the audit workflows in `.claude/workflows/`.

## Running workflows

- **Launch by script path**, not by name: by name can run a stale cached copy.
- **One `serial-audits` run at a time**; alternate `{"kind": "people"}` and `{"kind": "ideologies"}` runs.
- **Parallel runs** are lanes in other sessions following [audits/PROMPT_LANE.md](audits/PROMPT_LANE.md). The
  integrator (the session running `serial-audits`) assigns subjects, reviews each lane's audit, moves it into
  `audits/`, builds, tests and pushes.
- **Each agent gets its own scratchpad folder** (`scratchpad/<id>/`).
- **Fetching goes through cached tools:** searches `node scripts/search.js`, pages `node scripts/get.js <id> <url>`,
  Wikipedia `scripts/wiki.js`, YouTube `scripts/yt.js`, Gutenberg `scripts/gutenberg.js`. Hooks refuse the rest.

## Audit rules

- Evidence rules live once, in `audits/AUDIT_RULES.md`, for ideologies and people alike; `PROMPT.md` and
  `PROMPT_PEOPLE.md` add only what is specific to their subject.

## New statements

- **Wording review:** a reviewer session follows `audits/PROMPT_STATEMENT_REVIEW.md` and only writes proposals
  to `scratchpad/statement-review/`; the maintainer approves each.
- **New ideologies** get a statement pass first (`audits/PROMPT_STATEMENTS.md`). Statements Claude and Codex both
  approve go into `statements.json` as candidates. Check wording with `node scripts/statements-check.js --wording`.

## People

- A change touching only people needs `node scripts/build.js --people` and `node test.js --people`.

## After each run

- Check `git status` for files left uncommitted (often `audits/statements/texts.json`) or a skipped rebuild.
- Check the report for audits not produced, failed tests and new `notAnIdeology` records; judgment calls go to
  the maintainer. Shifts in who the uncertainty rule includes follow from the data and are never flagged.
- Every run ends with `node scripts/statement-signal.js --apply`, which promotes candidates that carry signal on
  the real lines and demotes active statements that lost it.
