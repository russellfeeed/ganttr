# Roles & capacity planning

Add lightweight capacity planning: each team defines roles with a headcount, tasks declare how many of each role they need, and the chart surfaces load vs capacity.

## Data model (src/lib/gantt-store.ts)

- Extend `Team` with `roles: Role[]` where `Role = { id, name, headcount: number }`.
- Extend `Task` with `demands: { roleId: string; quantity: number }[]` (empty by default). Demand is per-role, applied uniformly across the task's weeks.
- Migrate persisted store to v2: default `roles: []` on existing teams, `demands: []` on existing tasks. Keep the v1 → v2 migration in `persist.migrate`.
- New store actions:
  - `addRole(chartId, teamId, name?, headcount?)`
  - `renameRole`, `setRoleHeadcount`, `deleteRole` (also strips demands referencing that role)
  - `setTaskDemand(chartId, taskId, roleId, quantity)` (quantity 0 removes it)
- Deleting a team already clears `teamId` on tasks; also clear demands whose roleId belonged to that team.

## Team management UI (chart editor Teams popover)

- Under each team, list its roles with inline name + headcount number input and a delete button.
- "Add role" row (name + headcount, defaults to 1). Reuse existing popover styling.

## Task demands UI (task details panel)

- New "Resource demand" section, only enabled when the task has a team assigned (roles belong to teams). If no team, show a hint: "Assign a team to add role demands."
- For each role in the task's team, show a small stepper (0–99). Non-zero values are stored in `task.demands`.
- Show a compact "2× Engineer, 1× Designer" summary on the task row and bar tooltip.

## Capacity view

- Add a "Capacity" toggle next to the existing List / Swimlanes toggle in the chart toolbar.
- Renders below (or replaces) the task grid while active:
  - Rows grouped by team, one row per role.
  - Columns = same weekly timeline as the chart (respects horizontal scroll + fixed header refactor).
  - Cell value = sum of `quantity` across tasks in that team+role whose week range covers that week (TBC tasks included but marked; filtered/searched tasks excluded to match current chart behaviour).
  - Cell shading:
    - 0 → empty
    - ≤ headcount → tinted using the team colour, opacity scaled by load / headcount
    - > headcount → red tint, showing "used / capacity" on hover
    - headcount 0 but demand > 0 → red hatched (no capacity defined)
- Cell tooltip lists contributing task names.

## Overallocation warnings (always on)

- Compute per week per team+role load in a shared `useMemo`.
- On each task bar, if any of its weeks pushes any of its demanded roles over capacity, show a small amber warning icon (lucide `TriangleAlert`) with tooltip: "Overallocates Engineer in W3–W4".
- In the task list row, same icon after the name.

## Out of scope for this pass

- Part-time %, per-person availability, holidays, cost rates. Note in comments where future hooks would slot in (role.headcount → role.availability[]).
- PDF export changes: keep the existing PDF unchanged for now; capacity is on-screen only. (Can add a second capacity page later.)

## Technical details

- All computation is derived (no new persisted state beyond roles + demands). Memoise `capacityByWeek: Map<teamId, Map<roleId, number[]>>` and `demandByWeek` at the chart level; both views and warning icons read from these.
- Zero-touch to `src/lib/export-pdf.ts` and JSON import/export shape stays backward compatible — older JSON without `roles`/`demands` loads via the same v1→v2 defaulting used in the persist migrator (importChartTasks fills `demands: []`, importCharts fills `roles: []` on teams).
- Types: extend the exported `Team` and `Task` types so the PDF module and importers pick up optional fields without changes.
