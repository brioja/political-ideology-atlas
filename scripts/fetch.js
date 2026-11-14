// The fetch library: every request to Wikimedia (Wikipedia, Wikidata, Commons, pageviews, SPARQL) goes through
// here (Brandon, 2026-11-14: each script had its own copy, with different User-Agents and 429 rules).
//   politeFetch(url, opts)  one request: the project's User-Agent, a pause after it, and a 429 waited out (the
//                           server's retry-after plus 10 s, 60 s when it gives none), at most 5 times in a row,
//                           then it stops. Returns the response; the caller handles 404s and other errors.
//   fetchJson(url, opts)    politeFetch, then the JSON, null for a 404, an error for anything else.
//   cachedJson(url, opts)   fetchJson cached on disk forever (~/.cache/political-ideology-atlas/http/<sha1>.json), so
//                           a rerun reads local copies instead of asking again. For pages that don't change; data
//                           that must be fresh (this month's views, whether a photo still exists) uses politeFetch.
// YouTube has its own rules and its own script (scripts/yt.js). validate.js --links checks arbitrary sites directly.
"use strict";
const fs = require("fs");
const path = require("path");

const USER_AGENT = "political-ideology-atlas/1.0 (https://github.com/brioja/political-ideology-atlas)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politeFetch(url, { method = "GET", body = null, headers = {}, pauseMs = 1000, signal } = {}) {
  for (let throttled = 0; ; throttled++) {
    const res = await fetch(url, { method, body, signal, headers: { "User-Agent": USER_AGENT, ...headers } });
    if (pauseMs) await sleep(pauseMs);
    if (res.status !== 429) return res;
    const after = Number(res.headers.get("retry-after")) || 50;
    if (throttled >= 4) throw new Error(`HTTP 429 from ${new URL(url).host} 5 times in a row (retry-after ${after} s): stopping`);
    process.stderr.write(`HTTP 429 from ${new URL(url).host}: waiting ${after + 10} s\n`);
    await sleep((after + 10) * 1000);
  }
}

async function fetchJson(url, opts = {}) {
  const res = await politeFetch(url, opts);
  if (res.ok) return res.json();
  if (res.status === 404) return null;
  throw new Error(`HTTP ${res.status} from ${url.slice(0, 160)}`);
}

const HTTP_CACHE = path.join(process.env.XDG_CACHE_HOME || path.join(require("os").homedir(), ".cache"), "political-ideology-atlas", "http");
const cacheFile = (url, body = null) => path.join(HTTP_CACHE, require("crypto").createHash("sha1").update(url + "\n" + (body || "")).digest("hex") + ".json");
async function cachedJson(url, { body = null, headers = {}, pauseMs = 1000 } = {}) {
  fs.mkdirSync(HTTP_CACHE, { recursive: true });
  const file = cacheFile(url, body);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const res = await politeFetch(url, { method: body ? "POST" : "GET", body, headers, pauseMs });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.slice(0, 120)}`);
  const json = await res.json();
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}

module.exports = { politeFetch, fetchJson, cachedJson, cacheFile, HTTP_CACHE, USER_AGENT };
