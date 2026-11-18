// PreToolUse guard (Brandon, 2026-11-18: "a wasteful check hook to not launch multiple agents"): one Agent at a time
// per session. Denies an Agent launch while an agent this session started is still running. The harness writes
// <session>/subagents/agent-<id>.meta.json at launch and adds "finished": true when the agent ends; a meta without it
// whose transcript was written in the last 30 minutes counts as running (older ones are crashed or abandoned).
// Workflow agents (subagents/workflows/) are not counted: serial-audits runs one agent at a time itself.
const fs = require("fs");
const path = require("path");
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  if (j.tool_name !== "Agent" || !j.transcript_path || !j.session_id) return;
  const dir = path.join(path.dirname(j.transcript_path), j.session_id, "subagents");
  let running = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".meta.json")) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (meta.finished) continue;
      const log = path.join(dir, f.replace(/\.meta\.json$/, ".jsonl"));
      const age = Date.now() - (fs.existsSync(log) ? fs.statSync(log).mtimeMs : 0);
      if (age < 30 * 60 * 1000) running.push(meta.description || f);
    }
  } catch { return; }
  if (!running.length) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: `One agent at a time: "${running.join('", "')}" is still running. Wait for its completion notification, then launch the next one (or do the work yourself).` } }));
});
