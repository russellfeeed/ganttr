
## Goal

Add an "Export for Zoho Projects" option at the chart level that produces a CSV file matching Zoho Projects' task import format, so tasks in the current chart can be uploaded into a Zoho Projects project.

## Zoho Projects CSV format

Zoho Projects' task importer accepts a CSV with a header row and one row per task. The columns we'll emit (all supported by the standard Zoho Projects import template):

- `Task Name` — task.name
- `Task List` — team name (or `General` if unassigned) — Zoho requires every task to belong to a task list, and swimlane teams map naturally to task lists
- `Start Date` — chart start date + `startWeek * 7` days, formatted `MM/DD/YYYY`
- `End Date` — start date + `durationWeeks * 7 - 1` days, `MM/DD/YYYY`
- `Duration` — `durationWeeks * 5` (working days, 5-day week) with unit `days`
- `Duration Type` — `days`
- `Priority` — `None` (we don't track priority)
- `Percentage Completed` — `0`
- `Dependency` — name of the task referenced by `dependsOn` with the suffix ` - FS` (finish-to-start, Zoho's default); blank when none
- `Description` — auto-generated: tags joined as `#tag`, plus `[TBC]` marker when `tbc`, plus demand summary (`Role x Qty`) when demands exist
- `Milestone` — blank (we don't model milestones)

Notes:
- Zoho matches `Dependency` by task name, so duplicate task names in the same chart will collide on import. We'll add a small warning toast if duplicates are detected but still export.
- Values containing commas, quotes, or newlines will be RFC 4180 quoted.
- The file is downloaded as `<chart-name>-zoho-projects.csv`.

## UI change

In `src/routes/chart.$chartId.tsx`, in the existing chart header export area (next to "Export JSON" / "Export PDF"), add an **Export for Zoho** button. On click it runs the CSV builder and triggers a browser download. No changes to the data model or the store.

## Implementation

1. New file `src/lib/export-zoho.ts`:
   - `exportChartToZohoCsv(chart: Chart): { filename: string; csv: string }`
   - Pure function: takes the chart (plus its teams for task-list names) and returns filename + CSV string. Includes CSV escaping helper and date math using `date-fns`.
2. `src/routes/chart.$chartId.tsx`:
   - Import the helper and add an `Export for Zoho` button in the toolbar.
   - On click: build CSV, create a Blob, trigger download, and show a success toast (plus a duplicate-name warning if applicable).
3. No store, schema, or migration changes; no changes to JSON export/import.

## Out of scope

- Direct API upload to Zoho Projects (would need OAuth + a connector).
- Importing from Zoho Projects back into the app.
- Exporting teams/roles/headcount (Zoho's task CSV has no equivalent fields).
