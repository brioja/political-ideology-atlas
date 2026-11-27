// Unit test of the evidence quotes for key works and key figures (scripts/coatrack-check.js; Brandon, 2026-11-27):
// each quote names the work or person and the ideology. A work may be named by its title, the title's head or a short
// name in "shortNames" ("Orbán's Constitution" for the Fundamental Law of Hungary); the ideology by any name, alias or
// form, anywhere in the quote. Whether the quote is in the saved copy is tested in validate-ideology-rules.test.js.
const assert = require("assert");
const c = require("../scripts/coatrack-check");
const audit = { name: "Illiberal democracy" };
const names = [audit.name].map(c.norm);
let n = 0;
const work = { title: "Fundamental Law of Hungary", shortNames: ["Orbán's Constitution"] };
const quotes = {
  "Orbán's Constitution entrenched illiberal democracy in Hungary": { work: true, ideology: true },
  "Orban's Constitution, the charter of Hungary's illiberal democracy": { work: true, ideology: true },
  "The Fundamental Law of Hungary set out the illiberal democracy Orbán had announced": { work: true, ideology: true },
  "Orbán's Constitution was adopted in April 2011": { work: true, ideology: false },
  "Orbán declared in 2014 that Hungary would be an illiberal democracy": { work: false, ideology: true },
  "The new constitution of Hungary set out illiberal democracy": { work: false, ideology: true },
};
for (const [q, want] of Object.entries(quotes)) {
  assert.strictEqual(c.namesWork(work, q), want.work, `names the work: "${q}"`); n++;
  const unnamed = c.ideologyUnnamed(audit, "key work", { ...work, evidence: [{ source: "s1", quote: q }] }, names);
  assert.strictEqual(unnamed.length === 0, want.ideology, `names the ideology: "${q}"${unnamed.length ? ` (${unnamed[0]})` : ""}`); n++;
}
// Without "shortNames" the shorthand doesn't name the work; the title's head (before a colon or bracket) does.
assert.strictEqual(c.namesWork({ title: work.title }, "Orbán's Constitution entrenched illiberal democracy"), false, "shorthand without shortNames"); n++;
assert.strictEqual(c.namesWork({ title: "Fundamental Law of Hungary: The 2011 Text" }, "the Fundamental Law of Hungary"), true, "the title's head"); n++;
// A key figure's quotes are held to the same ideology check: every quote, not one of them.
const figure = { first: "Viktor", last: "Orbán", evidence: [
  { source: "s1", quote: "Viktor Orbán is the architect of illiberal democracy" },
  { source: "s1", quote: "Orbán won a two-thirds majority in 2010" }] };
const fig = c.ideologyUnnamed(audit, "key figure", figure, names);
assert.strictEqual(fig.length, 1, "one of two figure quotes fails"); n++;
assert.ok(/the quote "Orbán won a two-thirds majority in 2010" doesn't name Illiberal democracy/.test(fig[0]), fig[0]); n++;
console.log(`evidence quotes: ${n} cases passed`);
