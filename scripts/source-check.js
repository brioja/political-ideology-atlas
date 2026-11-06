// Source check for ideology audits (Brandon, 2026-11-05): the sources have to discuss the ideology.
//   - A defining source (kind "reference" or "scholarly") must contain the ideology's name or one of
//     its `aliases` in its saved text.
//   - A primary source ("primary" or "program") passes if its own text names the ideology twice, or if
//     the sources that discuss the ideology (defining sources and primary texts that passed on their
//     own) name it twice by the head of its title (two words or more): one mention may be in passing.
//   - Wikipedia is never a defining source. An alias must be a name, not an everyday word.
//   - Aliases are liberal (Brandon, 2026-11-05): any name for the ideology, as long as it is a name
//     (not an everyday word) and no other ideology's name or alias.
// Texts are the copies saved in scratchpad/sources/<id>/ (index.json maps each file to its URL): the
// plain-text extract where there is one, else the gunzipped HTML with its tags stripped. A source
// with no saved copy can't be checked and is reported as unchecked.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const lib = require("./lib");

const LIB_DIR = path.join(lib.ROOT, "scratchpad", "sources");
const norm = (s) => ` ${String(s || "").replace(/ß/g, "ss").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
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
// An alias is a name, not an everyday word: several words, an acronym of the name, an -ism/-ist/-ian form, the eponym an
// "-ism" is named after ("Fortuyn" for "Fortuynism", "Mao" for "Maoism"), or a spelling variant of the
// name or a translation sharing its first four letters ("communisation" for "communization",
// "laïcité" for "laicism"). Be liberal with aliases: what
// the check exists to catch is a broader ideology's name ("communism" for World communism), and the
// uniqueness check stops that.
const isName = (al, name) => { const w = norm(al).trim().split(" "); if (w.length >= 2) return true;
  const flat = norm(name).trim().replace(/ /g, "");
  // An acronym of the name's words ("TERF" for trans-exclusionary radical feminism).
  const initials = norm(name).trim().split(" ").map((x) => x[0]).join("");
  if (w[0].length >= 3 && (w[0] === initials || w[0] === initials + "s")) return true;
  return /(isms?|ists?|ians?)$/.test(w[0]) || (w[0].length >= 3 && flat.startsWith(w[0])) || (w[0].length >= 5 && flat.slice(0, 4) === w[0].slice(0, 4)); };

// Every ideology audit's name and aliases, normalized, for the uniqueness check.
// An alias, author or extra title is a string (older audits) or carries its evidence:
// { "name" | "title": "...", "source": "s3", "quote": "verbatim passage from that source" }.
const entryName = (x) => (typeof x === "string" ? x : x && typeof x === "object"
  ? x.name || x.title || x.organisation || [x.first, x.last].filter(Boolean).join(" ") : "");
// The name a defining author is matched by: a person's last name ("last": "de Benoist", "bin Laden"),
// an organisation's full name. Older entries are a single string: its last word, or the whole string
// for an organisation (four words or more).
const authorKey = (x) => {
  if (x && typeof x === "object" && (x.last || x.organisation)) return norm(x.last || x.organisation);
  const n = entryName(x).trim(), w = n.split(/\s+/);
  return norm(w.length >= 4 ? n : w[w.length - 1]);
};
const list = (v) => (Array.isArray(v) ? v : []).map(entryName).filter((n) => n && n.trim());

let taken = null;
const ownNames = new Map(); // normalized name -> ideologies whose own name it is
// How often an ideology's own defining sources (saved, reference or scholarly, never Wikipedia) use a
// name, in any of its forms. Decides who owns a contested alias.
const usageCache = new Map();
function usage(id, n) {
  const key = id + "|" + n;
  if (usageCache.has(key)) return usageCache.get(key);
  let a; try { a = JSON.parse(fs.readFileSync(path.join(lib.PROFILES_DIR, id + ".json"), "utf8")); } catch { a = {}; }
  const text = (a.sources || []).filter((s) => (s.kind === "reference" || s.kind === "scholarly") && !isWikipedia(s))
    .map((s) => sourceText(id, s.url)).filter(Boolean).join(" ");
  const u = count(text, [...new Set(forms(n))]);
  usageCache.set(key, u);
  return u;
}
function namesTaken() {
  if (taken) return taken;
  taken = new Map();
  for (const f of fs.readdirSync(lib.PROFILES_DIR)) {
    if (!f.endsWith(".json")) continue;
    let a; try { a = JSON.parse(fs.readFileSync(path.join(lib.PROFILES_DIR, f), "utf8")); } catch { continue; }
    const id = f.slice(0, -5);
    for (const n of [a.name, ...list(a.aliases)]) {
      if (!n) continue;
      const k = norm(n);
      if (!taken.has(k)) taken.set(k, new Set());
      taken.get(k).add(id);
      if (n === a.name) { if (!ownNames.has(k)) ownNames.set(k, new Set()); ownNames.get(k).add(id); }
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
    for (const au of list(a.authors)) {
      const k = norm(au); if (!takenAuthors.has(k)) takenAuthors.set(k, new Set()); takenAuthors.get(k).add(f.slice(0, -5));
    }
  }
  return takenAuthors;
}

// The same name in another form needs no source equating it with the ideology's name: a translation
// (marked "type": "translation": "laïcité", "New Right"; or "variant": a reordering such as
// "Jihadi-Salafism"), a spelling variant (at most two letters differ: "Austro-Marxism", "communisation")
// or an acronym (initials: "TERF").
const sameName = (al, name, type) => {
  if (type === "translation" || type === "variant") return true;
  const a = norm(al).trim().replace(/ /g, ""), n = norm(name).trim().replace(/ /g, "");
  const initials = norm(name).trim().split(" ").map((x) => x[0]).join("");
  // A spelling variant is nearly the same string: s/z and spacing aside, at most two letters differ
  // ("Austromarxismus", "Greater Serbian", "communisation").
  const lev = (x, y) => { const d = Array.from({ length: x.length + 1 }, (_, i) => [i]); for (let j = 1; j <= y.length; j++) d[0][j] = j;
    for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    return d[x.length][y.length]; };
  const zs = (x) => x.replace(/z/g, "s");
  return lev(zs(a), zs(n)) <= 2 || a === initials || a === initials + "s";
};
// An eponym: the ideology is named after this author ("Klaus" for Klausism, "Sankara" for Sankarism,
// "Camilo" for Camilism). Their name counts as the ideology's name.
const isEponym = (x, name) => {
  if (!x || typeof x !== "object") return false;
  // Only a name built from the person's name as one word (Klausism, Gandhism, Thatcherism, Sorelianism),
  // never "Monroe Doctrine" or "Marshall Plan": those cover one part of the person's views, so the person's
  // name must not count as the ideology's (Brandon, 2026-11-05).
  if (!/^\S+(ism|ist|ian|ianism)$/i.test(String(name).trim())) return false;
  const n = norm(name).trim().replace(/ /g, "");
  return [x.last, x.first].filter(Boolean).map((w) => norm(w).trim().replace(/ /g, "")).some((w) => w.length >= 3 && n.slice(0, Math.min(5, w.length)) === w.slice(0, Math.min(5, w.length)));
};

// Wikidata labels and aliases of the catalog's items (corpora/wikidata-aliases/aliases.jsonl). Used only
// to connect an alias to its ideology, one to one (Brandon, 2026-11-05): the alias must be a label or
// alias of this ideology's own item and of no other catalog item. It never defines scope or answers.
let wd = null;
function wikidataNames() {
  if (wd) return wd;
  wd = { byItem: new Map(), owners: new Map() };
  const f = path.join(require("os").homedir(), ".cache/political-ideology-atlas/corpora/wikidata-aliases/aliases.jsonl");
  if (!fs.existsSync(f)) return wd;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const names = new Set([...Object.values(e.labels || {}), ...Object.values(e.aliases || {}).flat()].map((n) => norm(n)));
    wd.byItem.set(e.id, names);
    for (const n of names) { if (!wd.owners.has(n)) wd.owners.set(n, new Set()); wd.owners.get(n).add(e.id); }
  }
  return wd;
}
function wikidataLinks(audit, al) {
  const entry = lib.catalog().find((c) => c.id === audit.id);
  const q = entry && entry.wikidata, k = norm(al), w = wikidataNames();
  if (!q || !w.byItem.has(q) || !w.byItem.get(q).has(k)) return false;
  return [...(w.owners.get(k) || [])].every((o) => o === q);
}

// Evidence for an alias, author or title: the cited source is in the audit, its saved copy contains the
// quote, and the quote contains the name (in one of its forms). `strict` audits must give evidence.
function evidence(id, audit, field, x, strict, contains) {
  const label = `${field} "${entryName(x)}"`;
  if (typeof x === "string") return strict ? [`${label} needs evidence: { "${field === "title" ? "title" : "name"}", "source", "quote" }`] : [];
  if (field === "alias" && x && x.wikidata && !x.source) return []; // connected by Wikidata instead (checked in check())
  const src = (audit.sources || []).find((s) => s.id === x.source);
  if (!src) return [`${label}: source "${x.source}" is not in the audit`];
  if (typeof x.quote !== "string" || x.quote.trim().length < 10) return [`${label}: needs a verbatim "quote" from ${x.source}`];
  const q = norm(x.quote);
  if (!contains(q)) return [`${label}: its quote doesn't contain it`];
  const t = sourceText(id, src.url);
  if (t == null) return strict ? [`${label}: ${x.source} has no saved copy to check the quote against`] : [];
  if (!t.includes(q.trim())) return [`${label}: the quote isn't in ${x.source}'s saved copy`];
  return [];
}

function check(id, audit, { strict = false } = {}) {
  const problems = [], unchecked = [];
  if (audit.aliases !== undefined && (!Array.isArray(audit.aliases) || audit.aliases.some((x) => !entryName(x).trim()))) {
    problems.push('"aliases" must be a list of names (use [] for none)');
  }
  // An alias's quote names both the alias and the ideology itself, so the source is seen equating them
  // ("'trans-exclusionary radical feminism', or TERFism") (Brandon, 2026-11-05: traceability).
  for (const x of Array.isArray(audit.aliases) ? audit.aliases : []) {
    problems.push(...evidence(id, audit, "alias", x, strict, (q) => mentions(q, [norm(entryName(x))])));
    if (typeof x === "object" && x && x.wikidata) {
      if (!wikidataLinks(audit, entryName(x))) problems.push(`alias "${entryName(x)}": not a Wikidata label or alias of this ideology's item alone (one to one)`);
      continue;
    }
    if (typeof x === "object" && x && typeof x.quote === "string" && !sameName(entryName(x), audit.name, x.type) && !mentions(norm(x.quote), [norm(audit.name)]))
      problems.push(`alias "${entryName(x)}": its quote doesn't name "${audit.name}" too, so it doesn't show the source equating them`);
  }
  for (const x of Array.isArray(audit.authors) ? audit.authors : []) {
    const key = authorKey(x);
    if (strict && typeof x === "object" && !x.organisation && !(x.first && x.last)) problems.push(`author "${entryName(x)}" needs "first" and "last" (or "organisation")`);
    problems.push(...evidence(id, audit, "author", x, strict, (q) => q.includes(key)));
  }
  for (const src of audit.sources || []) for (const x of Array.isArray(src.titles) ? src.titles : []) {
    problems.push(...evidence(id, audit, "title", x, strict, (q) => q.includes(norm(entryName(x)))));
  }
  // Eponymous authors' names count as names of the ideology (as its last name: "Klaus", "Bukharin").
  const eponyms = (Array.isArray(audit.authors) ? audit.authors : []).filter((x) => isEponym(x, audit.name)).map((x) => x.last || x.first);
  // Catalog names that Wikipedia redirects to this ideology's article are aliases too (one to one).
  const redirectNames = lib.redirectAliases(id).filter((n) => norm(n) !== norm(audit.name));
  const aliases = [...list(audit.aliases), ...eponyms, ...redirectNames];
  for (const al of aliases) if (typeof al === "string" && al.trim() && !isName(al, audit.name)) problems.push(`alias "${al}" is an everyday word, not a name (use several words, an -ism/-ist/-ian form, or a spelling variant of the name)`);
  // Uniqueness. An ideology's own name is never another's alias. An alias two ideologies claim belongs
  // to the one whose defining sources use it most (the sources decide, Brandon 2026-11-05); the others
  // lose it. A tie leaves it to none of them.
  namesTaken();
  const kept = [];
  for (const al of aliases) {
    if (typeof al !== "string" || !al.trim()) continue;
    const k = norm(al);
    const nameOf = [...(ownNames.get(k) || [])].filter((o) => o !== id);
    if (nameOf.length) { problems.push(`alias "${al}" is the name of ${nameOf.join(", ")}`); continue; }
    const rivals = [...(namesTaken().get(k) || [])].filter((o) => o !== id);
    if (rivals.length) {
      const mine = usage(id, k), best = Math.max(...rivals.map((o) => usage(o, k)));
      if (mine <= best) { problems.push(`alias "${al}" belongs to ${rivals.filter((o) => usage(o, k) === best).join(", ")}, whose defining sources use it ${best} times (yours: ${mine})${mine === best ? "; a tie leaves it to none" : ""}`); continue; }
    }
    kept.push(al);
  }
  const names = [audit.name, ...kept].map(norm);
  const sources = Array.isArray(audit.sources) ? audit.sources : [];
  const defining = [];
  for (const s of sources.filter((s) => (s.kind === "reference" || s.kind === "scholarly") && !isWikipedia(s))) {
    const t = sourceText(id, s.url);
    if (t == null) { unchecked.push(s.id); continue; }
    if (mentions(t, names)) defining.push(t);
    else problems.push(`source ${s.id} (${s.kind}) never names "${audit.name}"${aliases.length ? " or an alias" : ""}: a defining source has to discuss the ideology`);
  }
  // Primary texts. A text that names the ideology twice passes on its own. Any other passes if the
  // sources that discuss the ideology (defining sources, and primary texts that passed on their own;
  // never Wikipedia) name it by title twice between them. One mention may be in passing; a source
  // that never names the ideology can't vouch for a text (the World communism case).
  // Defining authors ("authors"): the ideology's own thinkers, as its defining sources name them. Each
  // must be named (by surname) at least twice in the defining sources and belong to no other
  // ideology's "authors". A primary text by one of them is tied to the ideology.
  const authorEntries = (Array.isArray(audit.authors) ? audit.authors : []).filter((x) => entryName(x).trim());
  const authorOk = [];
  for (const x of authorEntries) {
    const au = entryName(x), sur = authorKey(x);
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
    const heads = [...titleHeads(s.title), ...list(s.titles).map(norm).filter((h) => h.trim().split(" ").length >= 2)];
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
