## Plan: Teams + swimlanes (per chart)

Add a per-chart team list, assign at most one team per task, and let the user toggle the timeline between the current flat view and a swimlane view grouped by team.

### Data model (`src/lib/gantt-store.ts`)
- New type `Team = { id: string; name: string; color: string }`.
- Extend `Chart` with `teams: Team[]` (default `[]`).
- Extend `Task` with `teamId?: string`.
- New actions: `addTeam(chartId, name?)`, `renameTeam(chartId, id, name)`, `setTeamColor(chartId, id, color)`, `deleteTeam(chartId, id)` (also clears `teamId` from tasks referencing it).
- Migration: use zustand `persist` `migrate` (bump version to 1) to add `teams: []` on existing charts and leave tasks untouched.
- `importChartTasks` and `importCharts` pass through `teamId`/`teams` unchanged; unknown `teamId`s are cleared on import (same pattern already used for `dependsOn`).

### Team management UI (chart editor toolbar)
- Add a **Teams** popover button next to the Cascade switch. Contents:
  - List of teams with color swatch, inline rename, delete.
  - "Add team" row (name input + color from existing `TASK_COLORS` palette).
- Empty state: "No teams yet — add one to start grouping tasks."

### Task → team assignment
- In the task detail panel, add a **Team** select above the existing Tag field with options `Unassigned` + each team. Selecting a team also (optionally) sets the task's color to the team color, but user can still override color afterwards.
- Task rows and bars show a small colored dot for the team when one is set (in addition to the existing per-task color).

### Swimlane view toggle
- Add a segmented control in the toolbar: **List** / **Swimlanes** (persisted in local component state; not saved to store — matches current zoom/cascade behavior).
- **List mode**: unchanged — current flat, reorderable task list.
- **Swimlanes mode**:
  - Left panel groups tasks under team headers in this order: each team in `chart.teams` order, then an **Unassigned** lane at the bottom.
  - Each group has a header row (team name + color swatch + task count) and its tasks below it. Task reordering via `@dnd-kit` stays enabled, but is restricted to reordering within the same lane (drop across lanes reassigns `teamId` — see below).
  - Timeline grid mirrors the left panel row-for-row so bars line up. Group headers span the full width with a subtle background.
  - Dragging a task **row** onto another lane's header reassigns `teamId` to that lane (or clears it for Unassigned). Dragging a task **bar** horizontally still only changes `startWeek` (unchanged).

### Filtering interaction
- Extend the existing tag filter dropdown to also allow filtering by team (single dropdown or add a second one — pick a second dropdown for clarity). In swimlane mode, filtering by a specific team collapses to just that lane.

### Out of scope
- Team-level capacity / workload views.
- Multiple assignees per task.
- Cross-chart teams or team templates.
- Saving the list/swimlane toggle to the persisted store.
