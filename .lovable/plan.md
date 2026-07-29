## Goal
Add a tooltip to the Capacity health score area explaining how the 0–100 score is calculated.

## Current behaviour
The `CapacityHealthBar` shows a score, status band and supporting metrics, but the score itself has no explanation of how it is derived.

## Planned change
- Wrap the score / badge block in a tooltip that opens on hover or focus.
- Tooltip text explains the calculation in plain language:
  - Score is based on the average penalty across every role-week cell that has demand (> 0); empty cells are ignored.
  - Penalty rules per active cell: unstaffed demand = 100; overallocated = 30–100 depending on severity; exactly at capacity = 10; above 85% capacity = 5; below 85% = 0.
  - Final score = 100 − average penalty, clamped to 0–100.

## Implementation details
- Edit `src/routes/chart.$chartId.tsx` in the `CapacityHealthBar` component.
- Wrap the score/badge block in the existing shadcn `<Tooltip>` / `<TooltipTrigger>` / `<TooltipContent>` pattern already used by the `Stat` component.
- Keep the visual styling unchanged; only add the tooltip interaction.
- No changes to `computeCapacityHealth` logic, store, or exports.

## Verification
- Open the Capacity view of a chart with demand.
- Hover over the score block and confirm the tooltip appears with the explanation text.