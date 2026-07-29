import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Copy, Pencil, LayoutGrid, Download, Upload, GitCompare, X } from "lucide-react";
import { toast } from "sonner";
import { useGanttStore } from "@/lib/gantt-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gantt — Simple weekly project timelines" },
      {
        name: "description",
        content: "Build simple Gantt charts with drag-and-drop tasks, weekly timelines, and dependencies.",
      },
      { property: "og:title", content: "Gantt — Simple weekly project timelines" },
      {
        property: "og:description",
        content: "Build simple Gantt charts with drag-and-drop tasks, weekly timelines, and dependencies.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const charts = useGanttStore((s) => s.charts);
  const order = useGanttStore((s) => s.order);
  const createChart = useGanttStore((s) => s.createChart);
  const deleteChart = useGanttStore((s) => s.deleteChart);
  const duplicateChart = useGanttStore((s) => s.duplicateChart);
  const renameChart = useGanttStore((s) => s.renameChart);
  const importCharts = useGanttStore((s) => s.importCharts);
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<
    { charts: Record<string, any>; order: string[] } | null
  >(null);
  const [selected, setSelected] = useState<string[]>([]);

  const list = order.map((id) => charts[id]).filter(Boolean);
  const selectedCharts = selected.map((id) => charts[id]).filter(Boolean);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      if (checked) return prev.includes(id) || prev.length >= 2 ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data && typeof data === "object" && data.chart && typeof data.chart === "object") {
        // Single-chart export — wrap it so importCharts can handle it.
        const c = data.chart;
        if (!c.id || !Array.isArray(c.tasks)) {
          toast.error("That chart file is missing tasks or an id.");
          return;
        }
        setPendingImport({ charts: { [c.id]: c }, order: [c.id] });
        return;
      }
      if (
        !data ||
        typeof data !== "object" ||
        !data.charts ||
        !Array.isArray(data.order)
      ) {
        toast.error("That doesn't look like a Gantt backup file.");
        return;
      }
      setPendingImport({ charts: data.charts, order: data.order });
    } catch {
      toast.error("Couldn't read that file — is it valid JSON?");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">Gantt</h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" /> Import JSON
            </Button>
            <Button
              variant="outline"
              disabled={list.length === 0}
              onClick={() => {
                const payload = {
                  version: 1,
                  exportedAt: new Date().toISOString(),
                  charts,
                  order,
                };
                const blob = new Blob([JSON.stringify(payload, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `gantt-backup-${format(new Date(), "yyyy-MM-dd")}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                toast.success(`Exported ${list.length} chart${list.length === 1 ? "" : "s"}`);
              }}
            >
              <Download className="mr-1.5 h-4 w-4" /> Export JSON
            </Button>
            <Button
              onClick={() => {
                const id = createChart();
                navigate({ to: "/chart/$chartId", params: { chartId: id } });
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> New chart
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-16 text-center">
            <h2 className="text-lg font-medium">No charts yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your first weekly Gantt chart to get started.
            </p>
            <Button
              className="mt-6"
              onClick={() => {
                const id = createChart();
                navigate({ to: "/chart/$chartId", params: { chartId: id } });
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> New chart
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((chart) => (
              <div
                key={chart.id}
                className={`group relative flex flex-col rounded-lg border bg-card p-5 pr-12 transition-colors ${
                  selected.includes(chart.id)
                    ? "border-primary ring-1 ring-primary/30"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="absolute right-4 top-4">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Checkbox
                            aria-label={`Select ${chart.name} for comparison`}
                            checked={selected.includes(chart.id)}
                            disabled={!selected.includes(chart.id) && selected.length >= 2}
                            onCheckedChange={(v) => toggleSelected(chart.id, v === true)}
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {!selected.includes(chart.id) && selected.length >= 2
                          ? "Only two charts can be compared"
                          : "Select to compare"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {editingId === chart.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameChart(chart.id, draft.trim() || chart.name);
                      setEditingId(null);
                    }}
                  >
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => {
                        renameChart(chart.id, draft.trim() || chart.name);
                        setEditingId(null);
                      }}
                    />
                  </form>
                ) : (
                  <Link
                    to="/chart/$chartId"
                    params={{ chartId: chart.id }}
                    className="text-base font-medium hover:text-primary"
                  >
                    {chart.name}
                  </Link>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {chart.tasks.length} task{chart.tasks.length === 1 ? "" : "s"} · starts{" "}
                  {format(new Date(chart.startDate), "MMM d, yyyy")}
                </p>

                <div className="mt-4 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(chart.id);
                      setDraft(chart.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => duplicateChart(chart.id)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this chart?</AlertDialogTitle>
                        <AlertDialogDescription>
                          "{chart.name}" and all its tasks will be permanently removed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteChart(chart.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {selected.length > 0 ? (
        <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <p className="text-sm text-muted-foreground">
              {selectedCharts.map((c, i) => (
                <span key={c.id}>
                  {i > 0 ? " vs " : ""}
                  <span className="font-medium text-foreground">{c.name}</span>
                </span>
              ))}
              {selected.length === 1 ? " — pick one more chart to compare" : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                <X className="mr-1.5 h-4 w-4" /> Clear
              </Button>
              <Button
                size="sm"
                disabled={selected.length !== 2}
                onClick={() =>
                  navigate({ to: "/compare", search: { a: selected[0], b: selected[1] } })
                }
              >
                <GitCompare className="mr-1.5 h-4 w-4" /> Compare
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import charts</AlertDialogTitle>
            <AlertDialogDescription>
              This backup contains{" "}
              {pendingImport ? Object.keys(pendingImport.charts).length : 0} chart
              {pendingImport && Object.keys(pendingImport.charts).length === 1 ? "" : "s"}.
              Merge with your existing charts, or replace them entirely?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingImport) return;
                const n = importCharts(pendingImport, "replace");
                setPendingImport(null);
                toast.success(`Replaced with ${n} chart${n === 1 ? "" : "s"}`);
              }}
            >
              Replace
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (!pendingImport) return;
                const n = importCharts(pendingImport, "merge");
                setPendingImport(null);
                toast.success(`Merged ${n} chart${n === 1 ? "" : "s"}`);
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
