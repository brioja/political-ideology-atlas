# Audit lane

A lane is a session (Claude or Codex) whose only job is researching and writing one complete audit.
It does not commit it. The integrator, the session that assigns subjects, moves the finished audit
into `audits/`, builds, tests and pushes. Start a lane with one line:

> Follow audits/PROMPT_LANE.md.

Follow the integrator's instructions (how to report, anything about the subject) when it sends
them; they take precedence over this file.

## Your subject

A lane audits one subject, person or ideology: the id the integrator gives you. Don't pick one
yourself; if you have no id, ask the integrator for one. When the integrator approves the audit, your
work is done: the session is cleared before the next subject.

## Doing the audit

Research to the end before you report: the audit you report is the finished audit, covering every
source and local corpus that could settle a statement.

1. Follow `audits/AUDIT_RULES.md` and `audits/PROMPT.md` (ideology) or `audits/PROMPT_PEOPLE.md`
   (person) exactly, with `{{id}}`, `{{name}}` and the other fields taken from the next.js output
   or the catalog. Answer every statement in statements.json, candidates included, and set `rules`
   to the current version (`CURRENT_RULES` in scripts/validate.js). Research to the end (section 6):
   anything you leave out stays missing from the site.
2. If the subject already has an audit (or next.js gives a "reason"), this is a re-audit: start
   from the committed file and follow `audits/AUDIT_RULES.md` section 6 (reviewHistory, `passes`,
   your model in `auditor`), never rewrite it from scratch. `auditor` is your full model id
   (e.g. `gpt-6.1-sol`, `claude-opus-5-5`), not a family name.
3. Sources go in `scratchpad/sources/<id>/`; helper scripts in `scratchpad/<lane>-<id>/`.
4. Write the audit to `scratchpad/lane-out/<lane>/<id>.json`, never into `audits/`: the integrator's
   build would pick up a file there before it is reviewed. Validate it there:

       node scripts/validate.js [--people] --dir scratchpad/lane-out/<lane> <id>

   and fix every error except the uncertainty rule. Don't research toward the lines it names: the
   lines change as statements are promoted and demoted. Answer every statement the record settles,
   whatever its line, and never add or strengthen an answer to meet the rule; failing it is an
   acceptable outcome.
5. Edit no other file. Do not build, test, commit or push.

When the audit is complete, tell the integrator one line: id, kind, known answers, and whether
the audit meets the uncertainty rule. The integrator moves the file into `audits/` once it
approves, builds, tests and pushes.
