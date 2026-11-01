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
narrows the worst line instead of separating likely matches looked far less accurate (45/143 vs 110/143),
but the comparison is unfair: the simulated takers are copies of ideology audits and answer "No opinion"
wherever their audit is blank, so 45% of the narrowing selector's questions were wasted (26% for today's
selector, which only scores statements ideologies have positions on and so effectively knows which ones a
simulated taker can answer). Counting answered statements only: 109 vs 123/143. Undecided: comparing
selectors fairly needs takers who answer every statement (real ones).


Resolved 2026-10-31 with model-generated takers (each at an ideology's place, answering every statement
as the model predicts there plus its noise; scratchpad tools, test.js section 3 uses the same takers). At
equal length both selectors place takers about equally well (0.34 SD per line after 49 statements either
way); narrowing the worst line does better on the worst line (0.85 vs 0.94 SD). What differed was the
mismatch: the old selector aimed at telling likely matches apart while "Done" measured placement, so it
reached Done slowly. Shipped: one Done rule (doneGaps in pca.js) that the selector aims at too, measured as
band width, every band at most ±1. Brandon first picked ±1.25 (fewer statements for the same accuracy),
but his own result at 35 statements put a sparse ideology first (Post-Marxism: same side on 4 of his
answers, opposite on 5); at 60 his usual Saint-Simonianism was back level at the top (same side on 33,
opposite on 3). Results at Done:

| rule (placement selector unless noted) | statements | own ideology first |
| --- | --- | --- |
| old selector, 35% share (before) | 46 | 89/143 |
| band ±1.5 | 25 | 68/143 |
| band ±1.25 | 35 | 91/143 |
| **band ±1 (shipped)** | 60 | 111/143 |
| share 25% / 15% | 32 / 65 | 63 / 100 of 143 |

Band rules find the ideology more often than share rules at the same length; they leave lines 10-14 a
little looser (0.43-0.51 SD off vs 0.35-0.42). The selector depends only on which statements are answered,
so the quiz is effectively a fixed sequence: it changes with an ideology audit or a "No opinion" (Brandon:
fine). The bar is drawn on a log scale of the worst band's gap (a straight scale read half full after two
statements).

## Two-stage progress bar (idea, 2026-10-31)

Brandon: the bar could fill up twice, once per accuracy level, e.g. "Short quiz done" at a looser band,
then "Long quiz 10%" toward Done (±1.25 took 35 statements, own ideology first 91/143; ±1 took 60 at
111). Not started.

## Thinner ideologies leading (watch, 2026-10-31; narrowed 2026-11-01)

A mild taker matching a mild ideology is fine (Brandon). The worry was that an ideology with fewer
positions (Post-Marxism, 103, vs Saint-Simonianism, 252) could come first because distance weighs each
line by reliability. Post-Marxism is thinner on every line: its error bars (±1 SD) are ±0.78-1.06, wider
than 90-96% of the 570 shown ideologies on 13 of 14 lines and 1.5-1.8 times Saint-Simonianism's
(±0.50-0.73); they look short on the page only because the lines span about ±10. On Brandon's
60-answer mobile run (2026-10-31, with the misread economy-in-majority-hands answer corrected),
Saint-Simonianism is closer (8.9 vs 10.7). Two-thirds of Post-Marxism's squared distance is on the drawn
lines (Globalism-Nationalism alone 38 of 115: Brandon -10.8, Post-Marxism -4.2), and giving it
Saint-Simonianism's reliability on every line moves it only from 10.70 to 11.00. So thinness nudges, it
didn't decide that run. Earlier, at 35 answers, Post-Marxism came first with 4 same side / 5 opposite on
13 shared statements. Like-with-like matching was decided against (decided-against.md). Watch for a
thinner ideology leading on real links; deepening its audit is the route that needs no change to matching.

## A 20% overall average (measured 2026-11-01, kept at 25%; superseded the same day)

Superseded: the rule moved to error bars the same day (below), which measure what this section
measured in the units distances use.

The uncertainty rule's overall check allows 25% unknown on average over the 14 lines (error bars on
average no wider than half a line's spread). At 20%, 23 of 559 shown ideologies and 72 of 338 shown
people would leave (list kept outside the repo, `~/work/average-20-percent.md`); Black feminism (24%)
would be among them. Too drastic for now: revisit only if takers complain about matching. Control
case for any change here: Brandon's own results matching Jared Kushner, with whom he disagrees on
lines 10-14 (a thin record on those lines pulled toward him); a change that makes that match
stronger, not weaker, is going the wrong way.

## Uncertainty rule moved to error bars (2026-11-01)

Brandon: the share-of-spread rule (each line at most 50% unknown, 25% on average, line 13 allowed 60%)
let ideologies in that were placed poorly on the big lines. Bars now come from the known positions
alone (no baseline: a line nothing reaches has an infinite bar), in line units, the units distances use;
shown when no bar exceeds ±4 and they average at most ±2 (`MAX_BAR`, `MAX_MEAN_BAR` in pca.js). The
quiz's Done, the next-question selector, the progress bar and the drawn bars use the same
bars, at half the limits: Done when no bar exceeds ±2 and they average at most ±1 (simulated takers:
48 statements, own ideology first 107/134; every bar ±1 took 80 statements for 111). Per line, 50%
unknown had allowed about ±6 on lines 1-2 but under ±2 on lines 12-14. Measured on
the audits at the time: 559 -> 536 ideologies (+6 that failed only on line 14, -29), 338 -> 268 people
(+2, -72, about half of them US politicians close to the line whose Congress records are not yet
searched; Joe Rogan and Alex Jones among them). Line 13's allowance was removed with it. A Joe Rogan
Experience transcript mirror was tried to fill his line 11 (secession) and deleted: his silence there is
real.
