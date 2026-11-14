// The audit agents' download tool (Brandon, 2026-11-14): fetch a page or document into the subject's source library,
// trying each allowed download agent in turn and keeping the first good copy.
//   node scripts/get.js <audit id> <url>             save it to scratchpad/sources/<id>/ (plain text + original)
//   node scripts/get.js <audit id> <url> --short-ok  accept a page under 300 words (it really is that short)
//   node scripts/get.js <audit id> <url> --refresh   fetch again even if the library already has this url
//   node scripts/get.js <audit id> <url> --agents=firefox,chrome   try only these agents
// Agents, in order (those not installed are skipped):
//   curl (the project's own User-Agent), wget, wget2, aria2c (each its own), lynx, w3m (text browsers, their
//   own), headless Firefox, headless Chrome (real browsers, their own User-Agents).
// Any refusal (403, 429, a bot check) moves on to the next agent (Brandon, 2026-11-14: "move on for any
// refusals"). What stays out: posing as a browser from a script, reusing cookies, solving a captcha.
// A good copy is a 2xx PDF with text, or a page with at least 300 words of text that isn't a bot check or a
// JavaScript shell. The index.json entry records which agent got it.
// Wikipedia/Wikidata, YouTube and Gutenberg are refused here: they have their own cached tools.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { execFileSync, spawn, spawnSync } = require("child_process");
const { USER_AGENT } = require("./fetch");

const OWN_TOOL = [
  [/(^|\.)(wikipedia|wikidata|wikimedia)\.org$/i, 'node scripts/wiki.js "<title or URL>"'],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, 'node scripts/yt.js "<video URL or id>"'],
  [/(^|\.)gutenberg\.org$/i, 'node scripts/gutenberg.js --search "<author or title>"'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;

function toText(html) {
  return html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|li|h[1-6]|tr|div|br)\s*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}
const words = (t) => t.split(/\s+/).filter(Boolean).length;
// Challenge and block pages: a copy that is one of these is not the document.
const BOT_CHECK = /captcha|cf-challenge|challenge-platform|just a moment\.\.\.|attention required! \| cloudflare|checking your browser|are you a (robot|human)|verify you are (a )?human|datadome|px-captcha|incapsula incident|request unsuccessful|access denied|enable javascript and cookies to continue|<title>\s*(403|forbidden|429|too many requests)/i;

// Judge a downloaded file. Returns { ok, why, kind, text }.
function judge(file, { shortOk, status } = {}) {
  if (status && (status < 200 || status >= 300)) return { ok: false, why: `HTTP ${status}` };
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) return { ok: false, why: "empty" };
  const head = fs.readFileSync(file).subarray(0, 5).toString("latin1");
  if (head === "%PDF-") {
    const txt = file + ".txt";
    try { execFileSync("pdftotext", ["-layout", file, txt], { stdio: "ignore" }); } catch { return { ok: false, why: "unreadable PDF" }; }
    const text = fs.readFileSync(txt, "utf8"); fs.rmSync(txt);
    return { ok: true, kind: "pdf", text, why: words(text) < 50 ? "a scan (no text layer)" : "" };
  }
  const raw = fs.readFileSync(file, "utf8");
  const isHtml = /<html|<body|<!doctype html/i.test(raw.slice(0, 4000));
  const text = isHtml ? toText(raw) : raw.trim();
  const n = words(text);
  if (BOT_CHECK.test(raw.slice(0, 20000)) && n < 1500) return { ok: false, why: "bot check or block page" };
  if (n < 300 && !shortOk) return { ok: false, why: `only ${n} words (a landing page or JavaScript shell; --short-ok if it really is that short)` };
  return { ok: true, kind: isHtml ? "html" : "text", text };
}

function run(cmd, args, timeoutMs = 90000) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 1 << 28 });
  return { code: r.status, out: r.stdout || "", err: (r.stderr || "") + (r.error ? String(r.error.message) : "") };
}

// Each agent writes the response body to `out` and returns { status? } (status where the agent can tell it).
const AGENTS = [
  { name: "curl", cmd: "curl", get(url, out) {
    const r = run("curl", ["-sSL", "--compressed", "--max-time", "60", "-A", USER_AGENT, "-o", out, "-w", "%{http_code}", url]);
    return { status: Number(r.out.trim()) || 0, err: r.err };
  } },
  { name: "wget", cmd: "wget", get(url, out) {
    const r = run("wget", ["--server-response", "--timeout=60", "--tries=1", "-O", out, url]);
    const codes = [...r.err.matchAll(/HTTP\/[\d.]+ (\d{3})/g)];
    return { status: codes.length ? Number(codes.at(-1)[1]) : 0, err: r.code ? r.err.split("\n").slice(-3).join(" ") : "" };
  } },
  { name: "wget2", cmd: "wget2", get(url, out) {
    const r = run("wget2", ["--server-response", "--timeout=60", "--tries=1", "-O", out, url]);
    const codes = [...(r.err + r.out).matchAll(/(?:HTTP\/[\d.]+ |:status: )(\d{3})/g)];
    return { status: codes.length ? Number(codes.at(-1)[1]) : r.code === 0 ? 200 : 0, err: r.code ? r.err.split("\n").slice(-3).join(" ") : "" };
  } },
  { name: "aria2c", cmd: "aria2c", get(url, out) {
    const r = run("aria2c", ["-q", "--allow-overwrite=true", "--auto-file-renaming=false", "--timeout=60", "--max-tries=1",
      "-d", path.dirname(out), "-o", path.basename(out), url]);
    const m = r.err.match(/status=(\d{3})/) || r.out.match(/status=(\d{3})/);
    return { status: r.code === 0 ? 200 : m ? Number(m[1]) : 0, err: r.code ? (r.err || r.out).split("\n").slice(-3).join(" ") : "" };
  } },
  { name: "lynx", cmd: "lynx", get(url, out) {
    // Plain text of the rendered page; no status line, so judged on content alone.
    const r = run("lynx", ["-dump", "-nolist", "-connect_timeout=60", url]);
    fs.writeFileSync(out, r.out);
    return { err: r.code ? r.err : "" };
  } },
  { name: "w3m", cmd: "w3m", get(url, out) {
    const r = run("w3m", ["-dump", "-o", "accept_cookie=0", url]);
    fs.writeFileSync(out, r.out);
    return { err: r.code ? r.err : "" };
  } },
  { name: "firefox", cmd: "firefox", get: firefox },
  { name: "chrome", cmd: "google-chrome", alt: "chromium", get(url, out, cmd) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pit-get-chrome-"));
    try {
      const r = run(cmd, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`,
        "--virtual-time-budget=15000", "--dump-dom", url], 120000);
      fs.writeFileSync(out, r.out);
      return { err: r.out ? "" : r.err.split("\n").slice(-3).join(" ") };
    } finally { fs.rmSync(profile, { recursive: true, force: true }); }
  } },
];

// Headless Firefox driven over WebDriver BiDi: a fresh profile each time (no cookies carried over). The profile
// lives under ~/snap/firefox/common because the snap build can't read other folders.
async function firefox(url, out, cmd) {
  const base = fs.existsSync(path.join(os.homedir(), "snap", "firefox")) ? path.join(os.homedir(), "snap", "firefox", "common") : os.tmpdir();
  const profile = fs.mkdtempSync(path.join(base, "pit-get-ff-"));
  const downloads = path.join(profile, "downloads");
  fs.mkdirSync(downloads);
  // Files (PDFs) download to the profile instead of opening in the viewer.
  fs.writeFileSync(path.join(profile, "user.js"), [["pdfjs.disabled", true], ["browser.download.folderList", 2],
    ["browser.download.dir", downloads], ["browser.download.useDownloadDir", true], ["browser.download.always_ask_before_handling_new_types", false],
    ["browser.helperApps.neverAsk.saveToDisk", "application/pdf,application/octet-stream"]]
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("\n") + "\n");
  const ff = spawn(cmd, ["--headless", "--no-remote", "--profile", profile, "--remote-debugging-port", "0"], { stdio: ["ignore", "ignore", "pipe"] });
  let log = ""; ff.stderr.on("data", (d) => (log += d));
  let ws;
  try {
    let m;
    for (let i = 0; i < 120 && !(m = log.match(/WebDriver BiDi listening on (ws:\/\/[\d.:]+)/)); i++) await sleep(250);
    if (!m) return { err: "Firefox didn't start: " + log.split("\n").slice(-2).join(" ") };
    ws = new WebSocket(m[1] + "/session");
    const pending = new Map(); let n = 0;
    ws.onmessage = (e) => { const msg = JSON.parse(e.data); if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const send = (method, params = {}) => new Promise((res, rej) => {
      const id = ++n; pending.set(id, (msg) => (msg.type === "success" ? res(msg.result) : rej(new Error(msg.message || msg.error))));
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evalJs = async (expression, ctx) => {
      const r = await send("script.evaluate", { expression, target: { context: ctx }, awaitPromise: true });
      if (r.type === "exception") throw new Error(r.exceptionDetails?.text || "script error");
      return r.result.value;
    };
    await send("session.new", { capabilities: {} });
    const ctx = (await send("browsingContext.getTree")).contexts[0].context;
    let navErr = null;
    let timer;
    await Promise.race([send("browsingContext.navigate", { context: ctx, url, wait: "complete" }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), 60000); })])
      .catch((e) => { navErr = e; }).finally(() => clearTimeout(timer));
    // A download ends the navigation: wait for the file to finish (no .part left).
    const done = () => fs.readdirSync(downloads).filter((f) => !f.endsWith(".part"));
    for (let i = 0; i < 120; i++) {
      const files = fs.readdirSync(downloads);
      if (done().length && !files.some((f) => f.endsWith(".part"))) break;
      if (!files.length && i >= (navErr ? 20 : 4)) break; // a page, or nothing downloading
      await sleep(500);
    }
    if (done().length) { fs.copyFileSync(path.join(downloads, done()[0]), out); return { status: 200 }; }
    if (navErr) throw navErr;
    await sleep(3000); // let scripts fill the page in
    const status = await evalJs("performance.getEntriesByType('navigation')[0]?.responseStatus || 0", ctx);
    fs.writeFileSync(out, await evalJs("document.documentElement.outerHTML", ctx));
    return { status };
  } catch (e) {
    return { err: String(e.message || e) };
  } finally {
    try { ws?.close(); } catch {}
    ff.kill();
    await sleep(500);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

// Save a judged copy into the library: the plain text (what agents search) and the original (HTML gzipped; a PDF
// only if it has no text layer), and an index.json entry.
function save(id, url, file, verdict, extra) {
  const dir = path.join(__dirname, "..", "scratchpad", "sources", id);
  fs.mkdirSync(dir, { recursive: true });
  const base = (extra.addedBy === "maintainer" ? "m-" : "") + url.replace(/^https?:\/\/(www\.)?/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 70);
  const txt = base + ".txt";
  fs.writeFileSync(path.join(dir, txt), verdict.text.trim() + "\n");
  let original = null;
  if (verdict.kind === "pdf" && words(verdict.text) < 50) fs.copyFileSync(file, path.join(dir, (original = base + ".pdf")));
  if (verdict.kind === "html") fs.writeFileSync(path.join(dir, (original = base + ".html.gz")), zlib.gzipSync(fs.readFileSync(file)));
  const title = (verdict.text.split("\n").find((l) => l.trim().length > 10) || url).trim().slice(0, 120);
  const idxFile = path.join(dir, "index.json");
  const idx = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, "utf8")) : [];
  const list = Array.isArray(idx) ? idx : (idx.files = idx.files || []);
  const entry = { file: txt, ...(original ? { original } : {}), title, url, downloaded: new Date().toISOString().slice(0, 10), ...extra };
  const i = list.findIndex((x) => x.url === url);
  if (i >= 0) list[i] = entry; else list.push(entry);
  fs.writeFileSync(idxFile, JSON.stringify(idx, null, 1) + "\n");
  return { dir: path.relative(path.join(__dirname, ".."), dir), entry };
}

function existing(id, url) {
  const idxFile = path.join(__dirname, "..", "scratchpad", "sources", id, "index.json");
  if (!fs.existsSync(idxFile)) return null;
  const idx = JSON.parse(fs.readFileSync(idxFile, "utf8"));
  return (Array.isArray(idx) ? idx : idx.files || []).find((x) => x.url === url) || null;
}

async function get(id, url, { shortOk = false, refresh = false, addedBy, only = null } = {}) {
  const host = new URL(url).hostname;
  const own = OWN_TOOL.find(([re]) => re.test(host));
  if (own) throw new Error(`${host} has its own cached tool: ${own[1]}`);
  if (!refresh) { const e = existing(id, url); if (e) return { cached: true, entry: e, dir: `scratchpad/sources/${id}`, tried: [] }; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pit-get-"));
  const tried = [];
  try {
    for (const a of AGENTS.filter((x) => !only || only.includes(x.name))) {
      const cmd = has(a.cmd) ? a.cmd : a.alt && has(a.alt) ? a.alt : null;
      if (!cmd) continue;
      if (tried.length) await sleep(2000);
      const out = path.join(tmp, a.name + ".download");
      let r;
      try { r = await a.get(url, out, cmd); } catch (e) { r = { err: String(e.message || e) }; }
      const v = r.err && !fs.existsSync(out) ? { ok: false, why: r.err.trim().slice(0, 160) || "failed" } : judge(out, { shortOk, status: r.status });
      tried.push({ agent: a.name, result: v.ok ? "ok" : v.why });
      if (r.status === 404 || r.status === 410) break; // not there: no other agent will find it
      if (v.ok) return { ...save(id, url, out, v, { agent: a.name, ...(addedBy ? { addedBy } : {}) }), tried, note: v.why };
    }
    return { tried };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

module.exports = { get, judge, save, toText };

if (require.main === module) {
  const args = process.argv.slice(2);
  const [id, url] = args.filter((a) => !a.startsWith("--"));
  if (!id || !/^[a-z0-9-]+$/.test(id) || !/^https?:\/\//.test(url || "")) {
    console.error("usage: node scripts/get.js <audit id> <url> [--short-ok] [--refresh] [--agents=curl,wget,...]");
    process.exit(1);
  }
  const only = (args.find((a) => a.startsWith("--agents=")) || "").slice(9).split(",").filter(Boolean);
  get(id, url, { shortOk: args.includes("--short-ok"), refresh: args.includes("--refresh"), only: only.length ? only : null }).then((r) => {
    for (const t of r.tried) console.error(`  ${t.agent}: ${t.result}`);
    if (r.cached) console.log(`already in the library: ${r.dir}/${r.entry.file}`);
    else if (r.entry) console.log(`saved by ${r.entry.agent}: ${r.dir}/${r.entry.file} (${words(fs.readFileSync(path.join(__dirname, "..", r.dir, r.entry.file), "utf8"))} words)${r.note ? `; ${r.note}, original ${r.entry.original}` : ""}`);
    else {
      console.error("No agent got a good copy. Try another copy of the same text (Wayback, archive.org, a mirror); otherwise name the page in your report (backlog/blocked-sources.md).");
      process.exit(1);
    }
  }).catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
