import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import { startOfWeek, formatISO } from "date-fns";

export const TASK_COLORS = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Slate", value: "#64748b" },
  { name: "Teal", value: "#14b8a6" },
];

export type Role = {
  id: string;
  name: string;
  headcount: number;
};

export type Team = {
  id: string;
  name: string;
  color: string;
  roles: Role[];
};

export type TaskDemand = {
  roleId: string;
  quantity: number;
};

export type Task = {
  id: string;
  name: string;
  startWeek: number; // offset in weeks from chart.startDate (Monday)
  durationWeeks: number;
  color: string;
  tags?: string[];
  dependsOn?: string;
  teamId?: string;
  tbc?: boolean;
  demands?: TaskDemand[];
};

export function normalizeTags(input: unknown, legacyTag?: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const v = raw.trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  if (Array.isArray(input)) for (const v of input) push(v);
  else if (typeof input === "string") push(input);
  if (typeof legacyTag === "string") push(legacyTag);
  return out;
}

export type Chart = {
  id: string;
  name: string;
  startDate: string; // ISO date of the Monday the chart starts on
  tasks: Task[];
  teams: Team[];
  createdAt: number;
};

type State = {
  charts: Record<string, Chart>;
  order: string[];
  exportSignatures: Record<string, string>;
};

type Actions = {
  createChart: (name?: string) => string;
  renameChart: (id: string, name: string) => void;
  deleteChart: (id: string) => void;
  duplicateChart: (id: string) => string | null;
  addTask: (chartId: string, partial?: Partial<Task>) => string;
  updateTask: (chartId: string, taskId: string, patch: Partial<Task>) => void;
  deleteTask: (chartId: string, taskId: string) => void;
  reorderTasks: (chartId: string, ids: string[]) => void;
  moveTask: (chartId: string, taskId: string, newStartWeek: number, cascade: boolean) => void;
  importCharts: (
    incoming: { charts: Record<string, Chart>; order: string[] },
    mode: "merge" | "replace",
  ) => number;
  importChartTasks: (
    chartId: string,
    incoming: { tasks: Task[]; name?: string; startDate?: string; teams?: Team[] },
    mode: "merge" | "replace",
  ) => number;

  addTeam: (chartId: string, name?: string, color?: string) => string;
  renameTeam: (chartId: string, teamId: string, name: string) => void;
  setTeamColor: (chartId: string, teamId: string, color: string) => void;
  deleteTeam: (chartId: string, teamId: string) => void;
  addRole: (chartId: string, teamId: string, name?: string, headcount?: number) => string;
  renameRole: (chartId: string, teamId: string, roleId: string, name: string) => void;
  setRoleHeadcount: (chartId: string, teamId: string, roleId: string, headcount: number) => void;
  deleteRole: (chartId: string, teamId: string, roleId: string) => void;
  setTaskDemand: (chartId: string, taskId: string, roleId: string, quantity: number) => void;
  markChartExported: (chartId: string) => void;
};

function firstMondayISO(): string {
  return formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), { representation: "date" });
}

export function computeChartSignature(chart: Chart): string {
  return JSON.stringify({
    n: chart.name,
    s: chart.startDate,
    teams: (chart.teams ?? []).map((t) => [
      t.id,
      t.name,
      t.color,
      (t.roles ?? []).map((r) => [r.id, r.name, r.headcount]),
    ]),
    tasks: chart.tasks.map((t) => [
      t.id,
      t.name,
      t.startWeek,
      t.durationWeeks,
      t.color,
      t.tag ?? "",
      t.dependsOn ?? "",
      t.teamId ?? "",
      t.tbc ? 1 : 0,
      (t.demands ?? []).map((d) => [d.roleId, d.quantity]),
    ]),
  });
}

export const useGanttStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      charts: {},
      order: [],
      exportSignatures: {},

      createChart: (name) => {
        const id = nanoid(8);
        const chart: Chart = {
          id,
          name: name?.trim() || "Untitled chart",
          startDate: firstMondayISO(),
          tasks: [],
          teams: [],
          createdAt: Date.now(),
        };
        set((s) => ({ charts: { ...s.charts, [id]: chart }, order: [id, ...s.order] }));
        return id;
      },

      renameChart: (id, name) =>
        set((s) => {
          const c = s.charts[id];
          if (!c) return s;
          return { charts: { ...s.charts, [id]: { ...c, name } } };
        }),

      deleteChart: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.charts;
          return { charts: rest, order: s.order.filter((x) => x !== id) };
        }),

      duplicateChart: (id) => {
        const src = get().charts[id];
        if (!src) return null;
        const newId = nanoid(8);
        const copy: Chart = {
          ...src,
          id: newId,
          name: `${src.name} (copy)`,
          createdAt: Date.now(),
          tasks: src.tasks.map((t) => ({ ...t, id: nanoid(8), dependsOn: undefined })),
        };
        set((s) => ({ charts: { ...s.charts, [newId]: copy }, order: [newId, ...s.order] }));
        return newId;
      },

      addTask: (chartId, partial) => {
        const id = nanoid(8);
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          const color = TASK_COLORS[chart.tasks.length % TASK_COLORS.length].value;
          const task: Task = {
            id,
            name: partial?.name ?? `Task ${chart.tasks.length + 1}`,
            startWeek: partial?.startWeek ?? 0,
            durationWeeks: partial?.durationWeeks ?? 2,
            color: partial?.color ?? color,
            tag: partial?.tag,
            dependsOn: partial?.dependsOn,
          };
          return {
            charts: { ...s.charts, [chartId]: { ...chart, tasks: [...chart.tasks, task] } },
          };
        });
        return id;
      },

      updateTask: (chartId, taskId, patch) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                tasks: chart.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
              },
            },
          };
        }),

      deleteTask: (chartId, taskId) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                tasks: chart.tasks
                  .filter((t) => t.id !== taskId)
                  .map((t) => (t.dependsOn === taskId ? { ...t, dependsOn: undefined } : t)),
              },
            },
          };
        }),

      reorderTasks: (chartId, ids) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          const byId = new Map(chart.tasks.map((t) => [t.id, t]));
          const next = ids.map((id) => byId.get(id)!).filter(Boolean);
          return { charts: { ...s.charts, [chartId]: { ...chart, tasks: next } } };
        }),

      moveTask: (chartId, taskId, newStartWeek, cascade) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          const t = chart.tasks.find((x) => x.id === taskId);
          if (!t) return s;
          const delta = newStartWeek - t.startWeek;
          if (delta === 0) return s;

          const shifted = new Set<string>([taskId]);
          if (cascade) {
            // BFS through descendants
            let changed = true;
            while (changed) {
              changed = false;
              for (const task of chart.tasks) {
                if (task.dependsOn && shifted.has(task.dependsOn) && !shifted.has(task.id)) {
                  shifted.add(task.id);
                  changed = true;
                }
              }
            }
          }

          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                tasks: chart.tasks.map((task) =>
                  shifted.has(task.id)
                    ? { ...task, startWeek: Math.max(0, task.startWeek + delta) }
                    : task,
                ),
              },
            },
          };
        }),


      importCharts: (incoming, mode) => {
        let count = 0;
        set((s) => {
          const baseCharts = mode === "replace" ? {} : { ...s.charts };
          const baseOrder = mode === "replace" ? [] : [...s.order];
          const idMap: Record<string, string> = {};
          const nextCharts: Record<string, Chart> = { ...baseCharts };
          const prepended: string[] = [];
          for (const oldId of incoming.order) {
            const src = incoming.charts[oldId];
            if (!src) continue;
            const newId = nextCharts[oldId] ? nanoid(8) : oldId;
            idMap[oldId] = newId;
            nextCharts[newId] = {
              ...src,
              id: newId,
              teams: (src.teams ?? []).map((t) => ({ ...t, roles: t.roles ?? [] })),
              tasks: (src.tasks ?? []).map((t) => ({ ...t, demands: t.demands ?? [] })),
            };
            prepended.push(newId);
            count++;
          }
          const nextOrder = [
            ...prepended,
            ...baseOrder.filter((id) => !prepended.includes(id)),
          ];
          return { charts: nextCharts, order: nextOrder };
        });
        return count;
      },

      importChartTasks: (chartId, incoming, mode) => {
        let count = 0;
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;

          // Merge/replace teams first so we know the valid role IDs before sanitizing demands.
          const incomingTeams: Team[] = (incoming.teams ?? []).map((t) => ({
            ...t,
            roles: (t.roles ?? []).map((r) => ({ ...r })),
          }));
          let nextTeams: Team[];
          if (mode === "replace") {
            nextTeams = incomingTeams;
          } else {
            const existing = (chart.teams ?? []).map((t) => ({ ...t, roles: [...(t.roles ?? [])] }));
            const byId = new Map(existing.map((t) => [t.id, t]));
            for (const inc of incomingTeams) {
              const cur = byId.get(inc.id);
              if (!cur) {
                existing.push(inc);
                byId.set(inc.id, inc);
              } else {
                const roleIds = new Set(cur.roles.map((r) => r.id));
                for (const r of inc.roles) if (!roleIds.has(r.id)) cur.roles.push(r);
              }
            }
            nextTeams = existing;
          }

          const existingIds = new Set(chart.tasks.map((t) => t.id));
          const idMap: Record<string, string> = {};
          const remapped: Task[] = incoming.tasks.map((t) => {
            const newId = existingIds.has(t.id) || idMap[t.id] ? nanoid(8) : t.id;
            idMap[t.id] = newId;
            return { ...t, id: newId, demands: t.demands ?? [] };
          });
          // Fix dependsOn references within the imported set + sanitize teamId + demand roleIds
          const knownTeamIds = new Set(nextTeams.map((t) => t.id));
          const knownRoleIds = new Set<string>();
          for (const team of nextTeams) for (const r of team.roles ?? []) knownRoleIds.add(r.id);
          for (const t of remapped) {
            if (t.dependsOn && idMap[t.dependsOn]) t.dependsOn = idMap[t.dependsOn];
            else if (t.dependsOn && !existingIds.has(t.dependsOn)) t.dependsOn = undefined;
            if (t.teamId && !knownTeamIds.has(t.teamId)) t.teamId = undefined;
            if (t.demands && t.demands.length > 0) {
              t.demands = t.demands.filter((d) => knownRoleIds.has(d.roleId));
            }
          }
          const nextTasks = mode === "replace" ? remapped : [...chart.tasks, ...remapped];
          count = remapped.length;
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                name: mode === "replace" && incoming.name ? incoming.name : chart.name,
                startDate:
                  mode === "replace" && incoming.startDate ? incoming.startDate : chart.startDate,
                teams: nextTeams,
                tasks: nextTasks,
              },
            },
          };
        });
        return count;
      },


      addTeam: (chartId, name, color) => {
        const id = nanoid(8);
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          const teams = chart.teams ?? [];
          const fallback = TASK_COLORS[teams.length % TASK_COLORS.length].value;
          const team: Team = {
            id,
            name: name?.trim() || `Team ${teams.length + 1}`,
            color: color ?? fallback,
            roles: [],
          };
          return {
            charts: {
              ...s.charts,
              [chartId]: { ...chart, teams: [...teams, team] },
            },
          };
        });
        return id;
      },

      renameTeam: (chartId, teamId, name) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                teams: (chart.teams ?? []).map((t) =>
                  t.id === teamId ? { ...t, name } : t,
                ),
              },
            },
          };
        }),

      setTeamColor: (chartId, teamId, color) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                teams: (chart.teams ?? []).map((t) =>
                  t.id === teamId ? { ...t, color } : t,
                ),
              },
            },
          };
        }),

      deleteTeam: (chartId, teamId) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          const team = (chart.teams ?? []).find((t) => t.id === teamId);
          const removedRoleIds = new Set((team?.roles ?? []).map((r) => r.id));
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                teams: (chart.teams ?? []).filter((t) => t.id !== teamId),
                tasks: chart.tasks.map((task) => {
                  const cleared = task.teamId === teamId ? { ...task, teamId: undefined } : task;
                  if (!cleared.demands || cleared.demands.length === 0) return cleared;
                  const nextDemands = cleared.demands.filter((d) => !removedRoleIds.has(d.roleId));
                  return { ...cleared, demands: nextDemands };
                }),
              },
            },
          };
        }),

      addRole: (chartId, teamId, name, headcount) => {
        const id = nanoid(8);
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                teams: (chart.teams ?? []).map((t) => {
                  if (t.id !== teamId) return t;
                  const roles = t.roles ?? [];
                  const role: Role = {
                    id,
                    name: name?.trim() || `Role ${roles.length + 1}`,
                    headcount: Math.max(0, headcount ?? 1),
                  };
                  return { ...t, roles: [...roles, role] };
                }),
              },
            },
          };
        });
        return id;
      },

      renameRole: (chartId, teamId, roleId, name) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                teams: (chart.teams ?? []).map((t) =>
                  t.id === teamId
                    ? {
                        ...t,
                        roles: (t.roles ?? []).map((r) =>
                          r.id === roleId ? { ...r, name } : r,
                        ),
                      }
                    : t,
                ),
              },
            },
          };
        }),

      setRoleHeadcount: (chartId, teamId, roleId, headcount) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                teams: (chart.teams ?? []).map((t) =>
                  t.id === teamId
                    ? {
                        ...t,
                        roles: (t.roles ?? []).map((r) =>
                          r.id === roleId ? { ...r, headcount: Math.max(0, headcount) } : r,
                        ),
                      }
                    : t,
                ),
              },
            },
          };
        }),

      deleteRole: (chartId, teamId, roleId) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                teams: (chart.teams ?? []).map((t) =>
                  t.id === teamId
                    ? { ...t, roles: (t.roles ?? []).filter((r) => r.id !== roleId) }
                    : t,
                ),
                tasks: chart.tasks.map((task) => {
                  if (!task.demands || task.demands.length === 0) return task;
                  const nextDemands = task.demands.filter((d) => d.roleId !== roleId);
                  if (nextDemands.length === task.demands.length) return task;
                  return { ...task, demands: nextDemands };
                }),
              },
            },
          };
        }),

      setTaskDemand: (chartId, taskId, roleId, quantity) =>
        set((s) => {
          const chart = s.charts[chartId];
          if (!chart) return s;
          const q = Math.max(0, Math.floor(quantity));
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                tasks: chart.tasks.map((task) => {
                  if (task.id !== taskId) return task;
                  const existing = task.demands ?? [];
                  const others = existing.filter((d) => d.roleId !== roleId);
                  const next = q > 0 ? [...others, { roleId, quantity: q }] : others;
                  return { ...task, demands: next };
                }),
              },
            },
          };
        }),

      markChartExported: (chartId) =>
        set((s) => {
          const c = s.charts[chartId];
          if (!c) return s;
          return { exportSignatures: { ...s.exportSignatures, [chartId]: computeChartSignature(c) } };
        }),
    }),
    {
      name: "gantt-store-v1",
      version: 2,
      migrate: (persisted: any, version) => {
        if (!persisted || typeof persisted !== "object") return persisted;
        if (version < 1 && persisted.charts) {
          for (const id of Object.keys(persisted.charts)) {
            const c = persisted.charts[id];
            if (c && !Array.isArray(c.teams)) c.teams = [];
          }
        }
        if (version < 2 && persisted.charts) {
          for (const id of Object.keys(persisted.charts)) {
            const c = persisted.charts[id];
            if (!c) continue;
            if (Array.isArray(c.teams)) {
              for (const t of c.teams) if (!Array.isArray(t.roles)) t.roles = [];
            }
            if (Array.isArray(c.tasks)) {
              for (const task of c.tasks) if (!Array.isArray(task.demands)) task.demands = [];
            }
          }
        }
        return persisted;
      },
    },
  ),
);
