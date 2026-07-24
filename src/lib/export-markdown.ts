import { addWeeks, format } from "date-fns";
import type { Chart, Task, Team } from "./gantt-store";

function esc(s: string): string {
  return (s ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function safeFile(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "chart";
}

function taskEndDate(chartStart: Date, t: Task): Date {
  // end date = start + duration weeks - 1 day (last day of last week)
  const end = addWeeks(chartStart, t.startWeek + t.durationWeeks);
  end.setDate(end.getDate() - 1);
  return end;
}

function formatResources(t: Task, team: Team | null): string {
  if (!t.demands || t.demands.length === 0) return "—";
  return t.demands
    .map((d) => {
      const role = team?.roles.find((r) => r.id === d.roleId);
      const name = role ? role.name : "⚠ orphan";
      return `${d.quantity}× ${esc(name)}`;
    })
    .join(", ");
}

function computePeakDemand(chart: Chart) {
  // team.id -> role.id -> { peak, peakWeek }
  const result = new Map<string, Map<string, { peak: number; peakWeek: number }>>();
  const chartStart = new Date(chart.startDate);
  const totalWeeks = chart.tasks.reduce(
    (m, t) => Math.max(m, t.startWeek + t.durationWeeks),
    0,
  );
  for (const team of chart.teams) {
    const roleMap = new Map<string, { peak: number; peakWeek: number }>();
    for (const role of team.roles) {
      const perWeek = new Array(totalWeeks).fill(0);
      for (const t of chart.tasks) {
        if (t.teamId !== team.id) continue;
        const qty =
          t.demands?.find((d) => d.roleId === role.id)?.quantity ?? 0;
        if (qty <= 0) continue;
        for (let w = t.startWeek; w < t.startWeek + t.durationWeeks; w++) {
          if (w >= 0 && w < totalWeeks) perWeek[w] += qty;
        }
      }
      let peak = 0;
      let peakWeek = 0;
      for (let w = 0; w < perWeek.length; w++) {
        if (perWeek[w] > peak) {
          peak = perWeek[w];
          peakWeek = w;
        }
      }
      roleMap.set(role.id, { peak, peakWeek });
    }
    result.set(team.id, roleMap);
  }
  return { result, chartStart };
}

export function exportChartToMarkdown(chart: Chart): void {
  const chartStart = new Date(chart.startDate);
  const totalWeeks = chart.tasks.reduce(
    (m, t) => Math.max(m, t.startWeek + t.durationWeeks),
    0,
  );
  const chartEnd =
    totalWeeks > 0
      ? (() => {
          const d = addWeeks(chartStart, totalWeeks);
          d.setDate(d.getDate() - 1);
          return d;
        })()
      : chartStart;

  const lines: string[] = [];
  lines.push(`# ${esc(chart.name || "Untitled chart")}`);
  lines.push("");
  lines.push(`- Start: ${format(chartStart, "MMM d, yyyy")}`);
  lines.push(`- Total tasks: ${chart.tasks.length}`);
  lines.push(
    `- Duration: ${totalWeeks} week${totalWeeks === 1 ? "" : "s"} (${format(
      chartStart,
      "MMM d, yyyy",
    )} → ${format(chartEnd, "MMM d, yyyy")})`,
  );
  lines.push(`- Exported: ${format(new Date(), "MMM d, yyyy HH:mm")}`);
  lines.push("");

  // Teams
  const hasUnassigned = chart.tasks.some((t) => !t.teamId);
  if (chart.teams.length > 0 || hasUnassigned) {
    lines.push("## Teams");
    lines.push("");
    for (const team of chart.teams) {
      lines.push(`### ${esc(team.name)} (${team.color})`);
      if (team.roles.length > 0) {
        lines.push(
          `- Roles: ${team.roles
            .map((r) => `${esc(r.name)} × ${r.headcount}`)
            .join(", ")}`,
        );
      } else {
        lines.push(`- Roles: —`);
      }
      lines.push("");
    }
  }

  // Tasks grouped by team
  lines.push("## Tasks");
  lines.push("");
  const teamsById = new Map(chart.teams.map((t) => [t.id, t]));
  const groups: { team: Team | null; tasks: Task[] }[] = [];
  for (const team of chart.teams) {
    const tasks = chart.tasks.filter((t) => t.teamId === team.id);
    if (tasks.length > 0) groups.push({ team, tasks });
  }
  const unassigned = chart.tasks.filter(
    (t) => !t.teamId || !teamsById.has(t.teamId),
  );
  if (unassigned.length > 0) groups.push({ team: null, tasks: unassigned });

  const taskNameById = new Map(chart.tasks.map((t) => [t.id, t.name]));

  for (const g of groups) {
    lines.push(`### ${esc(g.team?.name ?? "Unassigned")}`);
    lines.push("");
    lines.push(
      "| # | Task | Start | End | Weeks | TBC | Depends on | Resources |",
    );
    lines.push("|---|------|-------|-----|-------|-----|------------|-----------|");
    const sorted = [...g.tasks].sort((a, b) => a.startWeek - b.startWeek);
    sorted.forEach((t, i) => {
      const start = format(addWeeks(chartStart, t.startWeek), "MMM d, yyyy");
      const end = format(taskEndDate(chartStart, t), "MMM d, yyyy");
      const dep = t.dependsOn
        ? esc(taskNameById.get(t.dependsOn) ?? "⚠ missing")
        : "—";
      const res = formatResources(t, g.team);
      lines.push(
        `| ${i + 1} | ${esc(t.name || "Untitled")} | ${start} | ${end} | ${t.durationWeeks} | ${t.tbc ? "Yes" : "–"} | ${dep} | ${res} |`,
      );
    });
    lines.push("");
  }

  // Capacity summary
  const teamsWithRoles = chart.teams.filter((t) => t.roles.length > 0);
  if (teamsWithRoles.length > 0) {
    const { result } = computePeakDemand(chart);
    lines.push("## Capacity summary");
    lines.push("");
    lines.push("| Team | Role | Headcount | Peak demand | Peak week | Status |");
    lines.push("|------|------|-----------|-------------|-----------|--------|");
    for (const team of teamsWithRoles) {
      for (const role of team.roles) {
        const info = result.get(team.id)?.get(role.id) ?? {
          peak: 0,
          peakWeek: 0,
        };
        let status = "Healthy";
        if (info.peak === 0) status = "—";
        else if (role.headcount === 0) status = "Unstaffed";
        else if (info.peak > role.headcount) status = "Overloaded";
        else if (info.peak === role.headcount) status = "At capacity";
        const peakWeekLabel =
          info.peak > 0
            ? format(addWeeks(chartStart, info.peakWeek), "MMM d, yyyy")
            : "—";
        lines.push(
          `| ${esc(team.name)} | ${esc(role.name)} | ${role.headcount} | ${info.peak} | ${peakWeekLabel} | ${status} |`,
        );
      }
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFile(chart.name)}-${format(new Date(), "yyyy-MM-dd")}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
