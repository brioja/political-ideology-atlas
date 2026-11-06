// PreToolUse guard (Brandon, 2026-11-06): agents never fetch Wikipedia or Wikidata directly; rate limits are why audit
// runs are serial. They go through `node scripts/wiki.js`, which reads the project's on-disk cache and waits out
// limits. Denies WebFetch to those hosts and shell commands that download from them (curl, wget, python, fetch).
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  const HOST = /\b(?:[a-z-]+\.)?(?:m\.)?(wikipedia|wikidata|wikimedia)\.org\b/i;
  let hit = false;
  if (j.tool_name === "WebFetch") hit = HOST.test(String((j.tool_input || {}).url || ""));
  if (j.tool_name === "Bash") {
    const c = String((j.tool_input || {}).command || "");
    hit = HOST.test(c) && /\b(curl|wget|requests|urllib|urlopen|fetch|lynx|w3m|aria2c)\b/i.test(c) && !/scripts\/wiki\.js/.test(c);
  }
  if (!hit) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: "Don't fetch Wikipedia/Wikidata directly (rate limits). Use the cached tool: `node scripts/wiki.js \"<title or URL>\"` (plain text), `--html`, `--search \"<words>\"`, or `--wikidata Q123`." } }));
});
