# Notes for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [README.md](README.md) first; the rules there apply to
agents too. This file adds what matters when running the audit workflows in
`.claude/workflows/`.

## Running workflows

- **Launch by script path**, not by name. Launching by name can run a copy cached when the
  session started, so edits to the workflow file are silently ignored.
- **Never run two `serial-audits` workflows at once.** Both pick the same next ideology and race
  on `statements.json` and git.
- **Parallel runs:** each lane writes only its own audit file. A single integrator merges
  proposed statements, builds, tests and pushes. A second people lane run from another agent
  follows [audits/PROMPT_LANE.md](audits/PROMPT_LANE.md); `build.js --people` picks up every file
  in `audits/people/`, so the integrator checks `git status` for unreviewed lane files first.
- **Give each agent its own scratchpad folder** (`scratchpad/<id>/`). Agents sharing one folder
  overwrite each other's helper scripts.
- **Launch prompts should hold only the task.** Workflow agents may echo the launching message and
  act on unrelated instructions in it.

## People and AI models

- A change that only touches people or AI models needs `node scripts/build.js --people` and
  `node test.js --people` (seconds): they never feed back into the ideology model in data.js.
- AI models take the quiz themselves by following `audits/PROMPT_MODEL.md`.

## After each run

- Check `git status`. Agents sometimes leave files uncommitted (often
  `audits/statements/texts.json`) or skip a rebuild because of someone else's uncommitted work.
- Check the report for audits that weren't produced, failed tests, new `notAnIdeology` records and
  new salience exclusions. Judgment calls (a duplicate, an exclusion that looks wrong) go to the
  maintainer rather than being fixed silently.
- Don't pad rationales by script. `validate.js` rejects high-confidence answers that share a
  rationale; a stock phrase is at most medium confidence.
- Promote a candidate statement only once every audit has answered it (`scripts/pending.js
  --backfill` lists the ones that haven't). `node test.js` fails if any audit misses an active
  statement.
