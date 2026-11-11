// Statement review loop (Brandon, 2026-11-10): audits answered some statements differently from the claim
// intended, mostly where the wording joins two claims ("and"), contrasts two ("rather than") or leans on a
// condition or jargon. This walks the active statements in quiz order (the order the next-question selector
// asks them, the same for every respondent) and writes a review brief for the first one that fails the wording
// check and has no review yet. A reviewer (Codex, following audits/PROMPT_STATEMENT_REVIEW.md) answers each
// brief in scratchpad/statement-review/<id>-results.md; nothing here edits statements.json or any audit, and the
// maintainer decides which proposals to apply.
//   node scripts/statement-review.js next [--warnings]   write the next brief, print its path (or "none")
//   node scripts/statement-review.js list [--warnings]   print the queue in quiz order, reviewed ones marked
//   --warnings also takes statements with wording warnings only (default: errors only)
//   --id <id>: write the brief for that statement, reviewed or not
const fs = require("fs");
const path = require("path");
const { ROOT, readJson, allStatements, wordingMarks, wordingRe, WORDING } = require("./lib");

const OUT = path.join(ROOT, "scratchpad", "statement-review");
const WARNINGS = process.argv.includes("--warnings");
const idArg = process.argv.indexOf("--id");
const ONE = idArg > -1 ? process.argv[idArg + 1] : null;
const mode = process.argv[2];

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

const statements = allStatements();
const byId = new Map(statements.map((s) => [s.id, s]));
const marks = (s) => wordingMarks(s.text);
const fails = (s) => { const m = marks(s); return m.errors.length > 0 || (WARNINGS && m.warnings.length > 0); };
// A review counts only if the statement text it proposes passes the check: errors are absolute (Brandon,
// 2026-11-10), so a review that keeps or proposes an error word sends the statement back to the queue.
const resultsFile = (id) => path.join(OUT, `${id}-results.md`);
// Guidance from the maintainer for one statement, shown in its brief (a rejected review sent back).
const maintainerFile = (id) => path.join(OUT, `${id}-maintainer.md`);
const proposedText = (id) => {
  if (!fs.existsSync(resultsFile(id))) return null;
  const m = fs.readFileSync(resultsFile(id), "utf8").match(/^\*\*Statement:\*\*\s*(.+?)\s*$/m);
  return m ? m[1].replace(/^["“]|["”]$/g, "") : null;
};
const proposalFails = (id) => { const t = proposedText(id); return !t || wordingMarks(t).errors.length > 0; };
const reviewed = (id) => fs.existsSync(resultsFile(id)) && !proposalFails(id);

function queue() {
  return quizOrder().map((id, i) => ({ step: i + 1, s: byId.get(id) })).filter((x) => x.s && fails(x.s));
}

// Every audit's answer to one statement, with the subject's id and kind.
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

// Samples per value, rationales that weigh two things against each other first: those are where a statement that
// joins or contrasts two claims shows how audits read it.
const CONTRAST = /\b(but|though|although|yet|while|whereas|however|split|both|mixed)\b/i;
function samples(answers, value, n) {
  const at = answers.filter((a) => a.value === value);
  const contrast = at.filter((a) => CONTRAST.test(a.rationale)), rest = at.filter((a) => !CONTRAST.test(a.rationale));
  const pick = (list, k) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / k)) === 0).slice(0, k);
  return [...pick(contrast, Math.ceil(n / 2)), ...pick(rest, n)].slice(0, n);
}

// Related statements by shared content words, so the reviewer can see what is already measured elsewhere.
const STOP = new Set("should their there which would about other these those every people country government state political society within against between because without person persons rather".split(" "));
const words = (t) => new Set((t.toLowerCase().match(/[a-z]{5,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, "")));
function related(s, n) {
  const mine = words(s.text);
  return statements.filter((o) => o.id !== s.id)
    .map((o) => ({ o, shared: [...words(o.text)].filter((w) => mine.has(w)).length }))
    .filter((x) => x.shared > 0).sort((a, b) => b.shared - a.shared).slice(0, n).map((x) => x.o);
}

const clip = (t, n = 220) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

function brief(step, s) {
  const m = marks(s), ans = answersTo(s.id), spread = {};
  for (const a of ans) spread[a.value] = (spread[a.value] || 0) + 1;
  const marked = s.text.replace(wordingRe([...m.errors, ...m.warnings]), (w) => `**${w.toUpperCase()}**`);
  const entry = Object.fromEntries(["id", "text", "agree", "disagree", "note", "status"].filter((k) => s[k] !== undefined).map((k) => [k, s[k]]));
  const sampleBlock = [2, 1, 0, -1, -2].map((v) => {
    const list = samples(ans, v, v === 0 ? 4 : 3);
    return list.length ? `**${v > 0 ? "+" : ""}${v}** (${spread[v] || 0}):\n\n${list.map((a) => `- \`${a.who}\`: "${clip(a.rationale)}"`).join("\n")}` : "";
  }).filter(Boolean).join("\n\n");
  return `# Review \`${s.id}\`

Statement review, generated by \`node scripts/statement-review.js\` on ${new Date().toISOString().slice(0, 10)}. Follow
\`audits/PROMPT_STATEMENT_REVIEW.md\`.

## The task

Say whether this statement measures one clear claim that the audits answered, and propose the best wording.
Prefer an **in-place** rewording: the statement keeps its id and the existing answers stay valid, so the new text
makes the claim the audits answered. If your pick would make some current answers wrong, list them.

Write your reply to \`scratchpad/statement-review/${s.id}-results.md\` (a new file; touch nothing else), with:

1. **Verdict:** keep as is, reword in place, or a new id (a different claim).
2. Your pick of statement text, with an \`agree\` text (and a \`note\` if the current one no longer fits).
3. Which claim it measures, and why it keeps what the audits answered.
4. Answers it would make wrong or that contradict their own rationale (audit id, value, reason). Separate
   **clear conflicts** (the rationale argues against the answer) from **needs evidence** (thin, not shown wrong).
5. A one-line verdict on any alternative you considered.

## The statement now (quiz step ${step})

\`\`\`json
${JSON.stringify(entry, null, 1)}
\`\`\`

${fs.existsSync(maintainerFile(s.id)) ? `## From the maintainer

${fs.readFileSync(maintainerFile(s.id), "utf8").trim()}

` : ""}${fs.existsSync(resultsFile(s.id)) ? `**An earlier review proposed a text that still fails the check** (${proposedText(s.id) ? `"${proposedText(s.id)}"` : "no **Statement:** line found"}). Errors are absolute: propose a text with none, and overwrite \`${s.id}-results.md\`.\n\n` : ""}Wording check: ${m.errors.length ? `**errors** ${m.errors.map((w) => `"${w}"`).join(", ")}` : "no errors"}${m.warnings.length ? `; warnings ${m.warnings.map((w) => `"${w}"`).join(", ")}` : ""}.
Marked: ${marked}

## Evidence: what the audits answered

${ans.length} answers: ${[-2, -1, 0, 1, 2].map((v) => `${v > 0 ? "+" : ""}${v}: ${spread[v] || 0}`).join(", ")}. Samples below put
rationales that weigh two things against each other first; read the full set in the audit files.

${sampleBlock || "_No answers yet._"}

## Related statements

${related(s, 8).map((o) => `- \`${o.id}\`${o.status === "candidate" ? " (candidate)" : ""}: "${o.text}"`).join("\n") || "_None found by shared words._"}

## Rules the wording must meet

The statement text (not the agree text) must pass \`node scripts/statements-check.js --wording\` with no errors,
and ideally no warnings (\`WORDING\` in \`scripts/lib.js\`; test 3 in \`audits/statements/STANDARD.md\`):

- **Errors:** ${WORDING.errors.map((w) => `"${w}"`).join(", ")}.
- **Warnings:** ${WORDING.warnings.map((w) => `"${w}"`).join(", ")}.
- One claim, read literally, in plain neutral words both sides would accept as fair. Not relative to the status
  quo. The maintainer rejects overloaded or odd phrasing: a "should" that could be a prediction or an aim,
  jargon, figurative verbs.

The \`agree\` text follows STANDARD.md "Explanations", not the wording check: it means exactly the statement, in
other words that help a reader see the position (examples are fine there); it must not add a claim the
statement lacks.

## Files

- \`statements.json\`: the entry. \`audits/statements/texts.json\`: each id's recorded text.
- Rationales: \`answers["${s.id}"]\` in \`audits/profiles/*.json\` and \`audits/people/*.json\`.
`;
}

if (ONE) {
  const s = byId.get(ONE);
  if (!s) { console.error(`no statement ${ONE}`); process.exit(1); }
  const step = quizOrder().indexOf(ONE) + 1;
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, `${s.id}-brief.md`);
  fs.writeFileSync(f, brief(step || "-", s));
  console.log(path.relative(ROOT, f));
} else if (mode === "list") {
  const q = queue();
  const state = (id) => (reviewed(id) ? "reviewed" : fs.existsSync(resultsFile(id)) ? "redo    " : "pending ");
  for (const { step, s } of q) console.log(`${String(step).padStart(3)} ${state(s.id)} ${s.id}: ${s.text}`);
  console.log(`\n${q.length} statements fail the check${WARNINGS ? " (errors or warnings)" : " (errors)"}; ${q.filter((x) => reviewed(x.s.id)).length} reviewed.`);
} else if (mode === "next") {
  const next = queue().find((x) => !reviewed(x.s.id));
  if (!next) { console.log("none"); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, `${next.s.id}-brief.md`);
  fs.writeFileSync(f, brief(next.step, next.s));
  console.log(path.relative(ROOT, f));
} else {
  console.log("usage: node scripts/statement-review.js next|list [--warnings] | --id <id>");
}
