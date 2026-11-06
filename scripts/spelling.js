// Spells a text in one variety of English (Brandon, 2026-11-06): "us", "uk", or "oxford" (British with -ize).
// Word list only: a word changes only if it is listed here, so "advertise", "exercise" or "compromise" are never
// touched. A capitalised word in mid-sentence is taken as a proper noun and left alone ("the Labour Party" stays in
// an American text, "Center Party" in a British one). Used by build.js for summaries and roles.
"use strict";

// [American, British] pairs; inflected forms are generated below.
const PAIRS = [
  ["color", "colour"], ["favor", "favour"], ["favorable", "favourable"], ["favorite", "favourite"], ["labor", "labour"],
  ["honor", "honour"], ["honorable", "honourable"], ["behavior", "behaviour"], ["behavioral", "behavioural"], ["neighbor", "neighbour"],
  ["neighborhood", "neighbourhood"], ["harbor", "harbour"], ["rumor", "rumour"], ["vigor", "vigour"], ["endeavor", "endeavour"],
  ["humor", "humour"], ["valor", "valour"], ["savior", "saviour"], ["glamor", "glamour"], ["armor", "armour"], ["parlor", "parlour"],
  ["center", "centre"], ["centered", "centred"], ["theater", "theatre"], ["fiber", "fibre"], ["somber", "sombre"],
  ["defense", "defence"], ["offense", "offence"], ["pretense", "pretence"],
  ["program", "programme"], ["catalog", "catalogue"], ["gray", "grey"], ["plow", "plough"], ["mold", "mould"],
  ["aging", "ageing"], ["fulfill", "fulfil"], ["fulfillment", "fulfilment"], ["enroll", "enrol"], ["enrollment", "enrolment"],
  ["skillful", "skilful"], ["willful", "wilful"], ["installment", "instalment"], ["judgment", "judgement"],
  ["traveled", "travelled"], ["traveling", "travelling"], ["traveler", "traveller"], ["labeled", "labelled"], ["labeling", "labelling"],
  ["modeled", "modelled"], ["modeling", "modelling"], ["canceled", "cancelled"], ["canceling", "cancelling"],
  ["counseled", "counselled"], ["counselor", "counsellor"], ["signaled", "signalled"], ["signaling", "signalling"],
  ["fueled", "fuelled"], ["fueling", "fuelling"], ["leveled", "levelled"], ["marvelous", "marvellous"], ["jewelry", "jewellery"],
  ["analyze", "analyse"], ["analyzed", "analysed"], ["analyzing", "analysing"], ["paralyze", "paralyse"], ["paralyzed", "paralysed"],
  ["maneuver", "manoeuvre"], ["anesthetic", "anaesthetic"], ["pediatric", "paediatric"], ["encyclopedia", "encyclopaedia"],
  ["medieval", "mediaeval"], ["percent", "per cent"], ["license", "licence"], ["practice", "practise"],
];
// Verbs with -ize (US, Oxford) / -ise (British); -izes, -ized, -izing, -ization, -izations, -izer follow.
const IZE = ["organ", "recogn", "real", "emphas", "critic", "national", "privat", "legal", "central", "decentral", "colon",
  "civil", "mobil", "character", "priorit", "legitim", "modern", "industrial", "democrat", "liberal", "criminal", "decriminal",
  "social", "stabil", "maxim", "minim", "apolog", "symbol", "sympath", "harmon", "util", "author", "polar", "radical", "marginal",
  "normal", "standard", "subsid", "summar", "theor", "union", "western", "popular", "secular", "collectiv", "militar", "demilitar",
  "global", "internation", "natural", "neutral", "jeopard", "capital", "revolution", "special", "visual", "categor", "commercial",
  "dramat", "familiar", "formal", "general", "human", "ideal", "immun", "institutional", "legal", "local", "material", "memorial",
  "monopol", "moral", "politic", "rational", "regular", "romantic", "sanit", "scrutin", "sensit", "steril", "synchron", "terror",
  "tranquil", "urban", "vandal", "vocal", "fertil", "hospital", "agon", "antagon", "evangel", "fetish", "proselyt", "catechis",
  "satir", "ostrac", "patron", "fraternis", "homogen", "trivial", "equal", "final", "optim", "minimal", "personal", "spiritual",
  "federal", "unitar"];
const ENDS = [["ize", "ise"], ["izes", "ises"], ["ized", "ised"], ["izing", "ising"], ["ization", "isation"], ["izations", "isations"], ["izer", "iser"], ["izers", "isers"]];

function table(target) {
  const map = new Map();
  const add = (from, to) => { if (from !== to) map.set(from, to); };
  const forms = (w) => [w, w + "s", w + "ed", w + "ing", w + "ly", w + "al", w + "ful"];
  for (const [us, uk] of PAIRS) {
    // British "practise"/"licence" are verbs/nouns in British usage only; convert them only towards US.
    if ((us === "practice" || us === "license") && target !== "us") continue;
    const fromList = target === "us" ? [uk] : [us], toWord = target === "us" ? us : uk;
    for (const f of fromList) for (const [a, b] of forms(f).map((x, i) => [x, forms(toWord)[i]])) add(a, b);
  }
  for (const stem of IZE) for (const [z, s] of ENDS) {
    if (target === "uk") add(stem + z, stem + s); else add(stem + s, stem + z); // us and oxford use -ize
  }
  return map;
}
const TABLES = { us: table("us"), uk: table("uk"), oxford: table("oxford") };

function spell(text, variety) {
  const map = TABLES[variety];
  if (!map || typeof text !== "string") return text;
  return text.replace(/[A-Za-z]+(?:'[a-z]+)?/g, (w, i) => {
    const lower = w.toLowerCase();
    const to = map.get(lower);
    if (!to) return w;
    if (w[0] !== w[0].toLowerCase()) {
      const before = text.slice(0, i).trimEnd();
      if (before && !/[.!?:"“(]$/.test(before)) return w; // capitalised mid-sentence: a proper noun
      return to[0].toUpperCase() + to.slice(1);
    }
    return to;
  });
}
module.exports = { spell };
if (require.main === module) {
  const [variety, ...words] = process.argv.slice(2);
  console.log(spell(words.join(" "), variety));
}
