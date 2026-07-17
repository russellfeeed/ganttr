## Goal
In the Capacity view, clicking a heatmap cell (team + role + week) opens a details panel listing every task contributing to that cell, with its allocation quantity, so you can quickly see what's driving demand or an overallocation.

## Scope
Only affects the Capacity heatmap in `src/routes/chart.$chartId.tsx`. No changes to store, export/import, or PDF.

## UX
- Cells become buttons with a pointer cursor and focus ring; hover shows a subtle highlight.
- Clicking a cell opens a **Dialog** (shadcn) titled with the team, role, and week label (e.g. "Cloud · Snr Dev · Week of 12 Aug 2026").
- Dialog body shows:
  - Summary line: `Allocated X / Capacity Y` with a red tint when over capacity, amber when at capacity, otherwise neutral.
  - Table of contributing tasks: task name (color dot + tag), demand quantity for that role, task date range. Rows are clickable and open that task in the existing task editor (closing the dialog).
  - Empty state ("No tasks allocated") when the cell is zero.
- Close via the standard dialog close button or Escape.
- Keyboard: cells are `<button>` elements so Tab/Enter work.

## Technical notes
- Add local state in `ChartEditor`: `capacityCell: { teamId: string; roleId: string; week: number } | null`.
- Pass an `onCellClick` prop into `CapacityHeatmap`; wrap each cell `<div>` as a `<button type="button">` and call it with the coordinates.
- Compute the dialog's task list on the fly from `visibleTasks`: filter by `teamId`, week within `[startWeek, startWeek+durationWeeks)`, and a demand entry matching `roleId` with `quantity > 0`.
- Reuse the existing `formatWeekLabel`/date helpers already in the file for the header.
- Reuse the existing task-selection mechanism (setting `selectedTaskId`) for the "open task" row action.

## Out of scope
- Editing demand from within the dialog (still done in the task editor).
- Bulk actions or rebalancing suggestions.
