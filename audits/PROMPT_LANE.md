# Audit lane

A lane audits from another session (Codex, or another Claude session) alongside the integrator, the session
running `serial-audits`, which reviews lane files, builds, tests and pushes. Start a lane with one line:

> Follow audits/PROMPT_LANE.md.

The integrator's instructions (which subjects, in what order, how to report) take precedence over this file.

## Which subjects

Audit the ids the integrator gives you. With no list, take the next with
`node scripts/next.js --skip <ids the integrator and other lanes have taken>` (add `--people` or `--ideologies` if
assigned a kind) and tell the integrator which id you took.

## For each subject

1. Follow `audits/AUDIT_RULES.md` and `audits/PROMPT.md` (ideology) or `audits/PROMPT_PEOPLE.md` (person), with
   the fields from the next.js output or the catalog. Set `rules` to `CURRENT_RULES` in scripts/validate.js and
   `auditor` to your full model id (e.g. `gpt-6.1-sol`, `claude-opus-5-5`).
2. An existing audit (or a "reason" from next.js) means a later pass: build on the committed file
   (AUDIT_RULES.md section 6), never rewrite it from scratch.
3. Sources go in `scratchpad/sources/<id>/`; helper scripts in `scratchpad/<lane>-<id>/`.
4. Write the audit to `scratchpad/lane-out/<lane>/<id>.json`, never into `audits/` (the build would pick it up
   before review), and validate it there: `node scripts/validate.js [--people] --dir scratchpad/lane-out/<lane> <id>`.
   Fix every error except the uncertainty rule.
5. Edit no other file. Do not build, test, commit or push.

After each subject, tell the integrator one line: id, kind, known answers, and whether the uncertainty rule passed
(or the lines it names).
