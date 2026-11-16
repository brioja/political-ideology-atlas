// PreToolUse guard (Brandon, 2026-11-12): serial-audits must name the audit model. Without {"model": ...} the audit
// agents inherit the launching session's model (Opus), which happened three times. Audits run on Sonnet or better,
// never Haiku (memory: no-haiku-fresh-audits).
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  if (j.tool_name !== "Workflow") return;
  const ti = j.tool_input || {};
  const target = [ti.scriptPath, ti.name, typeof ti.script === "string" ? ti.script.slice(0, 400) : ""].join(" ");
  if (!/serial-audits/.test(target)) return;
  let args = ti.args;
  if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
  const model = args && typeof args === "object" ? String(args.model || "") : "";
  let reason = "";
  if (!model) reason = 'serial-audits needs an explicit audit model: add "model": "sonnet" to args (without it the audit agents inherit this session\'s model).';
  else if (/haiku/i.test(model)) reason = "Audits run on Sonnet or better, never Haiku: use \"model\": \"sonnet\".";
  if (!reason) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: reason } }));
});
