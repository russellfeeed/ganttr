Add an overall resource planning health indicator to the Capacity heatmap view.

## What we'll build

A compact **Health** summary rendered at the top of the Capacity view (above the heatmap grid, spanning the full width). It gives an at-a-glance sense of how healthy the resource plan is across all weeks and roles.

### Score

A 0–100 score, computed from the same `demandByWeek` data the heatmap already builds. For each (team, role, week) cell where the role has headcount > 0:

- ratio = used / capacity
- cell penalty:
  - 0 if ratio ≤ 0.85 (healthy / well-utilised)
  - light penalty if 0.85 < ratio ≤ 1 (at capacity — amber)
  - heavier penalty proportional to `(ratio − 1)` when ratio > 1 (overallocated)
- Cells for roles with `headcount === 0` but `used > 0` count as a hard "unstaffed demand" penalty.

Score = round(100 − weighted average penalty), clamped to 0–100.

### Rating band + color

- 85–100: **Healthy** (green)
- 60–84: **At risk** (amber)
- 0–59: **Overloaded** (red)

### Supporting stats (shown next to the score)

- Overallocated cells: count of role-weeks where used > capacity
- At-capacity cells: count where used === capacity (and cap > 0)
- Unstaffed demand: count of role-weeks with cap = 0 but used > 0
- Peak overload: max `used − capacity` seen in any single cell, with the role/week it happened
- Coverage: % of role-weeks with any allocation (utilisation signal)

### Placement

- Rendered inside `CapacityHeatmap` as a sticky banner above the header row (or as a bar directly above the two-pane layout, full width). It stays visible while scrolling the timeline horizontally.
- Uses the same color tokens already in the file (destructive / amber / muted) — no new tokens.

## Technical details

- File: `src/routes/chart.$chartId.tsx` only.
- New pure helper `computeCapacityHealth(teams, demandByWeek, totalWeeks)` colocated with `CapacityHeatmap`, returning `{ score, band, overCells, atCapCells, unstaffedCells, peak, coveragePct }`.
- Memoize the health result with `useMemo` keyed on `teams`, `demandByWeek`, `totalWeeks`.
- New small presentational component `CapacityHealthBar` rendered at the top of the Capacity view.
- No store/schema changes, no new dependencies.

## Out of scope

- Per-team health scores or drill-down panels.
- Historical trend / sparkline of health over time.
- Health surfaced in List or Swimlane views.
- Persisting the score or exporting it to PDF/Zoho.
