# Answering new statements in an existing audit

New statements are added to `statements.json` as candidates (see `audits/statements/STANDARD.md`).
Existing audits stay valid and only need answers for the new statements. This is that job.

For each audit you are given (`audits/profiles/<id>.json`) and its list of statement ids:

1. Read the audit's `summary`, `scope` and `sources` first. Answer for the same strand and period the
   scope describes; don't reinterpret the ideology.
2. Answer each listed statement exactly as `audits/PROMPT.md` section 3 says: the same -2..+2 scale,
   the same confidence levels, a rationale that explains the answer, and at least one source id.
   - Reuse the audit's existing sources when they support the answer.
   - When they don't, research it: open a real page with WebSearch/WebFetch and add it to
     `sources` with the next free id (`s7`, `s8`, ...). Cite only pages you opened in this session.
   - An inference from the ideology's principles is fine at `low` confidence; say what you
     inferred it from. Never raise a confidence you can't source.
   - If the statement came from this ideology's own `missingStatements`, your answer should agree
     with the value recorded there.
3. Add the answers to `answers`. Do not change any other answer, field or source.
4. Run `node scripts/validate.js --no-salience <id>`. It should report no "needs answers" warning for the
   statements you were given.

Be economical: most new statements are about one ideology's defining issue, and for the others the
existing sources or a single extra page usually settle it.
