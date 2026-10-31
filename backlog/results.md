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

## Error bars instead of a dot (idea, 2026-10-31)

Show the taker's place on each dividing line as a range, not a point: `lineStats` in pca.js gives
each line's variance, so ±1 SD is available already. A line with nothing answered shows as wide as
the ideologies' whole spread there and narrows as statements on it are answered. First as a
debugging view; whether takers see it is open.

## Far-edge distance (parked 2026-10-31, Brandon wants to understand it better first)

Measure each line between the furthest points of the two records' ranges (|Δ| + sd_a + sd_b) instead
of between their centres, so a line a record leaves unknown counts against it without any inclusion
rule. It doesn't score silence: null leaves the range wide, a middle answer narrows it. Measured at
±1 SD on every complete audit with no rule (scratchpad tool far-edge.js): it barely separates thin
records (mean distance to the others 33.6 for the thinnest vs 32.1 for well-placed ones), because the
middle of a line plus one SD is about where a typical known ideology sits. A record failing the 50%
rule was in the top 5 for 44 of 140 simulated adherents after 77 statements, and first for 45 of 114
regression takers. A wider edge (2 SD, the line's ends) would separate them more, but how wide is a
chosen number, the same choice as the 50% inclusion cut-off in another form.

## A stricter "Done" (measured 2026-10-31, kept as is)

"Done" is every line at most 35% of its own spread unknown. A fixed band width instead, measured on 143
simulated believers (every 4th shown ideology, ~20% of answers nudged, "No opinion" where the audit has
none), with today's selector:

| Done when | median statements | own ideology first | top 3 |
|---|---|---|---|
| 35% of own spread (now) | 64 | 110/143 | 130/143 |
| every band at most ±2 | 59 | 87/143 | 108/143 |
| every band at most ±1.5 | 94 | 126-128/143 | 136-138/143 |
| every band at most ±1.25 | 119 | 130-135/143 | 136-142/143 |
| every band at most ±1 | 196 | 120/143 | 123/143 |

±1.5 is the knee, but the gain is measured only on idealised one-ideology takers, while it costs every
real taker ~30 statements; kept at 35% until real takers say results feel unsettled. A selector that
narrows the worst line instead of separating likely matches reaches Done in half the statements but
finds the right ideology far less often (45/143 vs 110/143): the disagreement selector stays.

