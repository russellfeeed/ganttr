# Simple Gantt Chart Builder — Plan

A local-first app for building week-based Gantt charts. Tasks span multiple weeks or months, and are edited by dragging bars around a weekly grid.

## Core features

- **Weekly timeline grid**: columns = ISO weeks (Mon–Sun). Header shows week number + month label. Horizontal scroll for long projects; sticky task-name column on the left.
- **Tasks**: name, start week, duration (in weeks), color, category label, optional dependency (predecessor task).
- **Drag & drop**:
  - Drag a bar horizontally → change start week (move task).
  - Drag left/right edge handle → resize duration.
  - Drag task row up/down in the left panel → reorder.
  - Snap to whole weeks.
- **Dependencies**: pick a predecessor from a dropdown in the task editor. An SVG arrow is drawn from the end of the predecessor to the start of the successor. When moving a predecessor, successors optionally shift to preserve the gap (toggle "cascade").
- **Colors & labels**: each task has a color swatch and a free-text category tag. Tags shown as small pill on the bar; filter bar at the top to show/hide by tag.
- **Chart management**: multiple charts, each with a name. Sidebar lists charts; create / rename / duplicate / delete.
- **Persistence**: all data stored in `localStorage` under a single JSON blob. Auto-save on every change. Export/import JSON for backup. Export PNG of the current chart.

## Screens

1. `/` — chart list + "New chart" button. Redirects to last opened chart if any.
2. `/chart/$chartId` — the Gantt editor:
   - Left: task list (drag handle, name, duration).
   - Right: scrollable weekly timeline with bars.
   - Top: chart title, zoom (compact / normal / wide week columns), add-task button, tag filter, export menu.
   - Task editor: side sheet or inline popover for name, color, tag, dependency, cascade toggle.

## Technical details

- **Routes** (TanStack Start file-based):
  - `src/routes/index.tsx` — chart list (replaces placeholder).
  - `src/routes/chart.$chartId.tsx` — editor.
- **State**: Zustand store persisted to `localStorage` (`gantt-store` key). Shape:
  ```ts
  { charts: Record<string, Chart>, order: string[] }
  Chart = { id, name, startDate: ISODate (Monday), tasks: Task[] }
  Task = { id, name, startWeek: number, durationWeeks: number,
           color: string, tag?: string, dependsOn?: string }
  ```
  `startWeek` is an integer offset from `chart.startDate` so week math stays simple.
- **Drag/resize/reorder**: `@dnd-kit/core` + `@dnd-kit/sortable` for row reordering; custom pointer-event handlers on bars for horizontal move + edge-resize (snap = column width). No heavy Gantt library — keeps bundle small and behavior predictable.
- **Dependency arrows**: single absolutely-positioned SVG overlay across the timeline; recompute polyline paths from task positions on every render.
- **Dates**: `date-fns` (`addWeeks`, `format`, `startOfISOWeek`).
- **Export PNG**: `html-to-image` on the chart container.
- **Styling**: existing Tailwind + shadcn tokens. Add a small palette of task colors as CSS variables in `styles.css` so bars stay theme-consistent in light/dark.
- **Head metadata**: update `__root.tsx` title/description to "Gantt — simple weekly project timelines"; leaf routes set their own titles.

## Out of scope (for now)

- Cloud sync / accounts.
- Sub-tasks, milestones, resource assignments.
- Day-level or month-level zoom (weeks only, per your choice).
- Critical-path calculation.

## Build order

1. Store + types + localStorage persistence.
2. Chart list page (replace `index.tsx`).
3. Editor route with static weekly grid + bars from store.
4. Drag-to-move + edge-resize with week snapping.
5. Row reordering via dnd-kit.
6. Task editor popover (name, color, tag, dependency, cascade).
7. Dependency arrow overlay + cascade-on-move logic.
8. Tag filter, zoom levels, export PNG, JSON import/export.
