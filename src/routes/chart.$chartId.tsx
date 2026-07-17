import type { ReactElement } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { addWeeks, format, startOfWeek, formatISO, differenceInCalendarWeeks } from "date-fns";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
} from "@/components/ui/alert-dialog";
import { useGanttStore, TASK_COLORS, computeChartSignature, type Task, type Team } from "@/lib/gantt-store";
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
import { cn } from "@/lib/utils";
import { exportChartToPdf, type PdfRow } from "@/lib/export-pdf";

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

type ViewMode = "list" | "swimlanes";
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
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{
    tasks: Task[];
    name?: string;
    startDate?: string;
  } | null>(null);

  const {
    renameChart,
    addTask,
    updateTask,
    deleteTask,
    reorderTasks,
    moveTask,
    importChartTasks,
    addTeam,
    renameTeam,
    setTeamColor,
    deleteTeam,
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
    (chart?.tasks ?? []).forEach((t) => t.tag && s.add(t.tag));
    return Array.from(s);
  }, [chart?.tasks]);

  const teams = chart?.teams ?? [];

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleTasks = useMemo(() => {
    const tasks = chart?.tasks ?? [];
    return tasks.filter((t) => {
      if (tagFilter !== "__all__" && t.tag !== tagFilter) return false;
      if (teamFilter === "__all__") return true;
      if (teamFilter === "__none__") return !t.teamId;
      return t.teamId === teamFilter;
    }).filter((t) => {
      if (!normalizedSearch) return true;
      return t.name.toLowerCase().includes(normalizedSearch);
    });
  }, [chart?.tasks, tagFilter, teamFilter, normalizedSearch]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (viewMode === "list") {
      return visibleTasks.map((t) => ({ kind: "task", task: t, key: t.id }));
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
      for (const t of g.tasks) rows.push({ kind: "task", task: t, key: t.id });
    }
    return rows;
  }, [viewMode, visibleTasks, teams]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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

  function onSortEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = chart.tasks.map((t) => t.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    reorderTasks(chart.id, arrayMove(ids, oldIdx, newIdx));
  }

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
            <PopoverContent className="w-80 p-3" align="end">
              <TeamsManager
                teams={teams}
                onAdd={(name) => addTeam(chart.id, name)}
                onRename={(id, name) => renameTeam(chart.id, id, name)}
                onSetColor={(id, c) => setTeamColor(chart.id, id, c)}
                onDelete={(id) => deleteTeam(chart.id, id)}
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

          {allTags.length > 0 && (
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All tags</SelectItem>
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
                if (Array.isArray(data?.tasks)) {
                  tasks = data.tasks;
                  name = data.name;
                  startDate = data.startDate;
                } else if (data?.chart?.tasks) {
                  tasks = data.chart.tasks;
                  name = data.chart.name;
                  startDate = data.chart.startDate;
                } else if (data?.charts) {
                  const firstId = data.order?.[0] ?? Object.keys(data.charts)[0];
                  const c = firstId ? data.charts[firstId] : null;
                  if (c) {
                    tasks = c.tasks;
                    name = c.name;
                    startDate = c.startDate;
                  }
                }
                if (!tasks) {
                  toast.error("No tasks found in that file.");
                  return;
                }
                setPendingImport({ tasks, name, startDate });
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
                  tasks: chart.tasks,
                  teams: chart.teams,
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
                  viewMode,
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
        {/* Left panel */}
        <div className="flex flex-col border-r border-border" style={{ width: LEFT_PANEL }}>
          <div
            className="flex shrink-0 items-center border-b border-border px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            style={{ height: HEADER_HEIGHT }}
          >
            Tasks
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onSortEnd}
              >
                <SortableContext
                  items={visibleTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {displayRows.map((row) =>
                    row.kind === "task" ? (
                      <TaskRow
                        key={row.key}
                        task={row.task}
                        team={teams.find((t) => t.id === row.task.teamId) ?? null}
                        selected={selectedTaskId === row.task.id}
                        onSelect={() => setSelectedTaskId(row.task.id)}
                      />
                    ) : null,
                  )}
                </SortableContext>
              </DndContext>
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
        <div className="flex-1 overflow-auto">
          <TimelineGrid
            weeks={totalWeeks}
            weekWidth={weekWidth}
            chartStart={chartStart}
            rows={displayRows}
            selectedTaskId={selectedTaskId}
            onSelect={setSelectedTaskId}
            onMove={(taskId, newStart) => moveTask(chart.id, taskId, newStart, cascade)}
            onResize={(taskId, newDuration) =>
              updateTask(chart.id, taskId, { durationWeeks: newDuration })
            }
          />
        </div>

        {/* Right editor */}
        {selectedTask && (
          <TaskEditor
            key={selectedTask.id}
            task={selectedTask}
            chartTasks={chart.tasks}
            teams={teams}
            onChange={(patch) => updateTask(chart.id, selectedTask.id, patch)}
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
              {(pendingImport?.tasks.length ?? 0) === 1 ? "" : "s"}. Add them to this chart, or
              replace all existing tasks?
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
}: {
  teams: Team[];
  onAdd: (name: string) => string;
  onRename: (id: string, name: string) => void;
  onSetColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">Teams</h4>
        <p className="text-xs text-muted-foreground">
          Assign tasks to a team, then switch to Swimlanes view to group them.
        </p>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {teams.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No teams yet — add one below.
          </div>
        )}
        {teams.map((team) => (
          <div key={team.id} className="flex items-center gap-2">
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onDelete(team.id)}
              aria-label="Delete team"
            >
              <X className="h-4 w-4" />
            </Button>
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

/* ---------------- Task row (sortable, list mode) ---------------- */

function TaskRow({
  task,
  team,
  selected,
  onSelect,
}: {
  task: Task;
  team: Team | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    height: ROW_HEIGHT,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 border-b border-border px-2 cursor-pointer",
        selected && "bg-accent",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <TaskRowBody task={task} team={team} />
    </div>
  );
}

/* ---------------- Task row (static, swimlane mode) ---------------- */

function TaskRowStatic({
  task,
  team,
  selected,
  onSelect,
}: {
  task: Task;
  team: Team | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-task-id", task.id);
      }}
      onClick={onSelect}
      style={{ height: ROW_HEIGHT }}
      className={cn(
        "flex items-center gap-2 border-b border-border pl-6 pr-2 cursor-grab active:cursor-grabbing",
        selected && "bg-accent",
      )}
      title="Drag onto a team lane to assign"
    >
      <TaskRowBody task={task} team={team} />
    </div>
  );
}

function TaskRowBody({ task, team }: { task: Task; team: Team | null }) {
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
          {task.tag && (
            <>
              <span>·</span>
              <span className="truncate">{task.tag}</span>
            </>
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
  selectedTaskId,
  onSelect,
  onMove,
  onResize,
}: {
  weeks: number;
  weekWidth: number;
  chartStart: Date;
  rows: DisplayRow[];
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  onMove: (taskId: string, newStart: number) => void;
  onResize: (taskId: string, newDuration: number) => void;
}) {
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
  selected,
  onSelect,
  onMove,
  onResize,
}: {
  task: Task;
  top: number;
  weekWidth: number;
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
  return (
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
        {task.tag && (
          <Badge
            variant="secondary"
            className="ml-1.5 h-4 px-1 text-[9px] bg-black/20 text-white border-0"
          >
            {task.tag}
          </Badge>
        )}
      </div>
      <div
        className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-md hover:bg-black/20"
        onMouseDown={(e) => startDrag("resize-r", e)}
      />
    </div>
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
  onDelete,
  onClose,
}: {
  task: Task;
  chartTasks: Task[];
  teams: Team[];
  onChange: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const otherTasks = chartTasks.filter((t) => t.id !== task.id);
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
          <Label className="text-xs">Tag</Label>
          <Input
            value={task.tag ?? ""}
            onChange={(e) => onChange({ tag: e.target.value || undefined })}
            placeholder="e.g. Design, Backend"
            className="mt-1"
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

        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          <Trash2 className="mr-1.5 h-4 w-4" /> Delete task
        </Button>
      </div>
    </aside>
  );
}

// Keep import used to avoid unused warning (helper reserved for future date input)
void differenceInCalendarWeeks;
