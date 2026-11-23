// Coatrack check for ideology audits (audits/AUDIT_RULES.md, "No coatracks"; Brandon, 2026-11-05): the sources
// have to discuss the ideology, so another subject's sources can't answer for it. Run by validate.js. All of the
// check's logic lives here.
//   - A defining source (kind "reference" or "scholarly") must contain the ideology's name or one of
//     its `aliases` in its saved text.
//   - A primary source ("primary" or "program") passes if its own text names the ideology twice, or if
//     the sources that discuss the ideology (defining sources and primary texts that passed on their
//     own) name it twice by the head of its title (two words or more): one mention may be in passing.
//   - Wikipedia is never a defining source. An alias must be a name (a coined word counts), not an everyday word.
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
// A Wikipedia title without its trailing disambiguator ("Radical right (Europe)" -> "Radical right").
const plainName = (t) => String(t).replace(/\s*\([^)]*\)\s*$/, "").trim();

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
// Where a text names something: the [start, end) spans of every form of every name.
const spans = (text, names) => names.flatMap(forms).flatMap((f) => { const out = []; let i = -1;
  while ((i = text.indexOf(f, i + 1)) !== -1) out.push([i + 1, i + f.length - 1]); return out; });
// Two sets of names both named in the text, by phrases that don't overlap.
const separately = (text, a, b) => { const sb = spans(text, b);
  return spans(text, a).some(([s, e]) => sb.some(([s2, e2]) => e <= s2 || e2 <= s)); };
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
// "laïcité" for "laicism"), or a coined word: four letters or more and not in the English word list
// (Brandon, 2026-11-14: "Neoreaction" for Dark Enlightenment, "Ancap", "Radfem"; "Equality" and
// "Moderate" stay out). Be liberal with aliases: what
// the check exists to catch is a broader ideology's name ("communism" for World communism), and the
// uniqueness check stops that.
let english = null;
const isEnglish = (w) => {
  if (!english) english = new Set(fs.readFileSync(path.join(__dirname, "english-words.txt"), "utf8").split("\n").filter((x) => x && !x.startsWith("#")));
  return english.has(w);
};
const isCoined = (w) => /^[a-z]{4,}$/.test(w) && !isEnglish(w);
const isName = (al, name) => { const w = norm(al).trim().split(" "); if (w.length >= 2) return true;
  if (isCoined(w[0])) return true;
  const flat = norm(name).trim().replace(/ /g, "");
  // An acronym of the name's words ("TERF" for trans-exclusionary radical feminism).
  const initials = norm(name).trim().split(" ").map((x) => x[0]).join("");
  if (w[0].length >= 3 && (w[0] === initials || w[0] === initials + "s")) return true;
  return /(isms?|ists?|ians?)$/.test(w[0]) || (w[0].length >= 3 && flat.startsWith(w[0])) || (w[0].length >= 5 && flat.slice(0, 4) === w[0].slice(0, 4)); };

// Every ideology audit's name and aliases, normalized, for the uniqueness check.
// An alias, key figure or key work is a string (older audits) or carries its evidence:
// { "name" | "first" and "last" | "title": "...", "source": "s3", "quote": "verbatim passage from that source" }.
const entryName = (x) => (typeof x === "string" ? x : x && typeof x === "object"
  ? x.name || x.title || x.organisation || [x.first, x.last].filter(Boolean).join(" ") : "");
// The name a key figure is matched by: their last name ("last": "de Benoist", "bin Laden").
const figureKey = (x) => {
  if (x && typeof x === "object" && x.last) return norm(x.last);
  const w = entryName(x).trim().split(/\s+/);
  return norm(w[w.length - 1]);
};
const list = (v) => (Array.isArray(v) ? v : []).map(entryName).filter((n) => n && n.trim());

let taken = null;
const ownNames = new Map(); // normalized name -> ideologies whose own name it is
// normalized name -> ideologies whose Wikipedia article it redirects to. A redirect has one target (Brandon,
// 2026-11-06), so it is that ideology's other name, audited or not, and no other ideology's alias ("race realism"
// redirects to Scientific racism, "liberal theology" to Religious liberalism).
const redirectNames = new Map();
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
  // Every catalog entry's name is its own, audited or not (names are one to many, Brandon 2026-11-20).
  for (const e of lib.catalog()) { const k = norm(e.name); if (!ownNames.has(k)) ownNames.set(k, new Set()); ownNames.get(k).add(e.id); }
  // A title with a disambiguator ("Unionists (Ireland)") isn't the bare name ("Unionists"), so it isn't counted.
  for (const e of lib.catalog()) for (const t of lib.wikipediaOtherNames(e.id)) {
    if (plainName(t) !== t) continue;
    const k = norm(t); if (!redirectNames.has(k)) redirectNames.set(k, new Set()); redirectNames.get(k).add(e.id);
  }
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

let takenFigures = null, committed = null, reserved = null;
// The committed ideology audits' names, dates and key figures (tests pass their own list).
function profiles() {
  if (committed) return committed;
  committed = new Map();
  for (const f of fs.readdirSync(lib.PROFILES_DIR)) {
    if (!f.endsWith(".json")) continue;
    let a; try { a = JSON.parse(fs.readFileSync(path.join(lib.PROFILES_DIR, f), "utf8")); } catch { continue; }
    committed.set(f.slice(0, -5), { name: a.name, auditedAt: a.auditedAt, keyFigures: a.keyFigures });
  }
  return committed;
}
// The person each eponymous catalog ideology is named after, audited or not (audits/namesakes.json). The
// ideology reserves them as its key figure, so no other audit lists them only to lose them later
// (Brandon, 2026-11-21). Tests pass their own.
function namesakes() {
  if (reserved) return reserved;
  try { reserved = JSON.parse(fs.readFileSync(path.join(lib.ROOT, "audits", "namesakes.json"), "utf8")).namesakes || {}; } catch { reserved = {}; }
  return reserved;
}
function setProfilesForTests(map, names = null) { committed = map; reserved = names; takenFigures = null; }
// A person's name with its words in any order ("Mao Zedong", "Zedong Mao").
const personKey = (s) => norm(s).trim().split(" ").sort().join(" ");
// The audits that list each key figure.
function figuresTaken() {
  if (takenFigures) return takenFigures;
  takenFigures = new Map();
  for (const [id, a] of profiles()) for (const au of list(a.keyFigures)) {
    const k = personKey(au); if (!takenFigures.has(k)) takenFigures.set(k, new Set()); takenFigures.get(k).add(id);
  }
  return takenFigures;
}
// Whether key figure `x` is the reserved `person`: the same name in any word order, or the same surname and first
// initial ("Mohandas Gandhi" for "Mahatma Gandhi", "V. I. Lenin" for "Vladimir Lenin"; never Yuri Ivanov for
// Porfiry Ivanov). A numeral or Jr./Sr. is no surname: a regnal name ("Joseph II") counts only whole, never for
// John Paul II, and where both names give Jr. or Sr. they must agree.
const samePerson = (x, person) => {
  if (personKey(entryName(x)) === personKey(person)) return true;
  const a = norm(entryName(x)).trim().split(" "), b = norm(person).trim().split(" ");
  const gen = (w) => (w.length > 1 && /^([ivxl]+|jr|sr)$/.test(w[w.length - 1]) ? w.pop() : null);
  const ga = gen(a), gb = gen(b);
  if ([ga, gb].some((g) => g && /^[ivxl]+$/.test(g)) || (ga && gb && ga !== gb)) return false;
  return a.length >= 2 && b.length >= 2 && a[a.length - 1] === b[b.length - 1] && a[0][0] === b[0][0];
};
// The ideology named after a person, which takes them as a key figure before any other (Brandon,
// 2026-11-21: democratic centralism had listed Lenin first, so Leninism couldn't): one word, the surname
// (a final "e" dropped: de Gaulle, Gaullism) plus "-ism" or "-ianism". Stricter than isEponym, which also
// matches first names and word beginnings (Otto Bauer and Ottomanism, Mill and Millenarianism). A bare name
// ("Marcus Garvey") counts by its last word: eponyms reserved their namesakes that way (Brandon, 2026-11-21).
const namesakeOf = (x, name) => {
  const last = typeof x === "string" ? x.trim().split(/\s+/).pop() : x && typeof x === "object" ? x.last : null;
  if (!last) return false;
  const n = norm(name).trim(), w = norm(last).trim().split(" ").pop();
  return !n.includes(" ") && w.length >= 3 && [w, w.replace(/e$/, "")].some((st) => n === `${st}ism` || n === `${st}ianism`);
};
// Whether key figure `x` is the person ideology `id` is named after: its audits/namesakes.json entry (which also
// covers given names and other forms: Kemalism, "Xi Jinping Thought"), or for an ideology without one, the
// surname rule above.
const isNamesake = (x, id, name) => (namesakes()[id] ? samePerson(x, namesakes()[id]) : namesakeOf(x, name));
// The ideologies audits/namesakes.json reserves key figure `x` for.
const reservedFor = (x) => Object.entries(namesakes()).filter(([, person]) => samePerson(x, person)).map(([o]) => o);
const ideologyName = (o) => (profiles().get(o) || {}).name || (lib.catalog().find((e) => e.id === o) || {}).name;

// Why an alias is another name for the ideology (Brandon, 2026-11-20): every alias gives one "reason", and each is
// checked here.
//   REDIRECT     a Wikipedia redirect to the ideology's article (resolve-articles.js otherNames); needs no quote.
//   SUPPORTED    a source says they are the same: the quote names both the alias and the ideology. Acronyms go here,
//                found by looking the acronym up ("TERF" in a dictionary): initials alone can mean several things.
//                Not a name Wikipedia files under another topic (aliasPage below).
//   TRANSLATION  the name in another language, or its romanization, as Wikipedia gives it: the title of the article's
//                language link in that language, or a name the article's lead or infobox tags with a language
//                ("Chinese: 新儒家; pinyin: Xīn Rújiā"). Needs no quote (Brandon, 2026-11-21).
//   SPELLING     the same name spelled differently: s/z, case, accents, spacing and hyphens aside, at most two letters
//                differ and the ending is the same ("Austro-Marxism", "communisation"), or the same words reordered
//                ("Jihadi-Salafism"). Not a name Wikipedia files under another topic (aliasPage below): "modern liberalism"
//                is two letters off "Modern U.S. liberalism" but a disambiguation page. A word form ("Bolshevik", "Gaullist") or another name is a REDIRECT, or SUPPORTED.
//   EPONYM       the person the "-ism" is named after ("Fortuyn" for Fortuynism).
const ALIAS_REASONS = ["REDIRECT", "SUPPORTED", "TRANSLATION", "SPELLING", "EPONYM"];

// Where Wikipedia files a SUPPORTED, TRANSLATION or SPELLING alias. A name Wikipedia gives to another topic (its own article, a disambiguation
// page, a redirect to another article or to a section of one) would bring that topic's sources in with it ("Committee of
// Union and Progress", "counterculture", "radical left"), so it isn't this ideology's alias (Brandon, 2026-11-21). A
// redirect to the ideology's own article, a section of it included, is fine; a name with no page at all is too.
// validate.js fetches the lookup first (prefetchAliasPages); check() reads it from the cache and skips one not fetched.
const aliasPageUrl = (al) => require("./wiki").apiUrl({ action: "query", titles: al, redirects: "1", prop: "pageprops", ppprop: "disambiguation" });
let aliasPagesForTests = null;
function setAliasPagesForTests(map) { aliasPagesForTests = map; }
const isSupported = (x) => x && typeof x === "object" && (x.reason === "SUPPORTED" || x.reason === undefined);
const isTranslation = (x) => x && typeof x === "object" && x.reason === "TRANSLATION";
const isSpellingAlias = (x) => x && typeof x === "object" && x.reason === "SPELLING";
const pageChecked = (x) => isSupported(x) || isTranslation(x) || isSpellingAlias(x);
const langLinksUrl = (title) => require("./wiki").apiUrl({ action: "query", titles: title, prop: "langlinks", lllimit: "max", redirects: "1" });
async function prefetchAliasPages(id, audit) {
  const aliases = Array.isArray(audit && audit.aliases) ? audit.aliases : [];
  for (const x of aliases) if (pageChecked(x)) await lib.cachedJson(aliasPageUrl(entryName(x)));
  const own = lib.articleTitle({ id });
  if (own && aliases.some(isTranslation)) { await lib.cachedJson(langLinksUrl(own)); await lib.fetchArticle({ id }); }
}
// The ideology's names in other languages on Wikipedia: its article's language links, and the names its lead (the
// infobox included) tags with a language, romanizations among them (lang="zh-Latn", "he-Latn"). null if not fetched.
let translationNamesForTests = null;
function setTranslationNamesForTests(map) { translationNamesForTests = map; }
function translationNames(id) {
  if (translationNamesForTests) return translationNamesForTests[id] || [];
  const own = lib.articleTitle({ id }), f = own && require("./fetch").cacheFile(langLinksUrl(own)), html = lib.articleHtml({ id });
  if (!f || !fs.existsSync(f) || !html) return null;
  const q = JSON.parse(fs.readFileSync(f, "utf8")), page = q && q.query && (q.query.pages || [])[0];
  const links = ((page && page.langlinks) || []).map((l) => plainName(l.title));
  const lead = html.split(/<h2|<div class="mw-heading mw-heading2/)[0];
  const tagged = [...lead.matchAll(/<(i|span|b|bdi)\b[^>]*\blang="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)]
    .filter((m) => !/fonipa/.test(m[2]) && !/^en\b/.test(m[2])).map((m) => require("./wiki").htmlToText(m[3]).trim()).filter(Boolean);
  return [...links, ...tagged];
}
// Any script; marks, apostrophes and spacing aside, at most two letters differ and the ending is the same (isSpelling).
const flatAny = (t) => String(t).replace(/ß/g, "ss").normalize("NFKD").replace(/\p{M}|\p{Lm}/gu, "").toLowerCase().replace(/ı/g, "i").replace(/[^\p{L}\p{N}]+/gu, "");
const sameTranslation = (al, n) => { const a = flatAny(al), b = flatAny(n); return !!a && !!b && (a === b || (lev(a, b) <= 2 && a.slice(-3) === b.slice(-3))); };
// null: not fetched or no page; otherwise { title, fragment, redirected, disambiguation }.
function aliasPage(al) {
  let q;
  if (aliasPagesForTests) q = aliasPagesForTests[al];
  else { const f = require("./fetch").cacheFile(aliasPageUrl(al)); if (!fs.existsSync(f)) return null; q = JSON.parse(fs.readFileSync(f, "utf8")); }
  const page = q && q.query && (q.query.pages || [])[0];
  if (!page || page.missing || page.invalid) return null;
  const redirects = q.query.redirects || [], last = redirects[redirects.length - 1];
  return { title: page.title, fragment: (last && last.tofragment) || "", redirected: !!last, disambiguation: !!(page.pageprops && "disambiguation" in page.pageprops) };
}
function aliasPageProblem(id, al) {
  const p = aliasPage(al), own = lib.articleTitle({ id });
  if (!p || (!p.disambiguation && own && p.title === own)) return null;
  const where = p.disambiguation ? `a disambiguation page ("${p.title}")` : p.redirected ? `a redirect to "${p.title}${p.fragment ? "#" + p.fragment : ""}"` : "its own article";
  return `alias "${al}": Wikipedia files it as ${where}, another topic than "${own}", so it isn't this ideology's other name`;
}
const lev = (x, y) => { const d = Array.from({ length: x.length + 1 }, (_, i) => [i]); for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return d[x.length][y.length]; };
const isSpelling = (al, name) => {
  const flat = (t) => norm(t).trim().replace(/ /g, "").replace(/z/g, "s");
  const a = flat(al), n = flat(name);
  // A word form isn't a spelling ("Bolshevik" for Bolshevism, "gaullista", "Austromarxismus"): the ending stays the same.
  // Word forms and other names come in as Wikipedia redirects (Brandon, 2026-11-20).
  if (lev(a, n) <= 2 && a.slice(-3) === n.slice(-3)) return true;
  // Reordered: the same letters, and the same word starts ("jihadi salafism" / "salafi jihadism").
  const sorted = (t) => [...t].sort().join(""), starts = (t) => norm(t).trim().split(" ").map((w) => w.slice(0, 4)).sort().join(" ");
  return sorted(a) === sorted(n) && starts(al) === starts(name);
};
// An EPONYM alias is a proper name (its words capitalised, none an "-ism" form: not "Burkean conservatism") that the
// ideology's one-word name is built from ("Strasser" for Strasserism).
const isEponymAlias = (al, name) => {
  const ws = String(al).trim().split(/\s+/);
  if (norm(al).trim().split(" ").some((w) => /(ism|isme|ismo|ismus|ist|ian)$/.test(w))) return false;
  if (!ws.every((w) => w.length < 3 || /^\p{Lu}/u.test(w))) return false;
  const n = norm(al).trim().split(" ");
  return isEponym({ first: n[0], last: n[n.length - 1] }, name);
};
// An eponym: the ideology is named after this person ("Klaus" for Klausism, "Sankara" for Sankarism,
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

// Evidence for an alias, key figure or key work: the cited source is in the audit, its saved copy contains the
// quote, and the quote contains the name (in one of its forms). `strict` audits must give evidence.
function evidence(id, audit, field, x, strict, contains) {
  const label = `${field} "${entryName(x)}"`;
  // A bare name (older audits: a string, or a key figure moved over from "authors" with only a role and article).
  if (typeof x === "string" || (x && typeof x === "object" && x.source === undefined && x.quote === undefined)) return strict ? [`${label} needs evidence: { ${field === "key work" ? "\"title\"" : field === "key figure" ? "\"first\", \"last\"" : "\"name\""}, "source", "quote" }`] : [];
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

// `pass`: the audit is a pass's draft (validate.js --dir) or checked as one (--as-current), not a committed audit.
function check(id, full, { strict = false, pass = false } = {}) {
  const problems = [], unchecked = [], warnings = [];
  // A source cited only on talk pages (reviewHistory) or as the reason for a nulling documents a replaced version,
  // often the very source it was replaced for (Wikipedia, another subject's text): it isn't evidence of a current
  // position, so the check skips it.
  const citedNow = new Set([
    ...Object.values(full.answers || {}).flatMap((x) => (x && x.value !== null && Array.isArray(x.sources) ? x.sources : [])),
    ...(Array.isArray(full.missingStatements) ? full.missingStatements : []).flatMap((m) => [...(m.sources || []), ...(m.quotes || []).map((q) => q.source)]),
    ...["aliases", "keyFigures", "keyWorks"].flatMap((k) => (Array.isArray(full[k]) ? full[k] : []).flatMap((x) => (x ? [x.source, x.work] : []))),
  ].filter(Boolean));
  const historyOnly = new Set(Object.values(full.answers || {}).flatMap((x) => (x && Array.isArray(x.reviewHistory) ? x.reviewHistory : []))
    .flatMap((e) => (e && Array.isArray(e.sources) ? e.sources : [])).filter((sid) => !citedNow.has(sid)));
  const audit = historyOnly.size ? { ...full, sources: (full.sources || []).filter((s) => !historyOnly.has(s.id)) } : full;
  if (audit.aliases !== undefined && (!Array.isArray(audit.aliases) || audit.aliases.some((x) => !entryName(x).trim()))) {
    problems.push('"aliases" must be a list of names (use [] for none)');
  }
  // Each alias gives its "reason" (ALIAS_REASONS above). A SUPPORTED alias's quote names both the alias and the
  // ideology itself, so the source is seen equating them ("'trans-exclusionary radical feminism', or TERFism")
  // (Brandon, 2026-11-05: traceability). Audits older than the field are held to that for every alias.
  // A name Wikipedia redirects to the article is already connected by the redirect (Brandon, 2026-11-20), so a quote
  // may name the subject by any of those names (a renamed entry's old name among them).
  const ideologyNames = [audit.name, plainName(audit.name), ...lib.wikipediaOtherNames(id).map(plainName)];
  for (const x of Array.isArray(audit.aliases) ? audit.aliases : []) {
    // Wikidata no longer connects an alias (Brandon, 2026-11-14: a poor source; of the 17 it connected, Wikipedia sent two
    // elsewhere and seven were labeled redirects anyway). Its "wikidata": true marker is refused, so an alias needs a quote.
    if (x && typeof x === "object" && "wikidata" in x) problems.push(`alias "${entryName(x)}": Wikidata no longer connects aliases; give a source and quote`);
    if (!x || typeof x !== "object") { problems.push(...evidence(id, audit, "alias", x, strict, (q) => mentions(q, [norm(entryName(x))]))); continue; }
    const al = entryName(x), reason = x.reason;
    if ("type" in x) problems.push(`alias "${al}": "type" is replaced by "reason" (${ALIAS_REASONS.join(", ")})`);
    if (reason !== undefined && !ALIAS_REASONS.includes(reason)) { problems.push(`alias "${al}": "reason" must be one of ${ALIAS_REASONS.join(", ")}`); continue; }
    if (reason === undefined && strict) problems.push(`alias "${al}" needs a "reason": one of ${ALIAS_REASONS.join(", ")}`);
    if (reason === "TRANSLATION") {
      const names = translationNames(id);
      if (names && !names.some((n) => sameTranslation(al, n)))
        problems.push(`alias "${al}": not a name Wikipedia gives the ideology in another language (a language link of "${lib.articleTitle({ id })}", or a name its lead tags with a language), so it isn't a TRANSLATION`);
      const pr = aliasPageProblem(id, al); if (pr) problems.push(pr);
      continue;
    }
    if (reason === "REDIRECT") {
      if (!lib.wikipediaOtherNames(id).some((t) => norm(plainName(t)) === norm(al)))
        problems.push(`alias "${al}": not a Wikipedia redirect to the ideology's article (scripts/resolve-articles.js otherNames)`);
      continue;
    }
    problems.push(...evidence(id, audit, "alias", x, strict, (q) => mentions(q, [norm(al)])));
    if (reason === "SPELLING" && !ideologyNames.some((n) => isSpelling(al, n)))
      problems.push(`alias "${al}": not a spelling of "${audit.name}" (more than two letters differ); give a source saying they are the same (SUPPORTED)`);
    if (reason === "EPONYM" && !isEponymAlias(al, plainName(audit.name))) {
      problems.push(`alias "${al}": "${audit.name}" isn't named after it (EPONYM is for the person an "-ism" is named after)`); }
    // The quote names the alias and the ideology as separate phrases: "Keywords: Brazilian Integralist Action" names only
    // the party, and "the Tea Party movement" never says "Tea Party" is another name, while "the Tea Party movement, or
    // the Tea Party" does (Brandon, 2026-11-20: a supported name has to be supported).
    if ((reason === "SUPPORTED" || reason === undefined) && typeof x.quote === "string" && !separately(norm(x.quote), [norm(al)], ideologyNames.map(norm)))
      problems.push(`alias "${al}": its quote doesn't name "${audit.name}" and the alias as separate phrases, so it doesn't show the source equating them`);
    if (isSupported(x) || isSpellingAlias(x)) { const pr = aliasPageProblem(id, al); if (pr) problems.push(pr); }
  }
  for (const x of Array.isArray(audit.keyFigures) ? audit.keyFigures : []) {
    const key = figureKey(x);
    if (x && typeof x === "object" && x.organisation) { problems.push(`key figure "${x.organisation}": an organisation isn't a key figure; list its texts in "keyWorks"`); continue; }
    if (strict && typeof x === "object" && !x.last) problems.push(`key figure "${entryName(x)}" needs "last" (and "first" unless they go by one name: Plato)`);
    // The person audits/namesakes.json names the ideology after needs no quote: that record is the evidence
    // (Brandon, 2026-11-21: Xi Jinping for Xi Jinping Thought).
    if (namesakes()[id] && typeof x === "object" && samePerson(x, namesakes()[id])) continue;
    problems.push(...evidence(id, audit, "key figure", x, strict, (q) => q.includes(key)));
  }
  for (const x of Array.isArray(audit.keyWorks) ? audit.keyWorks : []) {
    problems.push(...evidence(id, audit, "key work", x, strict, (q) => q.includes(norm(entryName(x)))));
  }
  // Eponymous key figures' names count as names of the ideology (as its last name: "Klaus", "Bukharin").
  // The name it is built from, which may be the first (Saddam for Saddamism).
  const eponyms = (Array.isArray(audit.keyFigures) ? audit.keyFigures : []).filter((x) => isEponym(x, audit.name))
    .map((x) => [x.last, x.first].find((w) => w && isEponym({ last: w }, audit.name)));
  const aliases = [...list(audit.aliases), ...eponyms];
  for (const al of aliases) if (typeof al === "string" && al.trim() && !isName(al, audit.name)) problems.push(`alias "${al}" is an everyday word, not a name (use several words, an -ism/-ist/-ian form, a coined word, or a spelling variant of the name)`);
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
    const redirectOf = (redirectNames.get(k) || new Set()).has(id) ? [] : [...(redirectNames.get(k) || [])];
    if (redirectOf.length) { problems.push(`alias "${al}" is a Wikipedia redirect to the article of ${redirectOf.join(", ")}, so it is that ideology's other name`); continue; }
    const rivals = [...(namesTaken().get(k) || [])].filter((o) => o !== id);
    if (rivals.length) {
      const mine = usage(id, k), best = Math.max(...rivals.map((o) => usage(o, k)));
      if (mine <= best) { problems.push(`alias "${al}" belongs to ${rivals.filter((o) => usage(o, k) === best).join(", ")}, whose defining sources use it ${best} times (yours: ${mine})${mine === best ? "; a tie leaves it to none" : ""}`); continue; }
    }
    kept.push(al);
  }
  // Other names Wikipedia files as redirects to this ideology's article are aliases automatically, one to one
  // (Brandon, 2026-11-06: "Leftism", "Leftist" for left-wing politics). One that is an everyday word, the name of
  // another ideology or an alias another audit claims is simply left out.
  for (const raw of lib.wikipediaOtherNames(id)) {
    const al = plainName(raw), k = norm(al);
    if (!al || k === norm(audit.name) || kept.some((x) => norm(x) === k) || !isName(al, audit.name)) continue;
    if ([...(ownNames.get(k) || [])].some((o) => o !== id) || [...(namesTaken().get(k) || [])].some((o) => o !== id)) continue;
    kept.push(al);
  }
  // The name without Wikipedia's disambiguator ("Jacobin (politics)" is written "Jacobin"), as for other names above.
  const names = [...new Set([audit.name, plainName(audit.name), ...kept])].map(norm);
  // A source only past answers cite (reviewHistory, the talk page) stays listed so those entries keep their meaning
  // and its id isn't reused, but it supports nothing current, so it isn't checked and can't vouch for another text
  // (Brandon, 2026-11-21: Savarkar's Essentials of Hindutva in Akhand Bharat, kept after its answers were nulled).
  const cited = (o, where, inHistory, acc) => {
    if (Array.isArray(o)) { o.forEach((x, i) => cited(x, `${where}[${i}]`, inHistory, acc)); return acc; }
    if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
      if (k === "reviewHistory") cited(v, where, true, acc);
      else if (k === "sources" || k === "source") for (const sid of [v].flat()) {
        if (typeof sid !== "string") continue;
        if (inHistory) acc.past.add(sid); else (acc.now[sid] = acc.now[sid] || new Set()).add(where);
      }
      else cited(v, where ? `${where}.${k}` : k, inHistory, acc);
    }
    return acc;
  };
  const use = cited({ ...audit, sources: undefined }, "", false, { now: {}, past: new Set() });
  // Where a failing source is still cited: if nothing current should rest on it, citing it only in history is the fix.
  const citedBy = (sid) => use.now[sid] ? `; it is cited by ${[...use.now[sid]].slice(0, 4).join(", ")}${use.now[sid].size > 4 ? ` and ${use.now[sid].size - 4} more` : ""}: if none of these should rest on it, stop citing it there and keep it listed for the answer histories that cite it` : "";
  const sources = (Array.isArray(audit.sources) ? audit.sources : []).filter((s) => !(use.past.has(s.id) && !use.now[s.id]));
  // A source may discuss the ideology under another name: an alias the audit doesn't list yet (Brandon, 2026-11-21).
  const ALIAS_HINT = `; if it names the ideology another way, list that name in "aliases" with its reason (${ALIAS_REASONS.join(", ")}) and quote, as audits/PROMPT.md says`;
  const defining = [];
  for (const s of sources.filter((s) => (s.kind === "reference" || s.kind === "scholarly") && !isWikipedia(s))) {
    const t = sourceText(id, s.url);
    if (t == null) { unchecked.push(s.id); continue; }
    if (mentions(t, names)) defining.push(t);
    else problems.push(`source ${s.id} (${s.kind}) never names "${audit.name}"${aliases.length ? " or an alias" : ""}: a defining source has to discuss the ideology${ALIAS_HINT}${citedBy(s.id)}`);
  }
  // Primary texts. A text that names the ideology twice passes on its own. Any other passes if the
  // sources that discuss the ideology (defining sources, and primary texts that passed on their own;
  // never Wikipedia) name it by title twice between them. One mention may be in passing; a source
  // that never names the ideology can't vouch for a text (the World communism case).
  // Key figures ("keyFigures"): the ideology's own thinkers, as its defining sources name them. Each
  // must be named (by surname) at least twice in the defining sources and belong to no other
  // ideology's "keyFigures". A primary text by one of them is tied to the ideology.
  // Settled, don't reopen (Brandon, 2026-11-21): this ties every text a listed key figure wrote, including works
  // outside the ideology. Across all audits 208 texts are tied only this way; outside ideologies named after
  // a person, 181 of them aren't named by title in the defining sources, so no narrower tie a script can
  // check would separate off-topic texts from their core ones. Whether a text speaks for the ideology
  // is the auditor's call in each pass; no rule for it.
  const figureEntries = (Array.isArray(audit.keyFigures) ? audit.keyFigures : []).filter((x) => entryName(x).trim() && !(x && x.organisation));
  const figuresOk = [];
  for (const x of figureEntries) {
    const au = entryName(x), sur = figureKey(x);
    const others = [...(figuresTaken().get(personKey(au)) || [])].filter((o) => o !== id);
    const reserving = reservedFor(x).filter((o) => o !== id);
    // The ideology named after the key figure lists them whatever others do; another that lists them too is an
    // error at once, committed or not (Brandon, 2026-11-21: remove the duplicates even if it breaks older audits).
    if ((others.length || reserving.length) && !isNamesake(x, id, audit.name)) {
      const owner = reserving[0] || others.find((o) => isNamesake(x, o, ideologyName(o)));
      problems.push(owner
        ? `key figure "${au}" belongs to ${owner}, the ideology named after them, which reserves them: take them out of "keyFigures" and tie their texts here another way (by title, in "keyWorks")`
        : `key figure "${au}" is also a key figure of ${others.join(", ")}`);
      continue;
    }
    if (count(defining.join(" "), [sur]) < 2) { problems.push(`key figure "${au}" is named fewer than twice in the defining sources`); continue; }
    figuresOk.push(sur);
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
    // The titles the sources that discuss the ideology use for the text: its key works ("keyWorks") whose "work" is it
    // ("Hatt-ı Hümayun" for the Rescript of Reform).
    const titles = (Array.isArray(audit.keyWorks) ? audit.keyWorks : []).filter((w) => w && w.work === s.id);
    const heads = [...titleHeads(s.title), ...list(titles).map(norm).filter((h) => h.trim().split(" ").length >= 2)];
    const own = t || "";
    const others = vouching.filter((v) => v !== own).join(" ");
    const named = heads.some((h) => count(others, [h]) >= 2);
    if (named) continue;
    // A key figure's text: its author is one the audit lists in "keyFigures" (see above).
    if (figuresOk.length && s.author && figuresOk.some((sur) => norm(s.author).includes(sur))) continue;
    // No saved copy: it can't be judged either way. New audits must save every source, and validate.js
    // makes an unchecked source an error for them.
    if (t == null) { unchecked.push(s.id); continue; }
    // The message names all three ways to tie a primary text, each with its evidence (audits/PROMPT.md);
    // Brandon, 2026-11-21.
    problems.push(`source ${s.id} (${s.kind}) doesn't name "${audit.name}" twice, and the sources that discuss it don't name it by title twice: it isn't tied to the ideology. Tie it one of three ways, each with a quote, as audits/PROMPT.md says: the title those sources use for it (in "keyWorks", with "work": "${s.id}"); another name for the ideology that the text uses (in "aliases", with its reason: ${ALIAS_REASONS.join(", ")}); or its author, listed as a key figure (in "keyFigures"), if the defining sources present the ideology as that person's body of thought and name them at least twice${citedBy(s.id)}`);
  }
  return { problems, unchecked, warnings };
}

module.exports = { setProfilesForTests, setAliasPagesForTests, setTranslationNamesForTests, translationNames, sameTranslation, prefetchAliasPages, aliasPage, namesakeOf, isNamesake, check, norm, separately, forms, mentions, sourceText, isWikipedia, isName, namesTaken, isSpelling, isEponym, isEponymAlias, ALIAS_REASONS, plainName };
