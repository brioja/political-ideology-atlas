// Prints one batch of quiz statements for an AI model taking the quiz itself (audits/PROMPT_MODEL.md).
//   node scripts/model-batch.js        prints the number of batches
//   node scripts/model-batch.js <k>    prints batch k (0-based) as JSON
const { activeStatements } = require("./lib");
const SIZE = 50;
const statements = activeStatements();
const k = process.argv[2];
if (k === undefined) {
  console.log(Math.ceil(statements.length / SIZE));
} else {
  const batch = statements.slice(Number(k) * SIZE, (Number(k) + 1) * SIZE);
  if (!batch.length) { console.error(`No batch ${k}.`); process.exit(1); }
  console.log(JSON.stringify(batch.map(({ id, text, agree, disagree }) => ({ id, text, agree, disagree })), null, 1));
}
