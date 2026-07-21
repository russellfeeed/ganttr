## Fix capacity health scoring to ignore empty cells

**Problem**: The current health score averages penalties across all team/role/week cells, including empty ones (0 penalty). That dilutes the score so a chart full of red overallocated cells can still read 92/100 while coverage sits at 31%.

**Change**: Base every health metric only on cells that have demand or unstaffed load. Empty cells contribute to nothing.

### Scoring rules (in `computeCapacityHealth`, `src/routes/chart.$chartId.tsx`)

- Define **active cells** = cells where `used > 0` OR `headcount > 0 && demand > 0` (i.e. any cell with real demand, staffed or not). Empty role-weeks are ignored entirely.
- Score = `100 - (sum of penalties / activeCells)`; if `activeCells === 0`, show "No demand" instead of a number.
- Penalty weights stay as today (overallocated > unstaffed > at-capacity), but are only averaged over active cells.
- Health bands unchanged (Healthy / At risk / Overloaded thresholds).

### Coverage redefinition

- Coverage currently = `allocatedCells / totalCells` which is really "demand density", not staffing coverage. Redefine as **staffing coverage**: `staffedDemand / totalDemand` across active cells (sum of `min(used, headcount)` ÷ sum of `used`). This makes it answer "how much of the demand is actually staffable?" and lines up with the score.
- Rename tooltip copy accordingly: "Share of total role-week demand that assigned teams can staff."

### Stats bar

- Keep Overallocated / At capacity / Unstaffed counts as raw counts (not ratios) — they already only count active cells.
- Peak overload detail unchanged.

### PDF export

- Mirror the same logic in `src/lib/export-pdf.ts` health header so the printed score matches the UI.

### Out of scope

- No visual redesign of the heatmap or bands.
- No changes to how demand is entered or how teams/roles work.

### Technical notes

- `computeCapacityHealth` currently iterates `demandByWeek` cells; switch the denominator from `totalCells` to a running `activeCells` counter and compute coverage from summed used/staffed values in the same pass.
- Update the `Stat` tooltip strings for Coverage and (optionally) Score to reflect the new definitions.
