// PreToolUse check (Brandon, 2026-11-16): audit prompts that describe a review loop must not invite a quick first
// pass. In the Chirac pilot the researcher was told "when the draft is done, send it; the integrator will send back
// gaps", and it reported after 13 minutes with 39 answers while a drafter told only "research to the end" kept going
// for 25 minutes and reached 51.
// - A prompt file that mentions sending gaps back, review rounds or reporting to an integrator must carry the
//   sentence REQUIRED below.
// - "first report", "first draft" and "first pass" (of a lane's work) are refused outright: they say there will be
//   more rounds, which is the quick-pass framing itself. ("first pass" of an audit, as in AUDIT_RULES.md, is a
//   different thing; that file is out of scope.)
// Applies to audits/PROMPT*.md and scratchpad prompt files for lanes, integrators, investigators or researchers.
// Denies the Write/Edit otherwise.
const fs = require("fs"), path = require("path");
const REQUIRED = "Research to the end before you report";
// Phrases about the lane's work being checked or reviewed, even negated ("as if no one will check"), prime the same
// quick pass. "check the corpora" and similar instructions stay allowed.
const BANNED = /\bfirst (draft|report|pass)\b|\b(check|review)(s|ed|ing)? (your|the lane's|the) (work|audit|draft)\b|\bno one will (check|review)\b|\b(will|to) be (checked|reviewed)\b|\bintegrator's (checks?|reviews?)\b/i;
const LOOP = /send(s|ing)? (back )?(the )?gaps|gaps? (are |is )?sent back|sends? (it |the draft )?back|review rounds?|later rounds?|(report|send|tell)[^.\n]{0,60}\bintegrator\b|\bintegrator\b[^.\n]{0,60}\b(sends?|repl(y|ies))\b[^.\n]{0,40}\b(gaps?|back)/i;
// In lane prompts (not PROMPT.md, where "gaps" are gaps in the statement bank) any "gap" reads as "someone will
// send gaps back", and any "pass" as "another pass will follow". Code spans (`passes`, a field name) are skipped.
const LANE_BANNED = /\bgaps?\b|\bpass(es|ed|ing)?\b/i;
const LANE_FILE = /(^|\/)audits\/PROMPT_LANE\.md$|(^|\/)scratchpad\/.*(lane|integrator|investigator|researcher)[^/]*\.md$/i;
const PROMPT_FILE = /(^|\/)audits\/PROMPT[^/]*\.md$|(^|\/)scratchpad\/.*(lane|integrator|investigator|researcher)[^/]*\.md$/i;
const WHY = "(Chirac pilot, 2026-11-16: the lane reported after 13 minutes with 39 answers)";

let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  const ti = j.tool_input || {};
  const file = String(ti.file_path || "");
  if (!PROMPT_FILE.test(file.split(path.sep).join("/"))) return;
  let text;
  if (j.tool_name === "Write") text = String(ti.content || "");
  else if (j.tool_name === "Edit") {
    let cur = ""; try { cur = fs.readFileSync(file, "utf8"); } catch { /* new file */ }
    const o = String(ti.old_string || ""), n = String(ti.new_string || "");
    text = ti.replace_all ? cur.split(o).join(n) : cur.replace(o, () => n);
  } else return;
  let reason = null;
  const banned = text.match(BANNED) || (LANE_FILE.test(file.split(path.sep).join("/")) && text.replace(/`[^`\n]*`/g, "").match(LANE_BANNED));
  if (banned) reason = `${path.basename(file)} says "${banned[0]}", which tells the lane more rounds will follow: the quick-pass ` +
    `framing ${WHY}. Reword without it: say what a finished audit is, not who looks at it next.`;
  else if (LOOP.test(text) && !text.includes(REQUIRED)) reason = `${path.basename(file)} describes a review loop ` +
    `("${text.match(LOOP)[0]}") but does not say "${REQUIRED}". A reviewer must not read as a reason for a quick pass ${WHY}. ` +
    `Add a sentence starting "${REQUIRED}: ..." (e.g. "...the audit you report is the finished audit") and retry.`;
  if (!reason) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: reason } }));
});
