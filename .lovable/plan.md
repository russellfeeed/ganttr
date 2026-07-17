## Plan: Export JSON backup on home page

Add a button in the header of `src/routes/index.tsx` labeled **Export JSON** that downloads the entire Gantt store (all charts + order) as a `.json` file.

### Behavior
- Click → serialize `{ charts, order, exportedAt, version: 1 }` to JSON.
- Trigger a browser download via a temporary `Blob` + `<a download>`.
- Filename: `gantt-backup-YYYY-MM-DD.json`.
- Disabled (or shows a toast) when there are zero charts.

### Implementation
- In `src/routes/index.tsx`, read `charts` and `order` from the existing `useGanttStore` selector.
- Add a small `handleExport()` that builds the payload, creates a `Blob`, and clicks a temporary anchor.
- Place the button next to the existing "New chart" button, using the same shadcn `Button` (variant `outline`) with a `Download` icon from `lucide-react`.

### Out of scope
- Import (can be added later as a separate button).
- Per-chart export.
- Fixing the earlier chart-route Vite error.
