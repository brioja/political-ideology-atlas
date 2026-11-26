// PreToolUse guard for an audit's local phase (Brandon, 2026-11-26): scripts/lane.js runs that phase's Claude turns with
// AUDIT_PHASE=local, and this hook then refuses the web: WebSearch, WebFetch, and shell commands that fetch pages
// (scripts/get.js, wiki.js, yt.js, curl, wget, a corpus tool's --fetch). The corpora, the maintainer's library,
// downloaded books (scratchpad/sources/<id>/, ideology-books/<id>/), scripts/gutenberg.js (books) and the marxists.org
// corpus tool's --fetch (one page into the local corpus) stay open: marxists.org and Gutenberg are read in this phase
// only, since the web phase can't read local texts (.claude/hooks/web-only.js).
// Its message says only what to do, never which phase this is (Brandon, 2026-11-26); for a marxists.org or Gutenberg
// address it names the tool that reads it locally, which the session's prompt no longer lists.
// No env var, no effect. Codex doesn't read these hooks; its prompt carries the rule.
if (process.env.AUDIT_PHASE !== "local") process.exit(0);
const WEB = /\bscripts\/(get|wiki|yt)\.js\b|\b(curl|wget|lynx|w3m|aria2c|yt-dlp)\b|\b(requests|urllib|urlopen)\b|\bfetch\(|--fetch\b/i;
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  const deny = j.tool_name === "WebSearch" || j.tool_name === "WebFetch"
    || (j.tool_name === "Bash" && WEB.test(String((j.tool_input || {}).command || "").replace(/\bmarxists\.js\s+--fetch\b/g, "marxists.js")));
  if (!deny) return;
  const asked = JSON.stringify(j.tool_input || {});
  const site = /marxists\.org/i.test(asked) ? ' A marxists.org page: `node ~/.cache/political-ideology-atlas/corpora/tools/marxists.js "<path, e.g. lenin/works/1917>" "<keyword>"` (`--fetch "<URL>"` adds a page the corpus lacks).'
    : /gutenberg\.org/i.test(asked) ? ' A Project Gutenberg book: `node scripts/gutenberg.js --search "<author or title>"`.' : "";
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: `Answer from local texts only (the corpora, the maintainer's reference library, books already downloaded for this audit).${site}` } }));
});
