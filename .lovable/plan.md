## Add export end-date (month/year) for PDF and JPG

When the user picks Export PDF or Export JPG (current view) from the Export / Import dropdown, first open a small dialog that lets them cap the exported timeline at a chosen month/year. Applies to both PDF and JPG. JSON and Zoho CSV are unchanged.

### Dialog

- Trigger: clicking "Export PDF" or "Export JPG (current view)" opens `ExportRangeDialog` instead of exporting immediately. The dialog remembers which format was requested.
- Fields:
  - Month select (Jan–Dec) and Year select.
  - "End date" preview line showing the resolved last week (e.g. `Ends week of Mar 30, 2026 · 42 weeks`).
- Suggested values (populated as quick-pick chips above the selectors):
  - `Full timeline` (default — current `totalWeeks` behavior)
  - `Last task ends` — month/year of the final task's end week
  - `+3 months`, `+6 months`, `+12 months` past the last task end
  - `End of current year`
  Each chip sets the month/year selectors. Chips whose date is before the chart start are hidden.
- Buttons: `Cancel`, `Export`.

### Behaviour

- The chosen month/year resolves to a week index: last week whose start date is `<= endOfMonth(selected)`. Clamp to a minimum of `requiredWeeks` (never cut off existing tasks) — if the user picks earlier, show an inline warning and disable Export.
- The resolved `exportWeeks` replaces `totalWeeks` in the export call only; on-screen `totalWeeks` is unchanged.
- PDF: pass `exportWeeks` into `exportChartToPdf` (already parameterised by `totalWeeks`). Capacity `demandByWeek` arrays are longer than needed — export code already reads `r.used[w] ?? 0` up to `totalWeeks`, so passing the smaller number naturally truncates.
- JPG: before capture, temporarily set a CSS custom property / inline `width` on the timeline inner tracks to `exportWeeks * weekWidth`, and hide week columns with index `>= exportWeeks` via a data attribute + a scoped style block injected for the capture. Restore in the existing `finally`. Header month cells use the same attribute so trailing months are hidden.
  - Simpler alternative kept as fallback if hiding proves brittle: temporarily lower `totalWeeks` via a React state used only during export, await two rAFs, capture, then restore. Chosen approach: the state-swap fallback, because the timeline grid is generated from `totalWeeks` in many places and mutating the DOM directly is fragile.

### Technical details

- New file `src/components/export-range-dialog.tsx` — shadcn `Dialog` with `Select` (month), `Select` (year), chip row, preview line, warning, action buttons. Props: `open`, `format: "pdf" | "jpg"`, `chartStart: Date`, `requiredWeeks: number`, `defaultWeeks: number`, `weekWidth`, `onConfirm(weeks: number)`, `onCancel()`.
- In `src/routes/chart.$chartId.tsx`:
  - Add `exportRequest` state: `null | { format: "pdf" | "jpg" }`.
  - Replace the current inline `onClick` bodies of the two dropdown items with `setExportRequest({ format: "pdf" | "jpg" })`.
  - Extract the current PDF and JPG logic into `runPdfExport(weeks: number)` and `runJpgExport(weeks: number)` helpers that use the passed `weeks` in place of `totalWeeks`.
  - For JPG, introduce `exportOverrideWeeks` state; when set, the render uses `Math.min(totalWeeks, exportOverrideWeeks)` for all timeline loops (header months, list/swimlane rows, capacity heatmap). Wait two rAFs, run capture, then clear the override in `finally`.
- Week resolution helper in the dialog: `weeksUntil(chartStart, endOfMonth(selected)) = differenceInCalendarWeeks(endOfMonth(selected), chartStart) + 1`, clamped to `[requiredWeeks, 520]`.
- Suggested-value builder uses `date-fns` (`endOfMonth`, `addMonths`, `endOfYear`) — already a project dependency.

### Out of scope

- No start-date picker (charts always start at `chart.startDate`).
- No per-view differences — same dialog for List, Swimlanes, Capacity.
- JSON and Zoho CSV exports unchanged.
