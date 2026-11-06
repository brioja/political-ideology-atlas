// PreToolUse guard (Brandon, 2026-11-06): rate-limited or robot-restricted sites go through the project's cached
// tools, never a direct fetch. Rate limits are why audit runs are serial; the caches mean each page is read once.
//   Wikipedia, Wikidata, Wikimedia -> node scripts/wiki.js       (on-disk cache, waits out 429s)
//   YouTube                        -> node scripts/yt.js         (captions/search cached, 20 s apart, stops on 429/captcha)
//   Project Gutenberg              -> node scripts/gutenberg.js  (official catalog + mirror, as its robot policy requires)
// Denies WebFetch to those hosts, shell downloads from them (curl, wget, python...), and yt-dlp run directly.
const RULES = [
  { host: /\b(?:[a-z-]+\.)?(?:m\.)?(wikipedia|wikidata|wikimedia)\.org\b/i, tool: "scripts/wiki.js",
    how: 'Use the cached tool: `node scripts/wiki.js "<title or URL>"` (plain text), `--html`, `--search "<words>"`, or `--wikidata Q123`.' },
  { host: /\b(?:www\.|m\.)?(youtube\.com|youtu\.be)\b/i, tool: "scripts/yt.js",
    how: 'Use the cached, paced tool: `node scripts/yt.js "<video URL or id>"` (captions) or `node scripts/yt.js --search "<words>" [N]`.' },
  { host: /\b(?:www\.)?gutenberg\.org\b/i, tool: "scripts/gutenberg.js",
    how: 'Gutenberg\'s robot policy allows only its mirror: `node scripts/gutenberg.js --search "<author or title>"`, then `node scripts/gutenberg.js <id>` for the local file path (fetched from the mirror if needed). Cite the book page URL; just don\'t fetch it.' },
];
const DOWNLOADER = /\b(curl|wget|requests|urllib|urlopen|fetch|lynx|w3m|aria2c)\b/i;
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  const ti = j.tool_input || {};
  let rule = null;
  if (j.tool_name === "WebFetch") rule = RULES.find((r) => r.host.test(String(ti.url || "")));
  if (j.tool_name === "Bash") {
    const c = String(ti.command || "");
    if (/\byt-dlp\b/.test(c) && !/scripts\/yt\.js/.test(c)) rule = RULES[1];
    else rule = RULES.find((r) => r.host.test(c) && DOWNLOADER.test(c) && !c.includes(r.tool));
  }
  if (!rule) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: `Don't fetch this site directly (rate limits / robot policy). ${rule.how}` } }));
});
