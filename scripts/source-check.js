// Source check for ideology audits (Brandon, 2026-11-05): the sources have to discuss the ideology.
//   - A defining source (kind "reference" or "scholarly") must contain the ideology's name or one of
//     its `aliases` in its saved text.
//   - A primary source ("primary" or "program") passes if its own text contains the name or an alias,
//     or if a defining source that passed names it, by the head of its title or its author's surname.
//   - Every alias must appear in at least one defining source, and no two ideologies may share a name
//     or alias.
// Texts are the copies saved in scratchpad/sources/<id>/ (index.json maps each file to its URL): the
// plain-text extract where there is one, else the gunzipped HTML with its tags stripped. A source
// with no saved copy can't be checked and is reported as unchecked.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const lib = require("./lib");

const LIB_DIR = path.join(lib.ROOT, "scratchpad", "sources");
const norm = (s) => ` ${String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const sameUrl = (a, b) => String(a || "").replace(/[#?].*$/, "").replace(/\/+$/, "").replace(/^http:/, "https:") ===
  String(b || "").replace(/[#?].*$/, "").replace(/\/+$/, "").replace(/^http:/, "https:");

function readText(file) {
  if (/\.txt$/i.test(file)) return fs.readFileSync(file, "utf8");
  const base = file.replace(/\.(html?|pdf)(\.gz)?$/i, "");
  if (fs.existsSync(base + ".txt")) return fs.readFileSync(base + ".txt", "utf8");
  let raw;
  if (/\.gz$/i.test(file)) raw = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
  else if (/\.html?$/i.test(file)) raw = fs.readFileSync(file, "utf8");
  else return null;
  return raw.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
}

// Normalized text of each saved copy of `url` in the audit's library, or null if none.
function sourceText(id, url) {
  const dir = path.join(LIB_DIR, id);
  const ix = path.join(dir, "index.json");
  if (!fs.existsSync(ix)) return null;
  let items;
  try { const j = JSON.parse(fs.readFileSync(ix, "utf8")); items = Array.isArray(j) ? j : j.files || []; } catch { return null; }
  const texts = items.filter((it) => it && it.file && sameUrl(it.url, url))
    .map((it) => { try { return readText(path.join(dir, it.file)); } catch { return null; } }).filter(Boolean);
  return texts.length ? norm(texts.join(" ")) : null;
}

// A name matches in its word forms: "Salafi jihadism" matches "Salafi jihadi" and "Salafi jihadist",
// "Gandhism" matches "Gandhian" (the last word's -ism, -ist, -ian or plural ending is optional).
const stem = (n) => { const t = n.trim(); const s = t.replace(/(isms?|ists?|ians?|s)$/, ""); return ` ${s.length >= 4 ? s : t}`; };
const mentions = (text, names) => names.some((n) => n.trim() && text.includes(stem(n)));
const titleHead = (t) => norm(String(t || "").split(/[,:;(–—]| - /)[0]);
const surname = (a) => { const w = norm(a).trim().split(" "); const s = w[w.length - 1] || ""; return s.length >= 4 && w.length <= 4 ? ` ${s} ` : null; };

// Every ideology audit's name and aliases, normalized, for the uniqueness check.
let taken = null;
function namesTaken() {
  if (taken) return taken;
  taken = new Map();
  for (const f of fs.readdirSync(lib.PROFILES_DIR)) {
    if (!f.endsWith(".json")) continue;
    let a; try { a = JSON.parse(fs.readFileSync(path.join(lib.PROFILES_DIR, f), "utf8")); } catch { continue; }
    const id = f.slice(0, -5);
    for (const n of [a.name, ...(Array.isArray(a.aliases) ? a.aliases : [])]) {
      if (!n) continue;
      const k = norm(n);
      if (!taken.has(k)) taken.set(k, new Set());
      taken.get(k).add(id);
    }
  }
  return taken;
}

function check(id, audit) {
  const problems = [], unchecked = [];
  const aliases = Array.isArray(audit.aliases) ? audit.aliases : [];
  if (audit.aliases !== undefined && (!Array.isArray(audit.aliases) || aliases.some((x) => typeof x !== "string" || !x.trim()))) {
    problems.push('"aliases" must be a list of names (use [] for none)');
  }
  const names = [audit.name, ...aliases].map(norm);
  for (const n of [audit.name, ...aliases]) {
    const others = [...(namesTaken().get(norm(n)) || [])].filter((o) => o !== id);
    if (others.length) problems.push(`name or alias "${n}" is also used by ${others.join(", ")}`);
  }
  const sources = Array.isArray(audit.sources) ? audit.sources : [];
  const defining = [];
  for (const s of sources.filter((s) => s.kind === "reference" || s.kind === "scholarly")) {
    const t = sourceText(id, s.url);
    if (t == null) { unchecked.push(s.id); continue; }
    if (mentions(t, names)) defining.push(t);
    else problems.push(`source ${s.id} (${s.kind}) never names "${audit.name}"${aliases.length ? " or an alias" : ""}: a defining source has to discuss the ideology`);
  }
  for (const al of aliases) if (defining.length && !defining.some((t) => mentions(t, [norm(al)]))) problems.push(`alias "${al}" appears in no defining source`);
  for (const s of sources.filter((s) => s.kind === "primary" || s.kind === "program")) {
    const t = sourceText(id, s.url);
    if (t != null && mentions(t, names)) continue;
    const head = titleHead(s.title), sur = surname(s.author);
    const named = defining.some((d) => (head.trim().length >= 6 && d.includes(head)) || (sur && d.includes(sur)));
    if (named) continue;
    if (t == null && !defining.length) { unchecked.push(s.id); continue; }
    problems.push(`source ${s.id} (${s.kind}) doesn't name "${audit.name}" and no defining source names it (by title or author): it isn't tied to the ideology`);
  }
  return { problems, unchecked };
}

module.exports = { check };
