## Add "Export Markdown" option

Add a new **Export Markdown** item to the Export / Import dropdown in the chart editor. Produces a `.md` file summarising the chart: metadata, teams/roles, and tasks grouped by team with dates, duration, dependencies, resource demands, and TBC flag. Capacity heatmap is not included (tables would be unreadable at scale); instead a compact per-role peak/capacity summary is emitted.

### Dropdown

- New item under existing PDF/JPG entries, before Zoho CSV: **Export Markdown** (icon `FileText` from lucide-react).
- Unlike PDF/JPG, this does not open `ExportRangeDialog` — markdown has no timeline width to truncate. Exports full chart.
- Counts toward the "unexported changes" amber dot the same way the other exports do (calls `markExported` on the store).

### File contents

```
# {Chart name}

- Start: {Mon d, yyyy}
- Total tasks: N
- Duration: N weeks (Mon d, yyyy → Mon d, yyyy)
- Exported: {timestamp}

## Teams

### {Team name} (color swatch as hex)
- Roles: {role name} × {headcount}, ...

(repeat; "Unassigned" section only if any task has no team)

## Tasks

### {Team name}
| # | Task | Start | End | Weeks | TBC | Depends on | Resources |
|---|------|-------|-----|-------|-----|------------|-----------|
| 1 | Name | Jul 6, 2026 | Aug 3, 2026 | 4 | – | Task A, Task B | 2× Engineer, 1× PM |

(one table per team, tasks sorted by startWeek then order)

## Capacity summary

| Team | Role | Headcount | Peak demand | Peak week | Status |
|------|------|-----------|-------------|-----------|--------|
| ... | ... | 2 | 3 | Aug 3, 2026 | Overloaded |

(Status: Healthy / At capacity / Overloaded / Unstaffed; only teams with roles)
```

Dependencies list uses task names. Resources list uses role names looked up from the assigned team (unknown role IDs marked `⚠ orphan`).

### Technical details

- New file `src/lib/export-markdown.ts` exporting `exportChartToMarkdown(chart: Chart)`.
  - Uses `date-fns` `addWeeks` / `format` (already deps) to compute per-task start/end dates from `chart.startDate + task.startWeek`.
  - Reuses the same demand-per-week computation shape as capacity (walk tasks, for each week add role qty) to find peak demand per role.
  - Escapes `|` and newlines in task/team/role names for markdown tables.
  - Triggers download via a Blob + `<a download>` with filename `${safe(chart.name)}-${yyyy-MM-dd}.md` (matches existing export naming).
- In `src/routes/chart.$chartId.tsx`:
  - Import `exportChartToMarkdown` and `FileText` icon.
  - Add `DropdownMenuItem` for "Export Markdown" — onClick: `exportChartToMarkdown(chart); markExported(chart.id)`.
- No changes to store, PDF export, JPG export, or `ExportRangeDialog`.

### Out of scope

- No per-week utilisation tables in markdown (too wide).
- No range/end-date picker for markdown.
- Import from markdown is not added — JSON remains the round-trip format.
