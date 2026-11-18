// PreToolUse guard (Brandon, 2026-11-18: "a wasteful check hook to not launch multiple agents ... the check is to not
// divide things up into batches"). One task goes to one agent: an Agent launch is denied when it hands out a slice of a
// task (batch N, chunk, part N of M, "the first/next 25 statements"). Each slice re-reads the same rules and sources, and
// small slices invited rushed work. A long task goes to one agent that saves as it goes; if it stops, resume that same
// agent (SendMessage) instead of starting another. Also denied while another agent this session started is running.
// The harness writes <session>/subagents/agent-<id>.meta.json at launch and adds "finished": true when the agent ends;
// one without it whose transcript was written in the last 30 minutes counts as running. Workflow agents don't count.
const fs = require("fs");
const path = require("path");
const SLICE = /\bbatch(es)?\b|\bchunks?\b|\bpart \d+\b|\b(first|next) \d+ (statements|items|answers|people|ideologies|ids|entries)\b/i;
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  if (j.tool_name !== "Agent") return;
  const ti = j.tool_input || {};
  const deny = (reason) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse",
    permissionDecision: "deny", permissionDecisionReason: reason } }));
  const text = `${ti.description || ""}\n${ti.prompt || ""}`;
  const m = text.match(SLICE);
  if (m) return deny(`Don't divide a task into batches of agents ("${m[0]}"): give one agent the whole task and have it save as it goes; if it stops, resume that agent with SendMessage.`);
  if (!j.transcript_path || !j.session_id) return;
  const dir = path.join(path.dirname(j.transcript_path), j.session_id, "subagents");
  const running = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".meta.json")) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (meta.finished) continue;
      const log = path.join(dir, f.replace(/\.meta\.json$/, ".jsonl"));
      if (Date.now() - (fs.existsSync(log) ? fs.statSync(log).mtimeMs : 0) < 30 * 60 * 1000) running.push(meta.description || f);
    }
  } catch { return; }
  if (running.length) deny(`One agent at a time: "${running.join('", "')}" is still running. Wait for it, or resume it with SendMessage.`);
});
