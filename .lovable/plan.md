# Fix the Orphans filter

## What I found so far

Probing the live app gave contradictory readings, so the first job is a clean reproduction rather than a guessed fix:

- The task counter in the left panel header does react to the toggle (it switches between "total 36" and "total 3", and there are exactly 3 tasks carrying the Orphan badge), so the filtered task set is being computed.
- In one reading the timeline pane still contained 36 task bars while the counter said 3 — i.e. the chart area kept showing every task, which is exactly what "the filter doesn't work" looks like. Other readings disagreed, so this is a suspect, not a confirmed cause.
- In the Capacity view the toggle genuinely does nothing: the heatmap is built from the unfiltered task set, and the filter is never applied there. That part is confirmed from the code.

## Step 1: reproduce properly

Load a copy of the current chart data into a headless browser, then capture, for each view (List, By Team, Capacity), the state with the toggle off and on: number of rows in the left panel, number of bars in the timeline, lane headers and their counts, plus screenshots. This pins down which pane ignores the filter instead of relying on partial DOM reads.

## Step 2: make the filter actually filter

Target behaviour: with Orphans on, only tasks carrying the Orphan badge are shown — everything else is hidden.

- **List view**: left rows and timeline bars come from the same filtered row list; fix whichever pane is still rendering the full set.
- **By Team view**: same, and lane headers show the filtered count; lanes left with zero matching tasks are hidden.
- **Capacity view**: the heatmap has role rows, not task rows, so "hide non-orphan tasks" has no direct equivalent. With Orphans on, restrict it to the orphaned tasks: show only the team/role rows involved plus a clearly labelled "Orphaned demands" list of the offending task/role pairs, so the toggle has a visible, consistent effect instead of silently doing nothing.
- Keep the counter, badge, and the `Orphans (n)` button count all driven by the same single source of truth, so the number on the button always equals the number of visible tasks.

## Step 3: verify

Re-run the reproduction after the fix and confirm, for all three views, that toggling on leaves exactly the badged tasks visible (rows, bars, and lane counts all agreeing), and toggling off restores everything.

## Technical notes

- All of this lives in `src/routes/chart.$chartId.tsx`: `orphanTaskIds`, `visibleTasks`, `listSwimlaneTasks`, `displayRows`, `TimelineGrid` (`rows` / `allTasks`), and `CapacityHeatmap` / `demandByWeek`.
- No changes to the store, capacity maths, or export code beyond passing the filtered set where the views already expect it.
