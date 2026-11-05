// Source check for ideology audits (Brandon, 2026-11-05): the sources have to discuss the ideology.
//   - A defining source (kind "reference" or "scholarly") must contain the ideology's name or one of
//     its `aliases` in its saved text.
//   - A primary source ("primary" or "program") passes if its own text names the ideology twice, or if
//     the defining sources that passed name it twice by the head of its title (two words or more):
//     one mention may be in passing.
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
const titleHead = (t) => { const h = norm(String(t || "").split(/[,:;(\u2013\u2014]| - /)[0]); return h.trim().split(" ").length >= 2 ? h : null; };
// Wikipedia never defines an ideology (audits/AUDIT_RULES.md section 2): it can't be a defining source.
const isWikipedia = (s) => /(^|\.)wikipedia\.org$/.test((() => { try { return new URL(s.url).host; } catch { return ""; } })());
// An alias is a name, not an everyday word: several words, an -ism/-ist/-ian form, the eponym an
// "-ism" is named after ("Fortuyn" for "Fortuynism", "Mao" for "Maoism"), or a spelling variant of the
// name (same first six letters: "communisation" for "communization"). Be liberal with aliases: what
// the check exists to catch is a broader ideology's name ("communism" for World communism), and the
// uniqueness check stops that.
const isName = (al, name) => { const w = norm(al).trim().split(" "); if (w.length >= 2) return true;
  const flat = norm(name).trim().replace(/ /g, "");
  return /(isms?|ists?|ians?)$/.test(w[0]) || (w[0].length >= 3 && flat.startsWith(w[0])) || (w[0].length >= 6 && flat.slice(0, 6) === w[0].slice(0, 6)); };

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
  for (const s of sources.filter((s) => s.kind === "primary" || s.kind === "program")) {
    const t = sourceText(id, s.url);
    // Two-mentions floor (Brandon, 2026-11-05): a single mention may be in passing. A primary text
    // passes if it names the ideology twice, or if the (non-Wikipedia) defining sources name it by
    // title twice between them.
    if (t != null && mentionCount(t, names) >= 2) continue;
    // Named by its title in a defining source; an author's name alone isn't enough (a different book
    // by the same author would pass).
    const head = titleHead(s.title);
    const named = head && count(defining.join(" "), [head]) >= 2;
    if (named) continue;
    if (t == null && !defining.length) { unchecked.push(s.id); continue; }
    problems.push(`source ${s.id} (${s.kind}) doesn't name "${audit.name}" and the defining sources don't name it by title twice: it isn't tied to the ideology (cite its title as a defining source names it)`);
  }
  return { problems, unchecked };
}

module.exports = { check };
