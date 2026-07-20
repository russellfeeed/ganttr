## Problem

In the Capacity view, clicking **Edit** in the cell popup sets `selectedTaskId`, but the `TaskEditor` panel never appears.

Root cause (verified in `src/routes/chart.$chartId.tsx`): the whole "Main split" block that renders `TaskEditor` (lines 825–839) lives inside the `viewMode !== "capacity"` branch that starts at line 710. When the user is on the Capacity view, that branch is not rendered, so the editor has nowhere to mount even though `selectedTaskId` is set correctly.

## Fix

Move the `TaskEditor` render out of the view-mode conditional so it can appear regardless of which view is active.

- In `src/routes/chart.$chartId.tsx`, lift the `{selectedTask && <TaskEditor .../>}` block out of the `else` branch and render it as a sibling of the main split, wrapped so it overlays / sits alongside the current view without depending on `viewMode`.
- Keep the existing props and handlers unchanged (`onChange`, `onSetDemand`, `onDelete`, `onClose`).
- Leave `onOpenTask` in `CapacityCellDialog` as-is (it already closes the dialog and sets `selectedTaskId`).

No changes to store logic, capacity math, or the task editor itself.

## Verification

- On Capacity view: open a cell → click **Edit** on a task → the TaskEditor panel should open with that task's details.
- On List and Swimlane views: clicking a task should still open the editor as before.
- Closing the editor should return to whichever view was active.