// PreToolUse guard for audit sessions (Brandon, 2026-11-27): scripts/lane.js runs its Claude sessions with
// AUDIT_LANE=1, and this hook then refuses reading the files that carry the site's agree/disagree explanations and
// notes for the statements: the root statements.json and the built data.js. A session sees each statement's text
// alone, in the statements file the driver names (<id>.statements.txt), as Sonnet runs were tested
// for understanding that way. Scripts the session runs (validate.js and the like) still read the bank themselves.
// No env var, no effect. Codex doesn't read these hooks.
if (process.env.AUDIT_LANE !== "1") process.exit(0);
const HIDDEN = /(?<![\w.-])(statements\.json|data\.js)\b/i;
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  const t = j.tool_input || {};
  const target = j.tool_name === "Bash" ? String(t.command || "")
    : ["Read", "Grep", "Glob"].includes(j.tool_name) ? [t.file_path, t.path, t.pattern, t.glob].filter(Boolean).join(" ") : "";
  if (!target || !HIDDEN.test(target)) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: "Answer from the statements file the driver names." } }));
});
