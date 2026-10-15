# Contributing

Thanks for helping make Political Ideology Atlas more accurate. Every ideology and person in the
test is backed by a public audit, a JSON file listing their answer to each statement, the reasoning,
a confidence level, and the sources. Corrections to those audits are the most valuable
contributions.

## Inclusion standard

The test follows a Wikipedia-style standard: anything notable and documented in reliable sources is
included and described neutrally, however controversial. Nothing is left out because it is
objectionable, and nothing is added on someone's say-so. The only reasons to leave something out are
missing evidence (a statement with no known position, an ideology with no documented color
tradition) or the published rules (such as the salience check), never a judgment about who or what
deserves to appear.

## Challenge an answer

If you think an ideology or person is placed wrong on a statement:

1. Find their audit: `audits/profiles/<id>.json` for ideologies, `audits/people/<id>.json` for people.
2. Either **open an issue** quoting the statement, the current answer, what you think it should be,
   and a source that shows it; or **edit the file** yourself:
   - change `value` (-2 to +2, or `null` for a person with no known position), `confidence` and
     `rationale`;
   - add your source to `sources` and cite its `id` in the answer;
   - cite a page you actually read. Primary sources (the ideology's founding texts, or the person's
     own words, votes and actions) beat commentary about them.
3. Run `node scripts/validate.js <id>` (add `--people` for a person) and fix any errors.
4. Open a pull request saying what you changed and why.

Please keep to the audit rules in `audits/PROMPT.md` (ideologies) and `audits/PROMPT_PEOPLE.md`
(people). In particular, never infer a living person's view from their party or ideology. Leave it
`null` instead.

## Suggest an ideology or person

- **Ideology:** add an entry to `audits/catalog.json`, then write its audit following `audits/PROMPT.md`.
- **Person:** add an entry to `audits/people-catalog.json`, run `node scripts/pageviews.js` to record
  their Wikipedia views, then write the audit following `audits/PROMPT_PEOPLE.md`. Run
  `node scripts/people-report.js` to check the roster's balance of gender, region and era.

A person only appears in the test if their record places them on the test's dividing lines
precisely enough to tell neighbouring ideologies apart. That's not a judgement about who is
"political enough"; it's computed from the data (see the README). If a person you add is excluded,
that usually means their public record covers too few kinds of issues for a meaningful match.

## Change the statements

Statements live in `statements.json` and follow `audits/statements/STANDARD.md`: a statement
must be a real, sourced position that ideologies disagree on. To propose one, open an issue with
the wording and a source for an ideology's stance. New statements start as candidates and existing
audits only need to answer them. Rewording a statement needs a new id, because audits answered
the old text. The `agree`, `disagree` and `note` explanations can be edited freely.

## Before opening a pull request

```
node scripts/validate.js            # ideology audits
node scripts/validate.js --people   # person audits
node scripts/build.js               # rebuild data.js and people.js
node test.js                        # math checks, plus the salience controls
```

`test.js` checks that apolitical celebrities (`audits/controls/`, audited with the same rules) are
still excluded. If your change makes one of them pass, something has gone wrong.

## Code and design

The site is plain HTML, CSS and JavaScript with no build step. Open `index.html` in a browser or run
`python3 -m http.server`. Please keep it accessible: every color has a shape and a text label
alongside it (WCAG 2.2 SC 1.4.1), and colors meet 3:1 contrast in light and dark mode.
