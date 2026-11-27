# Notes for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [README.md](README.md) first; the rules there apply to
agents too. This file adds what matters when running audits.

## Running audits

- **Audits run as lanes:** `node scripts/lane.js --engine codex|claude --kind people|ideologies` runs one session per
  subject following [audits/PROMPT_LANE.md](audits/PROMPT_LANE.md) and integrates each finished audit itself
  (validate, move into `audits/`, build, test, commit, batched push). One session per subject does the whole audit (an ideology's scope included) from local texts and the web. Before it, the driver takes Wikipedia citations and sources not tied to the subject out of the answers (`scripts/cleanup.js` dropFailing), and the session sees each statement's text alone, never the site's agree/disagree explanations or notes (`.claude/hooks/statement-text-only.js`). Between subjects it runs the books, triage and signal steps. Lanes write only their own drafts, in `scratchpad/lane-out/<lane>/`, never into `audits/`.
  The serial-audits workflow it replaced was removed 2026-11-20 (Brandon): the lanes did all it did, and the subject
  lanes left for it went unaudited while it wasn't running.
- **Stop lanes on a problem:** any agent may stop a running lane when its audits are going wrong (Ctrl-C twice, or
  `kill -INT` the driver twice: it quits at once and keeps the draft), then report why. Brandon, 2026-11-26.
- **Give each agent its own scratchpad folder** (`scratchpad/<id>/`). Agents sharing one folder
  overwrite each other's helper scripts.
- **Fetching goes through cached tools:** pages `node scripts/get.js <id> <url>`, Wikipedia `scripts/wiki.js`,
  YouTube `scripts/yt.js`, Gutenberg `scripts/gutenberg.js`, marxists.org the corpus's `tools/marxists.js --fetch`
  (saved into the local corpus). Hooks refuse the rest.
- **Local corpora first:** a hook adds a note when a web search or fetch names a source a local corpus holds
  (CNN/NPR, Congress, Hansard, marxists.org, Miller Center, Knesset, UN debates, Davos, Lex Fridman, French laws
  via LEGI): search the corpus instead.

## Commits

- **No AI attribution:** no `Co-Authored-By` trailer naming Claude, Anthropic, Codex or OpenAI, and no
  "Generated with Claude Code" line, even when the agent's own instructions ask for one. A local pre-push hook
  (`.git/hooks/pre-push`) refuses such commits, and the lane driver's batched push then fails for every subject.

## Audit rules

- Rules on evidence (sources, answers, uncertainty) live once, in
  `audits/AUDIT_RULES.md`, for ideologies and people alike. `PROMPT_IDEOLOGIES.md` and `PROMPT_PEOPLE.md` add
  only what is specific to their subject. Put a new evidence rule in AUDIT_RULES.md so both get it.
- Rules in `audits/*.md` are the maintainer's decisions; check `git log` before changing one. The files
  auditors read carry no names or dates (they clutter the auditor's prompt): put who and why in the commit.

## New statements

- **Statement wording review:** a reviewer session follows `audits/PROMPT_STATEMENT_REVIEW.md`, taking the
  statements that fail the wording check in quiz order (`node scripts/statement-review.js next`) and writing
  proposals to `scratchpad/statement-review/`. It edits nothing else; the maintainer approves each proposal.

- **Missing statements wait for a second audit:** a statement is worked on only once two audits ask for it, so it
  isn't a one-off request. Differently worded requests count together once Claude and Codex agree they mean the same
  thing and give them a shared `"group"` key; `node scripts/statements-check.js` lists those asked for twice.
  Brandon, 2026-11-25.

- New ideologies get a statement pass before their audits: `audits/PROMPT_STATEMENTS.md` (Opus builds
  the source library and proposes missing statements, each worded from at least two source quotes from separate places). Batches of
  about 20 proposed statements go to one Codex review; statements Claude and Codex both approve go into
  `statements.json` as candidates without asking the maintainer. Check wording with
  `node scripts/statements-check.js --wording <files>`.

## People

- A change that only touches people needs `node scripts/build.js --people` and
  `node test.js --people` (seconds): they never feed back into the ideology model in data.js.

## After each run

- Check `git status`. Agents sometimes leave files uncommitted (often
  `audits/statements/texts.json`) or skip a rebuild because of someone else's uncommitted work.
- Check the report for audits that weren't produced, failed tests and new `notIdeasOfWhatSocietyShouldBe` records.
  Judgment calls go to the maintainer rather than being fixed silently. Who the uncertainty rule
  includes or excludes is not one: it follows from the data, so shifts are never flagged.
- Promote a candidate once it carries signal on the real lines (test 2 in
  `audits/statements/STANDARD.md`; `node scripts/statements-check.js` lists them as Ready), and
  demote an active statement that loses it (`node scripts/statement-signal.js`). Brandon, 2026-11-05.
  An audit written before a promotion counts that statement as null until its next pass. Lanes run
  `statement-signal.js --apply` once, when they stop.
