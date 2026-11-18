# People

Ideas for the people catalog beyond public figures. Like every people audit, nothing here feeds the ideology
model or quiz calibration.

## AI models (shipped 2026-10-22, all hidden since 2026-10-24)

Versioned models take the quiz themselves (procedure: `audits/PROMPT_MODEL.md`); a new version is a new entry
and the old one stays. Answers are on file in `audits/models/` for Claude Haiku, Sonnet and Opus 5.5,
GPT-6-Astra, GPT-6.1-Sol and Gemini 3.8 Flash. All were hidden at public launch; to bring one back, remove its
`"hidden": true` in `audits/models-catalog.json` and rebuild with `--people`. Unhiding is Brandon's call.
When shown, show one model per provider (the flagship or newest).

Not run yet: Fable (token-heavy: after a usage reset or on a weekend) and other providers (Qwen, Kimi,
DeepSeek: need installs or paid keys; Brandon wants full models, not free tiers). Record which route ran
each entry (subscription CLI or API script). Decide when Brandon wants more models.

## Fictional characters (idea, 2026-10-22)

Not started, no design agreed; design with Brandon first, once the people catalog is further along. Open
questions to raise then: a separate kind like the AI models, labelled fictional; evidence is the canonical
work itself (what the character says and does), with the author's own commentary kept apart; a data-driven
catalog (fictional characters plus views), no hand-picked list; the same inclusion gates as real people.
