# Results page

## Showing uncertainty with the match (parked 2026-10-30)

At "Done" (precision 1, line matching) the top few ideologies sit within the taker's placement
uncertainty, so the leader can swap and every kind of taker lands at 79-92% match. Showing the
uncertainty would tell takers how settled their result is; the page shows a plain % match for now.

Preferred direction when revisited: from how much the result moved during the test, because it
also captures a taker whose answers vary. Open choices:
- what is tracked: the top ideology's own %, the top % whoever leads, or every listed ideology's %;
- the window: whole test, since "Done", the last 14 answers (one per real line), or the last half;
- where it shows: results heading, beside the quiz progress, or on each bar;
- whether it replaces or sits beside "Your top match has settled", which measures nearly the same.

Other ways of computing it: d ± s on the lines (s = placement uncertainty), or resampling the
taker's answers. Display options: a range ("87% (78-96%)"), ±, a band on each bar, the ideologies
within range named. What would decide it: a replay of real links (~/work/regression-links.txt)
showing the ranges each option gives.
