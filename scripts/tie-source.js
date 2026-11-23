#!/usr/bin/env node
// For auditors: look for a way to tie a source to the subject before dropping it (validate.js's "isn't tied to the
// ideology" error). Brandon, 2026-11-23: drop-source.js runs this first, so a source isn't dropped while a tie is there
// to be found.
//   node scripts/tie-source.js <id> <source id> [--people] [--dir <folder>]
// Searches, by every name of the subject (its name, its aliases, Wikipedia's other names for it and an eponymous key
// figure's surname, each in its word forms: "Trotskyism|Trotskyist|Trotskyite|Bolshevik-Leninism|Trotsky ..."):
//   1. the source's own saved copy: where it names the subject (twice ties it; once may point to an alias to list);
//   2. every page saved for this audit (scratchpad/sources/<id>/) and the local text corpora (maintainer reference
//      books, Marxists Internet Archive, Gutenberg): passages that name the source (its title or author) near a name
//      of the subject. Such a passage, cited as a source, ties the text by title ("keyWorks") or by author;
//   3. the defining sources: how often they name the source's author (a key figure needs two mentions).
// It lists what it finds, with quotes; whether a passage really ties the text is the auditor's call.
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const os = require("os");
const lib = require("./lib");
const ct = require("./coatrack-check");

const CORPORA = path.join(os.homedir(), ".cache", "political-ideology-atlas", "corpora");
const CORPUS_DIRS = ["reference/text", "marxists/text", "gutenberg/raw/books"].map((d) => path.join(CORPORA, d)).filter((d) => fs.existsSync(d));
const NEAR = 400, MAX_PER_PLACE = 8;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A name as a pattern on raw text: whole words, any spacing or hyphen between its words, in its word forms.
const pattern = (names) => {
  const alts = [...new Set(names.flatMap((n) => ct.forms(n).map((f) => f.trim())))].filter(Boolean)
    .sort((x, y) => y.length - x.length).map((f) => f.split(/\s+/).map(esc).join("[\\s\\-‐-―]+"));
  return alts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
};
const snippet = (t, i, j) => t.slice(Math.max(0, i - 160), Math.min(t.length, j + 160)).replace(/\s+/g, " ").trim();

function subjectNames(id, a) {
  const plain = (n) => ct.norm(n).trim();
  const names = [a.name, ct.plainName(a.name), ...(Array.isArray(a.aliases) ? a.aliases : []).map((x) => (typeof x === "string" ? x : x && (x.alias || x.name)))];
  for (const raw of lib.wikipediaOtherNames ? lib.wikipediaOtherNames(id) : []) names.push(ct.plainName(raw));
  const eponyms = (Array.isArray(a.keyFigures) ? a.keyFigures : []).filter((x) => x && x.last && ct.isEponym(x, a.name)).map((x) => plain(x.last));
  return { names: [...new Set([...names, ...eponyms].filter((n) => n && plain(n)).map(plain))], eponyms };
}

function findTies(id, sid, { people = false, dir = null } = {}) {
  const file = dir ? path.resolve(dir, `${id}.json`) : (people ? lib.personPath : lib.profilePath)(id);
  const a = JSON.parse(fs.readFileSync(file, "utf8"));
  const src = (a.sources || []).find((s) => s.id === sid);
  if (!src) throw new Error(`${id} has no source ${sid}`);
  // An eponym's surname counts in the source's own copy, as in the coatrack check; elsewhere it mostly names the person
  // (every page of the Trotsky Internet Archive says "Leon Trotsky"), so passages need a name of the ideology itself.
  const { names, eponyms } = subjectNames(id, a), selfRe = pattern(names);
  const subjectRe = pattern(names.filter((n) => !eponyms.includes(n)));
  // The source's names: title heads and author, written out (initials only in this audit's own pages: in a whole
  // corpus "ISO" is mostly something else).
  const srcNames = ct.sourceNames(src).map((n) => n.trim());
  const longNames = srcNames.filter((n) => n.includes(" "));
  const out = { names, srcNames, self: [], passages: [], author: null };

  // 1. The source's own copy.
  const libDir = path.join(lib.ROOT, "scratchpad", "sources", id);
  let index = [];
  try { const j = JSON.parse(fs.readFileSync(path.join(libDir, "index.json"), "utf8")); index = Array.isArray(j) ? j : j.files || []; } catch {}
  const sameUrl = (u, v) => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") === String(v || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
  for (const it of index.filter((it) => it && it.file && sameUrl(it.url, src.url))) {
    const t = read(path.join(libDir, it.file));
    for (const m of t.matchAll(selfRe)) out.self.push({ where: path.join("scratchpad/sources", id, it.file), name: m[0], quote: snippet(t, m.index, m.index + m[0].length) });
  }

  // 2. Passages naming the source near a name of the subject.
  const nearHits = (t, srcRe) => {
    const hits = [];
    for (const m of t.matchAll(srcRe)) {
      const lo = Math.max(0, m.index - NEAR), hi = Math.min(t.length, m.index + m[0].length + NEAR);
      if (!subjectRe) break;
      subjectRe.lastIndex = 0;
      const window = t.slice(lo, hi), s = subjectRe.exec(window);
      if (s) hits.push({ quote: snippet(t, Math.min(m.index, lo + s.index), Math.max(m.index + m[0].length, lo + s.index + s[0].length)), source: m[0], subject: s[0] });
      if (hits.length >= 2) break;
    }
    return hits;
  };
  const ownRe = pattern(srcNames), longRe = pattern(longNames);
  for (const it of index.filter((it) => it && it.file && !sameUrl(it.url, src.url))) {
    const t = read(path.join(libDir, it.file));
    for (const h of ownRe ? nearHits(t, ownRe) : []) out.passages.push({ where: path.join("scratchpad/sources", id, it.file), url: it.url, ...h });
  }
  if (longRe && CORPUS_DIRS.length) {
    // grep finds the files that name the source at all; the window check runs only on those.
    const files = new Set();
    for (const n of longNames) {
      const r = cp.spawnSync("grep", ["-rliF", "--include=*.txt", n, ...CORPUS_DIRS], { encoding: "utf8", maxBuffer: 1 << 26 });
      for (const f of (r.stdout || "").split("\n").filter(Boolean).slice(0, 3000)) files.add(f);
    }
    let found = 0;
    for (const f of files) {
      const hits = nearHits(read(f), longRe);
      for (const h of hits) out.passages.push({ where: path.relative(os.homedir(), f).replace(/^/, "~/"), ...h });
      if ((found += hits.length) >= 40) break;
    }
  }

  // 3. A person author in the defining sources (reference and scholarly works, never Wikipedia). An organisation isn't
  // a key figure.
  const au = String(src.author || "").replace(/\([^)]*\)/g, " ").trim(), sur = au.split(/\s+/).pop();
  const ORG = /\b(party|organi[sz]ation|international|league|committee|union|movement|group|congress|front|council|association|federation|society|institute|press|foundation|government|ministry|alliance|network|cent(er|re)|club|bund|order|brotherhood|army|church|forum|campaign|initiative|wikipedia|contributors|editors|britannica)\b/i;
  if (sur && sur.length > 2 && au.split(/\s+/).length <= 4 && !ORG.test(au)) {
    const defining = (a.sources || []).filter((s) => (s.kind === "reference" || s.kind === "scholarly") && !ct.isWikipedia(s));
    let n = 0;
    for (const s of defining) { const t = ct.sourceText(id, s.url); if (t) n += (t.match(new RegExp(` ${esc(ct.norm(sur).trim())} `, "g")) || []).length; }
    out.author = { name: au, surname: sur, definingMentions: n, listed: (a.keyFigures || []).some((x) => x && ct.norm(x.last || "").trim() === ct.norm(sur).trim()) };
  }
  return out;
}

// What a run found that could tie the source, for drop-source.js: its own copy naming the subject, or a passage.
const candidates = (r) => r.self.length + r.passages.length;

function report(r, sid) {
  const lines = [`Names searched for the subject: ${r.names.join(" | ")}`, `Names of ${sid}: ${r.srcNames.join(" | ")}`];
  lines.push(r.self.length ? `\n${sid}'s own copy names the subject ${r.self.length} time(s) (twice ties it; a name not yet in "aliases" may belong there, with its reason and quote):`
    : `\n${sid}'s own copy never names the subject.`);
  for (const h of r.self.slice(0, MAX_PER_PLACE)) lines.push(`  "${h.name}" (${h.where}): ...${h.quote}...`);
  const own = r.passages.filter((p) => p.where.startsWith("scratchpad/")), corp = r.passages.filter((p) => !p.where.startsWith("scratchpad/"));
  lines.push(own.length ? `\nPages saved for this audit that name ${sid} near the subject (cite one as a defining source and add the tie with its quote, as audits/PROMPT.md says):` : `\nNo page saved for this audit names ${sid} near the subject.`);
  for (const p of own.slice(0, MAX_PER_PLACE)) lines.push(`  ${p.where} (${p.url}): ...${p.quote}...`);
  lines.push(corp.length ? `\nLocal corpora passages that name ${sid} near the subject (read the passage: a tie only if it is about this text):` : `\nNo local corpus passage names ${sid} near the subject.`);
  for (const p of corp.slice(0, MAX_PER_PLACE)) lines.push(`  ${p.where}: ...${p.quote}...`);
  if (r.author) lines.push(`\nAuthor ${r.author.name}: named ${r.author.definingMentions} time(s) in the defining sources${r.author.listed ? "; already a key figure" : ""} (a key figure needs 2, and defining sources that present the ideology as their body of thought).`);
  return lines.join("\n");
}

module.exports = { findTies, candidates, report };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i > -1 ? args.splice(i, 2)[1] : null; };
  const dir = opt("--dir"), people = args.includes("--people");
  const [id, sid] = args.filter((x) => x !== "--people");
  if (!id || !sid) { console.error("usage: node scripts/tie-source.js <id> <source id> [--people] [--dir <folder>]"); process.exit(1); }
  console.log(report(findTies(id, sid, { people, dir }), sid));
}
