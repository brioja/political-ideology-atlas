// Shared helpers for the audit scripts.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PROFILES_DIR = path.join(ROOT, "audits", "profiles");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
// English Wikipedia views are summed over 12 full months ending in an odd-numbered month (Jan, Mar,
// ... Nov), so the period moves every two months, not monthly: a new period refetches views for
// everyone (hours for the people candidates), and a month's shift barely changes anyone's rank.
function viewsPeriod(now = new Date()) {
  let end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)); // last full month
  if ((end.getUTCMonth() + 1) % 2 === 0) end = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  return { start, end, ymd, label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}` };
}
const allStatements = () => readJson(path.join(ROOT, "statements.json")).statements;
// Candidates are answered by audits but not asked in the test until they carry signal on the real
// lines (audits/statements/STANDARD.md test 2, scripts/statement-signal.js).
const isCandidate = (s) => s.status === "candidate";
const activeStatements = () => allStatements().filter((s) => !isCandidate(s));
const catalog = () => readJson(path.join(ROOT, "audits", "catalog.json")).ideologies;

// Wikipedia and Wikidata requests, cached on disk (~/.cache/political-ideology-atlas/http/<sha1>.json)
// so a rerun reads local copies instead of asking Wikimedia again (rate limits). Polite: one request
// at a time, a pause after each network fetch, and a 429 stops the run (never retried in a loop).
const HTTP_CACHE = path.join(process.env.XDG_CACHE_HOME || path.join(require("os").homedir(), ".cache"), "political-ideology-atlas", "http");
const cacheFile = (url, body = null) => path.join(HTTP_CACHE, require("crypto").createHash("sha1").update(url + "\n" + (body || "")).digest("hex") + ".json");
async function cachedJson(url, { body = null, headers = {}, pauseMs = 1000 } = {}) {
  fs.mkdirSync(HTTP_CACHE, { recursive: true });
  const file = cacheFile(url, body);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const res = await fetch(url, { method: body ? "POST" : "GET", body, headers: { "User-Agent": "ideology-atlas-catalog-check/1.0 (research script)", ...headers } });
  if (res.status === 429) throw new Error(`HTTP 429 from ${new URL(url).host} (retry-after ${res.headers.get("retry-after") || "?"} s): stopping`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.slice(0, 120)}`);
  const json = await res.json();
  fs.writeFileSync(file, JSON.stringify(json));
  await new Promise((r) => setTimeout(r, pauseMs));
  return json;
}

// Duplicates, decided by data: one catalog entry per Wikipedia article (after redirects). The owner is
// the entry whose own title is the article ("exact"), else the most viewed; every other entry on that
// article is a duplicate of it and is never audited. No exceptions (Brandon, 2026-11-05).
let dupMap = null;
// What Wikipedia says about each entry's name (scripts/resolve-articles.js), when it has been fetched.
let articles = null;
const wikipediaArticles = () => {
  if (articles === null) { const f = path.join(ROOT, "audits", "wikipedia-articles.json"); articles = fs.existsSync(f) ? readJson(f).entries : {}; }
  return articles;
};
// An entry's whole Wikipedia page (the article the catalog resolved it to) as Wikipedia renders it,
// references and external links included, cached like every other Wikipedia request (Brandon, 2026-11-06).
// articleHtml / articleText read the cache only (null if never fetched); fetchArticle fills it.
const articleTitle = (e) => { const a = wikipediaArticles()[e.id]; return (a && a.title) || decodeURIComponent(String(e.wikipedia || "")).replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, "").replace(/_/g, " ") || null; };
const articleUrl = (title) => `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", action: "parse", prop: "text", redirects: "1", page: title })}`;
const htmlOf = (json) => (json && json.parse && json.parse.text) || null;
const htmlToText = (html) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ");
const articleHtml = (e) => { const t = articleTitle(e), f = t && cacheFile(articleUrl(t)); return f && fs.existsSync(f) ? htmlOf(JSON.parse(fs.readFileSync(f, "utf8"))) : null; };
const articleText = (e) => { const h = articleHtml(e); return h && htmlToText(h); };
const fetchArticle = async (e) => { const t = articleTitle(e); return t ? htmlOf(await cachedJson(articleUrl(t), { pauseMs: 3000 })) : null; };
// Notability by Wikipedia, decided by data: an article of its own (resolve-articles.js). Entries not yet
// resolved count as notable until the file says otherwise.
// Other names for an entry's article: redirects Wikipedia files as another name for it (resolve-articles.js).
const wikipediaOtherNames = (id) => { const a = wikipediaArticles()[id]; return (a && a.otherNames) || []; };
const notable = (id) => { const a = wikipediaArticles()[id]; return !a || a.notable; };
const articleKey = (e) => {
  const a = wikipediaArticles()[e.id];
  if (a && a.title) return a.title.toLowerCase();
  return decodeURIComponent(String(e.wikipedia || "")).replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, "").replace(/_/g, " ").toLowerCase();
};
function duplicateOf(id) {
  if (!dupMap) {
    dupMap = new Map();
    const groups = new Map();
    // A redirect to a subtopic or related article is not notable, so it is not a duplicate either.
    for (const e of catalog()) { const k = articleKey(e); if (!k || !notable(e.id)) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const owner = [...g].sort((a, b) => (b.wikipediaMatch === "exact") - (a.wikipediaMatch === "exact") || (b.views12m || 0) - (a.views12m || 0) || a.id.localeCompare(b.id))[0];
      for (const e of g) if (e !== owner) dupMap.set(e.id, owner.id);
    }
  }
  return dupMap.get(id) || null;
}
// The names of an entry's duplicates (catalog names that Wikipedia redirects to its article) are its
// aliases: a redirect has one target, so the link is one to one ("Neoreaction" for Dark Enlightenment).
const redirectAliases = (id) => { duplicateOf("_"); return catalog().filter((e) => dupMap.get(e.id) === id).map((e) => e.name); };

// Audits go stale per statement, not all at once: a new statement only needs answering, and a
// removed one is ignored. A rewording that changes the meaning would silently change what was
// answered, so it gets a new id. audits/statements/texts.json records each id's text and test.js
// fails if one changes, so a rewording that keeps the meaning (a reader fix) is a deliberate
// in-place edit: change the text in both files and keep the id and answers (Brandon, 2026-11-09).
const TEXTS = path.join(ROOT, "audits", "statements", "texts.json");
const unanswered = (answers, statements = allStatements()) => statements.filter((s) => !(answers && answers[s.id])).map((s) => s.id);

const profilePath = (id) => path.join(PROFILES_DIR, `${id}.json`);

// People are audited the same way, with their own catalog and folder.
const PEOPLE_DIR = path.join(ROOT, "audits", "people");
const peopleCatalog = () => readJson(path.join(ROOT, "audits", "people-catalog.json")).people;
const personPath = (id) => path.join(PEOPLE_DIR, `${id}.json`);
// Thumbnails are served from the site itself (img/<kind>/), never hotlinked from Wikimedia, so a visit
// contacts no third party (Brandon, 2026-11-08, after Privacy Badger flagged thumb.wikimedia.org). The file
// name carries a hash of the Commons URL: a new image gets a new name, so browsers never show a stale one.
// scripts/images.js downloads the files; build.js ships the local path when the file exists.
// Every file is WebP, at most 330 px (the site draws them at 220 px or less), which keeps logos' transparency.
const thumbPath = (kind, id, url) => `img/${kind}/${id}-${require("crypto").createHash("sha1").update(url).digest("hex").slice(0, 8)}.webp`;
// The image object build.js ships: the local copy plus the Commons credit, or null when there's no copy yet.
const shippedImage = (kind, entry) => {
  const im = entry.image;
  if (!im || !im.url) return null;
  const local = thumbPath(kind, entry.id, im.url);
  return fs.existsSync(path.join(ROOT, local)) ? { url: local, artist: im.artist, license: im.license, source: im.source } : null;
};
// Negative controls: apolitical celebrities audited the same way, expected to fail the uncertainty rule.
const CONTROLS_DIR = path.join(ROOT, "audits", "controls");
const controlsCatalog = () => readJson(path.join(ROOT, "audits", "controls-catalog.json")).people;
const controlPath = (id) => path.join(CONTROLS_DIR, `${id}.json`);

// Uncertainty (see pca.js) is judged against one context for ideologies and people alike: the lines of
// the landscape (every complete ideology audit, build.js) and their noise, as data.js ships them
// (PLACEMENT). It is judged from the rounded parts that are written out, so build.js,
// validate.js and test.js get the same verdicts. build.js passes the judge it has just made;
// everyone else gets the last build's.
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const judgeParts = (ctx) => ({
  k: ctx.k,
  noise: r6(ctx.noise),
  components: ctx.model.components.slice(0, ctx.k).map((c) => ({ eigenvalue: r6(c.eigenvalue), vector: c.vector.map((x) => Math.round(x * 1e4) / 1e4) })),
  // Each matched line in terms of the components (placementContext in pca.js), in the shipped order.
  lines: ctx.lines.map((row) => row.map(r6)),
});
// `ids`: the statement ids, in the order of the parts' vectors.
const judgeFrom = (parts, ids) => ({ ctx: require(path.join(ROOT, "pca.js")).placementFromParts(parts), ids });
// Silence in ideology audits written before "no known position" existed for them, when it was recorded
// as 0 (audits/AUDIT_RULES.md: silence is null): a low zero whose rationale the audit repeats 3+ times
// (a stock "no doctrine" line), or that says in words there is no position and mentions no split,
// difference or balance. Checked by hand on samples: about 95% of what it finds is silence; about a
// third of what it leaves (silence with a "but" clause) is too, for re-audits to pick up.
const SILENT = /\b(no (position|stance|view|doctrine|line|record|programme|program|documented|stated|known|clear|specific|explicit|common|shared|source (takes|decides|addresses|records|documents|covers|states|says))|not (address|discuss|mention|take|cover|state|applicable|part of|relevant|an? (issue|question|theme|concern|topic|matter|feature))\w*|(does|do|did)n.t (address|discuss|take|mention)|never (address|discuss|took|take)\w*|silent|nothing in|outside (its|the)|takes no|left neutral|offers? no|anachronis\w*|post-?dates?|pre-?dates?|irrelevant|beside the point|n\/a|undocumented|no counterpart|no \w+ (stance|position|view) (is )?(stated|recorded|documented)|not in (its|the) (documented )?(program|programme|platform|sources))\b/i;
const SPLIT = /\b(split|divided|mixed|balanc\w*|varie[ds]|vary|differ\w*|both (sides|ways)|compromise|tension|while|but\b|yet\b)\b/i;
function silentZeros(audit) {
  const uses = new Map();
  for (const a of Object.values(audit.answers || {})) uses.set(a.rationale, (uses.get(a.rationale) || 0) + 1);
  return new Set(Object.entries(audit.answers || {})
    .filter(([, a]) => a.value === 0 && a.confidence === "low"
      && (uses.get(a.rationale) >= 3 || (SILENT.test(a.rationale || "") && !SPLIT.test(a.rationale || ""))))
    .map(([id]) => id));
}
// An ideology audit's answers as the model takes them. "No known position" stays null: matching leaves
// it out, like a person's or a taker's (pca.js).
// A statement the audit hasn't answered yet (promoted after the audit was written) counts as null,
// like a statement it has no known position on (Brandon, 2026-11-05: the audit's next completing pass
// answers it).
const ideologyProfile = (audit, statements = activeStatements()) => statements.map((s) => (audit.answers[s.id] ? audit.answers[s.id].value : null));
// Every ideology audit (missing answers count as null): the landscape the lines come from.
const completeIdeologies = (statements = activeStatements()) => catalog()
  .filter((e) => fs.existsSync(profilePath(e.id)))
  .map((e) => ({ id: e.id, audit: readJson(profilePath(e.id)) }))
  .filter(({ audit }) => !audit.notAnIdeology)
  .map(({ id, audit }) => ({ id, name: audit.name, profile: ideologyProfile(audit, statements) }));
let lastJudge = null;
const shippedJudge = () => {
  if (!lastJudge) {
    const { QUESTIONS, PLACEMENT } = require(path.join(ROOT, "data.js"));
    lastJudge = judgeFrom(PLACEMENT, QUESTIONS.map((q) => q.id));
  }
  return lastJudge;
};
// The uncertainty rule (pca.js), from audit answers.
const judged = (answers, judge) =>
  require(path.join(ROOT, "pca.js")).uncertainty(judge.ctx, judge.ids.map((id) => (answers[id] ? answers[id].value : null)));
// Uncertainty counts every answer with a position, whatever its confidence (audits/AUDIT_RULES.md,
// section 5); "no known position" (null) doesn't count.
const RULES = 2;
const personUncertainty = (answers, judge = shippedJudge()) => judged(answers, judge);

// Ideology audits written before the shared rules (no "rules": 2) recorded silence as 0 and inferences
// unmarked, so only their medium and high answers count until they are re-audited.
const mediumOrHigh = (answers) => Object.fromEntries(Object.entries(answers)
  .map(([id, a]) => [id, { ...a, value: a.confidence === "low" ? null : a.value }]));
// The statements an ideology audit has a stated position on, as its uncertainty counts them (in audits
// from before the shared rules, medium or high only); never null.
const counted = (audit) => (audit.rules >= RULES ? audit.answers : mediumOrHigh(audit.answers));
const statedPositions = (audit) => new Set(Object.entries(counted(audit))
  .filter(([, a]) => a.value != null).map(([id]) => id));
const ideologyUncertainty = (audit, judge = shippedJudge()) =>
  judged(counted(audit), judge);

// The inputs of the real-line count (build.js, audits/lines.json): pca.js and the answers of the
// ideologies it is counted on (`id` and `profile`, in catalog order).
const linesKey = (ideologies) => require("crypto").createHash("sha1")
  .update(fs.readFileSync(path.join(ROOT, "pca.js"), "utf8"))
  .update(JSON.stringify(ideologies.map((i) => [i.id, i.profile])))
  .digest("hex");
// Ideologies held off the site until re-audited (audits/awaiting-reaudit.json). Their old audits still
// shape the dividing lines, like audits that fail the uncertainty rule.
const awaitingReaudit = () => {
  const f = path.join(ROOT, "audits", "awaiting-reaudit.json");
  return new Set(fs.existsSync(f) ? readJson(f).ids : []);
};

// Statement wording markers (STANDARD.md test 3). Errors almost always mean a defect: a permission
// ("can", "may"), two questions ("rather"), a reason ("so", "because") or a comparison ("as well as",
// "not only") or a joined claim ("and": Brandon, 2026-11-10, "I've not yet seen an 'and' apply cleanly"; a list of
// one claim folds into one general word). Warnings are often fine but worth a look: "or" (a list may be one claim),
// "like", "by"/"through" (a means, or just who acts: "chosen by voters"), "in" (a vague scope such as
// "in economic life", or just a place: "in war"), "not" (state the positive position and let an
// ideology answer -2: "work should be the centre of people's lives", not "work should not be..."), "if"/"unless"/"when"/"whenever"/"while"/"until"/"provided"/"as long as" (a
// condition is hard to negate: does disagreeing reject the claim or the condition? "while" and "until" added 2026-11-10).
const WORDING = {
  errors: ["can", "may", "rather", "so", "because", "as well as", "not only", "and"],
  warnings: ["or", "like", "by", "through", "in", "not", "if", "unless", "when", "whenever", "while", "until", "provided", "as long as"],
};
const wordingRe = (words) => new RegExp(`\\b(${words.join("|")})\\b`, "gi");
function wordingMarks(text) {
  const find = (words, t = text) => [...new Set((t.match(wordingRe(words)) || []).map((w) => w.toLowerCase()))];
  // "even when"/"even if" stress the claim rather than adding a condition, so they aren't marked; "provided" is
  // marked only as a condition ("provided that", or opening a clause), not as a verb ("provided by") (Brandon, 2026-11-09).
  const t = text.replace(/\beven (when|if)\b/gi, "").replace(/\bprovided\b(?! that\b)/gi, (w, at, s) => /(^|[,;:]\s*)$/.test(s.slice(0, at)) ? w : "");
  return { errors: find(WORDING.errors), warnings: find(WORDING.warnings, t) };
}

module.exports = { wikipediaOtherNames, cachedJson, articleTitle, articleHtml, articleText, fetchArticle, duplicateOf, redirectAliases, articleKey, notable, WORDING, wordingRe, wordingMarks, viewsPeriod, awaitingReaudit, linesKey, ROOT, PROFILES_DIR, readJson, allStatements, activeStatements, isCandidate, TEXTS, unanswered, catalog, profilePath,
  PEOPLE_DIR, peopleCatalog, personPath, thumbPath, shippedImage, CONTROLS_DIR, controlsCatalog, controlPath, personUncertainty, ideologyUncertainty,
  RULES, statedPositions, silentZeros, ideologyProfile, judgeParts, judgeFrom, completeIdeologies };
