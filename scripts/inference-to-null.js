// Leaves inferred answers out: in audits written before rules 3 (which has no inferences), each answer
// whose rationale says it is inferred, implied or not stated by the sources, that the question is
// anachronistic for the subject (it can't have answered it), or only that it "fits" the subject, becomes null, keeping its rationale and "nulledFrom": <old value>, and the audit gets a
// { kind: "inference" } entry in "reviews". Matching then treats it like any unknown position.
//   node scripts/inference-to-null.js [--dry-run] [--people] [id ...]
// Ideologies by default; --people converts people audits instead. Rules-3 audits and audits with
// nothing (more) to convert are left as they are; a rerun after the phrase list grows adds to the
// audit's existing "inference" review. The phrase list reads rationales, so it misses inferences worded as plain
// statements; re-audits under rules 3 catch those.
const fs = require("fs");
const { profilePath, catalog, personPath, peopleCatalog } = require("./lib");

const INFERRED = new RegExp([
  /^Inferred:/, /\binferred\b/, /\binfer(s|ring)?\b/, /\bpresumably\b/, /\bprobably\b/, /\blikely\b/, /\bunlikely\b/,
  /\bsuggest(s|ing)?\b/, /\bimpl(y|ies|ied)\b/,
  /\bwould (likely |probably )?(favou?r|support|oppose|reject|endorse|accept|back|welcome|resist|see|view|agree|disagree)/,
  /\b(is|are|was|were) not (a )?(stated|documented|discussed|addressed)/, /\bnot (explicitly )?(stated|documented|discussed|addressed)\b/,
  /\bsources? (do|does|did) not (state|say|address|discuss)/, /\bsay(s)? nothing\b/,
  /\bnot a (stated|documented|defining|core) (theme|plank|position|demand|concern)/, /\bunaddressed\b/,
  /\banachronis/, /\bfits\b/, /\bconsistent with\b/, /\bin line with\b/, /\bextends? (naturally )?to\b/, /\bcarries over\b/, /\bapproximates\b/, /\bakin to\b/,
].map((r) => r.source).join("|"), "i");

const dry = process.argv.includes("--dry-run"), people = process.argv.includes("--people");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const today = new Date().toISOString().slice(0, 10);
const pathOf = people ? personPath : profilePath;
let audits = 0, nulled = 0;
for (const id of ids.length ? ids : (people ? peopleCatalog() : catalog()).map((e) => e.id)) {
  const file = pathOf(id);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  const a = JSON.parse(text);
  if (a.rules === 3 || a.notAnIdeology || !a.answers) continue;
  let n = 0;
  for (const x of Object.values(a.answers)) {
    if (x && x.value != null && INFERRED.test(x.rationale || "")) { Object.assign(x, { nulledFrom: x.value, value: null }); n++; }
  }
  if (!n) continue;
  const review = (a.reviews || []).find((r) => r.kind === "inference");
  if (review) Object.assign(review, { reviewedAt: today, nulled: review.nulled + n });
  else a.reviews = [...(a.reviews || []), { kind: "inference", reviewer: "scripts/inference-to-null.js", reviewedAt: today, nulled: n }];
  // Keep the file's own layout (audits are indented 1 or 2 spaces, a few are on one line).
  const indent = (/^\{\r?\n( +)"/.exec(text) || [, ""])[1].length;
  if (!dry) fs.writeFileSync(file, JSON.stringify(a, null, indent || undefined) + (text.endsWith("\n") ? "\n" : ""));
  audits++; nulled += n;
}
console.log(`${dry ? "Would null" : "Nulled"} ${nulled} inferred answers in ${audits} ${people ? "people" : "ideology"} audits.`);
