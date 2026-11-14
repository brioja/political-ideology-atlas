// For the maintainer: put a page or document an audit agent couldn't reach into that audit's source library
// (scratchpad/sources/<id>/), so the next pass reads it locally (Brandon, 2026-11-06). Agents fetch with
// scripts/get.js; this is for what that tool couldn't get (backlog/blocked-sources.md).
//   node scripts/add-source.js <audit id> <url>                 fetch it with scripts/get.js (every download agent)
//   node scripts/add-source.js <audit id> <url> <saved file>    import a page saved from the browser (Ctrl+S)
//                                                               or a downloaded PDF; <url> is where it came from
// Writes a plain-text copy (what agents search), keeps the original (HTML gzipped; a PDF only if it has no text
// layer), and adds an entry to the library's index.json.
"use strict";
const { get, judge, save } = require("./get");

const shortOk = process.argv.includes("--short-ok");
const [id, url, saved] = process.argv.slice(2).filter((a) => a !== "--short-ok");
if (!id || !/^[a-z0-9-]+$/.test(id) || !/^https?:\/\//.test(url || "")) {
  console.error("usage: node scripts/add-source.js <audit id> <url> [saved file] [--short-ok]");
  process.exit(1);
}
const howToSave = `Open it in your browser, save the document itself (Ctrl+S, or download the PDF), then:\n  node scripts/add-source.js ${id} "${url}" <saved file>`;

(async () => {
  let r;
  if (saved) {
    const v = judge(saved, { shortOk });
    if (!v.ok) { console.error(`${v.why}: not the document. ${howToSave}`); process.exit(1); }
    if (v.why) console.warn(`${v.why}: the PDF is kept`);
    r = save(id, url, saved, v, { addedBy: "maintainer" });
  } else {
    r = await get(id, url, { shortOk, refresh: true, addedBy: "maintainer" });
    for (const t of r.tried) console.error(`  ${t.agent}: ${t.result}`);
    if (!r.entry) { console.error(`No download agent got it. ${howToSave}`); process.exit(1); }
  }
  console.log(`added to ${r.dir}/: ${r.entry.file}${r.entry.original ? ", original " + r.entry.original : ""}${r.entry.agent ? ` (by ${r.entry.agent})` : ""}`);
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
