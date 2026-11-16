# Audit lane

For running audits from another session (Codex, or a second Claude session) alongside the
integrator: the session running the `serial-audits` workflow, which reviews lane files, builds, tests
and pushes. A lane only writes audit drafts. Start it with one line:

> Follow audits/PROMPT_LANE.md.

Follow the integrator's instructions (which subjects, in what order, how to report) when it sends
them; they take precedence over this file.

## Which subjects

Audit the ids the integrator gives you, people or ideologies. With no list, take the next one with

    node scripts/next.js --skip <id>,<id>,...   (the ids the integrator and other lanes have taken)

(add `--people` or `--ideologies` if the integrator assigned you a kind) and tell the integrator
which id you took, so the two sessions never work on the same subject.

## For each subject

1. Follow `audits/AUDIT_RULES.md` and `audits/PROMPT.md` (ideology) or `audits/PROMPT_PEOPLE.md`
   (person) exactly, with `{{id}}`, `{{name}}` and the other fields taken from the next.js output
   or the catalog. Answer every statement in statements.json, candidates included, and set `rules`
   to the current version (`CURRENT_RULES` in scripts/validate.js). Research to the end (section 6):
   no later pass fills the gaps.
2. If the subject already has an audit (or next.js gives a "reason"), this is a later pass: start
   from the committed file and follow `audits/AUDIT_RULES.md` section 6 (reviewHistory, `passes`,
   your model in `auditor`), never rewrite it from scratch. `auditor` is your full model id
   (e.g. `gpt-6.1-sol`, `claude-opus-5-5`), not a family name.
3. Sources go in `scratchpad/sources/<id>/`; helper scripts in `scratchpad/<lane>-<id>/`.
4. Write the audit to `scratchpad/lane-out/<lane>/<id>.json`, never into `audits/`: the integrator's
   build would pick up a file there before it is reviewed. Validate it there:

       node scripts/validate.js [--people] --dir scratchpad/lane-out/<lane> <id>

   and fix every error except the uncertainty rule. Never add or strengthen an answer to pass it;
   failing it is an acceptable outcome.
5. Edit no other file. Do not build, test, commit or push.

After each subject, tell the integrator one line: id, kind, known answers, and whether the
uncertainty rule passed (or the lines it names). The integrator moves the file into `audits/`
after review, builds, tests and pushes.
