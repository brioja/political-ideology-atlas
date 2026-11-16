# Audit rules (ideologies and people)

These rules apply to every audit: ideologies (`audits/PROMPT.md`) and people (`audits/PROMPT_PEOPLE.md`).
Those prompts add only what is specific to their subject and never loosen a rule here. "The subject" is the
ideology or person being audited. Write `"rules": 7` in the audit file.

## 1. Standard

Follow a Wikipedia-style standard: describe the subject's documented positions neutrally, however
controversial. Don't editorialize, soften or omit positions because they are objectionable; attribute
them to sources. Write the summary and rationales in your own words; don't paste long passages.

## 2. Sources

- Cite only pages you opened in this session, by the URL you visited. Never cite from memory or construct
  a URL.
- Use at least 3 of the subject's defining sources: its own texts (founding documents, programmes, speeches,
  books, its record) where it has them, and the scholarship and reference works that define it.
- Scholarly reference works (Stanford and Internet Encyclopedias of Philosophy, Britannica, Oxford or
  Routledge) are evidence. Wikipedia, OnTheIssues and similar compilations only help find evidence: follow
  their citations to the original and cite that. An answer whose only source is Wikipedia has no evidence,
  and Wikipedia doesn't decide a subject's scope or what it holds. Read Wikipedia and Wikidata with
  `node scripts/wiki.js`, YouTube with `node scripts/yt.js`, Project Gutenberg with `node scripts/gutenberg.js`.
- Prefer a publisher's, author's, library's or archive's own copy. When it can't be opened, a Wayback copy,
  mirror or third-party copy of the same text is fine; say in the source title which copy it is. A
  publisher's or bookseller's preview is citable for the pages it shows; say so in the title.
- Check a quotation in the original: one on Wikiquote or in an article can be cut, misattributed or out of
  context. If the original is blocked, look for it elsewhere (Wayback, archive.org, a mirror, the official
  record) before giving up.
- Download pages with `node scripts/get.js <id> <url>` (it saves into the source library and tries each
  download agent). If no agent gets a page, name it in your report.
- Song lyrics are the subject's own words only if the subject wrote or co-wrote them; check and cite the
  songwriting credit.
- Political-quiz sites (12axes, 8values, Political Compass, IDRlabs, the polcompball wiki and similar) are
  not sources.
- Research theme by theme (each statement has a `theme`). After a first look, count known positions per
  theme and search specifically for the thin ones; government and world are the themes most often left thin.
- Where the subject's own texts exist as full text, download them and search them for each theme's topics
  rather than reading summaries. Keep downloads in `scratchpad/sources/<id>/` with an entry in its
  `index.json`; check it first, so later passes reuse it.
- Bulk public records are in `~/.cache/political-ideology-atlas/corpora/` (its README.md lists them and their
  tools): roll calls, floor speeches, hearings, Hansard, Knesset votes and bills, interview transcripts and
  more. Check them before searching the web for votes, speeches or interviews. Before giving up on a blocked
  source, search GitHub for a mirror or dataset. Cite a dataset by its publisher's page and version, a
  transcript by its original page (or a Wayback copy; or the dataset's page with the transcript's id in the
  title, keeping the dead address in `original`). Machine transcripts without speaker labels count only where
  the speaker is unambiguous and the passage reads coherently.
- A text the maintainer supplied is a primary source like any other. Cite it as the published work, with a
  publisher or library catalog page you opened, never a file path; name the chapter in each rationale that
  rests on it, and paraphrase rather than quote more than a short phrase.

## 3. Answers

Answer every statement with -2 (strongly disagree) to +2 (strongly agree), or `null` (no known position).
Read each statement literally: "Free trade benefits everyone in the long run" is about free trade, not
markets in general.

- **No data, no position.** If the sources record nothing on a statement, answer `null` at `low`, with a
  rationale saying so. Silence is not neutrality (never 0), and absence of evidence is never a negative answer.
- **Evidence for one part is not evidence for the whole.** Where a statement covers several things (a list,
  or a general word such as "security forces"), answer only on evidence covering the whole claim; otherwise
  `null`.
- **0 is a documented middle:** the subject's own sources genuinely point both ways, or the subject
  deliberately takes no side (laïcité refuses to rule on religious doctrine). Mixed evidence is `low`. Don't
  use 0 to avoid a hard call. A 0 cites the evidence for each side, of the same kind: actions against actions
  or words against words. Words against actions is not a split; answer from the actions. Adherents disagreeing
  while the sources take no side is `null`.
- **±2** only when the position is central or stated explicitly and forcefully.
- **Every answer is stated or null; there are no inferences.** An answer is stated when the subject's own
  stated position settles the statement: says the same, says the opposite, or could not be true without
  contradicting it (a doctrine that authority belongs to experts by competence rejects rule by inheritance).
  If the statement could be true without contradicting anything the subject states, the answer is `null`,
  however likely an answer seems.
- **A premise is not a position.** A view a source assumes in order to argue something else isn't the
  subject's position: answer only from what the source presents as the subject's own.
- **A general value doesn't answer a specific statement.** Liberty, equality, democracy or "equal rights for
  all" say nothing about apostasy laws or returning to foraging: `null`.
- **No guessed outcomes.** An answer that needs a guess about what the subject's method would produce, a
  contemporary consensus, or what adherents would probably think is `null`.
- **Evidence answers only the statement it settles.** A vote, act or statement answers a statement only if
  the statement couldn't be true (or false) without contradicting it. Evidence that fits either answer is
  `null`: voting against sanctioning the International Criminal Court doesn't settle "leaders should be tried
  before international criminal courts"; cannabis legalisation doesn't settle all drugs.
- **No coatracks.** Another subject's sources don't answer for this one, in either direction: a broader,
  narrower or related ideology's (secularism's not for Jewish secularism), a member movement's, a party's for
  one of its members, a relative's or employer's for a person, a government's for a head of state who only
  signed its measures on advice, or organisations' platforms for an ideology they share. An organisation's or
  thinker's own account of the ideology's tenets is a defining source; its platform or campaigns are not. Where
  the subject's own sources take opposite positions, it is a split (0, `low`).
- **Sources count by what they are.** Anyone's account of what the subject thinks is a way to find evidence,
  not evidence. A quotation counts only once checked in the primary source with its context; a full
  transcript is primary, an excerpt is not. A report that the subject did something counts as a report of the
  record. Interest-group ratings aren't evidence.
- **Record over words.** Where the subject has a record on a statement (acts), answer from the record alone
  and leave their words on it out, whether they agree or not. Words answer only where there is no record. A
  record pointing both ways is 0 at `low`. Tag each source as actions or words; a source holding both is
  listed twice, once per kind.
- **Over time.** Answer the mature position: held longest and set out most fully. A later position replaces it
  only when the change was explicit and sustained for years; a late remark or one-off reversal makes the
  answer mixed at most. Later words never override a record; only a later record does. Say in the rationale
  when a position changed.
- **Fix the answer, not the wording.** When the validator rejects an answer, change the answer; never
  rephrase a rationale to slip past a check.

Each rationale is one or two plain sentences that explain the answer and cite at least one source id.

## 4. Confidence

- `high`: stated directly on this statement in a primary source or shown by the record, or (for an ideology)
  settled in the scholarship. A stock phrase or a position the sources never discuss is at most `medium`.
- `medium`: clearly implied by what the subject said or did on this topic, or reported by a secondary or
  scholarly source.
- `low`: mixed or contested. If the rationale has to say the evidence is split, the answer is `low`.

## 5. Uncertainty

The validator measures how precisely the subject's known positions place it on each of the test's dividing
lines; a subject whose record leaves some line too loose is not shown. Every answer resting on evidence counts;
`null` doesn't. Don't pad answers to pass: an honest rejection is the correct outcome.

## 6. Research to the end, and later passes

**An audit goes as deep as the record allows.** There is no limit on sources and no later pass fills gaps:
never stop early. If the draft fails the uncertainty rule, keep researching: the lines the validator names,
then the statements still null, in new sources (the local corpora too). Stop when they are covered or the
record has nothing more, and say in `notes` which themes you searched. Never raise a confidence to pass.

**Texts known to exist** (people): every text by the person the validator knows of (Project Gutenberg, Miller
Center speeches, Voteview roll calls) is read and cited, or declined in `booksNotUsed` with a reason.

**Not found means tried twice:** a source you looked for and couldn't get goes in `notFound` with at least two
attempts in different places.

A later pass builds on the existing audit rather than starting over:
- Read its sources and answers. Research the lines the validator names, then the thinnest themes.
- To change an earlier answer, write the new answer with its reason and add the old one, signed, to the
  statement's `reviewHistory`. Words never overturn an action.
- Change an answer or raise its confidence only on evidence you found and cite. Every "Inferred:" answer an
  older pass left becomes stated (cite the source that settles it) or `null`.
- Add your model id to `auditor` and list every pass in `passes`; set `"rules": 7` and bring the whole file up
  to it.
