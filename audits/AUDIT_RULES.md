# Audit rules (ideologies and people)

These rules apply to every audit: ideologies (`audits/PROMPT.md`) and people (`audits/PROMPT_PEOPLE.md`).
Those prompts add only what is specific to their subject and never loosen a rule here. A change to
how evidence is judged goes in this file, so both kinds of audit get it.

"The subject" below is the ideology or the person being audited. Write `"rules": 2` in the audit
file, to record that it follows these rules.

## 1. Standard

Follow a Wikipedia-style standard: describe the subject's documented positions neutrally, however
controversial they are. Don't editorialize, soften or omit positions because they are
objectionable; attribute them to sources instead. Write the summary and rationales in your own
words; don't paste long passages.

## 2. Sources

- Use web search and fetch tools and cite only pages you opened in this session, by the URL you
  visited. Never cite from memory or construct a URL.
- Use at least 3 sources, including at least one `primary` source (the subject's own texts:
  founding documents, programmes, speeches, books, their record) and at least one `scholarly` or
  `reference` source.
- Scholarly reference works (the Stanford and Internet Encyclopedias of Philosophy, Britannica,
  Oxford or Routledge reference works) are scholarship, and count as evidence. Wikipedia,
  OnTheIssues and similar compilations are only a way to find evidence: follow their citations to
  the original and cite that. An answer whose only source is Wikipedia has no evidence.
- Check a quotation in the original: one on Wikiquote or in an article can be cut, misattributed
  or out of context. If the original is blocked or offline, look for it elsewhere (an archive.org
  copy, another site hosting the same text, the official record) before giving up.
- Do not use political-quiz sites (12axes, 8values, Political Compass, IDRlabs, the polcompball
  wiki and similar) as sources: a site's guess at where someone stands isn't evidence.
- Research theme by theme. Each statement has a `theme` (economy, government, society, world,
  liberty, culture, ecology, technology, means, globalism); an overview covers only a few statements
  per theme. After a first pass, count your known positions per theme and search specifically for
  the thin ones. Government (elections, courts, executive power, federalism) and world (wars,
  alliances, aid, the UN) are the themes most often left thin.
- When the subject's own texts are available as full text (a book, manifesto, programme or speech
  collection), download them into your scratch folder and search them for each theme's topics
  rather than reading summaries.
- The runner may hand you a text the maintainer supplied (a book you couldn't fetch yourself).
  Treat it as a primary source and search it the same way. Cite it as the published work, with the
  url of a publisher or library catalog page for it that you opened (e.g. openlibrary.org/isbn/…),
  never a file path or download site. Name the chapter in each rationale that rests on it, and
  paraphrase rather than quote more than a short phrase. A text's claims about its own results are
  claims; answer from the positions it states.

## 3. Answers

Answer every statement with -2 (strongly disagree) to +2 (strongly agree), or `null` (no known
position). Read each statement literally: "Free trade benefits everyone in the long run" is about
free trade, not about markets in general.

- **No data, no position.** If the sources record nothing on a statement, answer `null`, at `low`
  confidence, with a rationale saying so. Silence is not neutrality, so never record it as 0, and
  absence of evidence is never a negative answer ("no rehabilitative aim recorded" is not a position
  on prisons). Matching leaves a `null` out: it never counts as agreement, "Neither" or
  disagreement.
- **0 is a documented middle:** the evidence genuinely points both ways (a mixed record, strands or
  adherents split), or the subject deliberately takes no side (laïcité refuses to rule on religious
  doctrine). Mixed evidence is `low`. Don't use 0 to avoid a hard call.
- **±2** only when the position is central or stated explicitly and forcefully.
- **A general value doesn't answer a specific statement.** Humanism, liberty, equality, democracy,
  "freedom of religion" or "equal rights for all" say nothing stated about returning to foraging,
  apostasy laws or blasphemy. An answer deduced only from a value is an inference (below). An
  answer resting on what the subject says about the statement's topic is evidence: a movement that
  campaigns for gay rights has a position on criminalising homosexuality.
- **A statement the doctrine settles is stated, not inferred.** Where the statement says the same
  as the subject's stated position on the same question, or contradicts it, the answer is a stated
  position, as strong as the subject holds it: a doctrine that authority belongs to experts by
  competence rejects rule by inheritance, by clergy or by a sacred ruler, and one that the nation is
  defined by language has a position on defining it by descent. A statement on a different question
  that the position only bears on is still an inference (below).
- **A narrower or nearby case doesn't answer a broader or different statement:** cannabis is not all
  drugs, unauthorized migration is not immigration levels, refugee relief is not development aid,
  and a state's right of defence is not a person's right to kill in self-defence.
- **A related subject's sources aren't the subject's.** Sources about a broader, narrower or related
  subject don't answer for the subject, in either direction: secularism's not for Jewish
  secularism, nor American Jewish secularism's for Jewish secularism as a whole; a party's not for
  one of its members. That is borrowing, neither evidence nor inference: without the subject's own
  sources the answer is `null`. One branch's position (one country, strand or organisation) is the
  whole subject's only where sources show the other branches share it; where they differ, it is a
  split (0, `low`).
- **Critics aren't evidence.** What opponents say about the subject, and interest-group ratings (a
  lobby's scorecard grade), are not evidence of a position.
- **Record over words.** Where the subject's own record directly contradicts their words (elections
  rigged or cancelled, a single party kept in power while praising pluralism), the record wins; if
  the evidence is genuinely mixed, answer 0 at `low`. Words alone are never `high` where the record
  pulls the other way. Each prompt says what counts as the subject's own record.
- **Inference, only from a stated principle.** Where the subject never addressed a statement and
  no stated position settles it, but a principle they state bears on it directly, you may infer the answer (where the subject's prompt
  allows it). An inferred answer is `low`, and its rationale begins "Inferred:" and says what it is
  inferred from. If no stated principle bears on it, the answer is `null`.
- **Fix the answer, not the wording.** When the validator rejects an answer, change the answer: if it
  says contested evidence must be `low`, lower the confidence; never rephrase a rationale to slip
  past a check.

Each rationale is one or two plain sentences that explain the answer, not restate it, and cites at
least one source id from your `sources` list.

## 4. Confidence

- `high`: stated directly on this statement in a primary source or shown by the record, cited from
  that source, or (for an ideology) settled in the scholarship. The rationale says what the source
  states about this statement; a stock phrase ("Nationalism rejected.") or a position the sources
  never discuss is at most `medium`.
- `medium`: clearly implied by what the subject said or did on this statement's topic; reported by a
  secondary or scholarly source; or (for an ideology) the documented majority view of adherents.
- `low`: inferred, mixed, contested or anachronistic. If the rationale has to say the answer is
  inferred, that the evidence or adherents are split, or that the question is anachronistic, the
  answer is `low`, however clear the inference seems.

## 5. Salience

The validator checks whether the subject's known positions place them on the test's dividing lines
precisely enough to tell neighbouring ideologies apart. Every answer resting on evidence counts,
whatever its confidence; inferences ("Inferred:") and `null` don't. A subject with too thin a record
is left out of the test. Don't pad answers or upgrade an inference to pass: an honest rejection is
the correct outcome.

## 6. Deepening an existing audit

The runner may ask for another pass on an audit that fails the salience check or sits close to it.
Build on the existing audit rather than starting over:
- Read its sources and answers. Count known positions per theme and research the thinnest themes.
- Keep the subject. Don't borrow a related subject's positions (secular humanism's for secularism,
  a party's for one of its members, a relative's or employer's for a person).
- Change an answer or raise its confidence only on evidence you found and cite. Check every answer
  you touch against these rules: one deduced from a general value becomes an inference (`low`,
  "Inferred:"), and a ±2 you lower that way becomes ±1, since an inference isn't stated forcefully.
- Use a model that hasn't audited the subject yet. Add your model id to `auditor` (a list, the
  first auditor first) and list every pass in `passes`, e.g. `[{ "auditor": "<first>",
  "auditedAt": "<its date>" }, { "auditor": "<you>", "auditedAt": "YYYY-MM-DD" }]`; `auditedAt` is
  the date of your pass. Set `"rules": 2`.
- If the record really has nothing more, failing salience is the correct outcome. Say in `notes`
  which themes you searched.
