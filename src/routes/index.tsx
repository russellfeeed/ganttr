import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Copy, Pencil, LayoutGrid, Download } from "lucide-react";
import { toast } from "sonner";
import { useGanttStore } from "@/lib/gantt-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const list = order.map((id) => charts[id]).filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">Gantt</h1>
          </div>
          <Button
            onClick={() => {
              const id = createChart();
              navigate({ to: "/chart/$chartId", params: { chartId: id } });
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> New chart
          </Button>
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
                className="group flex flex-col rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
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
    </div>
  );
}
