## Diagnosis
The task "Communications Preferences (a la MFRS in VL)" has 3 `demands` entries whose `roleId` values don't match any role in its current team (SDLC). That's why:

- The **hover tooltip** shows `1 × Unknown role` three times (the fallback in `chart.$chartId.tsx:1660`).
- The **Resource demand editor** shows Dev / Snr Dev / TAE all at `0` — it only lists roles from the *current* team, so the orphaned demands are invisible and un-editable.
- Capacity view silently ignores them (their roleId doesn't map to any team/role row).

Most likely cause: the task was previously on a different team (or the team's roles were deleted/recreated), leaving stale demand rows referencing dead role IDs.

## Fix (UI only, no data model change)

In `src/routes/chart.$chartId.tsx`:

1. **Task details → Resource demand section**: after listing current team roles, compute `orphanDemands = task.demands.filter(d => !currentTeam.roles.some(r => r.id === d.roleId) && d.quantity > 0)` and render each as a warning row:
   - Label: `Unknown role` + small muted `(orphaned)` hint + the stored quantity.
   - A `Remove` (trash) button that calls `setTaskDemand(chartId, task.id, d.roleId, 0)` to drop it.
   - If any orphans exist, show a one-line explanation: *"These demands reference roles that no longer exist on this team. Remove them or reassign the task to the correct team."*

2. **Tooltip on task bars** (line ~1660): when the role name is missing, render `1 × Unknown role` in a muted/italic style so it's visibly flagged rather than looking like a normal role.

3. **Capacity cell dialog** (task rows): apply the same orphan treatment so users can clean them up from there too — reuse the same remove action.

No changes to store shape, export/import, or capacity math. Existing import sanitization in `gantt-store.ts` already drops unknown-role demands on import; this change lets users clean up orphans created before that guard existed (or by team/role edits).

## Out of scope
- Auto-deleting orphans on load (destructive; user should choose).
- Migrating orphans to same-named roles on another team (ambiguous).