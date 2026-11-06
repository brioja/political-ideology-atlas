// YouTube captions and search for agents, cached and paced (Brandon, 2026-11-06). YouTube answers bursts with
// 429s and captchas, so every network call goes through here: captions and search results are cached on disk
// (~/.cache/political-ideology-atlas/youtube/), calls are at least 20 s apart across all processes, and after a
// 429 or a captcha nothing is sent for an hour. No audio or video is ever downloaded. A project hook blocks
// direct yt-dlp and WebFetch to YouTube.
//   node scripts/yt.js "<video URL or id>"            the English captions as plain text (speaker labels are absent)
//   node scripts/yt.js --search "<words>" [N]         up to N (default 15) results: id, title, channel, duration
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DIR = path.join(require("os").homedir(), ".cache", "political-ideology-atlas", "youtube");
const LAST = path.join(DIR, ".last-request"), BLOCKED = path.join(DIR, ".blocked-until");
const GAP_MS = 20000, BLOCK_MS = 60 * 60 * 1000;
fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politely(run) {
  if (fs.existsSync(BLOCKED) && Date.now() < Number(fs.readFileSync(BLOCKED, "utf8"))) {
    const min = Math.ceil((Number(fs.readFileSync(BLOCKED, "utf8")) - Date.now()) / 60000);
    throw new Error(`YouTube blocked us recently; no requests for another ${min} min. Use other sources meanwhile.`);
  }
  const last = fs.existsSync(LAST) ? Number(fs.readFileSync(LAST, "utf8")) : 0;
  if (Date.now() - last < GAP_MS) await sleep(GAP_MS - (Date.now() - last));
  fs.writeFileSync(LAST, String(Date.now()));
  try { return run(); }
  catch (e) {
    const msg = String(e.stderr || e.message);
    if (/429|Too Many Requests|captcha|Sign in to confirm/i.test(msg)) {
      fs.writeFileSync(BLOCKED, String(Date.now() + BLOCK_MS));
      throw new Error("YouTube refused (rate limit or captcha): stopping YouTube requests for an hour. Use other sources.");
    }
    throw new Error(msg.split("\n").filter(Boolean).slice(-2).join(" "));
  }
}

const videoId = (s) => (String(s).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [, /^[\w-]{11}$/.test(s) ? s : null])[1];
const vttToText = (vtt) => {
  const lines = [];
  for (const l of vtt.split("\n")) {
    const t = l.replace(/<[^>]+>/g, "").trim();
    if (!t || /^WEBVTT|^Kind:|^Language:|-->|^\d+$/.test(t)) continue;
    if (lines[lines.length - 1] !== t) lines.push(t);
  }
  return lines.join("\n");
};

async function main() {
  const [a, b, c] = process.argv.slice(2);
  if (a === "--search") {
    if (!b) throw new Error("usage: node scripts/yt.js --search \"<words>\" [N]");
    const n = Number(c) || 15, key = path.join(DIR, `search-${require("crypto").createHash("sha1").update(`${b}\n${n}`).digest("hex")}.json`);
    if (!fs.existsSync(key)) {
      const out = await politely(() => execFileSync("yt-dlp", ["--flat-playlist", "-J", `ytsearch${n}:${b}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 }));
      fs.writeFileSync(key, out);
    }
    for (const e of JSON.parse(fs.readFileSync(key, "utf8")).entries || [])
      console.log(`${e.id}\t${e.title}\t${e.channel || e.uploader || ""}\t${e.duration ? Math.round(e.duration / 60) + " min" : ""}`);
    return;
  }
  const id = videoId(a || "");
  if (!id) throw new Error("usage: node scripts/yt.js \"<video URL or id>\" | --search \"<words>\" [N]");
  const txt = path.join(DIR, `${id}.txt`);
  if (!fs.existsSync(txt)) {
    await politely(() => execFileSync("yt-dlp", ["--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", "en-orig,en,en-US,en-GB",
      "--sub-format", "vtt", "-o", path.join(DIR, `${id}.%(ext)s`), `https://www.youtube.com/watch?v=${id}`], { stdio: ["ignore", "pipe", "pipe"] }));
    const vtt = fs.readdirSync(DIR).filter((f) => f.startsWith(id + ".") && f.endsWith(".vtt")).sort((x, y) => /en-orig/.test(y) - /en-orig/.test(x))[0];
    if (!vtt) { fs.writeFileSync(txt, ""); throw new Error(`no English captions for ${id}`); }
    fs.writeFileSync(txt, vttToText(fs.readFileSync(path.join(DIR, vtt), "utf8")));
  }
  const t = fs.readFileSync(txt, "utf8");
  if (!t) throw new Error(`no English captions for ${id} (cached)`);
  console.log(`URL: https://www.youtube.com/watch?v=${id}\nCaptions (automatic captions have no speaker labels):\n\n${t}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
