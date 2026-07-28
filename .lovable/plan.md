## Why not a real Loop component

Microsoft Loop only renders its own native components, or a link unfurled by an app registered in Microsoft 365 (Azure app registration + a hosted, authenticated backend). This chart data lives only in your browser, so a genuine Loop component isn't achievable. Pasting into Loop will always downscale a JPG.

The practical fix: a single self-contained `.html` file you can open in a browser, attach into a Loop page / Teams chat, or drop in SharePoint — where it stays fully interactive and scrollable at real size.

## What gets built

A new **Export HTML** item in the editor's export dropdown, next to Export Markdown.

The generated file:
- One standalone `.html` — no network calls, no fonts, no scripts from outside. Everything (styles, data, layout) is inlined, so it works offline and from OneDrive/SharePoint.
- **Frozen task / team-role name column** on the left while scrolling horizontally.
- **Frozen date header rows** (month+year tier and week-start tier) while scrolling vertically.
- Both freezes done with plain CSS `position: sticky`, so no JS scroll-syncing to go wrong.

Content included:
- Header: chart name, start date, week count, export date.
- **Tasks section** — grouped by team swimlane (matching the app's swimlane order), each task rendered as a coloured bar positioned by start week / duration, with its label, TBC styling, and team colour. Dependency arrows are omitted (they don't survive well without the app's SVG layer); dependencies instead appear as a small "after: X" note on the bar's tooltip.
- **Capacity section** — the role heatmap with the same colour bands (healthy / at-risk / overloaded) and `used/headcount` cell text, plus the health score summary line.
- Hovering a bar or a heatmap cell shows a native title tooltip with full details, so nothing is lost to truncation.

Interaction in the exported file:
- Free two-axis scrolling of the timeline.
- A zoom control (week column width: compact / normal / wide) so it reads well on any screen.
- Tasks / Capacity toggle at the top.

## Range handling

Reuses the existing `ExportRangeDialog` so you can pick an end month/year, with the same "Full timeline" / "Last task" suggestions and truncation warning. Weeks beyond the chosen end are dropped from the grid and bars are clipped, consistent with the PDF and JPG exports.

## Technical notes

- New `src/lib/export-html.ts` exporting `exportChartHtml(chart, { endWeek })`, building an HTML string and triggering a blob download — same pattern as `export-markdown.ts`.
- Week/date maths reuse the helpers already used by `export-markdown.ts` and `export-pdf.ts` (`addWeeks`, `taskEndDate`, peak-demand computation) so the exported numbers match the app exactly.
- Capacity colour bands and the health score are computed from the same `computeCapacityHealth` logic to avoid divergence.
- Wire the menu item in `src/routes/chart.$chartId.tsx` (export dropdown around lines 841-901), routed through the existing export-range dialog state and `markChartExported`.
- Verification: generate an export from a seeded chart, open the file in a headless browser, and confirm the left column and header rows stay pinned after scrolling.
