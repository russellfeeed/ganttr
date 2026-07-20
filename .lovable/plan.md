## Multiple tags per task

### Data model (`src/lib/gantt-store.ts`)
- Change `Task.tag?: string` → `Task.tags: string[]` (always an array, default `[]`).
- Bump persist schema to version 3 with migration:
  - If a task has legacy `tag` string, convert to `tags: [tag]` (trimmed, deduped).
  - Ensure `tags` is always an array on load; drop empty strings.
- Update `createTask` / `importChartTasks` sanitization to normalize `tags` (array of unique trimmed non-empty strings). Accept legacy `tag` on import for backward compatibility.
- Include `tags` in the chart signature used for the "unsaved export" indicator.

### Editor UI (`src/routes/chart.$chartId.tsx`)
- **Task details panel**: replace single text input with a chip-based multi-tag editor:
  - Existing tags shown as removable chips (`x` per chip).
  - Text input adds a tag on Enter or comma; trims and dedupes; still backed by `<datalist>` suggestions built from the union of all tags across the chart.
  - Suggestions exclude tags already on the task.
- **Task list row & task bar label**: show up to 2 tag chips, with `+N` overflow indicator if more.
- **Hover tooltip on task bar**: render all tags as small colored chips instead of one.
- **Tag filter dropdown** (top toolbar): options built from union of all tags; filter matches if the task contains the selected tag (`tags.includes(tagFilter)`).
- **Search**: unchanged (still name-based).

### PDF export (`src/lib/export-pdf.ts`)
- Where a single tag is rendered, join `task.tags` with `, ` (or render first tag + `+N`) so exports reflect the new model.

### Autofill / capacity dialog
- Any place currently reading `task.tag` will read `task.tags` (join for display).

### Out of scope
- No multi-select filter (still single-tag filter dropdown for now).
- No per-tag color mapping.
