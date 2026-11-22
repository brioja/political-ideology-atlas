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

// Wikipedia and Wikidata requests go through the fetch library (scripts/fetch.js): cached on disk, paced,
// 429s waited out. Re-exported here for the scripts that already take it from lib.
const { cachedJson, cacheFile } = require("./fetch");

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
const fetchArticle = async (e) => { const t = articleTitle(e); return t ? htmlOf(await cachedJson(articleUrl(t))) : null; };
// Notability by Wikipedia, decided by data: an article of its own (resolve-articles.js). Entries not yet
// resolved count as notable until the file says otherwise.
// Other names for an entry's article: redirects Wikipedia files as another name for it (resolve-articles.js).
const wikipediaOtherNames = (id) => { const a = wikipediaArticles()[id]; return (a && a.otherNames) || []; };
const notable = (id) => { const a = wikipediaArticles()[id]; return !a || a.notable; };
// An entry on one person's views, by its title ("Political positions of …", "Religious views of …"): that person's
// views, not a set of ideas, so not an ideology (notIdeasOfWhatSocietyShouldBe reason PERSON), marked by this rule
// without an audit. The people side audits the person. An ideology named after them (Trumpism) is tied to the
// person but isn't them, and is audited (Brandon, 2026-11-21).
const PERSON_VIEWS = /^(Political|Religious) (positions|views|philosophy) of /;
const personViews = (e) => PERSON_VIEWS.test(e.name);
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

// Audits go stale per statement, not all at once: a new statement only needs answering, and a
// removed one is ignored. A rewording that changes the meaning would silently change what was
// answered, so it gets a new id. audits/statements/texts.json records each id's text and test.js
// fails if one changes, so a rewording that keeps the meaning (a reader fix) is a deliberate
// in-place edit: change the text in both files and keep the id and answers (Brandon, 2026-11-09).
const TEXTS = path.join(ROOT, "audits", "statements", "texts.json");
// Statements just dropped from the bank (or renamed to a new id) are in texts.json until drop-answers.js has
// cleared their answers; then it removes them there too, and nothing keeps a retired id (Brandon, 2026-11-19: the
// review history guards current answers against improper nulling; an old statement's history guards nothing).
// retiredRe matches any of those ids as a whole word.
let retiredCache;
const retiredIds = () => {
  if (!retiredCache) { const bank = new Set(allStatements().map((s) => s.id)); retiredCache = Object.keys(readJson(TEXTS)).filter((k) => !bank.has(k)); }
  return retiredCache;
};
const retiredRe = () => (retiredIds().length ? new RegExp(`(?<![\\w-])(${retiredIds().join("|")})(?![\\w-])`, "g") : null);
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
// Until a replacement image's copy has downloaded, the copy of the image it replaced ("previousImage",
// scripts/images.js), so a photo renamed or deleted on Commons never leaves an entry without one.
const shippedImage = (kind, entry) => {
  for (const im of [entry.image, entry.previousImage]) {
    if (!im || !im.url) continue;
    const local = thumbPath(kind, entry.id, im.url);
    if (fs.existsSync(path.join(ROOT, local))) return { url: local, artist: im.artist, license: im.license, source: im.source };
  }
  return null;
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
  .filter(({ audit }) => !audit.notIdeasOfWhatSocietyShouldBe)
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
// one claim folds into one general word), or options ("or": Brandon, 2026-11-11, audits can't answer it: agreeing
// needs evidence for one option, disagreeing evidence against every one). Warnings are often fine but worth a look:
// "like", "by"/"through" (a means, or just who acts: "chosen by voters"), "not" (state the positive position and let an
// ideology answer -2: "work should be the centre of people's lives", not "work should not be..."), "if"/"unless"/"when"/"whenever"/"while"/"until"/"provided"/"as long as" (a
// condition is hard to negate: does disagreeing reject the claim or the condition? "while" and "until" added 2026-11-10),
// "cut"/"reduce"/"raise"/"increase"/"expand"/"lower" (a change from today's level, which differs by country and era:
// state the level instead; Brandon, 2026-11-11. "Cut internet access" or "lower-level councils" are fine), and
// "more"/"less"/"fewer" and the comparatives in COMPARATIVES ("higher", "larger", ...; Brandon, 2026-11-12) without a
// later "than", a semicolon and a second sentence (marked in wordingMarks), and
// "instead" ("A instead of B" is "rather than" in other words: hard to negate; Brandon, 2026-11-11), and "my country"
// (fine with "should"; a claim of fact about the reader's country has unstated context; Brandon, 2026-11-11).
// Hedges are errors too: "sometimes"/"at times"/"occasionally"/"in some cases" (almost anyone agrees; a warning from
// 2026-11-12, an error since 2026-11-19, Brandon: Sonnet's quiz retake showed a model misreading "sometimes necessary"),
// and "tend to"/"tends to" (nearly anyone grants a tendency; 2026-11-19), and "never" (2026-11-19, Brandon: Sonnet's
// quiz retake read "never justified" as "rarely justified" and answered 0 or agree on revolution-justified,
// political-violence-never and defensive-wars-only), and "always" and "whatever" (2026-11-19, Brandon: the same misread in
// the check of all of Sonnet's reasons: "exceptions exist" answered 0 or agree on initiating-force-wrong, non-intervention
// and disparate-impact-discrimination). "some" is a warning (2026-11-19): often the
// claim itself ("some moral truths hold across all cultures"), but it can be a hedge that makes agreeing trivial.
// Comparatives that, with no later "than", mean "than now" ("Taxes on the wealthy should be significantly higher").
const COMPARATIVES = ["more", "less", "fewer", "higher", "larger", "greater", "bigger", "smaller", "stronger", "weaker",
  "tighter", "looser", "stricter", "tougher", "harsher", "wider", "narrower", "broader"];
const WORDING = {
  errors: ["can", "may", "rather", "so", "because", "as well as", "not only", "and", "or",
    "sometimes", "at times", "occasionally", "in some cases", "tend to", "tends to", "never", "always", "whatever"],
  warnings: ["like", "by", "through", "not", "if", "unless", "when", "whenever", "while", "until", "provided", "as long as", "instead", "my country", "some",
    "cut", "cuts", "reduce", "reduced", "raise", "raised", "increase", "increased", "expand", "expanded", "lower", "lowered"],
};
// Why each mark matters, printed by statements-check.js and in review briefs (Brandon, 2026-11-11).
const WORDING_REASONS = {
  can: "a permission or ability is almost always trivially true; state the position",
  may: "a permission is almost always trivially true; state the position",
  rather: "\"A rather than B\" asks two things: a disagree could reject A or prefer a third option",
  so: "a reason joined to the claim: a disagree could reject the claim or the reason",
  because: "a reason joined to the claim: a disagree could reject the claim or the reason",
  "as well as": "joins a second claim",
  "not only": "joins a second claim",
  and: "joins a second claim, or a list where one general word would do",
  ";": "joins a second claim",
  or: "an audit can't answer it: agreeing needs evidence for one option, disagreeing needs evidence against every option; use one general word",
  like: "a comparison or example that adds a claim of its own",
  by: "may tie a means to the position (\"by requiring\"); a passive \"by\" (\"chosen by voters\") is fine",
  through: "may tie a means to the position (\"through lobbying\")",
  not: "a negative statement is harder to answer than its positive form",
  if: "a condition: a disagree could reject the claim or the condition",
  unless: "a condition: a disagree could reject the claim or the condition",
  when: "a condition: a disagree could reject the claim or the condition",
  whenever: "a condition: a disagree could reject the claim or the condition",
  while: "a condition or a second claim",
  until: "a condition on time: a disagree could reject the claim or the condition",
  provided: "a condition: a disagree could reject the claim or the condition",
  "as long as": "a condition: a disagree could reject the claim or the condition",
  "my country": "fine with \"should\" (a stance anyone can take about their own country); a claim of fact about it depends on which country the reader lives in",
  instead: "\"A instead of B\" asks two things, as \"rather than\" does: a disagree could reject A or prefer a third option",
  ...Object.fromEntries(["cut", "cuts", "reduce", "reduced", "raise", "raised", "increase", "increased", "expand", "expanded", "lower", "lowered"]
    .map((w) => [w, "a change from today's level, which differs by country and era; state the level (a literal use is fine)"])),
  ...Object.fromEntries(COMPARATIVES.map((w) => [w, "with no \"than\" it means \"than now\", which differs by country and era; state the level"])),
  ...Object.fromEntries(["sometimes", "at times", "occasionally", "in some cases"]
    .map((w) => [w, "a hedge: almost anyone agrees, and disagreeing means \"never\", which audits misread as preferring something else (revolution-justified, humanitarian-intervention, 2026-11-12); state the general claim"])),
  never: "an absolute: someone who thinks it's rare answers as if agreeing (Sonnet on revolution-justified and political-violence-never, 2026-11-19), and disagreeing means only \"at least once\"; state the general claim",
  always: "an absolute: someone who holds it with exceptions answers as if agreeing (Sonnet on initiating-force-wrong, 2026-11-19), and disagreeing means only \"not in every case\"; state the general claim",
  whatever: "an absolute (\"whatever the reason\"): someone who holds the claim with exceptions answers 0 or agree (Sonnet on non-intervention and disparate-impact-discrimination, 2026-11-19); state the general claim",
  ...Object.fromEntries(["tend to", "tends to"]
    .map((w) => [w, "a hedge: nearly anyone grants a tendency, so agreeing says little; state the claim itself"])),
  some: "may be a hedge that makes agreeing trivial (\"some X are bad\"); fine where \"some\" is the claim (\"some moral truths hold across all cultures\": disagreeing says none do)",
  "second sentence": "a second sentence usually adds a second claim",
};
const wordingReason = (w) => WORDING_REASONS[w.toLowerCase()] || "";
const wordingRe = (words) => new RegExp(`\\b(${words.join("|")})\\b`, "gi");
function wordingMarks(text) {
  const find = (words, t = text) => [...new Set((t.match(wordingRe(words)) || []).map((w) => w.toLowerCase()))];
  // "even when"/"even if" stress the claim rather than adding a condition, so they aren't marked; "provided" is
  // marked only as a condition ("provided that", or opening a clause), not as a verb ("provided by") (Brandon, 2026-11-09).
  const t = text.replace(/\beven (when|if)\b/gi, "").replace(/\bprovided\b(?! that\b)/gi, (w, at, s) => /(^|[,;:]\s*)$/.test(s.slice(0, at)) ? w : "");
  // "more"/"less"/"fewer" and other comparatives with no "than" after them usually mean "than now", a change from
  // today's level ("should have more power"); with a "than" they are a comparison ("more on rehabilitation than on
  // punishment") and aren't marked (Brandon, 2026-11-11).
  const relative = [...t.matchAll(new RegExp(`\\b(${COMPARATIVES.join("|")})\\b`, "gi"))].filter((m) => !/\bthan\b/i.test(t.slice(m.index))).map((m) => m[1].toLowerCase());
  // A semicolon joins a second claim, as "and" does: an error (Brandon, 2026-11-11). A second sentence usually does too: a warning.
  const semicolon = /;/.test(text) ? [";"] : [];
  const sentences = /[.!?]\s+\S/.test(text.trim()) ? ["second sentence"] : [];
  return { errors: [...find(WORDING.errors), ...semicolon], warnings: [...new Set([...find(WORDING.warnings, t), ...relative, ...sentences])] };
}

// How much of a statement an agree or disagree sentence only repeats: the share of content words the two have in
// common (Jaccard over words with stopwords and negations removed, so "should not be X" scores 1 against "should
// be X"). 1 is the statement's own words; a sentence that explains in other words scores low (Brandon, 2026-11-15:
// a quiz taker found "What does this mean?" only restated the statement).
const RESTATE_STOP = new Set(("a an the of to in on for and or by with as at from that which who whom is are was were be been being it its " +
  "their there this these those should would will can may must do does did not no never nor need any all every each own one").split(" "));
// A final -s is dropped (not -ss), so "does not tie" matches "ties" and "benefit" matches "benefits" (Brandon,
// 2026-11-20: sacred-nation's disagree was its agree with "does not" and passed at 0.82).
const restateStem = (w) => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w);
const restateWords = (t) => new Set((String(t || "").toLowerCase().replace(/\u2019/g, "'").match(/[a-z']+/g) || [])
  .map((w) => w.replace(/'s$/, "")).filter((w) => !RESTATE_STOP.has(w)).map(restateStem));
function restateSimilarity(a, b) {
  const A = restateWords(a), B = restateWords(b);
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / (new Set([...A, ...B]).size || 1);
}
// At or above these an explanation is reported as restating: an agree that rewords only a word or two, a disagree
// that is the statement with "not" added, and (mirror) a disagree that is the agree with "not" added, so the sheet
// explains the position once and repeats it (Brandon, 2026-11-15: both checks, no exceptions).
const RESTATE_LIMITS = { agree: 0.6, disagree: 0.9, mirror: 0.9 };
// Which explanations restate: "agree" and "disagree" against the statement, "mirror" the disagree against the agree.
function restatedParts(s) {
  const out = [];
  if (s.agree && restateSimilarity(s.text, s.agree) >= RESTATE_LIMITS.agree) out.push(["agree", restateSimilarity(s.text, s.agree)]);
  if (s.disagree && restateSimilarity(s.text, s.disagree) >= RESTATE_LIMITS.disagree) out.push(["disagree", restateSimilarity(s.text, s.disagree)]);
  if (s.agree && s.disagree && restateSimilarity(s.agree, s.disagree) >= RESTATE_LIMITS.mirror) out.push(["mirror", restateSimilarity(s.agree, s.disagree)]);
  return out;
}

// Active statements in the order the quiz asks them. The selector picks by how much an answer would narrow your
// place, which doesn't depend on the answers given, so one simulated respondent gives everyone's order (the
// selector keeps ordering past the quiz's done point). Anything it doesn't reach follows in bank order.
function quizOrder() {
  const pca = require(path.join(ROOT, "pca.js"));
  const data = require(path.join(ROOT, "data.js"));
  const model = pca.modelFromParts(data.IDEOLOGIES, data.MODEL, data.PLACEMENT);
  const Q = data.QUESTIONS.length, answers = Array(Q).fill(null), asked = new Set(), order = [];
  for (let k = 0; k < Q; k++) {
    const r = pca.nextQuestion(model, answers, asked);
    if (!r || r.q == null || asked.has(r.q)) break;
    asked.add(r.q); answers[r.q] = 0; order.push(data.QUESTIONS[r.q].id);
  }
  for (const q of data.QUESTIONS) if (!order.includes(q.id)) order.push(q.id);
  return order;
}

// Every audit's answer to one statement, with the subject's id and kind.
// An id from a name: accents dropped, and letters that don't decompose (ł, Đ, ø, ß...) spelled out first, so
// "Lech Wałęsa" is lech-walesa, not lech-waesa (Brandon, 2026-11-19).
const LETTERS = { ł: "l", Ł: "L", đ: "d", Đ: "D", ð: "d", Ð: "D", ø: "o", Ø: "O", ß: "ss", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", þ: "th", Þ: "TH", ħ: "h", Ħ: "H", ı: "i", ŀ: "l", Ŀ: "L" };
const slug = (s) => String(s).replace(/[łŁđĐðÐøØßæÆœŒþÞħĦıŀĿ]/g, (c) => LETTERS[c]).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function answersTo(id) {
  const out = [];
  for (const [dir, kind] of [["profiles", "ideology"], ["people", "person"]]) {
    const d = path.join(ROOT, "audits", dir);
    for (const f of fs.readdirSync(d).filter((f) => f.endsWith(".json"))) {
      const a = readJson(path.join(d, f));
      const x = a.answers && a.answers[id];
      if (x && x.value !== null && x.value !== undefined) out.push({ who: `${dir}/${f.replace(/\.json$/, "")}`, kind, value: x.value, rationale: x.rationale || "" });
    }
  }
  return out;
}

// Ideology colors (audits/ideology-colors.json): never only neutral shades (grey, black, white); a neutral is fine next
// to a real color. Saturation is HSL saturation; below 0.15 reads as neutral. test.js checks the committed file,
// validate.js a lane's <id>.color.json before it is merged (2026-11-22: Taoism's black-and-white entry failed every build).
const saturation = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mx = Math.max(...v), mn = Math.min(...v);
  return mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
};
const onlyNeutralColors = (entry) => entry.colors.length > 0 && !entry.colors.some((c) => saturation(c.hex) >= 0.15);
module.exports = { saturation, onlyNeutralColors, slug, restatedParts, answersTo, quizOrder, restateSimilarity, RESTATE_LIMITS, wikipediaOtherNames, cachedJson, articleTitle, articleHtml, articleText, fetchArticle, duplicateOf, articleKey, notable, personViews, WORDING, COMPARATIVES, WORDING_REASONS, wordingReason, wordingRe, wordingMarks, viewsPeriod, awaitingReaudit, linesKey, ROOT, PROFILES_DIR, readJson, allStatements, activeStatements, isCandidate, TEXTS, retiredIds, retiredRe, unanswered, catalog, profilePath,
  PEOPLE_DIR, peopleCatalog, personPath, thumbPath, shippedImage, CONTROLS_DIR, controlsCatalog, controlPath, personUncertainty, ideologyUncertainty,
  RULES, statedPositions, silentZeros, ideologyProfile, judgeParts, judgeFrom, completeIdeologies };
