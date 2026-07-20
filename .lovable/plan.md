## Problem
The JSON export **does** include teams (verified — the uploaded file has `teams` at line 493 with roles nested). What went wrong is the **chart-level Import** button inside the editor only restores tasks — it calls `importChartTasks`, which never touches `chart.teams`. Worse, that same function filters `demands` down to role IDs that already exist in the destination chart, so importing into an empty chart silently strips every role allocation as well.

Result: after re-importing over a chart that had no teams (or different teams), teams disappear and demands are wiped.

## Fix

Make the chart-level import restore teams/roles alongside tasks.

1. **`src/lib/gantt-store.ts` — extend `importChartTasks`**
   - Accept optional `teams` on the incoming payload.
   - **Replace mode**: replace `chart.teams` with `incoming.teams` (normalized: ensure each team has `roles: []`). Then import tasks as-is (no demand filtering needed — role IDs come from the same file).
   - **Merge mode**: merge teams by `id` — keep existing teams, append any incoming team whose `id` isn't already present; for teams that match by id, append any new roles by id. Then run the existing demand sanitization against the merged role set.
   - Rename to keep the signature backward compatible: the `incoming` argument gains an optional `teams?: Team[]` field.

2. **`src/routes/chart.$chartId.tsx` — pass teams through on import**
   - In the file-picker handler that builds `pendingImport`, include `teams: parsed.chart.teams` (and `name` / `startDate`, which already flow through).
   - Update the Import dialog copy to mention teams, e.g. *"This file contains N tasks and M teams. Replace everything in this chart, or merge with what's here?"*

3. **Recovery for the user**
   - The uploaded backup still has the teams. After the fix ships, re-importing `R-D-Roadmap-2026-07-17_9.json` with **Replace** will restore teams, roles, and all demand quantities in one shot.

## Out of scope
- Home-page import (already handles teams correctly via `importCharts`).
- PDF export of capacity data.
- Any change to the export format — it already contains everything needed.
