## Diagnose "tags gone everywhere"

Everything in code still reads and writes `task.tags` (row, bar, tooltip, editor, filter, export, migration). Since tags are missing everywhere at once, the most likely cause is data-side, not render-side — the current chart's tasks simply don't have a `tags` array populated. Possible causes:

1. The v3 migration ran on a store that never had a `tag` field, producing `tags: []` for every task (expected — but nothing to display).
2. A re-import from an older JSON export replaced tasks whose stored field was `tag` (singular) and the normalization missed them.
3. Tags were edited but `updateTask({tags})` was called with an empty array by the TagEditor's blur/commit path.

## Steps

1. **Inspect live state**: read `localStorage["gantt-store-v1"]` for the current chart and log, per task: `tags`, legacy `tag`, and the persisted `version`. This tells us whether tags exist in storage at all.
2. **Branch on result**:
   - If storage has legacy `tag` values but no `tags`: the migration didn't run for this chart — add a one-off normalization pass at store hydration and re-run for existing data.
   - If storage has `tags: []` everywhere and no legacy `tag`: tags were genuinely lost (likely at an import step). Offer to restore from the user's most recent JSON backup by re-importing.
   - If storage has correct `tags` arrays: the bug is in rendering/filtering — likely the `tagFilter` is stuck on a stale value (e.g. `"No tags"`) after the previous change; reset the filter and verify.
3. **Fix the identified cause**, then verify tags appear in the task list, on task bars, in the tooltip, in the details editor, and in the filter dropdown.

Nothing is edited until step 1's result is in — the diagnosis drives the fix.