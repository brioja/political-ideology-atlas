// PreToolUse guard (Brandon, 2026-11-18: "a hook that errors on an opus agent instead of sonnet"): agents run on
// Sonnet. Denies an Agent launch with model "opus", with no model (it would inherit this session's model, Opus), or as a
// fork (always runs on the session's model). serial-audits-model.js does the same for the serial-audits workflow.
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  if (j.tool_name !== "Agent") return;
  const ti = j.tool_input || {};
  const model = String(ti.model || "");
  let reason = "";
  if (ti.subagent_type === "fork") reason = "A fork runs on this session's model (Opus): launch a fresh agent with model \"sonnet\" instead.";
  else if (!model) reason = "Name the agent's model: add model \"sonnet\" (without it the agent inherits this session's model, Opus).";
  else if (/opus/i.test(model)) reason = "Agents run on Sonnet, not Opus: use model \"sonnet\".";
  if (!reason) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: reason } }));
});
