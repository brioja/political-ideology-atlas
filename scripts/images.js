// Stores each person's freely licensed Wikipedia lead image (thumbnail URL plus author and
// license, for attribution) in audits/people-catalog.json. Images are loaded from Wikimedia's
// servers by the site; only the URLs and credits are stored here.
//   node scripts/images.js
const fs = require("fs");
const path = require("path");
const { ROOT, readJson } = require("./lib");

const CATALOG = path.join(ROOT, "audits", "people-catalog.json");
const API = "https://en.wikipedia.org/w/api.php";
const HEADERS = { "user-agent": "political-ideology-atlas/1.0 (https://github.com/brioja/political-ideology-atlas)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (let attempt = 0; ; attempt++) {
    await sleep(300);
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt >= 5) throw new Error(`${res.status} for ${url}`);
    await sleep(5000 * (attempt + 1));
  }
}

const titleOf = (url) => decodeURIComponent(url.split("/wiki/")[1]).replace(/_/g, " ");
const plain = (html) => (html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function main() {
  const data = readJson(CATALOG);
  const people = data.people;
  for (let i = 0; i < people.length; i += 50) {
    const batch = people.slice(i, i + 50);
    // 1. Lead image, free licenses only (non-free "fair use" images can't be reused here).
    const q = await api({ action: "query", prop: "pageimages", piprop: "thumbnail|name", pithumbsize: "320",
      pilicense: "free", redirects: "1", titles: batch.map((p) => titleOf(p.wikipedia)).join("|") });
    const byTitle = new Map(q.query.pages.map((pg) => [pg.title, pg]));
    const files = [];
    for (const p of batch) {
      const pg = byTitle.get(titleOf(p.wikipedia));
      if (pg && pg.thumbnail && pg.pageimage) {
        p.image = { url: pg.thumbnail.source.split("?")[0], file: pg.pageimage };
        files.push(`File:${pg.pageimage}`);
      } else delete p.image;
    }
    // 2. Author and license for attribution.
    if (files.length) {
      const info = await api({ action: "query", prop: "imageinfo", iiprop: "extmetadata",
        iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl", titles: files.join("|") });
      const meta = new Map(info.query.pages.map((pg) => [pg.title.replace(/^File:/, ""), pg.imageinfo?.[0]?.extmetadata || {}]));
      const norm = new Map((info.query.normalized || []).map((n) => [n.from.replace(/^File:/, ""), n.to.replace(/^File:/, "")]));
      for (const p of batch) {
        if (!p.image) continue;
        const m = meta.get(norm.get(p.image.file) || p.image.file) || {};
        p.image.artist = plain(m.Artist?.value) || "Unknown author";
        p.image.license = plain(m.LicenseShortName?.value) || "see file page";
        if (m.LicenseUrl?.value) p.image.licenseUrl = m.LicenseUrl.value;
        p.image.source = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.image.file)}`;
      }
    }
  }
  fs.writeFileSync(CATALOG, JSON.stringify(data, null, 1) + "\n");
  const missing = people.filter((p) => !p.image).map((p) => p.name);
  console.log(`${people.length - missing.length}/${people.length} people have a free image.`);
  if (missing.length) console.log(`No free lead image: ${missing.join(", ")}`);
}

main();
