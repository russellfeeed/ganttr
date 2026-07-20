## Goal

Turn the Capacity cell popup from read-only into a quick-edit surface so overallocations can be resolved without leaving the dialog.

## Changes (all in `src/routes/chart.$chartId.tsx`, `CapacityCellDialog`)

### 1. Inline-edit each task's demand for this role
- Replace the current `Badge` showing the quantity with a compact number input (0–99), bound to `setTaskDemand(chartId, task.id, cell.roleId, qty)`.
- Setting the value to `0` removes/zeroes the demand for that role on that task.
- The row stays clickable to open full task details, but the number input `stopPropagation` so editing doesn't trigger navigation. Add a small "Edit task…" link/button per row to make the "open full details" action explicit (replacing the whole-row click for accessibility).
- `used`, `over`, `atCap`, and the diagnostic reasons recompute live from the updated store data (dialog already reads from props sourced from `visibleTasks`, so no extra state needed).

### 2. Edit team composition for the current role
- Add a "Team capacity" section between the allocation banner and the task list:
  - Role name inline-editable (`renameRole`).
  - Headcount stepper / number input (`setRoleHeadcount`, min 0).
  - Small helper text: "Applies to every week for this role."
- Provide a secondary link "Manage all roles" that closes the dialog and opens the existing Teams popover (reuse existing `setTeamsOpen(true)` if available; otherwise just close the dialog — Teams popover is one click away).

### 3. Wire new props from the parent
Pass three new handlers into `CapacityCellDialog`:
```ts
onSetDemand: (taskId, qty) => setTaskDemand(chart.id, taskId, cell.roleId, qty)
onRenameRole: (name) => renameRole(chart.id, cell.teamId, cell.roleId, name)
onSetRoleHeadcount: (hc) => setRoleHeadcount(chart.id, cell.teamId, cell.roleId, hc)
```
All three store actions already exist in `src/lib/gantt-store.ts` — no store changes needed.

### 4. Keep the existing "open full task" flow
`onOpenTask` remains for the explicit "Edit task…" button per row; it still closes the dialog and selects the task so `TaskDetails` opens on the right.

## Out of scope
- No store schema changes.
- No changes to the capacity heatmap rendering itself.
- No bulk actions (e.g. "shift task by 1 week to fix overallocation").
