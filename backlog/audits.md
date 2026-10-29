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

