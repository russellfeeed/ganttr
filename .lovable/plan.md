Implement a global "Show only tasks with orphaned resource demands" toolbar toggle.

## What we will build

1. **State**
   - Add `orphansOnly: boolean` state alongside the existing `noResourcesOnly` filter in the chart editor.

2. **Detection logic**
   - Compute a memoized `Set<string>` of task IDs that have at least one demand whose `roleId` does not match any role in the task's currently assigned team (or any role in the chart if the task has no team).
   - A task has orphaned demands when `task.demands` contains a quantity > 0 with a `roleId` that no longer exists on the task's team.

3. **Toolbar toggle**
   - Add a new toggle button in the chart toolbar next to the existing "No resources" filter.
   - Label: "Orphans" or similar, with a count badge showing the number of affected tasks.
   - Active state matches the existing filter styling.

4. **Filtering**
   - Extend the `visibleTasks` filtering logic so that when `orphansOnly` is active, only tasks with orphaned demands are shown in List and Swimlane views.
   - The Capacity heatmap view should not be filtered (it already shows overallocation across all tasks).
   - If the currently selected task is hidden by the filter, clear the selection so the task editor doesn't reference a missing task.

5. **Visual indicator (optional but helpful)**
   - In List and Swimlane rows, show a small amber warning indicator on tasks that have orphaned demands, even when the filter is not active, so users can spot them quickly.

## Technical details

- File: `src/routes/chart.$chartId.tsx`
- Reuse existing filter state patterns from `noResourcesOnly` / `noResourcesCount`.
- The filter is client-side only; no store or data model changes are required.
- No route or server changes are needed.

## Out of scope

- Auto-removing orphans.
- Adding a dedicated route or dashboard view for orphans.
- Changing the Capacity view behavior.