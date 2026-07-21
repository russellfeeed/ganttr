import type { ReactElement } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { addWeeks, format, startOfWeek, formatISO, differenceInCalendarWeeks } from "date-fns";
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Calendar as CalendarIcon,
  ZoomIn,
  ZoomOut,
  Download,
  FileDown,
  Upload,
  Users,
  List,
  Rows3,
  Search,
  X,
  TriangleAlert,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,

} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useGanttStore, TASK_COLORS, computeChartSignature, normalizeTags, type Task, type Team, type Role } from "@/lib/gantt-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { exportChartToPdf, type PdfRow } from "@/lib/export-pdf";
import { exportChartToZohoCsv } from "@/lib/export-zoho";

export const Route = createFileRoute("/chart/$chartId")({
  head: () => ({
    meta: [
      { title: "Gantt chart" },
      { name: "description", content: "Edit your weekly Gantt chart." },
    ],
  }),
  component: ChartEditor,
});

const MIN_WEEKS = 12;
const ROW_HEIGHT = 44;
const HEADER_ROW_HEIGHT = 32;
const HEADER_HEIGHT = 56;
const LEFT_PANEL = 260;

const ZOOM_LEVELS = [
  { label: "Compact", width: 48 },
  { label: "Normal", width: 72 },
  { label: "Wide", width: 104 },
];

type ViewMode = "list" | "swimlanes" | "capacity";
type DisplayRow =
  | { kind: "header"; team: Team | null; count: number; key: string }
  | { kind: "task"; task: Task; key: string };

function ChartEditor() {
  const { chartId } = Route.useParams();
  const chart = useGanttStore((s) => s.charts[chartId]);
  const navigate = useNavigate();

  const [zoomIdx, setZoomIdx] = useState(1);
  const [cascade, setCascade] = useState(true);
  const [tagFilter, setTagFilter] = useState<string>("__all__");
  const [teamFilter, setTeamFilter] = useState<string>("__all__");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [capacityCell, setCapacityCell] = useState<
    { teamId: string; roleId: string; week: number } | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [noResourcesOnly, setNoResourcesOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{
    tasks: Task[];
    name?: string;
    startDate?: string;
    teams?: Team[];
  } | null>(null);


  const {
    renameChart,
    addTask,
    updateTask,
    deleteTask,
    moveTask,
    importChartTasks,
    addTeam,
    renameTeam,
    setTeamColor,
    deleteTeam,
    addRole,
    renameRole,
    setRoleHeadcount,
    deleteRole,
    setTaskDemand,
    markChartExported,
  } = useGanttStore.getState();

  const exportedSignature = useGanttStore((s) => s.exportSignatures[chartId]);
  const currentSignature = useMemo(
    () => (chart ? computeChartSignature(chart) : ""),
    [chart],
  );
  const hasUnexportedChanges =
    !!chart && chart.tasks.length > 0 && currentSignature !== exportedSignature;

  // Subscribe so store changes cause re-renders
  useGanttStore((s) => s.charts[chartId]?.tasks.length);
  useGanttStore((s) => s.charts[chartId]?.teams?.length);

  const weekWidth = ZOOM_LEVELS[zoomIdx].width;

  const requiredWeeks = (chart?.tasks ?? []).reduce(
    (max, t) => Math.max(max, t.startWeek + t.durationWeeks),
    0,
  );
  const totalWeeks = Math.max(MIN_WEEKS, requiredWeeks + 4);

  const chartStart = useMemo(
    () => new Date((chart?.startDate ?? "1970-01-01") + "T00:00:00"),
    [chart?.startDate],
  );

  const allTags = useMemo(() => {
    const s = new Set<string>();
    (chart?.tasks ?? []).forEach((t) => (t.tags ?? []).forEach((tag) => s.add(tag)));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [chart?.tasks]);

  const teams = chart?.teams ?? [];

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleTasks = useMemo(() => {
    const tasks = chart?.tasks ?? [];
    return tasks.filter((t) => {
      if (tagFilter !== "__all__") {
        if (tagFilter === "__none__") {
          if ((t.tags ?? []).length > 0) return false;
        } else if (!(t.tags ?? []).includes(tagFilter)) {
          return false;
        }
      }
      if (teamFilter === "__all__") return true;
      if (teamFilter === "__none__") return !t.teamId;
      return t.teamId === teamFilter;
    }).filter((t) => {
      if (!normalizedSearch) return true;
      return t.name.toLowerCase().includes(normalizedSearch);
    }).filter((t) => {
      if (!noResourcesOnly) return true;
      const demands = t.demands ?? [];
      return demands.length === 0 || demands.every((d) => d.quantity <= 0);
    });
  }, [chart?.tasks, tagFilter, teamFilter, normalizedSearch, noResourcesOnly]);

  const noResourcesCount = useMemo(() => {
    return (chart?.tasks ?? []).filter((t) => {
      const demands = t.demands ?? [];
      return demands.length === 0 || demands.every((d) => d.quantity <= 0);
    }).length;
  }, [chart?.tasks]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (viewMode === "list" || viewMode === "capacity") {
      const tasks =
        viewMode === "list"
          ? [...visibleTasks].sort((a, b) => a.startWeek - b.startWeek || a.name.localeCompare(b.name))
          : visibleTasks;
      return tasks.map((t) => ({ kind: "task", task: t, key: t.id }));
    }
    const rows: DisplayRow[] = [];
    const teamIds = new Set(teams.map((t) => t.id));
    const groups: { team: Team | null; tasks: Task[] }[] = teams.map((team) => ({
      team,
      tasks: visibleTasks.filter((t) => t.teamId === team.id),
    }));
    const unassigned = visibleTasks.filter((t) => !t.teamId || !teamIds.has(t.teamId));
    if (unassigned.length || teams.length === 0) {
      groups.push({ team: null, tasks: unassigned });
    }
    for (const g of groups) {
      // Show empty team lanes too, but hide fully-empty Unassigned if teams exist
      if (g.team === null && g.tasks.length === 0 && teams.length > 0) continue;
      rows.push({
        kind: "header",
        team: g.team,
        count: g.tasks.length,
        key: `h-${g.team?.id ?? "none"}`,
      });
      const sorted = [...g.tasks].sort(
        (a, b) => a.startWeek - b.startWeek || a.name.localeCompare(b.name),
      );
      for (const t of sorted) rows.push({ kind: "task", task: t, key: t.id });
    }
    return rows;
  }, [viewMode, visibleTasks, teams]);

  // Per-week demand per team+role, computed from visible tasks
  // Shape: Map<teamId, Map<roleId, number[]>> where number[][week] = total quantity
  const demandByWeek = useMemo(() => {
    const map = new Map<string, Map<string, number[]>>();
    for (const task of visibleTasks) {
      if (!task.teamId || !task.demands || task.demands.length === 0) continue;
      let teamMap = map.get(task.teamId);
      if (!teamMap) {
        teamMap = new Map();
        map.set(task.teamId, teamMap);
      }
      for (const d of task.demands) {
        if (d.quantity <= 0) continue;
        let arr = teamMap.get(d.roleId);
        if (!arr) {
          arr = new Array(totalWeeks).fill(0);
          teamMap.set(d.roleId, arr);
        }
        const end = Math.min(totalWeeks, task.startWeek + task.durationWeeks);
        for (let w = Math.max(0, task.startWeek); w < end; w++) arr[w] += d.quantity;
      }
    }
    return map;
  }, [visibleTasks, totalWeeks]);

  // Task-level overallocation lookup for warning icons
  const overallocatedTaskIds = useMemo(() => {
    const set = new Set<string>();
    for (const task of visibleTasks) {
      if (!task.teamId || !task.demands || task.demands.length === 0) continue;
      const team = teams.find((t) => t.id === task.teamId);
      if (!team) continue;
      const roleCap = new Map<string, number>();
      for (const r of team.roles ?? []) roleCap.set(r.id, r.headcount);
      const teamMap = demandByWeek.get(task.teamId);
      if (!teamMap) continue;
      const end = Math.min(totalWeeks, task.startWeek + task.durationWeeks);
      outer: for (const d of task.demands) {
        if (d.quantity <= 0) continue;
        const cap = roleCap.get(d.roleId) ?? 0;
        const arr = teamMap.get(d.roleId);
        if (!arr) continue;
        for (let w = Math.max(0, task.startWeek); w < end; w++) {
          if (arr[w] > cap) {
            set.add(task.id);
            break outer;
          }
        }
      }
    }
    return set;
  }, [visibleTasks, teams, demandByWeek, totalWeeks]);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  if (!chart) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">This chart doesn't exist.</p>
          <Button variant="link" onClick={() => navigate({ to: "/" })}>
            Back to charts
          </Button>
        </div>
      </div>
    );
  }

  const selectedTask = chart.tasks.find((t) => t.id === selectedTaskId) ?? null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">

        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" /> Charts
          </Link>
        </Button>
        <Input
          value={chart.name}
          onChange={(e) => renameChart(chart.id, e.target.value)}
          className="max-w-xs border-transparent bg-transparent text-base font-semibold shadow-none focus-visible:border-input focus-visible:bg-background"
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-40 sm:w-56 pl-9 pr-8"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="mr-1.5 h-4 w-4" />
                Start: {format(chartStart, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={chartStart}
                onSelect={(d) => {
                  if (!d) return;
                  const monday = startOfWeek(d, { weekStartsOn: 1 });
                  useGanttStore.setState((s) => ({
                    charts: {
                      ...s.charts,
                      [chart.id]: {
                        ...chart,
                        startDate: formatISO(monday, { representation: "date" }),
                      },
                    },
                  }));
                }}
                className={cn("p-3 pointer-events-auto")}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* View mode toggle */}
          <div className="flex items-center rounded-md border border-input p-0.5">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode("list")}
            >
              <List className="mr-1 h-3.5 w-3.5" /> List
            </Button>
            <Button
              variant={viewMode === "swimlanes" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode("swimlanes")}
            >
              <Rows3 className="mr-1 h-3.5 w-3.5" /> Swimlanes
            </Button>
            <Button
              variant={viewMode === "capacity" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode("capacity")}
            >
              <BarChart3 className="mr-1 h-3.5 w-3.5" /> Capacity
            </Button>
          </div>

          {/* Teams manager */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Users className="mr-1.5 h-4 w-4" /> Teams
                {teams.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                    {teams.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-3" align="end">
              <TeamsManager
                teams={teams}
                onAdd={(name) => addTeam(chart.id, name)}
                onRename={(id, name) => renameTeam(chart.id, id, name)}
                onSetColor={(id, c) => setTeamColor(chart.id, id, c)}
                onDelete={(id) => deleteTeam(chart.id, id)}
                onAddRole={(teamId, name, headcount) => addRole(chart.id, teamId, name, headcount)}
                onRenameRole={(teamId, roleId, name) => renameRole(chart.id, teamId, roleId, name)}
                onSetRoleHeadcount={(teamId, roleId, hc) =>
                  setRoleHeadcount(chart.id, teamId, roleId, hc)
                }
                onDeleteRole={(teamId, roleId) => deleteRole(chart.id, teamId, roleId)}
              />
            </PopoverContent>
          </Popover>

          {teams.length > 0 && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All teams</SelectItem>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(chart?.tasks ?? []).length > 0 && (
            <Button
              variant={noResourcesOnly ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={() => setNoResourcesOnly((v) => !v)}
              title="Show only tasks with no resources allocated"
            >
              No resources ({noResourcesCount})
            </Button>
          )}

          {(chart?.tasks ?? []).length > 0 && (
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All tags</SelectItem>
                <SelectItem value="__none__">No tags</SelectItem>
                {allTags.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2 rounded-md border border-input px-2 py-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={zoomIdx === 0}
              onClick={() => setZoomIdx((z) => Math.max(0, z - 1))}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-14 text-center">
              {ZOOM_LEVELS[zoomIdx].label}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={zoomIdx === ZOOM_LEVELS.length - 1}
              onClick={() => setZoomIdx((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-input px-3 py-1.5">
            <Label htmlFor="cascade" className="text-xs">
              Cascade
            </Label>
            <Switch id="cascade" checked={cascade} onCheckedChange={setCascade} />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const data = JSON.parse(await f.text());
                let tasks: Task[] | undefined;
                let name: string | undefined;
                let startDate: string | undefined;
                let teamsFromFile: Team[] | undefined;
                if (Array.isArray(data?.tasks)) {
                  tasks = data.tasks;
                  name = data.name;
                  startDate = data.startDate;
                  teamsFromFile = Array.isArray(data.teams) ? data.teams : undefined;
                } else if (data?.chart?.tasks) {
                  tasks = data.chart.tasks;
                  name = data.chart.name;
                  startDate = data.chart.startDate;
                  teamsFromFile = Array.isArray(data.chart.teams) ? data.chart.teams : undefined;
                } else if (data?.charts) {
                  const firstId = data.order?.[0] ?? Object.keys(data.charts)[0];
                  const c = firstId ? data.charts[firstId] : null;
                  if (c) {
                    tasks = c.tasks;
                    name = c.name;
                    startDate = c.startDate;
                    teamsFromFile = Array.isArray(c.teams) ? c.teams : undefined;
                  }
                }
                if (!tasks) {
                  toast.error("No tasks found in that file.");
                  return;
                }
                setPendingImport({ tasks, name, startDate, teams: teamsFromFile });
              } catch {
                toast.error("Couldn't read that file — is it valid JSON?");
              }
            }}

          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const payload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                chart: {
                  id: chart.id,
                  name: chart.name,
                  startDate: chart.startDate,
                  tasks: chart.tasks.map((t) => ({ ...t, demands: t.demands ?? [] })),
                  teams: (chart.teams ?? []).map((t) => ({
                    id: t.id,
                    name: t.name,
                    color: t.color,
                    roles: (t.roles ?? []).map((r) => ({
                      id: r.id,
                      name: r.name,
                      headcount: r.headcount,
                    })),
                  })),
                  createdAt: chart.createdAt,
                },
              };

              const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              const safe =
                chart.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "chart";
              a.href = url;
              a.download = `${safe}-${format(new Date(), "yyyy-MM-dd")}.json`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              toast.success(
                `Exported ${chart.tasks.length} task${chart.tasks.length === 1 ? "" : "s"}`,
              );
              markChartExported(chart.id);
            }}
          >
            <Download className="mr-1 h-4 w-4" /> JSON
            {hasUnexportedChanges && (
              <span
                aria-label="Unexported changes"
                className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500"
              />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              try {
                const pdfRows: PdfRow[] = displayRows.map((r) =>
                  r.kind === "header"
                    ? { kind: "header", team: r.team, count: r.count }
                    : { kind: "task", task: r.task },
                );
                exportChartToPdf({
                  chart,
                  rows: pdfRows,
                  totalWeeks,
                  viewMode: viewMode === "capacity" ? "list" : viewMode,
                });
                toast.success("PDF exported");
                markChartExported(chart.id);
              } catch (err) {
                console.error(err);
                toast.error("Couldn't export PDF");
              }
            }}
          >
            <FileDown className="mr-1 h-4 w-4" /> PDF
            {hasUnexportedChanges && (
              <span
                aria-label="Unexported changes"
                className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500"
              />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              try {
                const { filename, csv, duplicateNames } = exportChartToZohoCsv(chart);
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                toast.success(`Exported ${chart.tasks.length} task${chart.tasks.length === 1 ? "" : "s"} for Zoho`);
                if (duplicateNames.length) {
                  toast.warning(
                    `Duplicate task names may break dependencies in Zoho: ${duplicateNames.slice(0, 3).join(", ")}${duplicateNames.length > 3 ? "…" : ""}`,
                  );
                }
                markChartExported(chart.id);
              } catch (err) {
                console.error(err);
                toast.error("Couldn't export Zoho CSV");
              }
            }}
          >
            <Download className="mr-1 h-4 w-4" /> Zoho
            {hasUnexportedChanges && (
              <span
                aria-label="Unexported changes"
                className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500"
              />
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const id = addTask(chart.id);
              setSelectedTaskId(id);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Task
          </Button>
        </div>
      </header>

      {/* Main split */}
      <div className="flex flex-1 overflow-hidden">
      {viewMode === "capacity" ? (
        <div className="flex flex-1 overflow-hidden">
          <CapacityHeatmap
            teams={teams}
            totalWeeks={totalWeeks}
            weekWidth={weekWidth}
            chartStart={chartStart}
            demandByWeek={demandByWeek}
            onCellClick={(teamId, roleId, week) =>
              setCapacityCell({ teamId, roleId, week })
            }
          />
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="flex flex-col border-r border-border" style={{ width: LEFT_PANEL }}>
          <div
            className="flex shrink-0 items-center justify-between border-b border-border px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            style={{ height: HEADER_HEIGHT }}
          >
            <span>Tasks</span>
            <span className="text-[10px] normal-case tabular-nums">
              {viewMode === "list" || viewMode === "swimlanes" ? (
                <>total {visibleTasks.length}</>
              ) : null}
            </span>
          </div>
          <div
            ref={leftScrollRef}
            className="flex-1 overflow-y-auto"
            onScroll={(e) => {
              if (syncingRef.current) return;
              syncingRef.current = true;
              if (rightScrollRef.current)
                rightScrollRef.current.scrollTop = e.currentTarget.scrollTop;
              syncingRef.current = false;
            }}
          >

            {viewMode === "list" ? (
              <div>
                {displayRows.map((row) =>
                  row.kind === "task" ? (
                    <TaskRowStatic
                      key={row.key}
                      task={row.task}
                      team={teams.find((t) => t.id === row.task.teamId) ?? null}
                      selected={selectedTaskId === row.task.id}
                      overallocated={overallocatedTaskIds.has(row.task.id)}
                      onSelect={() => setSelectedTaskId(row.task.id)}
                      draggable={false}
                    />
                  ) : null,
                )}
              </div>
            ) : (
              <div>
                {displayRows.map((row) =>
                  row.kind === "header" ? (
                    <LaneHeader
                      key={row.key}
                      team={row.team}
                      count={row.count}
                      onDropTask={(taskId) => {
                        const targetTeamId = row.team?.id;
                        const t = chart.tasks.find((x) => x.id === taskId);
                        if (!t) return;
                        if ((t.teamId ?? undefined) === targetTeamId) return;
                        const patch: Partial<Task> = { teamId: targetTeamId };
                        if (row.team) patch.color = row.team.color;
                        updateTask(chart.id, taskId, patch);
                      }}
                    />
                  ) : (
                    <TaskRowStatic
                      key={row.key}
                      task={row.task}
                      team={teams.find((t) => t.id === row.task.teamId) ?? null}
                      selected={selectedTaskId === row.task.id}
                      overallocated={overallocatedTaskIds.has(row.task.id)}
                      onSelect={() => setSelectedTaskId(row.task.id)}
                    />
                  ),
                )}
              </div>
            )}
            {chart.tasks.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No tasks yet. Click "Task" to add one.
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div
          ref={rightScrollRef}
          className="flex-1 overflow-auto"
          onScroll={(e) => {
            if (syncingRef.current) return;
            syncingRef.current = true;
            if (leftScrollRef.current)
              leftScrollRef.current.scrollTop = e.currentTarget.scrollTop;
            syncingRef.current = false;
          }}
        >
          <TimelineGrid
            weeks={totalWeeks}
            weekWidth={weekWidth}
            chartStart={chartStart}
            rows={displayRows}
            teams={teams}
            allTasks={chart.tasks}
            selectedTaskId={selectedTaskId}
            onSelect={setSelectedTaskId}
            onMove={(taskId, newStart) => moveTask(chart.id, taskId, newStart, cascade)}
            onResize={(taskId, newDuration) =>
              updateTask(chart.id, taskId, { durationWeeks: newDuration })
            }
          />
        </div>

      </div>
      )}

      {/* Right editor (available in all views) */}
      {selectedTask && (
        <TaskEditor
          key={selectedTask.id}
          task={selectedTask}
          chartTasks={chart.tasks}
          teams={teams}
          onChange={(patch) => updateTask(chart.id, selectedTask.id, patch)}
          onSetDemand={(roleId, qty) => setTaskDemand(chart.id, selectedTask.id, roleId, qty)}
          onDelete={() => {
            deleteTask(chart.id, selectedTask.id);
            setSelectedTaskId(null);
          }}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
      </div>


      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import tasks</AlertDialogTitle>
            <AlertDialogDescription>
              This file contains {pendingImport?.tasks.length ?? 0} task
              {(pendingImport?.tasks.length ?? 0) === 1 ? "" : "s"}
              {pendingImport?.teams && pendingImport.teams.length > 0
                ? ` and ${pendingImport.teams.length} team${pendingImport.teams.length === 1 ? "" : "s"}`
                : ""}
              . Merge with what's already in this chart, or replace everything?
            </AlertDialogDescription>

          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingImport) return;
                const n = importChartTasks(chart.id, pendingImport, "replace");
                setPendingImport(null);
                toast.success(`Replaced with ${n} task${n === 1 ? "" : "s"}`);
              }}
            >
              Replace
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (!pendingImport) return;
                const n = importChartTasks(chart.id, pendingImport, "merge");
                setPendingImport(null);
                toast.success(`Added ${n} task${n === 1 ? "" : "s"}`);
              }}
            >
              Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CapacityCellDialog
        cell={capacityCell}
        onOpenChange={(o) => !o && setCapacityCell(null)}
        teams={teams}
        tasks={visibleTasks}
        chartStart={chartStart}
        onOpenTask={(taskId) => {
          setCapacityCell(null);
          setSelectedTaskId(taskId);
        }}
        onSetDemand={(taskId, roleId, qty) =>
          setTaskDemand(chart.id, taskId, roleId, qty)
        }
        onRenameRole={(teamId, roleId, name) =>
          renameRole(chart.id, teamId, roleId, name)
        }
        onSetRoleHeadcount={(teamId, roleId, hc) =>
          setRoleHeadcount(chart.id, teamId, roleId, hc)
        }
      />

    </div>
  );
}

/* ---------------- Teams manager popover ---------------- */

function TeamsManager({
  teams,
  onAdd,
  onRename,
  onSetColor,
  onDelete,
  onAddRole,
  onRenameRole,
  onSetRoleHeadcount,
  onDeleteRole,
}: {
  teams: Team[];
  onAdd: (name: string) => string;
  onRename: (id: string, name: string) => void;
  onSetColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  onAddRole: (teamId: string, name: string, headcount: number) => string;
  onRenameRole: (teamId: string, roleId: string, name: string) => void;
  onSetRoleHeadcount: (teamId: string, roleId: string, headcount: number) => void;
  onDeleteRole: (teamId: string, roleId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">Teams &amp; roles</h4>
        <p className="text-xs text-muted-foreground">
          Assign tasks to a team, then define roles and headcount for capacity planning.
        </p>
      </div>
      <div className="space-y-3 max-h-[420px] overflow-y-auto">
        {teams.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No teams yet — add one below.
          </div>
        )}
        {teams.map((team) => (
          <div key={team.id} className="rounded-md border border-border p-2 space-y-2">
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="h-6 w-6 shrink-0 rounded-sm border border-border"
                    style={{ backgroundColor: team.color }}
                    aria-label="Change color"
                  />
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <div className="flex flex-wrap gap-1.5 max-w-[180px]">
                    {TASK_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => onSetColor(team.id, c.value)}
                        className={cn(
                          "h-6 w-6 rounded-sm border-2",
                          team.color === c.value ? "border-foreground" : "border-transparent",
                        )}
                        style={{ backgroundColor: c.value }}
                        aria-label={c.name}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                value={team.name}
                onChange={(e) => onRename(team.id, e.target.value)}
                className="h-8 text-sm"
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="Delete team"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{team.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the team and all its roles. Tasks assigned to this team will
                      become unassigned, and any role demands from this team will be cleared. This
                      can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(team.id)}>
                      Delete team
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

            </div>
            <TeamRolesEditor
              team={team}
              onAddRole={onAddRole}
              onRenameRole={onRenameRole}
              onSetRoleHeadcount={onSetRoleHeadcount}
              onDeleteRole={onDeleteRole}
            />
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 pt-2 border-t border-border"
        onSubmit={(e) => {
          e.preventDefault();
          const name = draft.trim();
          if (!name) return;
          onAdd(name);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New team name"
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function TeamRolesEditor({
  team,
  onAddRole,
  onRenameRole,
  onSetRoleHeadcount,
  onDeleteRole,
}: {
  team: Team;
  onAddRole: (teamId: string, name: string, headcount: number) => string;
  onRenameRole: (teamId: string, roleId: string, name: string) => void;
  onSetRoleHeadcount: (teamId: string, roleId: string, headcount: number) => void;
  onDeleteRole: (teamId: string, roleId: string) => void;
}) {
  const [name, setName] = useState("");
  const [count, setCount] = useState(1);
  const roles = team.roles ?? [];
  return (
    <div className="pl-8 space-y-1.5">
      {roles.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No roles yet.</p>
      )}
      {roles.map((r) => (
        <div key={r.id} className="flex items-center gap-1.5">
          <Input
            value={r.name}
            onChange={(e) => onRenameRole(team.id, r.id, e.target.value)}
            className="h-7 text-xs flex-1"
          />
          <Input
            type="number"
            min={0}
            step={0.5}
            value={r.headcount}
            onChange={(e) =>
              onSetRoleHeadcount(team.id, r.id, Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 2) / 2))
            }
            className="h-7 w-14 text-xs"
            aria-label="Headcount"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onDeleteRole(team.id, r.id)}
            aria-label="Delete role"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <form
        className="flex items-center gap-1.5 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          onAddRole(team.id, n, count);
          setName("");
          setCount(1);
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add role"
          className="h-7 text-xs flex-1"
        />
        <Input
          type="number"
          min={0}
          step={0.5}
          value={count}
          onChange={(e) => setCount(Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 2) / 2))}
          className="h-7 w-14 text-xs"
          aria-label="Headcount"
        />
        <Button type="submit" size="sm" variant="outline" className="h-7 px-2" disabled={!name.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}

/* ---------------- Lane header (swimlane mode) ---------------- */

function LaneHeader({
  team,
  count,
  onDropTask,
}: {
  team: Team | null;
  count: number;
  onDropTask: (taskId: string) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-task-id")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!over) setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const taskId = e.dataTransfer.getData("application/x-task-id");
        if (taskId) onDropTask(taskId);
      }}
      className={cn(
        "flex items-center gap-2 border-b border-border bg-muted/40 px-3",
        over && "bg-accent ring-1 ring-inset ring-primary",
      )}
      style={{ height: HEADER_ROW_HEIGHT }}
    >
      <span
        className="h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: team?.color ?? "hsl(var(--muted-foreground))" }}
      />
      <span className="text-xs font-medium">{team?.name ?? "Unassigned"}</span>
      <span className="ml-auto text-[10px] text-muted-foreground">
        {count} task{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

/* ---------------- Task row (static, list/swimlane mode) ---------------- */

function TaskRowStatic({
  task,
  team,
  selected,
  overallocated,
  onSelect,
  draggable = true,
}: {
  task: Task;
  team: Team | null;
  selected: boolean;
  overallocated?: boolean;
  onSelect: () => void;
  draggable?: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-task-id", task.id);
      }}
      onClick={onSelect}
      style={{ height: ROW_HEIGHT }}
      className={cn(
        "flex items-center gap-2 border-b border-border pl-6 pr-2",
        draggable && "cursor-grab active:cursor-grabbing",
        selected && "bg-accent",
      )}
      title={draggable ? "Drag onto a team lane to assign" : undefined}
    >
      <TaskRowBody task={task} team={team} overallocated={overallocated} />
    </div>
  );
}


function TaskRowBody({
  task,
  team,
  overallocated,
}: {
  task: Task;
  team: Team | null;
  overallocated?: boolean;
}) {
  return (
    <>
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: task.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 truncate text-sm">
          <span className="truncate">{task.name}</span>
          {task.tbc && (
            <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px] border-dashed">
              TBC
            </Badge>
          )}
          {overallocated && (
            <TriangleAlert
              className="h-3.5 w-3.5 shrink-0 text-amber-500"
              aria-label="Overallocated"
            />
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{task.durationWeeks}w</span>
          {team && (
            <>
              <span>·</span>
              <span
                className="h-1.5 w-1.5 rounded-sm"
                style={{ backgroundColor: team.color }}
              />
              <span className="truncate">{team.name}</span>
            </>
          )}
          {(task.tags ?? []).slice(0, 2).map((tag) => (
            <span key={tag} className="flex items-center gap-1 truncate max-w-[80px]">
              <span>·</span>
              <span className="truncate">{tag}</span>
            </span>
          ))}
          {(task.tags?.length ?? 0) > 2 && (
            <span className="text-[10px]">+{(task.tags!.length - 2)}</span>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------- Timeline grid ---------------- */

function TimelineGrid({
  weeks,
  weekWidth,
  chartStart,
  rows,
  teams,
  allTasks,
  selectedTaskId,
  onSelect,
  onMove,
  onResize,
}: {
  weeks: number;
  weekWidth: number;
  chartStart: Date;
  rows: DisplayRow[];
  teams: Team[];
  allTasks: Task[];
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  onMove: (taskId: string, newStart: number) => void;
  onResize: (taskId: string, newDuration: number) => void;
}) {
  const tasksById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of allTasks) m.set(t.id, t);
    return m;
  }, [allTasks]);
  const teamsById = useMemo(() => {
    const m = new Map<string, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);
  const monthSpans = useMemo(() => {
    const spans: { label: string; span: number }[] = [];
    let currentLabel = "";
    let currentSpan = 0;
    for (let i = 0; i < weeks; i++) {
      const d = addWeeks(chartStart, i);
      const label = format(d, "MMM yyyy");
      if (label === currentLabel) currentSpan++;
      else {
        if (currentSpan) spans.push({ label: currentLabel, span: currentSpan });
        currentLabel = label;
        currentSpan = 1;
      }
    }
    if (currentSpan) spans.push({ label: currentLabel, span: currentSpan });
    return spans;
  }, [chartStart, weeks]);

  // Compute cumulative Y offsets for each row (header vs task differ in height)
  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    let y = 0;
    for (const r of rows) {
      offsets.push(y);
      y += r.kind === "header" ? HEADER_ROW_HEIGHT : ROW_HEIGHT;
    }
    return { offsets, total: y };
  }, [rows]);

  // Map task id → row index for arrows
  const rowIndexByTaskId = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.kind === "task") m.set(r.task.id, i);
    });
    return m;
  }, [rows]);

  const width = weeks * weekWidth;
  const height = Math.max(rowOffsets.total, 200);

  return (
    <div className="relative" style={{ width, minWidth: "100%" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-20 border-b border-border bg-background"
        style={{ height: HEADER_HEIGHT, width }}
      >
        <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
          {monthSpans.map((m, i) => (
            <div
              key={i}
              className="flex items-center border-r border-border px-2 text-xs font-medium text-muted-foreground"
              style={{ width: m.span * weekWidth }}
            >
              {m.label}
            </div>
          ))}
        </div>
        <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
          {Array.from({ length: weeks }).map((_, i) => {
            const d = addWeeks(chartStart, i);
            return (
              <div
                key={i}
                className="flex items-center justify-center border-r border-border text-[10px] text-muted-foreground"
                style={{ width: weekWidth }}
              >
                {format(d, "MMM d")}
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid background */}
      <div className="relative" style={{ width, height }}>
        {/* vertical week lines */}
        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: weeks }).map((_, i) => (
            <div
              key={i}
              className={cn("border-r", i % 4 === 3 ? "border-border" : "border-border/40")}
              style={{ width: weekWidth }}
            />
          ))}
        </div>

        {/* horizontal row lines + lane header stripes */}
        <div className="absolute inset-0 pointer-events-none">
          {rows.map((r, i) => (
            <div
              key={i}
              className={cn(
                "border-b border-border/60",
                r.kind === "header" && "bg-muted/40",
              )}
              style={{ height: r.kind === "header" ? HEADER_ROW_HEIGHT : ROW_HEIGHT }}
            />
          ))}
        </div>

        {/* Dependency arrows */}
        <DependencyArrows
          rows={rows}
          rowIndexByTaskId={rowIndexByTaskId}
          rowOffsets={rowOffsets.offsets}
          weekWidth={weekWidth}
        />

        {/* Bars */}
        {rows.map((r, i) =>
          r.kind === "task" ? (
            <TaskBar
              key={r.task.id}
              task={r.task}
              top={rowOffsets.offsets[i]}
              weekWidth={weekWidth}
              chartStart={chartStart}
              team={r.task.teamId ? teamsById.get(r.task.teamId) ?? null : null}
              dependsOnTask={r.task.dependsOn ? tasksById.get(r.task.dependsOn) ?? null : null}
              selected={selectedTaskId === r.task.id}
              onSelect={() => onSelect(r.task.id)}
              onMove={(newStart) => onMove(r.task.id, newStart)}
              onResize={(newDuration) => onResize(r.task.id, newDuration)}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

/* ---------------- Task bar with drag/resize ---------------- */

type DragMode = null | "move" | "resize-l" | "resize-r";

function TaskBar({
  task,
  top,
  weekWidth,
  chartStart,
  team,
  dependsOnTask,
  selected,
  onSelect,
  onMove,
  onResize,
}: {
  task: Task;
  top: number;
  weekWidth: number;
  chartStart: Date;
  team: Team | null;
  dependsOnTask: Task | null;
  selected: boolean;
  onSelect: () => void;
  onMove: (newStart: number) => void;
  onResize: (newDuration: number) => void;
}) {
  const [drag, setDrag] = useState<{
    mode: DragMode;
    startX: number;
    startWeek: number;
    duration: number;
    ghostStart: number;
    ghostDuration: number;
  } | null>(null);

  useEffect(() => {
    if (!drag || !drag.mode) return;
    function onMouseMove(e: MouseEvent) {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const deltaWeeks = Math.round(dx / weekWidth);
      if (drag.mode === "move") {
        setDrag({ ...drag, ghostStart: Math.max(0, drag.startWeek + deltaWeeks) });
      } else if (drag.mode === "resize-r") {
        setDrag({ ...drag, ghostDuration: Math.max(1, drag.duration + deltaWeeks) });
      } else if (drag.mode === "resize-l") {
        const newDuration = Math.max(1, drag.duration - deltaWeeks);
        const newStart = Math.max(0, drag.startWeek + (drag.duration - newDuration));
        setDrag({ ...drag, ghostStart: newStart, ghostDuration: newDuration });
      }
    }
    function onMouseUp() {
      if (!drag) return;
      if (drag.mode === "move") {
        if (drag.ghostStart !== drag.startWeek) onMove(drag.ghostStart);
      } else if (drag.mode === "resize-r") {
        if (drag.ghostDuration !== drag.duration) onResize(drag.ghostDuration);
      } else if (drag.mode === "resize-l") {
        if (drag.ghostStart !== drag.startWeek) onMove(drag.ghostStart);
        if (drag.ghostDuration !== drag.duration) onResize(drag.ghostDuration);
      }
      setDrag(null);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [drag, weekWidth, onMove, onResize]);

  const currentStart = drag ? drag.ghostStart : task.startWeek;
  const currentDuration = drag ? drag.ghostDuration : task.durationWeeks;

  const left = currentStart * weekWidth + 2;
  const width = currentDuration * weekWidth - 4;
  const barTop = top + 6;

  function startDrag(mode: DragMode, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      mode,
      startX: e.clientX,
      startWeek: task.startWeek,
      duration: task.durationWeeks,
      ghostStart: task.startWeek,
      ghostDuration: task.durationWeeks,
    });
  }

  const stripe = task.tbc
    ? `repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 6px, rgba(255,255,255,0) 6px 12px)`
    : undefined;
  const startDate = addWeeks(chartStart, task.startWeek);
  const endDate = addWeeks(chartStart, task.startWeek + task.durationWeeks - 1);
  const dateRangeLabel =
    task.durationWeeks >= 4
      ? `${format(startDate, "MMM yyyy")} → ${format(endDate, "MMM yyyy")}`
      : `${format(startDate, "d MMM yyyy")} → ${format(endDate, "d MMM yyyy")}`;
  const roleNameById = new Map((team?.roles ?? []).map((r) => [r.id, r.name]));
  const demands = (task.demands ?? []).filter((d) => d.quantity > 0);

  return (
    <TooltipProvider delayDuration={300} disableHoverableContent>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-task-id={task.id}
            className={cn(
              "absolute flex items-center rounded-md text-xs text-white shadow-sm transition-opacity select-none",
              selected && "ring-2 ring-offset-2 ring-offset-background",
              task.tbc && "border border-dashed border-white/70 opacity-90",
            )}
            style={{
              left,
              width,
              top: barTop,
              height: ROW_HEIGHT - 12,
              backgroundColor: task.color,
              backgroundImage: stripe,
              // @ts-expect-error CSS var for ring
              "--tw-ring-color": task.color,
            }}
            onMouseDown={(e) => startDrag("move", e)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            <div
              className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-md hover:bg-black/20"
              onMouseDown={(e) => startDrag("resize-l", e)}
            />
            <div className="px-2 truncate flex-1 pointer-events-none">
              <span className="font-medium">{task.name}</span>
              {task.tbc && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 h-4 px-1 text-[9px] bg-white/25 text-white border-0"
                >
                  TBC
                </Badge>
              )}
              {(task.tags ?? []).slice(0, 2).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="ml-1.5 h-4 px-1 text-[9px] bg-black/20 text-white border-0"
                >
                  {tag}
                </Badge>
              ))}
              {(task.tags?.length ?? 0) > 2 && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 h-4 px-1 text-[9px] bg-black/20 text-white border-0"
                >
                  +{task.tags!.length - 2}
                </Badge>
              )}
            </div>
            <div
              className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-md hover:bg-black/20"
              onMouseDown={(e) => startDrag("resize-r", e)}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-xs p-3 space-y-1.5">
          <div className="flex items-start gap-2">
            <span
              className="mt-1 inline-block h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: task.color }}
              aria-hidden
            />
            <div className="font-semibold text-sm leading-snug">{task.name}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {dateRangeLabel}
            <span className="ml-1">
              · {task.durationWeeks} {task.durationWeeks === 1 ? "week" : "weeks"}
            </span>
          </div>
          <div className="text-xs">
            <span className="text-muted-foreground">Team: </span>
            <span className="font-medium">{team?.name ?? "No team"}</span>
          </div>
          {((task.tags?.length ?? 0) > 0 || task.tbc) && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {(task.tags ?? []).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] text-white border-0"
                  style={{ backgroundColor: task.color }}
                >
                  {tag}
                </Badge>
              ))}
              {task.tbc && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[10px] border-dashed border-current text-inherit"
                >
                  To be confirmed
                </Badge>
              )}

            </div>
          )}
          {demands.length > 0 && (
            <div className="text-xs pt-1 border-t border-border/60">
              <div className="text-muted-foreground mb-0.5">Resources</div>
              <ul className="space-y-0.5">
                {demands.map((d) => (
                  <li key={d.roleId}>
                    {d.quantity} × {roleNameById.get(d.roleId) ?? "Unknown role"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dependsOnTask && (
            <div className="text-xs pt-1 border-t border-border/60">
              <span className="text-muted-foreground">Depends on: </span>
              <span className="font-medium">{dependsOnTask.name}</span>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ---------------- Dependency arrows ---------------- */

function DependencyArrows({
  rows,
  rowIndexByTaskId,
  rowOffsets,
  weekWidth,
}: {
  rows: DisplayRow[];
  rowIndexByTaskId: Map<string, number>;
  rowOffsets: number[];
  weekWidth: number;
}) {
  const arrows: ReactElement[] = [];
  for (const r of rows) {
    if (r.kind !== "task") continue;
    const task = r.task;
    if (!task.dependsOn) continue;
    const predIdx = rowIndexByTaskId.get(task.dependsOn);
    const toIdx = rowIndexByTaskId.get(task.id);
    if (predIdx === undefined || toIdx === undefined) continue;
    const predRow = rows[predIdx];
    if (predRow.kind !== "task") continue;
    const pred = predRow.task;
    const x1 = (pred.startWeek + pred.durationWeeks) * weekWidth - 2;
    const y1 = rowOffsets[predIdx] + ROW_HEIGHT / 2;
    const x2 = task.startWeek * weekWidth + 2;
    const y2 = rowOffsets[toIdx] + ROW_HEIGHT / 2;
    const stub = 8;
    const midX = Math.max(x1 + stub, x2 - stub);
    const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2 - 4} ${y2}`;
    arrows.push(
      <g key={`${pred.id}-${task.id}`}>
        <path d={d} stroke="currentColor" strokeWidth={1.5} fill="none" />
        <polygon
          points={`${x2 - 4},${y2 - 4} ${x2},${y2} ${x2 - 4},${y2 + 4}`}
          fill="currentColor"
        />
      </g>,
    );
  }
  return (
    <svg
      className="absolute inset-0 pointer-events-none text-muted-foreground"
      width="100%"
      height="100%"
    >
      {arrows}
    </svg>
  );
}

/* ---------------- Task editor side panel ---------------- */

function TaskEditor({
  task,
  chartTasks,
  teams,
  onChange,
  onSetDemand,
  onDelete,
  onClose,
}: {
  task: Task;
  chartTasks: Task[];
  teams: Team[];
  onChange: (patch: Partial<Task>) => void;
  onSetDemand: (roleId: string, quantity: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const otherTasks = chartTasks.filter((t) => t.id !== task.id);
  const currentTeam = task.teamId ? teams.find((t) => t.id === task.teamId) : null;
  const demandFor = (roleId: string) =>
    task.demands?.find((d) => d.roleId === roleId)?.quantity ?? 0;
  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card p-5 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Task</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-xs">Name</Label>
          <Input
            value={task.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-xs">Team</Label>
          <Select
            value={task.teamId ?? "__none__"}
            onValueChange={(v) => {
              const teamId = v === "__none__" ? undefined : v;
              const team = teamId ? teams.find((t) => t.id === teamId) : null;
              // Adopt the team color if the task hasn't been recolored to a non-team color
              const patch: Partial<Task> = { teamId };
              if (team) patch.color = team.color;
              onChange(patch);
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Start week</Label>
            <Input
              type="number"
              min={0}
              value={task.startWeek}
              onChange={(e) =>
                onChange({ startWeek: Math.max(0, parseInt(e.target.value) || 0) })
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Duration (w)</Label>
            <Input
              type="number"
              min={1}
              value={task.durationWeeks}
              onChange={(e) =>
                onChange({ durationWeeks: Math.max(1, parseInt(e.target.value) || 1) })
              }
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Color</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {TASK_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => onChange({ color: c.value })}
                className={cn(
                  "h-7 w-7 rounded-md border-2",
                  task.color === c.value ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: c.value }}
                aria-label={c.name}
              />
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs">Tags</Label>
          <TagEditor
            tags={task.tags ?? []}
            allTags={Array.from(
              new Set(chartTasks.flatMap((t) => t.tags ?? [])),
            ).sort((a, b) => a.localeCompare(b))}
            color={task.color}
            listId={`tag-suggestions-${task.id}`}
            onChange={(tags) => onChange({ tags })}
          />
        </div>

        <div>
          <Label className="text-xs">Depends on</Label>
          <Select
            value={task.dependsOn ?? "__none__"}
            onValueChange={(v) => onChange({ dependsOn: v === "__none__" ? undefined : v })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {otherTasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
          <div className="space-y-0.5">
            <Label htmlFor="tbc" className="text-xs">
              To be confirmed
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Show this task as shaded on the chart.
            </p>
          </div>
          <Switch
            id="tbc"
            checked={!!task.tbc}
            onCheckedChange={(v) => onChange({ tbc: v || undefined })}
          />
        </div>

        {currentTeam && (
          <div className="space-y-2">
            <Label className="text-xs">Resource demand</Label>
            {(currentTeam.roles ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No roles defined for this team. Add roles in the Teams menu.
              </p>
            ) : (
              <div className="space-y-1.5">
                {currentTeam.roles.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <span className="text-xs flex-1 truncate">{r.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      /{r.headcount}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={demandFor(r.id)}
                      onChange={(e) =>
                        onSetDemand(r.id, Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 2) / 2))
                      }
                      className="h-7 w-16 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          <Trash2 className="mr-1.5 h-4 w-4" /> Delete task
        </Button>
      </div>
    </aside>
  );
}

/* ---------------- Capacity heatmap view ---------------- */

function CapacityHeatmap({
  teams,
  totalWeeks,
  weekWidth,
  chartStart,
  demandByWeek,
  onCellClick,
}: {
  teams: Team[];
  totalWeeks: number;
  weekWidth: number;
  chartStart: Date;
  demandByWeek: Map<string, Map<string, number[]>>;
  onCellClick: (teamId: string, roleId: string, week: number) => void;
}) {
  const teamsWithRoles = teams.filter((t) => (t.roles ?? []).length > 0);
  const NAME_COL = 240;

  const ratioColor = (ratio: number) => {
    if (ratio <= 0) return "hsl(var(--muted) / 0.3)";
    if (ratio <= 0.5) return "hsl(142 70% 45% / 0.35)";
    if (ratio <= 0.85) return "hsl(142 70% 45% / 0.7)";
    if (ratio <= 1) return "hsl(38 92% 50% / 0.75)";
    return "hsl(0 84% 60% / 0.85)";
  };

  if (teamsWithRoles.length === 0) {
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-8 text-center text-sm text-muted-foreground">
          Add roles with headcount to teams in the Teams menu to see capacity here.
        </div>
      </div>
    );
  }

  const timelineWidth = totalWeeks * weekWidth;

  return (
    <div className="flex flex-1 overflow-y-auto">
      {/* Fixed left column: team/role names */}
      <div className="shrink-0 border-r border-border bg-background" style={{ width: NAME_COL }}>
        <div
          className="sticky top-0 z-20 border-b border-border bg-background px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          style={{ height: HEADER_HEIGHT }}
        >
          Team / Role
        </div>
        {teamsWithRoles.map((team) => (
          <div key={team.id}>
            <div
              className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 text-xs font-semibold"
              style={{ height: ROW_HEIGHT * 0.7 }}
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: team.color }}
              />
              {team.name}
            </div>
            {team.roles.map((role) => (
              <div
                key={role.id}
                className="flex items-center justify-between border-b border-border px-3 text-xs"
                style={{ height: ROW_HEIGHT }}
              >
                <span className="truncate">{role.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  cap {role.headcount}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Scrollable right pane: timeline */}
      <div className="flex-1 overflow-x-auto">
        <div style={{ width: timelineWidth }}>
          <div
            className="sticky top-0 z-10 flex border-b border-border bg-background"
            style={{ height: HEADER_HEIGHT }}
          >
            {Array.from({ length: totalWeeks }).map((_, w) => (
              <div
                key={w}
                className="shrink-0 border-r border-border px-1 py-1 text-[10px] text-muted-foreground text-center"
                style={{ width: weekWidth }}
              >
                {format(addWeeks(chartStart, w), "MMM d")}
              </div>
            ))}
          </div>
          {teamsWithRoles.map((team) => (
            <div key={team.id}>
              <div
                className="border-b border-border bg-muted/40"
                style={{ height: ROW_HEIGHT * 0.7 }}
              />
              {team.roles.map((role) => {
                const arr = demandByWeek.get(team.id)?.get(role.id);
                return (
                  <div
                    key={role.id}
                    className="flex border-b border-border"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {Array.from({ length: totalWeeks }).map((_, w) => {
                      const used = arr?.[w] ?? 0;
                      const cap = role.headcount;
                      const ratio = cap > 0 ? used / cap : used > 0 ? 2 : 0;
                      const over = cap > 0 && used > cap;
                      return (
                        <button
                          type="button"
                          key={w}
                          onClick={() => onCellClick(team.id, role.id, w)}
                          className="shrink-0 border-r border-border flex items-center justify-center text-[10px] hover:ring-2 hover:ring-primary/60 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                          style={{
                            width: weekWidth,
                            height: "100%",
                            backgroundColor: ratioColor(ratio),
                            color: ratio > 0.85 ? "white" : undefined,
                          }}
                          title={`Week ${w + 1}: ${used}/${cap}${over ? " (over)" : ""}`}
                        >
                          {used > 0 ? `${used}/${cap}` : ""}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Keep import used to avoid unused warning (helper reserved for future date input)
void differenceInCalendarWeeks;

function CapacityCellDialog({
  cell,
  onOpenChange,
  teams,
  tasks,
  chartStart,
  onOpenTask,
  onSetDemand,
  onRenameRole,
  onSetRoleHeadcount,
}: {
  cell: { teamId: string; roleId: string; week: number } | null;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
  tasks: Task[];
  chartStart: Date;
  onOpenTask: (taskId: string) => void;
  onSetDemand: (taskId: string, roleId: string, qty: number) => void;
  onRenameRole: (teamId: string, roleId: string, name: string) => void;
  onSetRoleHeadcount: (teamId: string, roleId: string, hc: number) => void;
}) {
  const open = cell !== null;
  const team = cell ? teams.find((t) => t.id === cell.teamId) ?? null : null;
  const role = team && cell ? team.roles.find((r) => r.id === cell.roleId) ?? null : null;

  const contributing = cell
    ? tasks
        .filter((t) => t.teamId === cell.teamId)
        .filter(
          (t) =>
            cell.week >= t.startWeek &&
            cell.week < t.startWeek + t.durationWeeks,
        )
        .map((t) => {
          const d = t.demands?.find((d) => d.roleId === cell.roleId);
          return { task: t, qty: d?.quantity ?? 0 };
        })
    : [];

  const activeContribs = contributing.filter((c) => c.qty > 0);
  const used = activeContribs.reduce((s, c) => s + c.qty, 0);
  const cap = role?.headcount ?? 0;
  const over = cap > 0 && used > cap;
  const atCap = cap > 0 && used === cap;

  const reasons: string[] = [];
  if (cap === 0 && used > 0) {
    reasons.push(
      `Role has no headcount configured, but ${used} ${used === 1 ? "person is" : "people are"} demanded.`,
    );
  }
  if (over) {
    const overBy = used - cap;
    reasons.push(
      `Demand exceeds capacity by ${overBy} (${used} needed, ${cap} available).`,
    );
    if (activeContribs.length > 1) {
      reasons.push(
        `${activeContribs.length} tasks running simultaneously in this week compete for the same role.`,
      );
    }
    const heavy = activeContribs.filter((c) => c.qty > cap);
    for (const h of heavy) {
      reasons.push(
        `"${h.task.name}" alone demands ${h.qty}, more than the ${cap}-person capacity.`,
      );
    }
    if (activeContribs.length > 1 && heavy.length === 0) {
      const top = [...activeContribs].sort((a, b) => b.qty - a.qty).slice(0, 2);
      reasons.push(
        `Biggest contributors: ${top.map((t) => `"${t.task.name}" (${t.qty})`).join(", ")}.`,
      );
    }
  }

  const weekLabel = cell
    ? `Week of ${format(addWeeks(chartStart, cell.week), "d MMM yyyy")}`
    : "";

  const [roleNameDraft, setRoleNameDraft] = useState("");
  useEffect(() => {
    setRoleNameDraft(role?.name ?? "");
  }, [role?.id, role?.name]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {team?.name ?? "Team"} · {role?.name ?? "Role"}
          </DialogTitle>
          <DialogDescription>{weekLabel}</DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            over
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : atCap
                ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-border bg-muted/40",
          )}
        >
          Allocated <span className="font-semibold">{used}</span> / Capacity{" "}
          <span className="font-semibold">{cap}</span>
          {over ? " — overallocated" : atCap ? " — at capacity" : ""}
        </div>

        {reasons.length > 0 && (
          <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {reasons.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden>•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}

        {cell && role && team && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Team capacity
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={roleNameDraft}
                onChange={(e) => setRoleNameDraft(e.target.value)}
                onBlur={() => {
                  const v = roleNameDraft.trim();
                  if (v && v !== role.name) onRenameRole(team.id, role.id, v);
                  else setRoleNameDraft(role.name);
                }}
                className="h-8 flex-1"
                placeholder="Role name"
              />
              <div className="flex items-center gap-1">
                <Label htmlFor="cap-hc" className="text-xs text-muted-foreground">
                  Headcount
                </Label>
                <Input
                  id="cap-hc"
                  type="number"
                  min={0}
                  max={999}
                  step={0.5}
                  value={cap}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(999, Math.round((Number(e.target.value) || 0) * 2) / 2));
                    onSetRoleHeadcount(team.id, role.id, n);
                  }}
                  className="h-8 w-16"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Headcount applies to every week for this role.
            </p>
          </div>
        )}

        {contributing.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No tasks allocated in this week.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {contributing.map(({ task, qty }) => {
              const start = format(addWeeks(chartStart, task.startWeek), "d MMM");
              const end = format(
                addWeeks(chartStart, task.startWeek + task.durationWeeks - 1),
                "d MMM",
              );
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: task.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{task.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {start} – {end}
                      {task.tags?.length ? ` · ${task.tags.join(", ")}` : ""}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    step={0.5}
                    value={qty}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(99, Math.round((Number(e.target.value) || 0) * 2) / 2));
                      if (cell) onSetDemand(task.id, cell.roleId, n);
                    }}
                    className="h-8 w-14 shrink-0"
                    aria-label={`Demand for ${task.name}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-xs"
                    onClick={() => onOpenTask(task.id)}
                  >
                    Edit
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


/* ---------------- Tag editor ---------------- */

function TagEditor({
  tags,
  allTags,
  color,
  listId,
  onChange,
}: {
  tags: string[];
  allTags: string[];
  color: string;
  listId: string;
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const lowerSet = new Set(tags.map((t) => t.toLowerCase()));

  const commit = (raw: string) => {
    const next = normalizeTags([...tags, ...raw.split(",")]);
    if (next.length !== tags.length || next.some((v, i) => v !== tags[i])) {
      onChange(next);
    }
    setInput("");
  };

  const removeAt = (idx: number) => {
    const next = tags.filter((_, i) => i !== idx);
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const v = input.trim();
      if (v) commit(v);
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      e.preventDefault();
      removeAt(tags.length - 1);
    }
  };

  return (
    <div className="mt-1 space-y-1.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, idx) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-white"
              style={{ backgroundColor: color }}
            >
              {tag}
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="opacity-80 hover:opacity-100"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        list={listId}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          const v = input.trim();
          if (v) commit(v);
        }}
        placeholder="Type and press Enter"
      />
      <datalist id={listId}>
        {allTags
          .filter((t) => !lowerSet.has(t.toLowerCase()))
          .map((t) => (
            <option key={t} value={t} />
          ))}
      </datalist>
    </div>
  );
}



