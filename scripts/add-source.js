// For the maintainer: put a page or document an audit agent couldn't reach into that audit's source library
// (scratchpad/sources/<id>/), so the next pass reads it locally (Brandon, 2026-11-06). Agents never get past a
// refusal themselves; they name the page in their report (backlog/blocked-sources.md).
//   node scripts/add-source.js <audit id> <url>                 fetch it with wget (honest client name)
//   node scripts/add-source.js <audit id> <url> <saved file>    import a page saved from the browser (Ctrl+S)
//                                                               or a downloaded PDF; <url> is where it came from
// Writes a plain-text copy (what agents search), keeps the original (HTML gzipped; a PDF only if it has no text
// layer), and adds an entry to the library's index.json.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const [id, url, saved] = process.argv.slice(2).filter((a) => a !== "--short-ok");
if (!id || !/^[a-z0-9-]+$/.test(id) || !/^https?:\/\//.test(url || "")) {
  console.error("usage: node scripts/add-source.js <audit id> <url> [saved file]");
  process.exit(1);
}
const dir = path.join(__dirname, "..", "scratchpad", "sources", id);
fs.mkdirSync(dir, { recursive: true });
const base = "m-" + url.replace(/^https?:\/\/(www\.)?/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 70);

let raw = path.join(dir, base + ".download");
if (saved) fs.copyFileSync(saved, raw);
else {
  try {
    execFileSync("wget", ["-q", "-O", raw, "--user-agent=political-ideology-atlas/1.0 (maintainer fetch)", "--timeout=60", "--tries=2", url], { stdio: "inherit" });
  } catch {
    fs.rmSync(raw, { force: true });
    console.error("wget failed (refused or offline). Open the page in your browser, save it (Ctrl+S, or download the PDF), then:\n" +
      `  node scripts/add-source.js ${id} "${url}" <saved file>`);
    process.exit(1);
  }
}

const head = fs.readFileSync(raw).subarray(0, 5).toString("latin1");
const txt = path.join(dir, base + ".txt");
let original;
if (head === "%PDF-") {
  execFileSync("pdftotext", ["-layout", raw, txt]);
  const words = fs.readFileSync(txt, "utf8").split(/\s+/).filter(Boolean).length;
  if (words < 50) { original = base + ".pdf"; fs.renameSync(raw, path.join(dir, original)); console.warn(`only ${words} words of text: a scan; the PDF is kept`); }
  else fs.rmSync(raw);
} else {
  const html = fs.readFileSync(raw, "utf8");
  const text = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|li|h[1-6]|tr|div|br)\s*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  // A landing page, a JavaScript shell or a bot check is not the document: refuse it rather than save it.
  if (text.split(/\s+/).length < 300 && !process.argv.includes("--short-ok")) {
    fs.rmSync(raw);
    console.error(`only ${text.split(/\s+/).length} words of text: a landing page, JavaScript shell or bot check, not the document. ` +
      `Open it in your browser, save the document itself, then:\n  node scripts/add-source.js ${id} "${url}" <saved file>` +
      "\n(add --short-ok if the page really is that short)");
    process.exit(1);
  }
  fs.writeFileSync(txt, text + "\n");
  original = base + ".html.gz";
  fs.writeFileSync(path.join(dir, original), zlib.gzipSync(html));
  fs.rmSync(raw);
}

const title = (fs.readFileSync(txt, "utf8").split("\n").find((l) => l.trim().length > 10) || url).trim().slice(0, 120);
const idxFile = path.join(dir, "index.json");
let idx = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, "utf8")) : [];
const list = Array.isArray(idx) ? idx : (idx.files = idx.files || []);
const entry = { file: base + ".txt", ...(original ? { original } : {}), title, url, downloaded: new Date().toISOString().slice(0, 10), addedBy: "maintainer" };
const i = list.findIndex((x) => x.url === url);
if (i >= 0) list[i] = entry; else list.push(entry);
fs.writeFileSync(idxFile, JSON.stringify(idx, null, 1) + "\n");
console.log(`added to scratchpad/sources/${id}/: ${entry.file} (${fs.readFileSync(txt, "utf8").split(/\s+/).length} words)${original ? ", original " + original : ""}`);
