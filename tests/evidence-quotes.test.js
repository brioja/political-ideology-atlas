// The evidence quotes for key works and key figures, collected as they come up (scripts/coatrack-check.js; Brandon,
// 2026-11-27). Each quote names the work or person and the ideology:
// - a work by its title or the title's head (before a colon or bracket): a nickname the title doesn't contain
//   ("Orbán's Constitution" for the Fundamental Law of Hungary) doesn't name it;
// - a person by their surname;
// - the ideology by its name, an alias or a form of it ("Islamic modernist"), anywhere in the quote.
// Add each quote an audit gets wrong or right that the list doesn't cover yet, with `work`/`ideology` saying whether
// the quote names them. Whether the quote is in the saved copy is tested in validate-ideology-rules.test.js.
const assert = require("assert");
const c = require("../scripts/coatrack-check");

const CASES = [
  { ideology: "Illiberal democracy", work: { title: "Fundamental Law of Hungary" }, quotes: [
    { quote: "The Fundamental Law of Hungary set out the illiberal democracy Orbán had announced", work: true, ideology: true },
    { quote: "the fundamental law of hungary, charter of Hungary's illiberal democracy", work: true, ideology: true },
    { quote: "The Fundamental Law of Hungary was adopted in April 2011", work: true, ideology: false },
    { quote: "Orbán declared in 2014 that Hungary would be an illiberal democracy", work: false, ideology: true },
    { quote: "Orbán's Constitution entrenched illiberal democracy in Hungary", work: false, ideology: true, why: "a nickname the title doesn't contain" },
  ] },
  { ideology: "Illiberal democracy", work: { title: "Fundamental Law of Hungary: The 2011 Text" }, quotes: [
    { quote: "the Fundamental Law of Hungary set out illiberal democracy", work: true, ideology: true, why: "the title's head" },
  ] },
  { ideology: "Illiberal democracy", work: { title: "Orbán's Constitution" }, quotes: [
    { quote: "Orban's constitution entrenched illiberal democracy", work: true, ideology: true, why: "entered under the name its sources use; accents and case aside" },
  ] },
  { ideology: "Illiberal democracy", figure: { first: "Viktor", last: "Orbán" }, quotes: [
    { quote: "Viktor Orbán is the architect of illiberal democracy", work: true, ideology: true },
    { quote: "Orbán won a two-thirds majority in 2010", work: true, ideology: false },
  ] },
  // Islamic modernism's first audit (removed 2026-11-27, commit 5df639e5a).
  { ideology: "Islamic modernism", figure: { first: "Muhammad", last: "Abduh" }, quotes: [
    { quote: "The foremost exponent of Islamic modernism in Egypt was Muhammad 'Abduh (1849–1905).", work: true, ideology: true },
    { quote: "‘Abduh is revered as a key architect of the modern reformation of Islam", work: true, ideology: false },
  ] },
  { ideology: "Islamic modernism", figure: { first: "Jamal al-Din", last: "al-Afghani" }, quotes: [
    { quote: "Early Islamic modernism in Egypt was inspired by two forerunners: the education official Rifa'a Rafip al-Tahtawi and the Iranian-born activist Jamal al-Din al-Afghani", work: true, ideology: true, why: "names both, but as a forerunner: the second quote is what keeps him out" },
  ] },
  { ideology: "Islamic modernism", figure: { first: "Rifa'a", last: "al-Tahtawi" }, quotes: [
    { quote: "the education official Rifa'a Rafip al-Tahtawi and the Iranian-born activist Jamal al-Din al-Afghani", work: true, ideology: false },
  ] },
  { ideology: "Islamic modernism", figure: { first: "Khayr al-Din", last: "al-Tunisi" }, quotes: [
    { quote: "In Tunisia, the reformist Prime Minister Khayr al-Din al-Tunisi (1810–1889) established the Sadiqiyya college", work: true, ideology: false },
  ] },
  { ideology: "Islamic modernism", figure: { first: "Namik", last: "Kemal" }, quotes: [
    { quote: "Namik Kemal (1840-1888) was an Islamic modernist and, as a member of the Young Ottomans, an avid supporter of constitutionalism in the Ottoman Empire.", work: true, ideology: true, why: "\"Islamic modernist\" is a form of the name" },
  ] },
  { ideology: "Islamic modernism", figure: { first: "Sayyid Ahmad", last: "Khan" }, quotes: [
    { quote: "In India, the early modernist trend is primarily associated with the name of Sir Sayyid Ahmad Khan (1817–1898).", work: true, ideology: false, why: "\"modernist\" alone isn't the ideology's name" },
  ] },
  { ideology: "Islamic modernism", work: { title: "The Reconstruction of Religious Thought in Islam" }, quotes: [
    { quote: "widely influential The Reconstruction of Religious Thought in Islam", work: true, ideology: false },
  ] },
  { ideology: "Islamic modernism", work: { title: "The Liberation of Woman" }, quotes: [
    { quote: "The Liberation of Woman is composed in the vein of Islamic modernism", work: true, ideology: true },
  ] },
  { ideology: "Islamic modernism", work: { title: "Risalat al-tawhid" }, quotes: [
    { quote: "His writings include Risālat al-tawḥīd", work: true, ideology: false, why: "the title without its diacritics" },
  ] },
];

let n = 0;
for (const { ideology, work, figure, quotes } of CASES) {
  const entry = work || figure, field = work ? "key work" : "key figure", names = [c.norm(ideology)];
  for (const q of quotes) {
    const label = `${field} "${c.entryName(entry)}", quote "${q.quote}"${q.why ? ` (${q.why})` : ""}`;
    assert.strictEqual(work ? c.namesWork(entry, q.quote) : c.namesFigure(entry, q.quote), q.work, `names the ${work ? "work" : "person"}: ${label}`); n++;
    const unnamed = c.ideologyUnnamed({ name: ideology }, field, { ...entry, evidence: [{ source: "s1", quote: q.quote }] }, names);
    assert.strictEqual(unnamed.length === 0, q.ideology, `names ${ideology}: ${label}${unnamed.length ? ` (${unnamed[0]})` : ""}`); n++;
  }
}
console.log(`evidence quotes: ${n} cases passed`);
