// Stores each person's (or, with --ideologies, each ideology's) freely licensed Wikipedia lead image
// (thumbnail URL plus author and license, for attribution) in audits/people-catalog.json or
// audits/catalog.json, then downloads the thumbnail of every audited person and ideology into img/people/
// and img/ideologies/ (both kinds on every run), so the site serves them itself and a visit never contacts
// Wikimedia (Brandon, 2026-11-08: Privacy Badger flagged thumb.wikimedia.org as a tracker). Files no
// catalog entry uses any more are deleted. Only entries without an image are looked up; --refresh looks up every
// entry again (for newer lead images and credits, e.g. when tagging a release). A lookup that finds no usable
// image stores "image": null, so test.js can tell "none free" from "never looked up" (Brandon, 2026-11-07).
//   node scripts/images.js [--ideologies] [--refresh] [--check]   or   --thumbs (downloads only; build.js runs this)
// Monthly photo check (Brandon, 2026-11-07): Commons renames files, which breaks the stored URL (Nicholas II's photo,
// renamed 2026-11-05). Every run for people reads audits/photo-check.json; when its date is 30 or more days old (or
// with --check) it tests every shown person's photo URL, follows a renamed file to its new name (the same picture),
// clears a deleted one so this run looks it up again, and writes today's date. Serial people deploys run this script,
// so the check runs about once a month on its own.
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, thumbPath, catalog, peopleCatalog, profilePath, personPath } = require("./lib");

const IDEOLOGIES = process.argv.includes("--ideologies");
const REFRESH = process.argv.includes("--refresh");
const CATALOG = path.join(ROOT, "audits", IDEOLOGIES ? "catalog.json" : "people-catalog.json");
const LIST = IDEOLOGIES ? "ideologies" : "people";
const API = "https://en.wikipedia.org/w/api.php";
const HEADERS = { "user-agent": "political-ideology-atlas/1.0 (https://github.com/brioja/political-ideology-atlas)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, base = API) {
  const url = `${base}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (let attempt = 0; ; attempt++) {
    await sleep(300);
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt >= 5) throw new Error(`${res.status} for ${url}`);
    await sleep(5000 * (attempt + 1));
  }
}

// Ideology images must not show a real person (a portrait could be mistaken for the person match,
// and a photo can show a private individual). An image counts as showing one when its Commons
// "depicts" statements include a human, when it is the lead image of an article about a human, or
// when it is a camera photograph (EXIF camera make) that isn't a reproduction of an artwork: real
// people reach these images through photographs, while symbols, flags, maps, posters and artworks
// are what's left.
// Returns the file names (without "File:") that show a real person.
const COMMONS = "https://commons.wikimedia.org/w/api.php", WIKIDATA = "https://www.wikidata.org/w/api.php";
async function humans(qids) {
  const out = new Set();
  for (let i = 0; i < qids.length; i += 50) {
    const r = await api({ action: "wbgetentities", props: "claims", ids: qids.slice(i, i + 50).join("|") }, WIKIDATA);
    for (const [id, e] of Object.entries(r.entities || {})) if ((e.claims?.P31 || []).some((c) => c.mainsnak.datavalue?.value?.id === "Q5")) out.add(id);
  }
  return out;
}
async function showsRealPerson(fileNames) {
  const files = [...new Set(fileNames)].map((f) => `File:${f}`);
  const key = (t) => t.replace(/^File:/, "").replace(/_/g, " ");
  const depicts = new Map(), usedBy = new Map(), photo = new Set();
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50).join("|");
    // Commons "depicts" (structured data lives on the file's M-id).
    const pages = await api({ action: "query", titles: batch }, COMMONS);
    const mids = pages.query.pages.filter((p) => p.pageid).map((p) => [`M${p.pageid}`, key(p.title)]);
    if (mids.length) {
      const r = await api({ action: "wbgetentities", props: "claims", ids: mids.map((m) => m[0]).join("|") }, COMMONS);
      for (const [mid, name] of mids) {
        const st = r.entities?.[mid]?.statements || {};
        depicts.set(name, (st.P180 || []).map((c) => c.mainsnak.datavalue?.value?.id).filter(Boolean));
      }
    }
    // Camera photographs, minus reproductions of artworks (Commons files those as Artworks / PD-Art).
    const meta = await api({ action: "query", prop: "imageinfo|categories", iiprop: "metadata", cllimit: "max", titles: batch }, COMMONS);
    for (const p of meta.query.pages) {
      const camera = (p.imageinfo?.[0]?.metadata || []).some((m) => m.name === "Make" && m.value);
      const artwork = (p.categories || []).some((c) => /^Category:(Artworks|PD-Art)/.test(c.title));
      if (camera && !artwork) photo.add(key(p.title));
    }
    // English articles using the file (the first 500: portraits are used on few pages).
    const u = await api({ action: "query", prop: "fileusage", funamespace: "0", fulimit: "500", titles: batch });
    for (const p of u.query.pages) usedBy.set(key(p.title), (p.fileusage || []).map((x) => x.title));
  }
  const articles = [...new Set([...usedBy.values()].flat())];
  const lead = new Map();
  for (let i = 0; i < articles.length; i += 50) {
    const r = await api({ action: "query", prop: "pageimages|pageprops", piprop: "name", ppprop: "wikibase_item", titles: articles.slice(i, i + 50).join("|") });
    for (const p of r.query.pages) if (p.pageimage && p.pageprops?.wikibase_item) lead.set(p.title, { file: key(p.pageimage), q: p.pageprops.wikibase_item });
  }
  const isHuman = await humans([...new Set([...[...depicts.values()].flat(), ...[...lead.values()].map((x) => x.q)])]);
  return new Set(files.map(key).filter((f) => photo.has(f) || (depicts.get(f) || []).some((q) => isHuman.has(q))
    || (usedBy.get(f) || []).some((t) => lead.get(t)?.file === f && isHuman.has(lead.get(t).q))));
}

const titleOf = (url) => decodeURIComponent(url.split("/wiki/")[1]).replace(/_/g, " ");
const plain = (html) => (html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const CHECK_FILE = path.join(ROOT, "audits", "photo-check.json"), CHECK_DAYS = 30;
async function checkPhotos(data) {
  const shown = new Set(require(path.join(ROOT, "people.js")).PEOPLE.map((p) => p.id));
  let renamed = 0, gone = 0, checked = 0;
  for (const p of data[LIST].filter((x) => shown.has(x.id) && x.image && x.image.url)) {
    await sleep(150);
    checked++;
    let status;
    try { status = (await fetch(p.image.url, { method: "HEAD", headers: HEADERS })).status; } catch { continue; } // network trouble: next month
    if (status !== 404) continue;
    // Renamed on Commons: the old file page redirects to the new name; take the new name's thumbnail.
    const r = await api({ action: "query", redirects: "1", titles: `File:${p.image.file}`, prop: "imageinfo", iiprop: "url", iiurlwidth: "330" }, COMMONS);
    const pg = (r.query.pages || [])[0];
    const info = pg && !pg.missing && pg.imageinfo && pg.imageinfo[0];
    if (info && info.thumburl) {
      const file = pg.title.replace(/^File:/, "").replace(/ /g, "_");
      Object.assign(p.image, { url: info.thumburl.split("?")[0], file, source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}` });
      renamed++;
      console.log(`Photo of ${p.name}: renamed on Commons, now ${file}`);
    } else {
      delete p.image; // deleted: looked up again below, which finds the article's current lead image
      gone++;
      console.log(`Photo of ${p.name}: deleted on Commons, looking up the article's current image`);
    }
  }
  fs.writeFileSync(CHECK_FILE, JSON.stringify({ lastChecked: new Date().toISOString().slice(0, 10), everyDays: CHECK_DAYS,
    note: "scripts/images.js checks shown people's photo URLs when this date is 30 or more days old" }, null, 1) + "\n");
  console.log(`Photo check: ${checked} photos, ${renamed} renamed, ${gone} deleted.`);
}

async function main() {
  const data = readJson(CATALOG);
  if (!IDEOLOGIES) {
    const last = fs.existsSync(CHECK_FILE) ? readJson(CHECK_FILE).lastChecked : null;
    const due = !last || (Date.now() - Date.parse(last)) / 86400000 >= CHECK_DAYS;
    if (process.argv.includes("--check") || due) await checkPhotos(data);
  }
  // Ideologies found only by a Wikipedia search may point at the wrong article: no image for them.
  const people = data[LIST].filter((p) => p.wikipedia && (!IDEOLOGIES || ["exact", "redirect"].includes(p.wikipediaMatch))
    && (REFRESH || p.image === undefined));
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
      }
      // No lead image reported: keep the stored one. The page-image API drops lead images
      // intermittently (Hitler, Reagan, Modi and others went missing at once), and a stored image
      // was already checked as freely licensed. Never looked up before: record that there is none.
      else if (p.image === undefined) p.image = null;
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
        // Commons sometimes repeats the name in a hidden copy ("Unknown authorUnknown author").
        const artist = plain(m.Artist?.value), half = artist.slice(0, artist.length / 2);
        p.image.artist = (artist.length % 2 === 0 && artist === half + half ? half : artist) || "Unknown author";
        p.image.license = plain(m.LicenseShortName?.value) || "see file page";
        if (m.LicenseUrl?.value) p.image.licenseUrl = m.LicenseUrl.value;
        p.image.source = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.image.file)}`;
      }
    }
  }
  if (IDEOLOGIES) {
    const withImage = people.filter((p) => p.image);
    const person = await showsRealPerson(withImage.map((p) => p.image.file));
    const dropped = withImage.filter((p) => person.has(p.image.file.replace(/_/g, " ")));
    for (const p of dropped) p.image = null;
    console.log(`Left out ${dropped.length} images that show a real person: ${dropped.map((p) => p.name).join(", ")}`);
  }
  fs.writeFileSync(CATALOG, JSON.stringify(data, null, 1) + "\n");
  const missing = data[LIST].filter((p) => !p.image).map((p) => p.name);
  console.log(`Looked up ${people.length}; ${data[LIST].length - missing.length}/${data[LIST].length} ${LIST} have a free image.`);
  if (missing.length) console.log(`No free lead image: ${missing.join(", ")}`);
}

const toWebp = (buf) => require("child_process").execFileSync("convert", ["-[0]", "-resize", "330x330>", "-quality", "80", "webp:-"], { input: buf, maxBuffer: 1 << 26 });

// Downloads each audited entry's thumbnail to img/<kind>/ (only files not there yet) and deletes files
// that no catalog entry points at any more (a replaced or dropped image).
async function saveThumbs() {
  for (const [kind, entries, audited] of [["people", peopleCatalog(), personPath], ["ideologies", catalog(), profilePath]]) {
    const dir = path.join(ROOT, "img", kind);
    fs.mkdirSync(dir, { recursive: true });
    const wanted = new Set(), failed = [];
    let saved = 0;
    for (const e of entries.filter((x) => x.image && x.image.url && fs.existsSync(audited(x.id)))) {
      const rel = thumbPath(kind, e.id, e.image.url), file = path.join(ROOT, rel);
      wanted.add(path.basename(rel));
      if (fs.existsSync(file)) continue;
      let res;
      for (let attempt = 0; ; attempt++) {
        await sleep(300);
        try { res = await fetch(e.image.url, { headers: HEADERS }); } catch { res = null; }
        if (res && res.status === 429 && attempt < 5) { await sleep(5000 * (attempt + 1)); continue; }
        break;
      }
      if (!res || !res.ok) { failed.push(`${e.id} (${res ? res.status : "network"})`); continue; }
      // Re-encoded with ImageMagick: some stored URLs are full-size originals or large PNG thumbnails.
      try { fs.writeFileSync(file, toWebp(Buffer.from(await res.arrayBuffer()))); }
      catch (err) { failed.push(`${e.id} (convert: ${err.message.split("\n")[0]})`); continue; }
      saved++;
    }
    const stale = fs.readdirSync(dir).filter((f) => !wanted.has(f));
    for (const f of stale) fs.unlinkSync(path.join(dir, f));
    console.log(`Thumbnails (${kind}): ${saved} downloaded, ${stale.length} unused deleted, ${wanted.size} in img/${kind}/.`);
    if (failed.length) console.warn(`Could not download: ${failed.join(", ")} (shown without a picture until the next run)`);
  }
}

// --thumbs: only the download stage (build.js runs it first, so every build ships the thumbnails it needs).
(process.argv.includes("--thumbs") ? saveThumbs() : main().then(saveThumbs));
