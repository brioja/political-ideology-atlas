// Source check for ideology audits (Brandon, 2026-11-05): the sources have to discuss the ideology.
//   - A defining source (kind "reference" or "scholarly") must contain the ideology's name or one of
//     its `aliases` in its saved text.
//   - A primary source ("primary" or "program") passes if its own text names the ideology twice, or if
//     the sources that discuss the ideology (defining sources and primary texts that passed on their
//     own) name it twice by the head of its title (two words or more): one mention may be in passing.
//   - Wikipedia is never a defining source. An alias must be a name, not an everyday word.
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

// A name matches only as whole words, in its own word forms: an "-ism" also matches as -isms, -ist,
// -ists, -istic, -ian, -ians and -i ("Salafi jihadism": "Salafi jihadi", "Salafi jihadist";
// "Gandhism": "Gandhian"); any name also matches its plural. Never a bare prefix: "Communism" must
// not match "community".
function forms(n) {
  const t = n.trim();
  if (!t) return [];
  const out = [t, `${t}s`];
  const m = t.match(/^(.*?)ism$/);
  if (m && m[1].length >= 3) for (const e of ["isms", "ist", "ists", "istic", "ian", "ians", "i"]) out.push(m[1] + e);
  return out.map((f) => ` ${f} `);
}
const mentions = (text, names) => names.some((n) => forms(n).some((f) => text.includes(f)));
// How many times the text names the ideology (any name or alias, any form).
const count = (text, needles) => needles.reduce((sum, f) => { let k = 0, i = -1; while ((i = text.indexOf(f, i + 1)) !== -1) k++; return sum + k; }, 0);
const mentionCount = (text, names) => count(text, [...new Set(names.flatMap(forms))]);
// A primary text is named by the head of its title (before any comma, colon or bracket), only when
// that head is distinctive: two words or more ("Farewell Address", not "Speech").
// A title given in another language is often followed by its translation in brackets
// ("Aufzeichnungen eines Oekonomen (Notes of an Economist)"): both count.
const titleHeads = (t) => {
  const raw = String(t || "");
  const heads = [raw.split(/[,:;(\u2013\u2014]| - /)[0]];
  const m = raw.match(/^[^(]*\(([^)]+)\)/);
  if (m) heads.push(m[1]);
  return heads.map(norm).filter((h) => h.trim().split(" ").length >= 2);
};
// Wikipedia never defines an ideology (audits/AUDIT_RULES.md section 2): it can't be a defining source.
const isWikipedia = (s) => /(^|\.)wikipedia\.org$/.test((() => { try { return new URL(s.url).host; } catch { return ""; } })());
// An alias is a name, not an everyday word: several words, an -ism/-ist/-ian form, the eponym an
// "-ism" is named after ("Fortuyn" for "Fortuynism", "Mao" for "Maoism"), or a spelling variant of the
// name or a translation sharing its first four letters ("communisation" for "communization",
// "laïcité" for "laicism"). Be liberal with aliases: what
// the check exists to catch is a broader ideology's name ("communism" for World communism), and the
// uniqueness check stops that.
const isName = (al, name) => { const w = norm(al).trim().split(" "); if (w.length >= 2) return true;
  const flat = norm(name).trim().replace(/ /g, "");
  return /(isms?|ists?|ians?)$/.test(w[0]) || (w[0].length >= 3 && flat.startsWith(w[0])) || (w[0].length >= 5 && flat.slice(0, 4) === w[0].slice(0, 4)); };

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

let takenAuthors = null;
function authorsTaken() {
  if (takenAuthors) return takenAuthors;
  takenAuthors = new Map();
  for (const f of fs.readdirSync(lib.PROFILES_DIR)) {
    if (!f.endsWith(".json")) continue;
    let a; try { a = JSON.parse(fs.readFileSync(path.join(lib.PROFILES_DIR, f), "utf8")); } catch { continue; }
    for (const au of Array.isArray(a.authors) ? a.authors : []) {
      const k = norm(au); if (!takenAuthors.has(k)) takenAuthors.set(k, new Set()); takenAuthors.get(k).add(f.slice(0, -5));
    }
  }
  return takenAuthors;
}

function check(id, audit) {
  const problems = [], unchecked = [];
  const aliases = Array.isArray(audit.aliases) ? audit.aliases : [];
  if (audit.aliases !== undefined && (!Array.isArray(audit.aliases) || aliases.some((x) => typeof x !== "string" || !x.trim()))) {
    problems.push('"aliases" must be a list of names (use [] for none)');
  }
  for (const al of aliases) if (typeof al === "string" && al.trim() && !isName(al, audit.name)) problems.push(`alias "${al}" is an everyday word, not a name (use several words, an -ism/-ist/-ian form, or a spelling variant of the name)`);
  const names = [audit.name, ...aliases].map(norm);
  for (const n of [audit.name, ...aliases]) {
    const others = [...(namesTaken().get(norm(n)) || [])].filter((o) => o !== id);
    if (others.length) problems.push(`name or alias "${n}" is also used by ${others.join(", ")}`);
  }
  const sources = Array.isArray(audit.sources) ? audit.sources : [];
  const defining = [];
  for (const s of sources.filter((s) => (s.kind === "reference" || s.kind === "scholarly") && !isWikipedia(s))) {
    const t = sourceText(id, s.url);
    if (t == null) { unchecked.push(s.id); continue; }
    if (mentions(t, names)) defining.push(t);
    else problems.push(`source ${s.id} (${s.kind}) never names "${audit.name}"${aliases.length ? " or an alias" : ""}: a defining source has to discuss the ideology`);
  }
  for (const al of aliases) if (defining.length && !defining.some((t) => mentions(t, [norm(al)]))) problems.push(`alias "${al}" appears in no defining source`);
  // Primary texts. A text that names the ideology twice passes on its own. Any other passes if the
  // sources that discuss the ideology (defining sources, and primary texts that passed on their own;
  // never Wikipedia) name it by title twice between them. One mention may be in passing; a source
  // that never names the ideology can't vouch for a text (the World communism case).
  // Defining authors ("authors"): the ideology's own thinkers, as its defining sources name them. Each
  // must be named (by surname) at least twice in the defining sources and belong to no other
  // ideology's "authors". A primary text by one of them is tied to the ideology.
  const authors = Array.isArray(audit.authors) ? audit.authors : [];
  const authorOk = [];
  for (const au of authors) {
    const sur = norm(String(au).trim().split(/\s+/).pop());
    const others = [...(authorsTaken().get(norm(au)) || [])].filter((o) => o !== id);
    if (others.length) { problems.push(`author "${au}" is also a defining author of ${others.join(", ")}`); continue; }
    if (count(defining.join(" "), [sur]) < 2) { problems.push(`author "${au}" is named fewer than twice in the defining sources`); continue; }
    authorOk.push(sur);
  }
  const primaries = sources.filter((s) => s.kind === "primary" || s.kind === "program");
  const vouching = [...defining];
  const pending = [];
  for (const s of primaries) {
    const t = sourceText(id, s.url);
    if (t != null && !isWikipedia(s) && mentionCount(t, names) >= 2) { vouching.push(t); continue; }
    pending.push({ s, t });
  }
  for (const { s, t } of pending) {
    // Other titles the sources that discuss the ideology use for the text ("titles": ["Hatt-ı Hümayun"]).
    const heads = [...titleHeads(s.title), ...(Array.isArray(s.titles) ? s.titles : []).map(norm).filter((h) => h.trim().split(" ").length >= 2)];
    const own = t || "";
    const others = vouching.filter((v) => v !== own).join(" ");
    const named = heads.some((h) => count(others, [h]) >= 2);
    if (named) continue;
    // A defining author's text: its author is one the audit lists in "authors" (see below).
    if (authorOk.length && s.author && authorOk.some((sur) => norm(s.author).includes(sur))) continue;
    // No saved copy: it can't be judged either way. New audits must save every source, and validate.js
    // makes an unchecked source an error for them.
    if (t == null) { unchecked.push(s.id); continue; }
    problems.push(`source ${s.id} (${s.kind}) doesn't name "${audit.name}" twice, and the sources that discuss it don't name it by title twice: it isn't tied to the ideology (cite its title as those sources name it)`);
  }
  return { problems, unchecked };
}

module.exports = { check, norm, forms, mentions, sourceText, isWikipedia, isName, namesTaken };
