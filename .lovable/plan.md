## Add hover tooltip to task bars

Wrap each task bar in the chart editor (`src/routes/chart.$chartId.tsx`, both List and Swimlane views) with the shadcn `Tooltip` component so hovering reveals a compact summary popup.

### Tooltip contents
- **Task name** (bold)
- **Dates**: `MMM d, yyyy → MMM d, yyyy` (start week start → end week end) plus duration in weeks
- **Team**: team name, or "No team"
- **Tag** (if set) shown as a colored chip using the task color
- **TBC** badge (if flagged)
- **Demands** (if any): list of `qty × role name` per role
- **Dependencies** (if any): count of predecessors, e.g. "Depends on 2 tasks"

### Implementation notes
- Import `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` from `@/components/ui/tooltip`.
- Wrap the existing task bar `div` as the `TooltipTrigger asChild`. Keep drag/resize handlers on the bar unchanged.
- Use `delayDuration={300}` to avoid flicker while dragging.
- Use `date-fns` `format` (already imported) for dates.
- Render the same tooltip for bars in both List view and Swimlane view (single reusable inline component or shared render helper local to the file).
- No changes to store, PDF export, or types.
