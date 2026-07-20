## Fix

In `CapacityHeatmap` (`src/routes/chart.$chartId.tsx`), split into two columns:

- **Left**: fixed-width (`NAME_COL = 240`) column with the Team/Role header cell and all team/role name rows. Not horizontally scrollable.
- **Right**: `overflow-x-auto` container holding the week header and the corresponding week cells for each team/role row. Only this pane scrolls horizontally.

Both panes share a single vertical scroll — wrap them in a flex row inside one `overflow-y-auto` container so rows stay aligned. Row heights (`ROW_HEIGHT * 0.7` for team header, `ROW_HEIGHT` for role rows) and `HEADER_HEIGHT` remain identical on both sides to keep alignment.

Header row keeps `sticky top-0` on both panes so the week/date header and Team/Role label stay pinned while scrolling vertically.

No changes to data, other views, or the toolbar.