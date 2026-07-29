## Goal
On `/compare`, each row gets two small copy buttons (`→` copy A to B, `←` copy B to A) that push that one row's values into the other chart, after a confirmation dialog.

## UI (`src/routes/compare.tsx`)
- Add a trailing **Copy** column to the Tasks, Teams & resources, Tags and Dependencies tables.
- Each cell holds two icon buttons (`ArrowRight` / `ArrowLeft`, ghost, size sm) with tooltips "Copy A → B" / "Copy B → A". Buttons are disabled (with a reason tooltip) when the copy is impossible or a no-op — e.g. source side has no value, or the row is already identical.
- Clicking opens a single shared `AlertDialog` describing exactly what will change, e.g.
  "Copy **Design review** timing from *R&D Roadmap* to *Roadmap v2*: start 3 Mar 2026 → 10 Mar 2026, duration 4w → 6w. This overwrites the task in Roadmap v2." with **Cancel** / **Copy**.
- On confirm, apply via the store and show a sonner toast ("Copied to Roadmap v2"). Recomputed diff re-renders automatically since the page reads from the store.

## What each row copies
**Tasks — timing only.** Copies start and duration, calendar-aligned: the target `startWeek` is recomputed from the source task's absolute calendar start against the target chart's own `startDate` (reusing the `absWeek` maths already in `compare-charts.ts`). Only `startWeek` and `durationWeeks` are written — name, team, tags, colour, demands and dependency are untouched.
- Matched rows: overwrite the other side's timing.
- "Only A" / "Only B" rows: the copy button creates the task on the other chart (name + timing only) via `addTask`; the reverse direction is disabled.
- If the calendar start lands before the target chart's start date, week 0 is used and the dialog notes the clamp.

**Teams & resources.** Copy button on each role row copies headcount to the other chart; on the team header row it copies headcount for all roles in that team. Missing team/role on the target is created (`addTeam` / `addRole`) so the copy always lands. Demand columns are read-only (demand derives from tasks).

**Tags.** Copies tag membership: for tasks matched by name, the tag is added to / removed from the target task so the target's tag usage mirrors the source. Tasks that exist on only one side are skipped and the dialog says how many tasks will change.

**Dependencies.** Copies the `dependsOn` link for that task: resolves the source predecessor by name in the target chart and sets it; clears the link when the source has none. Disabled with an explanatory tooltip when the predecessor task doesn't exist in the target chart.

## Logic (`src/lib/compare-charts.ts`)
Export the existing `absWeek` helper plus a small `alignedStartWeek(from, to, startWeek)` so the route can translate week indices between charts. No changes to the diff shape itself.

## Notes
- All writes go through existing store actions (`updateTask`, `addTask`, `addTeam`, `addRole`, `setRoleHeadcount`), so persistence, undo-free localStorage saving and the chart editor stay consistent.
- Cascade is not applied — copying a row moves only that task, never its successors.
- No schema or backend changes.
