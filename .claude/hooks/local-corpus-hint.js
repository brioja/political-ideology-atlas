// PreToolUse hint (Brandon, 2026-11-12): a web search or fetch aimed at a source the local corpora already hold
// gets a note pointing at the local tool. It warns, never blocks: the corpora have gaps (MediaSum ends about 2020,
// the parsed Congressional Record starts in 1873), so the web may still be needed. A lane missed Aung San Suu
// Kyi's NPR interviews in MediaSum and went to YouTube instead.
// Tools run from ~/.cache/political-ideology-atlas/corpora (see its README.md).
const HINTS = [
  { re: /\bcnn\b|\bnpr\b|cnn\.com|npr\.org/i,
    tool: 'CNN/NPR interview transcripts (speaker-labelled, to about 2020): `node tools/mediasum.js "<speaker>" [keyword] [--year YYYY] [--max N]`' },
  { re: /congress\.gov|govinfo\.gov|congressional record|floor speech|\bcrec\b/i,
    tool: 'US Congressional Record floor speeches (1873-today) and hearings: `node tools/crec.js "<member>" [keyword ...]` (add `--source hearings`)' },
  { re: /voteview|roll[- ]call vote/i,
    tool: 'US Congress roll calls: `node tools/voteview.js "<name>" "<keyword>"`' },
  { re: /hansard|theyworkforyou|house of commons debate/i,
    tool: 'UK Commons Hansard (1919-today): `node tools/hansard.js "<MP>" [keyword ...]`; Australian House: `node tools/aushansard.js`' },
  { re: /marxists\.org|marxists internet archive/i,
    tool: 'Marxists Internet Archive (17 author sections): `node tools/marxists.js "<path e.g. lenin/works/1917>" "<keyword>"`' },
  { re: /millercenter|miller center|presidential speech/i,
    tool: 'Miller Center presidential speeches: `node tools/miller.js "<president>" [keyword ...]`' },
  { re: /general debate|un general assembly|unga speech|un\.org\/en\/ga/i,
    tool: 'UN General Assembly general-debate speeches 1946-2025: `node tools/ungdc.js` (see its header)' },
  { re: /security council/i,
    tool: 'UN Security Council debates 1992-2023: `node tools/unsc.js "<surname or country>" [keyword ...]`' },
  { re: /lex fridman|lexfridman/i,
    tool: 'Lex Fridman Podcast transcripts #1-#345: `node tools/lexfridman.js "<guest>" [keyword]`' },
  { re: /howtheyvote|european parliament vote/i,
    tool: 'European Parliament roll calls: `node tools/howtheyvote.js "<name>" "<keyword>"`' },
  { re: /davos|world economic forum|weforum/i,
    tool: 'Davos special addresses 2018-2026: `node tools/wef.js --list [year]` or `node tools/wef.js "<speaker>" [keyword]`' },
  { re: /legifrance|journal officiel|\bjorf\b|vie-publique\.fr\/loi|loi n°|loi no\.? \d/i,
    tool: 'French laws, ordinances and decrees since 1945 (DILA LEGI, every article version): `node tools/legi.js --texts "<title words>"` or `node tools/legi.js "<keyword>" ... [--nature LOI] [--from YYYY] [--to YYYY]`' },
  { re: /state of the state/i,
    tool: 'US governors\' State of the State addresses 1995-2022: `node tools/sots.js "<governor>" [keyword ...]`' },
];
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  let j; try { j = JSON.parse(input); } catch { return; }
  const ti = j.tool_input || {};
  let text = "";
  if (j.tool_name === "WebSearch") text = String(ti.query || "");
  else if (j.tool_name === "WebFetch") text = String(ti.url || "");
  else if (j.tool_name === "Bash") { const c = String(ti.command || ""); if (/\b(curl|wget)\b/.test(c) && !/tools\//.test(c)) text = c; }
  if (!text) return;
  const hits = HINTS.filter((h) => h.re.test(text));
  if (!hits.length) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse",
    additionalContext: `Local corpus first (in ~/.cache/political-ideology-atlas/corpora): ${hits.map((h) => h.tool).join("; ")}. The web is fine if the corpus doesn't cover it.` } }));
});
