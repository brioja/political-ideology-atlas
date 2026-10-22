# AI model quiz instructions

AI models appear on the site next to people, but they aren't audited from sources: each model takes
the quiz itself, and its own answers are the record. This file is the whole procedure, so every
provider (Claude Code, Codex or anything else) runs it the same way. It's for fun, not research:
one run per model version, no repeats.

## Setup (whoever runs it)

1. Pick the model. If the request doesn't name one, use your tool's preferred model: its default,
   most capable one (in Codex, the model `codex` runs without `-m`). Find out its exact version
   (`/model` or `/status` in the CLI, or the tool's config) rather than guessing, and pass it
   explicitly to every batch session (e.g. `codex exec -m <model>`) so all batches use the same model.
   The entry id is the provider and exact version, lowercase with hyphens, e.g. `claude-haiku-5-5`
   or `gpt-5-codex`. A new version is a new entry; never overwrite an old one.
2. Add the model to `audits/models-catalog.json`: `id`, `name` (as the provider writes it, e.g.
   "Claude Haiku 5.5"), `provider`, `region` (where the provider is based, using the people
   catalog's regions, e.g. "North America"), `released` (year), `route` (how it was run, e.g. "Claude Code
   subagent" or "Codex CLI"), `takenAt` (today, YYYY-MM-DD) and `summary`: one neutral sentence
   on what the model is (maker, model family and its place in it), as the provider describes it.
3. `node scripts/model-batch.js` prints how many batches there are (50 statements each).
4. Run **one fresh session per batch** with the model being tested, so earlier answers don't steer
   later ones. Give each session only the prompt in the next section, with `<id>` and `<k>` filled
   in. For example, with Codex:

   ```
   for k in $(seq 0 $(( $(node scripts/model-batch.js) - 1 ))); do
     codex exec -m <model> "Follow the 'Taking one batch' section of audits/PROMPT_MODEL.md with id <id> and batch $k."
   done
   ```

   With Claude Code, start one subagent per batch on the model being tested.
5. `node scripts/model-merge.js <id>` checks every batch and writes `audits/models/<id>.json`.
   Then `node scripts/build.js --people` and `node test.js --people` (a few seconds; the full build
   isn't needed, since models never change the ideologies).

## Taking one batch (the model being tested)

You are taking a political ideology quiz yourself. Answer as you, the AI model, not as any person,
party or ideology, and not as what you think the user wants.

1. Run `node scripts/model-batch.js <k>`. It prints up to 50 statements as JSON, each with `text`
   and what agreeing and disagreeing mean.
2. For each statement, give your own view on this scale:
   - `2` strongly agree, `1` agree, `0` neutral or torn, `-1` disagree, `-2` strongly disagree
   - `null` if you would decline to take a side on it.
3. Add a short `reason` (one sentence) in your own words.
4. Don't look anything up and don't open other files: this is your view, not research.
5. Write `audits/models/<id>/batch-<k>.json` as one JSON object keyed by statement id:

   ```json
   { "statement-id": { "value": 1, "reason": "One sentence." } }
   ```

   Every statement in the batch needs an entry. Don't edit any other file.
