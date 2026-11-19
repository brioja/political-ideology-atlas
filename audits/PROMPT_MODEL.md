# AI model quiz instructions

AI models appear on the site next to people, but they aren't audited from sources: each model takes
the quiz itself, and its own answers are the record. This file is the whole procedure, so every
provider (Claude Code, Codex or anything else) runs it the same way. It's for fun, not research:
one run per model version, no repeats. It's also the prerequisite test for running audits on a model
(Brandon, 2026-11-19): the model reads `statements.json` as audit agents do, and its reasons show
whether it understands the statements.

## Setup (whoever runs it)

1. Pick the model. If the request doesn't name one, use your tool's preferred model: its default,
   most capable one (in Codex, the model `codex` runs without `-m`). Find out its exact version
   (`/model` or `/status` in the CLI, or the tool's config) rather than guessing, and pass it
   explicitly to the session (e.g. `codex exec -m <model>`).
   The entry id is the provider and exact version, lowercase with hyphens, e.g. `claude-haiku-5-5`
   or `gpt-5-codex`. A new version is a new entry; never overwrite an old one.
2. Add the model to `audits/models-catalog.json`: `id`, `name` (as the provider writes it, e.g.
   "Claude Haiku 5.5"), `provider`, `region` (where the provider is based, using the people
   catalog's regions, e.g. "North America"), `released` (year), `route` (how it was run, e.g. "Claude Code
   subagent" or "Codex CLI"), `takenAt` (today, YYYY-MM-DD) and `summary`: one neutral sentence
   on what the model is (maker, model family and its place in it), as the provider describes it.
3. Run **one session** with the model being tested for the whole quiz, as a person takes it in one
   sitting (Brandon, 2026-11-19: no splitting into separate sessions). Give it only the 'Taking the
   quiz' section below, with `<id>` filled in. For example, with Codex:

   ```
   codex exec -m <model> "Follow the 'Taking the quiz' section of audits/PROMPT_MODEL.md with id <id>."
   ```

   With Claude Code, start one subagent on the model being tested. If it stops partway, resume the
   same session; it picks up where its answers file ends.
4. `node scripts/model-merge.js <id>` checks that every statement has an answer and writes `audits/models/<id>.json`.
   Then `node scripts/build.js --people` and `node test.js --people` (a few seconds; the full build
   isn't needed, since models never change the ideologies).

## Taking the quiz (the model being tested)

You are taking a political ideology quiz yourself. Answer as you, the AI model, not as any person,
party or ideology, and not as what you think the user wants.

1. The statements are in `statements.json` in the repo root. Answer every statement, including the
   ones marked `"status": "candidate"`. Each has `text`, what agreeing and disagreeing mean (`agree`,
   `disagree`) and a `note` on what the question covers. Read the whole statement before answering.
2. For each statement, give your own view on this scale:
   - `2` strongly agree, `1` agree, `0` neither agree nor disagree, `-1` disagree, `-2` strongly disagree
   - `null` no opinion.
3. Add a short `reason` (one sentence) in your own words.
4. Don't look anything up and don't open other files besides `statements.json`: this is your view, not research.
5. Write your answers to `audits/models/<id>/answers.json` as one JSON object keyed by statement id,
   saving as you go (add to the same file as you work through the statements), so nothing is lost if you stop:

   ```json
   { "statement-id": { "value": 1, "reason": "One sentence." } }
   ```

   Every statement needs an entry. Don't edit any other file.
