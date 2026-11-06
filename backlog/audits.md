# Audits

Audit work discussed but not started.

- **Remaining silence.** `scripts/silence-to-null.js` turned 56,931 "no doctrine" zeros into "no
  known position"; about 47,000 zeros remain, most of them real splits but roughly a third silence
  written with a "but" clause. Re-audits under `audits/AUDIT_RULES.md` (`"rules": 2`) pick these up.
- **Loosely placed shown ideologies.** After any re-audit wave, deepen the shown ideologies left close
  to the uncertainty rule's 50%, the most viewed first (Democracy, Hindutva, Christian nationalism, the
  Alt-right). Single-cause and national movements usually fail honestly; don't deepen those as a
  campaign.
- **"What it stands for" check** (pilot 2026-10-29: one Sonnet reader over the 50 most-viewed
  ideologies' six listed positions, about 59k tokens; it flagged the old Jewish secularism list
  correctly, so the method works, but flagged 45 of 51, many for one minor point). Leads it found,
  each to confirm before acting:
  - **Borrowed scope, re-audit candidates** (as Jewish secularism was): Stoicism (modern positions
    on ethnicity and religion instead of virtue, nature and reason); Egalitarianism (generic
    democratic positions instead of equal worth or equalising resources).
  - **Inferences shown as stated positions:** older audits mark some deductions from a general value
    `medium`, so they reach "What it stands for" (Technocracy's "schools should teach sex
    education", from "technocrats defer to expertise"). The parked inference review would lower
    these; it does affect what takers see after all.
  - **False alarms seen:** Lebensraum's racial segregation (sourced to Nazi occupation law) and
    other single minor flags. Run the full 628 (about 700k tokens) only with this in mind.
  - **Re-check, same 50 with the fixed wording:** a single run of the reader is noisy (54 of its
    first 112 flags weren't repeated). Flagged both times, so the firmest leads: Stoicism (5),
    Egalitarianism (3), Georgism (3: free-trade positions and an unrelated land-claims answer),
    Lebensraum (2: an "overseas territories" answer stretched from eastward settlement) and
    Technocracy (2: sex education deduced from "deference to experts"). These five are the re-audit
    candidates, as Jewish secularism was.
  - **Whole-catalog check** (2026-10-29, one Sonnet reader over all 628 lists, serially, after the
    wording fixes; full output in `scratchpad/beliefs-check-all/`, ranked in `summary.json`): 120
    ideologies have at least one flagged position on their current list (79 one, 32 two). Re-audit
    candidates, most flagged first:
    - **Borrowed scope or deductions across the list:** Soviet anti-Zionism (6 of 6: general Soviet
      state features), Budapest School (6 of 6: rejections deduced from anti-nationalism), Valencian
      nationalism (4: the Compromís coalition's wider politics), Right-wing antiglobalism (3: the
      wider right), Alter-globalization (3), Technolibertarianism (3), Indigenismo (3), Blaverism (3),
      Slovenian nationalism (3).
    - **Firm from the earlier runs** (flagged on wording since reworded, but the problem is in the
      audit): Stoicism, Egalitarianism, Georgism, Lebensraum, Technocracy.
    - **A possible wrong answer, not just a stretch:** Producerism lists foreign land ownership as
      allowed; the Populists opposed alien land ownership.
    Not checked by a second reader yet (`~/work/codex-beliefs-check.md` is ready for Codex); a single
    reader repeats only about half its flags, so confirm before re-auditing the one- and two-flag
    cases.
  - **Jewish secularism re-audit (8fe2108) borrows downward:** about a dozen of its answers rest on
    the American Society for Humanistic Judaism and JFASD alone (same-sex marriage, abortion,
    assisted dying, vouchers), which AUDIT_RULES.md now calls borrowing unless other branches,
    Israeli secularists above all, are shown to share the position. It is off the site already, so
    this matters only if it is deepened again.
- **Nationalisms not yet re-audited may carry their main party's programme** (2026-10-30). Under rules 3 a
  nationalism's doctrine is its position on the nation; a carrying party's or government's wider programme
  is borrowing (Valencian nationalism's old answers came from Compromís, Ethiopian nationalism's from Abiy's
  record). Honest re-audits leave most nationalisms short of the bar, so until all are redone, treatment
  differs by whether one has been re-audited. Re-audit them in turn, or decide another scope with Brandon.

## Source check: gaps it can't see (2026-11-05)

`scripts/source-check.js` (run by validate.js) checks whole sources, not the passage an answer rests on.
Open gaps, to revisit (Brandon: "could be problematic, but it can be revisited"):
- **A named primary text passes for every answer.** Once a defining source names a text by title, any
  passage of it can answer anything, including parts unrelated to the ideology.
- **The right source, the wrong passage.** A source that discusses the ideology can still carry an
  answer from a passage where the author speaks for themselves or describes someone else's view (a
  scholar's own argument, critics' responses), not the ideology's position. Not borrowing (no other
  ideology is involved). Regan on apartheid in Animal rights is probably NOT an example: it follows from the
  rights view's own equal-inherent-value argument.
- **A passing mention is enough (defining sources).** A defining source passes if it names the ideology once. A two-mentions
  floor for defining sources would filter this; primary texts got one on 2026-11-05.
- **The saved copy is trusted.** The check reads the agent's saved text, not the live page.
What would decide it: passage-level checking needs each answer to quote its passage (a new required
field, longer audits), so the check can confirm the quote is in the saved text and that its
surroundings discuss the ideology.

## Source check: filtered sources to look at (2026-11-05)

Answers in these audits rest on sources the source check filters (`node scripts/validate.js <id>`
lists them), but the texts look like the ideology's own, missing a defining author, title or alias
rather than borrowed. Left as they are; look again when the audit gets its next pass, or add
`authors` / `titles` / `aliases` with evidence if a defining source supports them.
- First-wave feminism: Seneca Falls Declaration, Mill's *Subjection of Women*, *History of Woman Suffrage*
- Asian values: Bangkok Declaration (on site; would leave if cleared)
- Dirigisme: Monnet's note to de Gaulle
- Christian Identity: its own sermons
- Greater Serbia: the Načertanije
- Esoteric neo-Nazism: Savitri Devi (Kaplan), Serrano interview
- Soviet anti-Zionism: *Caution: Zionism!*, Kichko's *Judaism Without Embellishment*
- Producerism: Populist platform, Knights of Labor, Weaver, Peffer, Powderly
- Two-nation theory: Iqbal's 1930 address
- Pashtun nationalism: "Pukhtun" Khudai Khidmatgar article, oath, ANP manifesto (on site; would leave if cleared)
- Ottomanism: the 1876 Constitution (on site; would leave if cleared)
- Borderline: Black feminism (Third World Women's Alliance statement), Laicism (2010 Constitutional Council ruling),
  Reactionary feminism, United Armenia, Greater Indonesia, Völkisch nationalism (Chamberlain, Class, Lagarde),
  Trans-exclusionary radical feminism (Women's Declaration, Jeffreys submission)

Cleared as borrowing on 2026-11-05 (answers resting only on those sources set to null): Moderate conservatism (SEP on conservatism, Burke; its "moderate reform" alias was descriptive), Arab nationalism
(Ba'th texts), Majoritarianism (Locke, Dicey), Elitism (Plato), Isolationism and Non-interventionism
(US founding texts), Christian communism (Winstanley), Northwest Territorial Imperative (general reports
on neo-Nazi groups), Ultraconservatism (a general source on conservatism), Postliberalism (Deneen,
Vermeule: its defining source never names them), Irish nationalism (no defining source names it).
- After the 2026-11-05 sourcing pass, still flagged (no source equates the alias, or names the text):
  Esoteric neo-Nazism ("Esoteric Hitlerism" equated only by Wikipedia; Devi, Serrano untied), Hungarian
  irredentism ("Greater Hungary"; Apponyi untied), Ultraconservatism (sources say "ultra-royalist", all 9
  stated answers rest on them), United Armenia (memorandum), Greater Indonesia (Yamin's BPUPK speech),
  Dirigisme (Monnet note), Producerism (Western Sydney thesis was a 403), Moderate conservatism (Kekes's
  book behind Cloudflare; its answers were cleared), Irish republican legitimism (s3 reference).
