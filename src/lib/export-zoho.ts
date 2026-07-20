import { addDays, format, parseISO } from "date-fns";
import type { Chart, Task } from "./gantt-store";

const HEADERS = [
  "Task Name",
  "Task List",
  "Start Date",
  "End Date",
  "Duration",
  "Duration Type",
  "Priority",
  "Percentage Completed",
  "Dependency",
  "Description",
  "Milestone",
];

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function taskDates(chart: Chart, task: Task) {
  const start = addDays(parseISO(chart.startDate), task.startWeek * 7);
  const end = addDays(start, Math.max(1, task.durationWeeks) * 7 - 1);
  return { start, end };
}

function buildDescription(task: Task, roleNameById: Map<string, string>): string {
  const parts: string[] = [];
  if (task.tbc) parts.push("[TBC]");
  if (task.tags?.length) parts.push(task.tags.map((t) => `#${t}`).join(" "));
  if (task.demands?.length) {
    const demands = task.demands
      .map((d) => {
        const name = roleNameById.get(d.roleId);
        if (!name) return null;
        return `${name} x ${d.quantity}`;
      })
      .filter(Boolean) as string[];
    if (demands.length) parts.push(`Resources: ${demands.join(", ")}`);
  }
  return parts.join(" · ");
}

export function exportChartToZohoCsv(chart: Chart): {
  filename: string;
  csv: string;
  duplicateNames: string[];
} {
  const teamNameById = new Map((chart.teams ?? []).map((t) => [t.id, t.name]));
  const roleNameById = new Map<string, string>();
  for (const team of chart.teams ?? []) {
    for (const role of team.roles ?? []) roleNameById.set(role.id, role.name);
  }
  const taskNameById = new Map(chart.tasks.map((t) => [t.id, t.name]));

  // Duplicate name detection
  const nameCounts = new Map<string, number>();
  for (const t of chart.tasks) {
    nameCounts.set(t.name, (nameCounts.get(t.name) ?? 0) + 1);
  }
  const duplicateNames = [...nameCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([name]) => name);

  const rows: string[] = [HEADERS.join(",")];
  for (const task of chart.tasks) {
    const { start, end } = taskDates(chart, task);
    const taskList = task.teamId ? teamNameById.get(task.teamId) ?? "General" : "General";
    const dependencyName = task.dependsOn ? taskNameById.get(task.dependsOn) : undefined;
    const dependency = dependencyName ? `${dependencyName} - FS` : "";
    const description = buildDescription(task, roleNameById);
    const durationDays = Math.max(1, task.durationWeeks) * 5;

    const cells = [
      task.name,
      taskList,
      format(start, "MM/dd/yyyy"),
      format(end, "MM/dd/yyyy"),
      String(durationDays),
      "days",
      "None",
      "0",
      dependency,
      description,
      "",
    ];
    rows.push(cells.map((c) => csvEscape(c ?? "")).join(","));
  }

  const safe = chart.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "chart";
  return {
    filename: `${safe}-zoho-projects.csv`,
    csv: rows.join("\r\n") + "\r\n",
    duplicateNames,
  };
}
