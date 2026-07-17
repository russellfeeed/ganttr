## Goal
Add a "PDF" export option next to the current JSON Export button that renders the chart (task list + timeline) to a landscape PDF.

## UX
- Replace the single Export button with a split: a **JSON** button (current behavior) and a new **PDF** button, both in the header toolbar.
- PDF button: generates a landscape A4 PDF named `<chart-name>-<date>.pdf` and triggers download. Shows a toast on success/failure.

## Approach
Use client-side generation with `jspdf` (no server round-trip, works offline, small footprint).

Rendered content:
1. **Header block**: chart name, start date, export timestamp.
2. **Task list column** (left, ~30% width): task name, duration, team badge (colored dot + name).
3. **Timeline area** (right, ~70% width): week header row + one bar per task, positioned by `startWeek` and sized by `durationWeeks`, filled with the task color. Team lane headers appear when the current view is Swimlanes; otherwise it's a flat list.
4. **Legend**: teams with color swatches (only if any teams exist).
5. **Pagination**: if tasks overflow a page, continue on the next page repeating the week header. Timeline width fits within page width — weeks are scaled to page width; no horizontal overflow.

## What's mirrored from the on-screen chart
- Current view mode (List vs Swimlanes) — the PDF reflects whatever the user is looking at.
- Current filters (tag / team) — only visible tasks are exported.
- Dependency arrows: **out of scope** for v1 (drawing arrows across paginated rows is fragile). Note this in the toast tooltip.

## Files touched
- `src/routes/chart.$chartId.tsx` — split the Export button, add PDF handler that calls a new helper.
- `src/lib/export-pdf.ts` (new) — pure function `exportChartToPdf(chart, opts)` that builds the jsPDF document. Takes `viewMode`, `visibleTasks`, `groups` (for swimlanes) so the route stays the source of truth for filtering/grouping.
- `package.json` — add `jspdf` dependency.

## Out of scope
- Custom paper sizes / portrait toggle (landscape only, per request).
- Dependency arrows in PDF.
- Server-side rendering / higher-fidelity vector export.

## Technical notes
- jsPDF is bundle-safe, no native deps, works in the browser.
- Landscape A4 = 297×210 mm. Use mm units. Reserve 10 mm margins.
- Week column width = `(pageWidth - leftPanelWidth - margins) / totalWeeks`, min 4 mm; if smaller, reduce left panel or paginate horizontally (v1: just clamp, accept dense weeks).
- Row height ~7 mm; page fits ~25 task rows after header.
