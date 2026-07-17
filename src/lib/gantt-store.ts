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

export type Team = {
  id: string;
  name: string;
  color: string;
};

export type Task = {
  id: string;
  name: string;
  startWeek: number; // offset in weeks from chart.startDate (Monday)
  durationWeeks: number;
  color: string;
  tag?: string;
  dependsOn?: string;
  teamId?: string;
};

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
    incoming: { tasks: Task[]; name?: string; startDate?: string },
    mode: "merge" | "replace",
  ) => number;
  addTeam: (chartId: string, name?: string, color?: string) => string;
  renameTeam: (chartId: string, teamId: string, name: string) => void;
  setTeamColor: (chartId: string, teamId: string, color: string) => void;
  deleteTeam: (chartId: string, teamId: string) => void;
};

function firstMondayISO(): string {
  return formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), { representation: "date" });
}

export const useGanttStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      charts: {},
      order: [],

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
            nextCharts[newId] = { ...src, id: newId };
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
          const existingIds = new Set(chart.tasks.map((t) => t.id));
          const idMap: Record<string, string> = {};
          const remapped: Task[] = incoming.tasks.map((t) => {
            const newId = existingIds.has(t.id) || idMap[t.id] ? nanoid(8) : t.id;
            idMap[t.id] = newId;
            return { ...t, id: newId };
          });
          // Fix dependsOn references within the imported set + sanitize teamId
          const knownTeamIds = new Set((chart.teams ?? []).map((t) => t.id));
          for (const t of remapped) {
            if (t.dependsOn && idMap[t.dependsOn]) t.dependsOn = idMap[t.dependsOn];
            else if (t.dependsOn && !existingIds.has(t.dependsOn)) t.dependsOn = undefined;
            if (t.teamId && !knownTeamIds.has(t.teamId)) t.teamId = undefined;
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
          return {
            charts: {
              ...s.charts,
              [chartId]: {
                ...chart,
                teams: (chart.teams ?? []).filter((t) => t.id !== teamId),
                tasks: chart.tasks.map((task) =>
                  task.teamId === teamId ? { ...task, teamId: undefined } : task,
                ),
              },
            },
          };
        }),
    }),
    {
      name: "gantt-store-v1",
      version: 1,
      migrate: (persisted: any, version) => {
        if (!persisted || typeof persisted !== "object") return persisted;
        if (version < 1 && persisted.charts) {
          for (const id of Object.keys(persisted.charts)) {
            const c = persisted.charts[id];
            if (c && !Array.isArray(c.teams)) c.teams = [];
          }
        }
        return persisted;
      },
    },
  ),
);
