// PreToolUse guard for an audit's web phase (Brandon, 2026-11-26): scripts/lane.js runs that phase's Claude turns with
// AUDIT_PHASE=web (and AUDIT_SUBJECT=<id>), and this hook then refuses reading local texts: the corpora and their tools
// (marxists.org and Gutenberg included), the maintainer's library, downloaded books, the files of the source library
// (scratchpad/sources/), and the subject's local-phase draft and committed audit. The local phase read all of these;
// Political moderate's web phase re-read the scope phase's saved pages instead of searching, and nulled 595 statements
// from them. A page already in the source library is read through `node scripts/get.js <id> <url> --grep|--print`,
// one URL at a time, so a cached copy serves a page the session looked for, never a scan. marxists.org pages and
// Gutenberg books the corpus lacks are added with --fetch-if-not-local (marxists.js, gutenberg.js <id>), which refuses
// what the corpus already has; gutenberg.js --search (the catalog, not the books) stays open to find them.
// No env var, no effect. Codex doesn't read these hooks; its prompt carries the rule.
if (process.env.AUDIT_PHASE !== "web") process.exit(0);
const id = process.env.AUDIT_SUBJECT || "";
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LOCAL = new RegExp([
  "political-ideology-atlas[/\\\\]corpora", "\\bcorpora[/\\\\]", "\\btools/[a-z0-9-]+\\.(js|py|sh)\\b",
  "scratchpad[/\\\\]sources", "(^|[\\s'\"/])sources/", "ideology-books", "ideology reference", "\\bscripts/gutenberg\\.js\\b",
  // the local-phase draft (<lane>/<id>.json; the web phase's own file is <id>.web.json) and the committed audit
  "lane-out/[^/\\s]+/[a-z0-9-]+\\.json\\b(?!\\.)",
  ...(id ? [`audits/(profiles|people)/${esc(id)}\\.json`] : []),
].join("|"), "i");
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  const t = j.tool_input || {};
  const target = j.tool_name === "Bash" ? String(t.command || "").replace(/\bscripts\/get\.js\b[^;&|]*/g, "scripts/get.js")
      .replace(/\S*\bmarxists\.js\s+--fetch-if-not-local\b[^;&|]*/g, "OK").replace(/\S*\bgutenberg\.js\s+(--search\b|\d+\s+--fetch-if-not-local\b)[^;&|]*/g, "OK")
    : ["Read", "Grep", "Glob"].includes(j.tool_name) ? [t.file_path, t.path, t.pattern, t.glob].filter(Boolean).join(" ") : "";
  // The web phase's own file passes: scratchpad/lane-out/<lane>/<id>.web.json.
  if (!target || !LOCAL.test(target.replace(/[a-z0-9-]+\.web\.json/gi, "WEBDRAFT"))) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: "This is the web phase: the local phase already read the local texts (the corpora, marxists.org, Gutenberg, the maintainer's library, downloaded books, the source library) and the local answers. Search the web for each open statement. To read a page already in the source library, name it: `node scripts/get.js <id> <url> --grep \"<keyword>\"` (or --print). A marxists.org page or Gutenberg book the local corpus lacks: `node ~/.cache/political-ideology-atlas/corpora/tools/marxists.js --fetch-if-not-local \"<URL>\" \"<keyword>\"`, `node scripts/gutenberg.js <id> --fetch-if-not-local --grep \"<keyword>\"` (find ids with --search)." } }));
});
