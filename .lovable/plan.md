# Fix capacity view alignment with the left Team/Role column

## What's actually wrong

I measured the live capacity view: the role rows in the left column and the timeline rows line up exactly (same tops, same heights, top and bottom). The real problem is the horizontal scrollbar.

The timeline pane is its own horizontally-scrolling box, so its scrollbar sits *inside* that pane and eats ~15px at the bottom (measured: pane is 666px tall but only 651px usable). The left Team/Role column has no such scrollbar, so:

- the last role rows on the left have no matching cells visible on the right — the scrollbar sits over them,
- the two panes end at different heights, which reads as an alignment/offset bug (exactly the area circled in the screenshot).

## The fix

Use a single scroll container instead of two panes with independent scrollbars:

- Make the outer wrapper the only scroll container (both axes).
- Pin the Team/Role column with `sticky left-0` and a background plus right border so timeline cells scroll behind it.
- Keep the two-tier month/week header `sticky top-0`, and make the Team/Role header cell sticky on both axes so it stays in the top-left corner.
- Layer z-indexes so: corner cell > header row and sticky column > body cells.

Result: one horizontal scrollbar at the bottom of the whole grid, shared by both panes, so every role label keeps its row of cells and nothing is clipped.

## Technical notes

- All changes are contained in `CapacityHeatmap` in `src/routes/chart.$chartId.tsx`.
- No changes to row heights, capacity math, or the health/summary bars.
- Verify afterwards in the preview: role row tops still match, the last role row is fully visible above the scrollbar, and the left column stays pinned while scrolling right.
