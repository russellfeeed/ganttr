Add an optional tooltip to the `Stat` component in the Capacity health bar so the **Unstaffed demand** and **Coverage** labels explain their meaning on hover.

### Changes
1. Extend `Stat` props to accept an optional `tooltip` string.
2. When `tooltip` is provided, wrap the `Stat` label in a `Tooltip` using the existing `TooltipProvider` / `TooltipTrigger` / `TooltipContent` imports from `@/components/ui/tooltip`.
3. Pass the definitions as tooltips:
   - **Unstaffed demand**: "Role demand that cannot be filled because the assigned team has no people in that role, or fewer than required."
   - **Coverage**: "Percentage of total weekly role demand that is covered by available headcount in the assigned teams."

No other behavior or styling changes. The definitions match the ones already provided to the user.