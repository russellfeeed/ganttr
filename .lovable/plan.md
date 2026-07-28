Add a hover tooltip to the team lane header in Swimlanes view that displays the team's available resources (roles and headcounts).

Changes
- Update `LaneHeader` in `src/routes/chart.$chartId.tsx` to wrap the team name in a `Tooltip`.
- Render a popup listing each role with its headcount, e.g. "Backend Engineer — 2".
- For the "Unassigned" lane, show a short message like "Tasks without a team assignment".
- Use existing `Tooltip`/`TooltipContent`/`TooltipTrigger` components and semantic tokens.
- Keep drag-and-drop behavior on the lane header unchanged.

No state, export, or backend changes are needed.