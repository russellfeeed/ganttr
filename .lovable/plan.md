## Goal
Let you tick two chart cards on the dashboard and open a comparison view showing how the two roadmaps differ in timing, team/resource needs, tags and dependencies.

## 1. Dashboard selection (`src/routes/index.tsx`)
- Add a checkbox in the top-right of each chart card (always visible; clicking it does not open the chart).
- Keep selected ids in local state, capped at 2. When 2 are ticked, the remaining checkboxes are disabled with a tooltip "Only two charts can be compared".
- A sticky action bar appears once 1+ is ticked: shows the selected chart names, a **Clear** button, and a **Compare** button enabled only at exactly 2.
- Compare navigates to `/compare?a=<id>&b=<id>`.

## 2. Comparison route (`src/routes/compare.tsx`)
Reads both charts from the store by search params; if either is missing, shows an empty state with a link back. Own `head()` metadata.

Layout: header with both chart names (colour-coded A/B) and a back link, then sections:

**Timeline overview**
- Each chart's absolute start date, end date (start + last task end) and total duration in weeks.
- Deltas: how many weeks later/earlier B starts and ends versus A.

**Task comparison** — tasks matched by normalised name (case/whitespace-insensitive):
| Task | A start–end | B start–end | Shift |
Three groups: *In both* (with start/end shift in weeks, highlighted when non-zero), *Only in A*, *Only in B*. Dates shown as real calendar dates derived from each chart's own `startDate`, so charts starting on different Mondays compare correctly.

**Teams & resources**
- Per team (matched by name): headcount per role in A vs B and the difference.
- Totals row: total headcount, total role-weeks of demand, and peak demand per chart.
- Roles/teams present in only one chart are flagged.

**Tags**
- Union of all tags, with task counts per chart and a delta column; tags unique to one chart flagged.

**Dependencies**
- Per matched task, its predecessor name in A vs B; rows differ-highlighted when the dependency was added, removed or changed.
- Counts of total dependency links per chart.

## 3. Comparison logic (`src/lib/compare-charts.ts`)
Pure helper `compareCharts(a, b)` returning the structured diff (timeline, tasks, teams/roles, tags, dependencies) used by the route. Keeps the route presentational and makes the maths testable.

## Notes
- Read-only: no store changes, no schema changes, nothing persisted beyond existing chart data.
- Weeks→dates use each chart's own `startDate` so comparisons are calendar-accurate.
- Task matching is by name; unmatched tasks are listed separately rather than force-paired.
