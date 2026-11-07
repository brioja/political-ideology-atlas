// Wikipedia and Wikidata for agents, through the project's on-disk cache (Brandon, 2026-11-06): one request at a
// time, polite pauses, rate limits waited out, and every page read only once across all runs. Agents never fetch
// wikipedia.org or wikidata.org directly (a project hook blocks it); they use this.
//   node scripts/wiki.js "<title or en.wikipedia.org URL>"        the article as plain text
//   node scripts/wiki.js --html "<title or URL>"                   the rendered article HTML (links, references)
//   node scripts/wiki.js --wikidata Q12345                         the Wikidata item (labels, aliases, claims) as JSON
//   node scripts/wiki.js --search "<words>"                        article titles matching the words
//   node scripts/wiki.js --commons "File:<name>"                   a Commons file: where it redirects, and its log
//                                                                  (renames, deletions), as JSON
// Wikipedia is for leads only (audits/AUDIT_RULES.md section 2): follow its citations to the originals.
"use strict";
const lib = require("./lib");

async function cached(url) {
  for (let tries = 0; ; tries++) {
    try { return await lib.cachedJson(url, { pauseMs: 3000 }); }
    catch (e) {
      const m = e.message.match(/429.*retry-after (\d+)/);
      if (!m || tries >= 5) throw e;
      process.stderr.write(`rate-limited, waiting ${Number(m[1]) + 10} s\n`);
      await new Promise((r) => setTimeout(r, (Number(m[1]) + 10) * 1000));
    }
  }
}
const title = (s) => decodeURIComponent(String(s).replace(/^https?:\/\/en\.(m\.)?wikipedia\.org\/wiki\//, "").replace(/[#?].*$/, "")).replace(/_/g, " ");
const api = (host, params) => `https://${host}/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;

async function main() {
  const [flag, arg] = process.argv[2] && process.argv[2].startsWith("--") ? [process.argv[2], process.argv[3]] : [null, process.argv[2]];
  if (!arg) { console.error("usage: node scripts/wiki.js [--html | --wikidata | --search | --commons] <title, URL, Q-id, words or File:name>"); process.exit(1); }
  if (flag === "--commons") {
    const t = String(arg).replace(/^https?:\/\/commons\.wikimedia\.org\/wiki\//, "").replace(/_/g, " ");
    const page = await cached(api("commons.wikimedia.org", { action: "query", redirects: "1", titles: t, prop: "imageinfo", iiprop: "url" }));
    const log = await cached(api("commons.wikimedia.org", { action: "query", list: "logevents", letitle: t, lelimit: "10" }));
    console.log(JSON.stringify({ page: page.query, log: (log.query.logevents || []).map((e) => ({ when: e.timestamp, type: e.type, action: e.action,
      comment: e.comment, target: e.params && e.params.target_title })) }, null, 1));
    return;
  }
  if (flag === "--wikidata") {
    const r = await cached(api("www.wikidata.org", { action: "wbgetentities", ids: arg, props: "labels|aliases|descriptions|claims|sitelinks", languages: "en" }));
    console.log(JSON.stringify(r.entities && r.entities[arg], null, 1));
    return;
  }
  if (flag === "--search") {
    const r = await cached(api("en.wikipedia.org", { action: "query", list: "search", srsearch: arg, srlimit: "20" }));
    for (const s of r.query.search) console.log(s.title);
    return;
  }
  const r = await cached(api("en.wikipedia.org", { action: "parse", prop: "text", redirects: "1", page: title(arg) }));
  if (r.error) { console.error(`${r.error.code}: ${r.error.info}`); process.exit(1); }
  const html = r.parse.text;
  console.log(`Title: ${r.parse.title}\nURL: https://en.wikipedia.org/wiki/${encodeURIComponent(r.parse.title.replace(/ /g, "_"))}\n`);
  if (flag === "--html") { console.log(html); return; }
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|li|h[1-6]|tr|div)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n");
  console.log(text.trim());
}
main().catch((e) => { console.error(e.message); process.exit(1); });
