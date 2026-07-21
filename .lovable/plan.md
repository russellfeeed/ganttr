## Goal
Make it easy to spot tasks that have no resource demands assigned (empty `demands` array, or all demand quantities = 0).

## Change
In `src/routes/chart.$chartId.tsx` toolbar, add a new toggle button **"No resources"** next to the existing tag filter / search input.

- When active, `visibleTasks` is filtered to only tasks where `!task.demands || task.demands.every(d => d.quantity <= 0)`.
- Button shows a count badge of matching tasks (e.g. "No resources (4)") so users see how many exist even when the filter is off — helpful discovery.
- Uses the existing shadcn `Button` with `variant="outline"` when inactive and `variant="default"` when active, matching the current TBC-style filter affordances in the toolbar.
- Works in List and Swimlane views (same filter path as search/tag). In Capacity view it has no effect (already aggregates by role).
- Clearing: clicking the button again toggles it off. Also cleared by the existing "Clear filters" affordance if present; otherwise the toggle itself is sufficient.

## Out of scope
- No data model changes.
- No changes to export, PDF, or capacity computations.
