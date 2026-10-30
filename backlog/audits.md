# Audits

Audit work discussed but not started.

- **Remaining silence.** `scripts/silence-to-null.js` turned 56,931 "no doctrine" zeros into "no
  known position"; about 47,000 zeros remain, most of them real splits but roughly a third silence
  written with a "but" clause. Re-audits under `audits/AUDIT_RULES.md` (`"rules": 2`) pick these up.
- **Inference review** (parked 2026-10-29: it changes only which ideologies pass salience, nothing a
  taker sees). Medium/high answers deduced from a general value should be low. Prepared in
  `scratchpad/inference-pass/` (jobs, brief, apply and status scripts); the method was two
  independent reviews, lowering only where both agree.
- **Loosely placed shown ideologies.** After any re-audit wave, deepen the shown ideologies left close
  to the salience bar, the most viewed first (Democracy, Hindutva, Christian nationalism, the
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
- **Next-question selector and results ranking use different measures of fit** (found 2026-10-30, simulated
  takers through the real selector). nextQuestion weights ideologies by squared misses extrapolated to all
  answers (very sharp: half the weight on one ideology by ~q20), while the results page ranks by mean absolute
  gap over shared statements. They disagree on the leader, so questions narrow a ranking the taker isn't
  shown and the shown top match wanders for mixed takers (an environmentalist-libertarian mix got African
  feminism at q40). Direction: one measure of fit for both, no special rules; measure with regression.js.
