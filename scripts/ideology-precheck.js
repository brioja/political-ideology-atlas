// The whole-article pre-check for catalog candidates found through Wikipedia's links (ideology-candidates.js step 4,
// source "wikipedia-links"): a Haiku session reads the whole article and says whether its subject is political ideas
// of what society should be, the content test of audits/IDEOLOGY_STANDARD.md gate 2. Verdicts stand as they are, with
// no hand-picking in either direction, and are kept in audits/ideology-precheck.json (by article title), so each
// article is judged once.
//   node scripts/ideology-precheck.js [--limit N] [--jobs N] [--titles "A|B"]   judge candidates without a verdict yet,
//                                                                               most linked first; --titles: only these
//   node scripts/ideology-precheck.js --trial [--model M] --titles "A|B"         judge again without saving, beside the saved verdict
//   node scripts/ideology-precheck.js --show "<title>"                           print exactly what would be sent
//
// Nothing sent contains the word "ideology" or any form of it (Brandon, 2026-11-20): the session judges the content,
// not a label. The article's own uses of the word, its title included, are replaced with "[…]", and the script
// refuses to send any text that still has it. The session runs from an empty folder with its own system prompt, no
// tools, no settings (so no hooks, memory or project instructions) and no MCP servers.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { ROOT, readJson } = require("./lib");
const wiki = require("./wiki");

const FILE = path.join(ROOT, "audits", "ideology-precheck.json");
let MODEL = "haiku";
const WORD = /ideolog/i;
const mask = (t) => String(t).replace(/ideolog\w*/gi, "[…]");

const REASONS = ["PERSON", "PARTY", "ORGANIZATION", "STATE", "GOVERNMENT_BODY", "EVENT", "DOES_NOT_INCLUDE_IDEAS"];
const SYSTEM = "You classify encyclopedia articles. Reply with one JSON object and nothing else.";
const QUESTION = `Below is the full text of an English Wikipedia article. Decide whether its subject is political ideas of what society should be.

Answer "yes" if what the article describes includes ideas of what society, government, the economy or relations between groups ought to be. A worked-out plan for getting there is not needed. Doctrines, the beliefs of movements, regime types and forms of government, political practices, prejudices, and names that critics use for a set of views all count when the article describes what their holders want society to be.

Answer "no" in two cases:
- the subject has ideas but is not itself a set of ideas: a person (PERSON), a political party (PARTY), an organization (ORGANIZATION), a state (STATE), a particular government body (GOVERNMENT_BODY; a form of government is not one), or an event (EVENT);
- the subject holds no political ideas of what society should be (DOES_NOT_INCLUDE_IDEAS).

Judge by what the article says about the subject's content, not by what it is called. Where the article's text shows "[…]", a word has been removed.

Reply with exactly this JSON: {"answer": "yes" or "no", "reason": null if yes, else one of PERSON, PARTY, ORGANIZATION, STATE, GOVERNMENT_BODY, EVENT, DOES_NOT_INCLUDE_IDEAS, "why": "one sentence"}`;

const load = () => (fs.existsSync(FILE) ? readJson(FILE) : { rule: "", verdicts: {} });
const verdicts = () => load().verdicts;
const save = (data) => {
  const sorted = Object.fromEntries(Object.entries(data.verdicts).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(FILE, JSON.stringify({ ...data, verdicts: sorted }, null, 1) + "\n");
};

async function payload(title) {
  const html = await wiki.articleHtml(title);
  if (!html) return null;
  const text = `${QUESTION}\n\nArticle title: ${mask(title)}\n\n${mask(wiki.htmlToText(html))}`;
  if (WORD.test(text) || WORD.test(SYSTEM)) throw new Error(`refusing to send ${title}: the word is still in the text`);
  return text;
}

const EMPTY = path.join(require("os").tmpdir(), "ideas-precheck-empty");
function ask(text) {
  fs.mkdirSync(EMPTY, { recursive: true });
  return new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", "--model", MODEL, "--output-format", "json", "--system-prompt", SYSTEM, "--tools", "",
      "--setting-sources", "", "--strict-mcp-config", "--no-session-persistence"], { cwd: EMPTY, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      try {
        const r = JSON.parse(out);
        const m = String(r.result || "").match(/\{[\s\S]*\}/);
        if (!m) throw new Error(`no JSON in reply: ${String(r.result).slice(0, 200)}`);
        let v; try { v = JSON.parse(m[0]); } catch (e) { throw new Error(`${e.message}: ${m[0].slice(0, 200)}`); }
        // A "yes" carries no reason (Haiku sometimes puts its sentence there). A "no" whose reason isn't one of the
        // listed ones stands as a "no" with no reason: only the answer decides, and Haiku's own label is kept in "why".
        if (typeof v.why !== "string" && v.answer === "yes") v.why = v.reason;
        if (v.answer === "yes") v.reason = null;
        if (v.answer === "no" && !REASONS.includes(v.reason)) {
          v.why = [v.reason, v.why].filter((x) => typeof x === "string" && x && x !== "placeholder").join(": ") || null;
          v.reason = null;
        }
        if (!["yes", "no"].includes(v.answer) || typeof v.why !== "string")
          throw new Error(`bad answer: ${m[0].slice(0, 200)}`);
        resolve({ ...v, cost: r.total_cost_usd });
      } catch (e) { reject(new Error(`claude exit ${code}: ${e.message} ${err.slice(0, 300)}`)); }
    });
    p.stdin.end(text);
  });
}

async function main() {
  const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
  if (arg("--show")) { console.log((await payload(arg("--show"))) || "no article"); return; }
  const limit = Number(arg("--limit") || Infinity), jobs = Number(arg("--jobs") || 3);
  const trial = process.argv.includes("--trial");
  if (arg("--model")) MODEL = arg("--model");
  const data = load();
  data.rule = "Whole-article pre-check of wikipedia-links candidates against the content test (IDEOLOGY_STANDARD gate 2), by scripts/ideology-precheck.js";
  let todo;
  if (arg("--titles")) todo = arg("--titles").split("|");
  else {
    const lib = require("./lib");
    const covered = new Set(lib.catalog().flatMap((e) => [lib.articleTitle(e), ...lib.wikipediaOtherNames(e.id)]).filter(Boolean).map((t) => t.toLowerCase()));
    const linked = await require("./ideology-candidates").linkedArticles();
    todo = linked.filter((l) => !covered.has(l.title.toLowerCase())).sort((a, b) => b.via.size - a.via.size || a.title.localeCompare(b.title)).map((l) => l.title);
  }
  todo = todo.filter((t) => trial || !data.verdicts[t]).slice(0, limit);
  console.error(`${todo.length} to pre-check`);
  let cost = 0, done = 0;
  const one = async (title) => {
    try {
      const text = await payload(title);
      if (!text) { console.error(`no article: ${title}`); return; }
      const v = await ask(text);
      cost += v.cost || 0;
      if (trial) { const o = data.verdicts[title]; console.log(`${++done}/${todo.length} ${v.answer.padEnd(3)} ${v.reason || ""}\t${title}${o ? ` (saved: ${o.answer} ${o.reason || ""})` : ""}: ${v.why}`); return; }
      data.verdicts[title] = { answer: v.answer, reason: v.reason || null, why: v.why, model: MODEL, date: new Date().toISOString().slice(0, 10) };
      save(data);
      console.log(`${++done}/${todo.length} ${v.answer.padEnd(3)} ${v.reason || ""}\t${title}: ${v.why}`);
    } catch (e) { console.error(`${title}: ${e.message}`); }
  };
  for (let i = 0; i < todo.length; i += jobs) await Promise.all(todo.slice(i, i + jobs).map(one));
  console.error(`done ${done}; cost $${cost.toFixed(2)} ($${done ? (cost / done).toFixed(3) : 0} each)`);
}

module.exports = { verdicts };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
