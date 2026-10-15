// Stores each person's (or, with --ideologies, each ideology's) freely licensed Wikipedia lead image
// (thumbnail URL plus author and license, for attribution) in audits/people-catalog.json or
// audits/catalog.json. Images are loaded from Wikimedia's servers by the site; only the URLs and
// credits are stored here.
//   node scripts/images.js [--ideologies]
const fs = require("fs");
const path = require("path");
const { ROOT, readJson } = require("./lib");

const IDEOLOGIES = process.argv.includes("--ideologies");
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

async function main() {
  const data = readJson(CATALOG);
  // Ideologies found only by a Wikipedia search may point at the wrong article: no image for them.
  const people = data[LIST].filter((p) => p.wikipedia && (!IDEOLOGIES || ["exact", "redirect"].includes(p.wikipediaMatch)));
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
      // was already checked as freely licensed.
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
    for (const p of dropped) delete p.image;
    console.log(`Left out ${dropped.length} images that show a real person: ${dropped.map((p) => p.name).join(", ")}`);
  }
  fs.writeFileSync(CATALOG, JSON.stringify(data, null, 1) + "\n");
  const missing = people.filter((p) => !p.image).map((p) => p.name);
  console.log(`${people.length - missing.length}/${people.length} ${LIST} have a free image.`);
  if (missing.length) console.log(`No free lead image: ${missing.join(", ")}`);
}

main();
