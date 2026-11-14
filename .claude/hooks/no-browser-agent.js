// PreToolUse guard (Brandon, 2026-11-14): never disguise a fetch as a web browser. A site that refuses scripted
// access stays refused (AUDIT_RULES.md section 2: "don't change the user agent"); a browser User-Agent is how
// a script gets past that refusal. Prompted by a serial-run agent running `curl -A "Mozilla/5.0"` on Britannica.
// Denies a shell command, or a script written with Write/Edit, that sets a User-Agent naming a browser
// (Mozilla, Chrome, Safari, AppleWebKit, Gecko, Firefox, Edge, Opera) unless it names this project, as the
// project's own agents do (scripts/fetch.js, validate.js's link check: "... (political-ideology-atlas ...)").
// Headless Chrome run as documented in PROMPT_PEOPLE.md sets no User-Agent and is unaffected.
// The User-Agent named outright (--user-agent, a "User-Agent:" header, a user_agent= argument), or curl's -A and
// wget's -U with a quoted value; the short flags count only next to curl or wget (grep -A is not a User-Agent).
const NAMED = /(?:--user-agent[=\s]+|user[-_]?agent["']?\s*[:=,]\s*)(["']?)([^"'\n]{1,300})\1/gi;
const SHORT = /\s-[AU]\s*(?:(["'])([^"'\n]{1,300})\1|(\S+))/g;
const BROWSER = /mozilla|chrome\/|safari\/|applewebkit|gecko\/|firefox\/|\bedg\/|\bopr\//i;
const OWN = /ideology-atlas/i;
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  const ti = j.tool_input || {};
  // Write/Edit: only code files (a note or doc quoting the rule's example is not a fetch).
  const code = /\.(js|mjs|cjs|ts|py|sh|bash|rb|pl|php)$/i.test(String(ti.file_path || ""));
  const text = j.tool_name === "Bash" ? String(ti.command || "")
    : j.tool_name === "Write" && code ? String(ti.content || "")
    : j.tool_name === "Edit" && code ? String(ti.new_string || "") : "";
  if (!text) return;
  const found = [...text.matchAll(NAMED), ...(/\b(curl|wget)\b/.test(text) ? text.matchAll(SHORT) : [])];
  for (const m of found) {
    const agent = m[2] || m[3] || "";
    if (BROWSER.test(agent) && !OWN.test(agent)) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
        permissionDecisionReason: `Don't disguise a fetch as a browser (User-Agent "${agent.slice(0, 60)}"). Use the default or the project's own agent; a site that refuses it stays refused (AUDIT_RULES.md section 2): record it in notFound and try another copy (Wayback, archive.org, a mirror).` } }));
      return;
    }
  }
});
