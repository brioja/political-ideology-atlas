// The fetch library: every request to Wikimedia (Wikipedia, Wikidata, Commons, pageviews, SPARQL) goes through
// here (Brandon, 2026-11-14: each script had its own copy, with different User-Agents and 429 rules).
//   politeFetch(url, opts)  one request: the project's User-Agent, the host's pace (below), and a 429 waited out (the
//                           server's retry-after plus 10 s, 60 s when it gives none), at most 5 times in a row,
//                           then it stops. Returns the response; the caller handles 404s and other errors.
//   fetchJson(url, opts)    politeFetch, then the JSON, null for a 404, an error for anything else.
//   cachedJson(url, opts)   fetchJson cached on disk forever (~/.cache/political-ideology-atlas/http/<sha1>.json), so
//                           a rerun reads local copies instead of asking again. For pages that don't change; data
//                           that must be fresh (this month's views, whether a photo still exists) uses politeFetch.
// YouTube has its own rules and its own script (scripts/yt.js). validate.js --links checks arbitrary sites directly.
// Pace (Brandon, 2026-11-14: "move the throttling to a library"): the gap between two requests to one host is set
// here, per host, not by each script, and it holds across processes: the time of the last request to each host is
// kept in the cache directory, so two scripts asking Wikipedia at once share one pace instead of doubling it.
"use strict";
const fs = require("fs");
const path = require("path");

const USER_AGENT = "political-ideology-atlas/1.0 (https://github.com/brioja/political-ideology-atlas)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimum gap between requests to one host, in ms. Hosts not listed get DEFAULT_GAP.
const HOST_GAP = {
  "en.wikipedia.org": 3000,      // the API and article pages (wiki.js, resolve-articles, people-aliases, triage...)
  "www.wikidata.org": 2000,
  "query.wikidata.org": 1000,    // SPARQL: each query is slow anyway
  "qlever.dev": 1000,
  "commons.wikimedia.org": 1000,
  "wikimedia.org": 150,          // the REST API (page views): built for bulk use
  "upload.wikimedia.org": 300,   // image files and thumbnails
};
const DEFAULT_GAP = 1000;
const gapFor = (host) => HOST_GAP[host] ?? DEFAULT_GAP;

const HTTP_CACHE = path.join(process.env.XDG_CACHE_HOME || path.join(require("os").homedir(), ".cache"), "political-ideology-atlas", "http");
// Waits until the host's gap since the last request (from any process) has passed, then records this one. A lock
// directory (mkdir is atomic) keeps two processes from taking the same slot; a lock older than 30 s is stale.
async function paceFor(host) {
  const dir = path.join(HTTP_CACHE, "pace");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = path.join(dir, host + ".last"), lock = path.join(dir, host + ".lock");
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) fs.rmSync(lock, { recursive: true, force: true }); } catch {}
      await sleep(50);
    }
  }
  try {
    const last = fs.existsSync(stamp) ? Number(fs.readFileSync(stamp, "utf8")) || 0 : 0;
    const wait = last + gapFor(host) - Date.now();
    if (wait > 0) await sleep(wait);
    fs.writeFileSync(stamp, String(Date.now()));
  } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

async function politeFetch(url, { method = "GET", body = null, headers = {}, signal } = {}) {
  const host = new URL(url).host;
  for (let throttled = 0; ; throttled++) {
    await paceFor(host);
    const res = await fetch(url, { method, body, signal, headers: { "User-Agent": USER_AGENT, ...headers } });
    if (res.status !== 429) return res;
    const after = Number(res.headers.get("retry-after")) || 50;
    if (throttled >= 4) throw new Error(`HTTP 429 from ${host} 5 times in a row (retry-after ${after} s): stopping`);
    process.stderr.write(`HTTP 429 from ${host}: waiting ${after + 10} s\n`);
    await sleep((after + 10) * 1000);
  }
}

async function fetchJson(url, opts = {}) {
  const res = await politeFetch(url, opts);
  if (res.ok) return res.json();
  if (res.status === 404) return null;
  throw new Error(`HTTP ${res.status} from ${url.slice(0, 160)}`);
}

const cacheFile = (url, body = null) => path.join(HTTP_CACHE, require("crypto").createHash("sha1").update(url + "\n" + (body || "")).digest("hex") + ".json");
async function cachedJson(url, { body = null, headers = {} } = {}) {
  fs.mkdirSync(HTTP_CACHE, { recursive: true });
  const file = cacheFile(url, body);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const res = await politeFetch(url, { method: body ? "POST" : "GET", body, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.slice(0, 120)}`);
  const json = await res.json();
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}

module.exports = { politeFetch, fetchJson, cachedJson, cacheFile, HTTP_CACHE, USER_AGENT, HOST_GAP, DEFAULT_GAP };
