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
} from "lucide-react";
import { useGanttStore, TASK_COLORS, type Task } from "@/lib/gantt-store";
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
const HEADER_HEIGHT = 56;
const LEFT_PANEL = 260;

const ZOOM_LEVELS = [
  { label: "Compact", width: 48 },
  { label: "Normal", width: 72 },
  { label: "Wide", width: 104 },
];

function ChartEditor() {
  const { chartId } = Route.useParams();
  const chart = useGanttStore((s) => s.charts[chartId]);
  const navigate = useNavigate();

  const [zoomIdx, setZoomIdx] = useState(1);
  const [cascade, setCascade] = useState(true);
  const [tagFilter, setTagFilter] = useState<string>("__all__");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const {
    renameChart,
    addTask,
    updateTask,
    deleteTask,
    reorderTasks,
    moveTask,
  } = useGanttStore.getState();

  // Subscribe so store changes cause re-renders (getState() alone won't)
  useGanttStore((s) => s.charts[chartId]?.tasks.length);

  if (!chart) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">This chart doesn't exist.</p>
          <Button variant="link" onClick={() => navigate({ to: "/" })}>
            Back to charts
          </Button>
        </div>
      </div>
    );
  }

  const weekWidth = ZOOM_LEVELS[zoomIdx].width;

  // Determine how many week columns to show: at least MIN_WEEKS, and enough
  // to cover the furthest task end + some slack.
  const requiredWeeks = chart.tasks.reduce(
    (max, t) => Math.max(max, t.startWeek + t.durationWeeks),
    0,
  );
  const totalWeeks = Math.max(MIN_WEEKS, requiredWeeks + 4);

  const chartStart = useMemo(() => new Date(chart.startDate + "T00:00:00"), [chart.startDate]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    chart.tasks.forEach((t) => t.tag && s.add(t.tag));
    return Array.from(s);
  }, [chart.tasks]);

  const visibleTasks =
    tagFilter === "__all__" ? chart.tasks : chart.tasks.filter((t) => t.tag === tagFilter);

  const selectedTask = chart.tasks.find((t) => t.id === selectedTaskId) ?? null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
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

        <div className="ml-auto flex items-center gap-2">
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
        {/* Left panel: task list with reorder */}
        <div className="flex flex-col border-r border-border" style={{ width: LEFT_PANEL }}>
          <div
            className="flex items-center border-b border-border px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            style={{ height: HEADER_HEIGHT }}
          >
            Tasks
          </div>
          <div className="flex-1 overflow-y-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSortEnd}>
              <SortableContext
                items={chart.tasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {chart.tasks.map((task) => {
                  const dimmed = tagFilter !== "__all__" && task.tag !== tagFilter;
                  return (
                    <TaskRow
                      key={task.id}
                      task={task}
                      dimmed={dimmed}
                      selected={selectedTaskId === task.id}
                      onSelect={() => setSelectedTaskId(task.id)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
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
            chartId={chart.id}
            weeks={totalWeeks}
            weekWidth={weekWidth}
            chartStart={chartStart}
            tasks={chart.tasks}
            visibleTaskIds={new Set(visibleTasks.map((t) => t.id))}
            selectedTaskId={selectedTaskId}
            onSelect={setSelectedTaskId}
            cascade={cascade}
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
            onChange={(patch) => updateTask(chart.id, selectedTask.id, patch)}
            onDelete={() => {
              deleteTask(chart.id, selectedTask.id);
              setSelectedTaskId(null);
            }}
            onClose={() => setSelectedTaskId(null)}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------- Task row (sortable) ---------------- */

function TaskRow({
  task,
  dimmed,
  selected,
  onSelect,
}: {
  task: Task;
  dimmed: boolean;
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
    opacity: isDragging ? 0.5 : dimmed ? 0.35 : 1,
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
      <span
        className="h-3 w-3 shrink-0 rounded-sm"
        style={{ backgroundColor: task.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm">{task.name}</div>
        <div className="text-xs text-muted-foreground">
          {task.durationWeeks}w{task.tag ? ` · ${task.tag}` : ""}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Timeline grid ---------------- */

function TimelineGrid({
  chartId,
  weeks,
  weekWidth,
  chartStart,
  tasks,
  visibleTaskIds,
  selectedTaskId,
  onSelect,
  onMove,
  onResize,
}: {
  chartId: string;
  weeks: number;
  weekWidth: number;
  chartStart: Date;
  tasks: Task[];
  visibleTaskIds: Set<string>;
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  cascade: boolean;
  onMove: (taskId: string, newStart: number) => void;
  onResize: (taskId: string, newDuration: number) => void;
}) {
  void chartId;

  // Build month spans across the week columns for the top header
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

  const width = weeks * weekWidth;
  const height = tasks.length * ROW_HEIGHT;

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
      <div className="relative" style={{ width, height: Math.max(height, 200) }}>
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
        {/* horizontal row lines */}
        <div className="absolute inset-0 pointer-events-none">
          {tasks.map((_, i) => (
            <div
              key={i}
              className="border-b border-border/60"
              style={{ height: ROW_HEIGHT }}
            />
          ))}
        </div>

        {/* Dependency arrows */}
        <DependencyArrows
          tasks={tasks}
          weekWidth={weekWidth}
          visibleTaskIds={visibleTaskIds}
        />

        {/* Bars */}
        {tasks.map((task, rowIdx) => (
          <TaskBar
            key={task.id}
            task={task}
            rowIdx={rowIdx}
            weekWidth={weekWidth}
            selected={selectedTaskId === task.id}
            visible={visibleTaskIds.has(task.id)}
            onSelect={() => onSelect(task.id)}
            onMove={(newStart) => onMove(task.id, newStart)}
            onResize={(newDuration) => onResize(task.id, newDuration)}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------------- Task bar with drag/resize ---------------- */

type DragMode = null | "move" | "resize-l" | "resize-r";

function TaskBar({
  task,
  rowIdx,
  weekWidth,
  selected,
  visible,
  onSelect,
  onMove,
  onResize,
}: {
  task: Task;
  rowIdx: number;
  weekWidth: number;
  selected: boolean;
  visible: boolean;
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
  const top = rowIdx * ROW_HEIGHT + 6;

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

  return (
    <div
      data-task-id={task.id}
      className={cn(
        "absolute flex items-center rounded-md text-xs text-white shadow-sm transition-opacity select-none",
        selected && "ring-2 ring-offset-2 ring-offset-background",
        !visible && "opacity-30",
      )}
      style={{
        left,
        width,
        top,
        height: ROW_HEIGHT - 12,
        backgroundColor: task.color,
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
  tasks,
  weekWidth,
  visibleTaskIds,
}: {
  tasks: Task[];
  weekWidth: number;
  visibleTaskIds: Set<string>;
}) {
  const rowOf = new Map(tasks.map((t, i) => [t.id, i]));
  const arrows: ReactElement[] = [];
  for (const task of tasks) {
    if (!task.dependsOn) continue;
    const pred = tasks.find((t) => t.id === task.dependsOn);
    if (!pred) continue;
    if (!visibleTaskIds.has(task.id) || !visibleTaskIds.has(pred.id)) continue;
    const fromRow = rowOf.get(pred.id)!;
    const toRow = rowOf.get(task.id)!;
    const x1 = (pred.startWeek + pred.durationWeeks) * weekWidth - 2;
    const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
    const x2 = task.startWeek * weekWidth + 2;
    const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

    // L-shape path with a small horizontal stub
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
  onChange,
  onDelete,
  onClose,
}: {
  task: Task;
  chartTasks: Task[];
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

        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={onDelete}
        >
          <Trash2 className="mr-1.5 h-4 w-4" /> Delete task
        </Button>
      </div>
    </aside>
  );
}

// Keep import used to avoid unused warning (helper reserved for future date input)
void differenceInCalendarWeeks;
