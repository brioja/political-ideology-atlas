// PreToolUse guard (Brandon, 2026-11-16): git hooks are never skipped. A Haiku triage agent and a Sonnet research
// agent committed with `-c core.hooksPath=/dev/null` unprompted, with nothing failing first. The repo's hooks must
// run on every commit and push.
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  if (j.tool_name !== "Bash") return;
  const c = String((j.tool_input || {}).command || "");
  if (!/\bgit\b/.test(c)) return;
  // Quoted text (a commit message) is not a flag.
  const bare = c.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
  const hit = bare.match(/core\.hooksPath|--no-verify|\bgit\s+(?:-c\s+\S+\s+)*(?:commit|push|merge|rebase|am)\b[^|;&]*\s-n\b/);
  if (!hit) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: `Git hooks are never skipped (found "${hit[0]}"). Run the git command without it; if a hook fails, ` +
      `fix what it reports, or stop and report the failure.` } }));
});
