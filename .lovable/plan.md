## Export current view as JPG

Add an "Export JPG" action to the existing Export / Import dropdown in the chart editor toolbar. It captures whichever view is currently active (List, Swimlanes, or Capacity) as a single JPG image and downloads it.

### Behaviour

- New menu item under Export / Import, below Export PDF: `Export JPG (current view)`.
- Captures the visible chart surface — the header row (weeks/months) plus the task/team pane and timeline — as one image, including horizontally-scrolled content that is off-screen. The full width of the timeline is rendered so nothing is cropped.
- Filename: `{chartName}-{view}-{yyyy-MM-dd}.jpg` (view = list / swimlanes / capacity).
- Respects the current filters (search, orphans, no-resources) and view mode, exactly as shown.
- Also marks the chart as "exported" so the amber unsaved-changes dot on the dropdown clears, matching PDF/JSON exports.

### Technical notes

- Add `html-to-image` (small, no external deps, works with Tailwind and CSS variables) via `bun add html-to-image`. Use `toJpeg(node, { quality: 0.92, pixelRatio: 2, backgroundColor: <resolved --background> })`.
- Wrap the capture target with a `ref` in `src/routes/chart.$chartId.tsx`. Each view (list/swimlane grid, capacity heatmap) already lives in a scroll container — the ref goes on the outer element that contains both the fixed left pane and the scrollable timeline.
- Before capture, temporarily expand the scroll container's inline `width` / `overflow` to force the off-screen timeline into layout so the full width renders; restore after. Do this inside a `try/finally` so the UI recovers on error.
- Trigger download by creating an `<a href={dataUrl} download={filename}>` and clicking it (same pattern as the existing JSON export).
- Reuse `markChartExported(chartId)` from the store so the dirty indicator behaves like the other exports.

### Out of scope

- No PNG option, no size/DPI picker, no per-page tiling — one JPG of the current view.
- No changes to PDF export or capacity scoring.
