import { createFileRoute, Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ArrowLeft, GitCompare } from "lucide-react";
import { useGanttStore } from "@/lib/gantt-store";
import { compareCharts } from "@/lib/compare-charts";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/compare")({
  validateSearch: (search: Record<string, unknown>) => ({
    a: typeof search.a === "string" ? search.a : "",
    b: typeof search.b === "string" ? search.b : "",
  }),
  head: () => ({
    meta: [
      { title: "Compare roadmaps — Gantt" },
      {
        name: "description",
        content:
          "Compare two Gantt roadmaps side by side: start and end dates, team and resource needs, tags and dependencies.",
      },
      { property: "og:title", content: "Compare roadmaps — Gantt" },
      {
        property: "og:description",
        content:
          "Compare two Gantt roadmaps side by side: start and end dates, team and resource needs, tags and dependencies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComparePage,
});

const fmt = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM yyyy") : "—");

function Delta({ weeks, unit = "w" }: { weeks: number | null | undefined; unit?: string }) {
  if (weeks == null) return <span className="text-muted-foreground">—</span>;
  if (weeks === 0) return <span className="text-muted-foreground">same</span>;
  const late = weeks > 0;
  return (
    <span className={late ? "font-medium text-destructive" : "font-medium text-emerald-600"}>
      {late ? "+" : ""}
      {weeks}
      {unit}
    </span>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const th = "px-4 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "px-4 py-2 text-sm";

function ComparePage() {
  const { a: aId, b: bId } = Route.useSearch();
  const charts = useGanttStore((s) => s.charts);
  const a = charts[aId];
  const b = charts[bId];

  if (!a || !b) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="text-lg font-semibold">Can't compare these charts</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One or both of the selected charts no longer exist.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to charts
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const cmp = compareCharts(a, b);
  const numFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <GitCompare className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Compare roadmaps</h1>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">A · {a.name}</span>
                {"  vs  "}
                <span className="font-medium text-foreground">B · {b.name}</span>
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link to="/">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
        <Section title="Timeline" subtitle="Deltas are B relative to A. Positive means later or longer.">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}></th>
                <th className={th}>A · {a.name}</th>
                <th className={th}>B · {b.name}</th>
                <th className={th}>Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className={`${td} text-muted-foreground`}>Start</td>
                <td className={td}>{fmt(cmp.timeline.a.startISO)}</td>
                <td className={td}>{fmt(cmp.timeline.b.startISO)}</td>
                <td className={td}>
                  <Delta weeks={cmp.timeline.startShiftWeeks} />
                </td>
              </tr>
              <tr>
                <td className={`${td} text-muted-foreground`}>End</td>
                <td className={td}>{fmt(cmp.timeline.a.endISO)}</td>
                <td className={td}>{fmt(cmp.timeline.b.endISO)}</td>
                <td className={td}>
                  <Delta weeks={cmp.timeline.endShiftWeeks} />
                </td>
              </tr>
              <tr>
                <td className={`${td} text-muted-foreground`}>Duration</td>
                <td className={td}>{cmp.timeline.a.spanWeeks} weeks</td>
                <td className={td}>{cmp.timeline.b.spanWeeks} weeks</td>
                <td className={td}>
                  <Delta weeks={cmp.timeline.b.spanWeeks - cmp.timeline.a.spanWeeks} />
                </td>
              </tr>
              <tr>
                <td className={`${td} text-muted-foreground`}>Tasks</td>
                <td className={td}>{cmp.timeline.a.taskCount}</td>
                <td className={td}>{cmp.timeline.b.taskCount}</td>
                <td className={td}>
                  <Delta weeks={cmp.timeline.b.taskCount - cmp.timeline.a.taskCount} unit="" />
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section
          title="Tasks"
          subtitle={`${cmp.tasks.both.length} matched by name · ${cmp.tasks.changedCount} shifted · ${cmp.tasks.onlyA.length} only in A · ${cmp.tasks.onlyB.length} only in B`}
        >
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Task</th>
                <th className={th}>A start → end</th>
                <th className={th}>B start → end</th>
                <th className={th}>Start shift</th>
                <th className={th}>End shift</th>
                <th className={th}>Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cmp.tasks.both.map((t) => (
                <tr key={`both-${t.key}`} className={t.changed ? "bg-amber-500/5" : undefined}>
                  <td className={`${td} font-medium`}>{t.name}</td>
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                    {fmt(t.a!.startISO)} → {fmt(t.a!.endISO)}
                  </td>
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                    {fmt(t.b!.startISO)} → {fmt(t.b!.endISO)}
                  </td>
                  <td className={td}>
                    <Delta weeks={t.startShiftWeeks} />
                  </td>
                  <td className={td}>
                    <Delta weeks={t.endShiftWeeks} />
                  </td>
                  <td className={td}>
                    <Delta weeks={t.durationDeltaWeeks} />
                  </td>
                </tr>
              ))}
              {cmp.tasks.onlyA.map((t) => (
                <tr key={`a-${t.key}`}>
                  <td className={`${td} font-medium`}>
                    {t.name}{" "}
                    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      only A
                    </span>
                  </td>
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                    {fmt(t.a!.startISO)} → {fmt(t.a!.endISO)}
                  </td>
                  <td className={`${td} text-muted-foreground`}>—</td>
                  <td className={td} colSpan={3} />
                </tr>
              ))}
              {cmp.tasks.onlyB.map((t) => (
                <tr key={`b-${t.key}`}>
                  <td className={`${td} font-medium`}>
                    {t.name}{" "}
                    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      only B
                    </span>
                  </td>
                  <td className={`${td} text-muted-foreground`}>—</td>
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                    {fmt(t.b!.startISO)} → {fmt(t.b!.endISO)}
                  </td>
                  <td className={td} colSpan={3} />
                </tr>
              ))}
              {cmp.tasks.both.length + cmp.tasks.onlyA.length + cmp.tasks.onlyB.length === 0 ? (
                <tr>
                  <td className={`${td} text-muted-foreground`} colSpan={6}>
                    Neither chart has tasks.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Section>

        <Section
          title="Teams & resources"
          subtitle="Headcount is total people per team. Demand is total role-weeks required by tasks."
        >
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Team / role</th>
                <th className={th}>A headcount</th>
                <th className={th}>B headcount</th>
                <th className={th}>A demand (role-weeks)</th>
                <th className={th}>B demand (role-weeks)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cmp.teams.rows.map((team) => (
                <>
                  <tr key={team.name} className="bg-muted/40">
                    <td className={`${td} font-medium`}>
                      {team.name}
                      {team.status !== "both" ? (
                        <span className="ml-2 rounded bg-background px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          only {team.status === "onlyA" ? "A" : "B"}
                        </span>
                      ) : null}
                    </td>
                    <td className={td}>{numFmt(team.aHeadcount)}</td>
                    <td className={td}>{numFmt(team.bHeadcount)}</td>
                    <td className={td}>{numFmt(team.aDemand)}</td>
                    <td className={td}>{numFmt(team.bDemand)}</td>
                  </tr>
                  {team.roles.map((r) => (
                    <tr key={`${team.name}-${r.name}`}>
                      <td className={`${td} pl-8 text-muted-foreground`}>
                        {r.name}
                        {r.aHeadcount == null || r.bHeadcount == null ? (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                            only {r.aHeadcount == null ? "B" : "A"}
                          </span>
                        ) : null}
                      </td>
                      <td className={td}>{r.aHeadcount == null ? "—" : numFmt(r.aHeadcount)}</td>
                      <td className={td}>{r.bHeadcount == null ? "—" : numFmt(r.bHeadcount)}</td>
                      <td className={td}>{numFmt(r.aDemand)}</td>
                      <td className={td}>{numFmt(r.bDemand)}</td>
                    </tr>
                  ))}
                </>
              ))}
              <tr className="border-t-2 border-border font-medium">
                <td className={td}>Total</td>
                <td className={td}>{numFmt(cmp.teams.totals.aHeadcount)}</td>
                <td className={td}>{numFmt(cmp.teams.totals.bHeadcount)}</td>
                <td className={td}>{numFmt(cmp.teams.totals.aDemand)}</td>
                <td className={td}>{numFmt(cmp.teams.totals.bDemand)}</td>
              </tr>
              {cmp.teams.rows.length === 0 ? (
                <tr>
                  <td className={`${td} text-muted-foreground`} colSpan={5}>
                    Neither chart defines teams.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Section>

        <Section title="Tags" subtitle="Number of tasks carrying each tag.">
          <table className="w-full min-w-[520px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Tag</th>
                <th className={th}>A</th>
                <th className={th}>B</th>
                <th className={th}>Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cmp.tags.map((t) => (
                <tr key={t.tag}>
                  <td className={`${td} font-medium`}>
                    {t.tag}
                    {t.aCount === 0 || t.bCount === 0 ? (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        only {t.aCount === 0 ? "B" : "A"}
                      </span>
                    ) : null}
                  </td>
                  <td className={td}>{t.aCount}</td>
                  <td className={td}>{t.bCount}</td>
                  <td className={td}>
                    <Delta weeks={t.delta} unit="" />
                  </td>
                </tr>
              ))}
              {cmp.tags.length === 0 ? (
                <tr>
                  <td className={`${td} text-muted-foreground`} colSpan={4}>
                    No tags in either chart.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Section>

        <Section
          title="Dependencies"
          subtitle={`${cmp.dependencies.aCount} link${cmp.dependencies.aCount === 1 ? "" : "s"} in A · ${cmp.dependencies.bCount} in B`}
        >
          <table className="w-full min-w-[620px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Task</th>
                <th className={th}>Depends on (A)</th>
                <th className={th}>Depends on (B)</th>
                <th className={th}>Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cmp.dependencies.rows.map((d) => (
                <tr key={d.key} className={d.status === "same" ? undefined : "bg-amber-500/5"}>
                  <td className={`${td} font-medium`}>{d.name}</td>
                  <td className={`${td} text-muted-foreground`}>{d.a ?? "—"}</td>
                  <td className={`${td} text-muted-foreground`}>{d.b ?? "—"}</td>
                  <td className={`${td} capitalize`}>
                    {d.status === "same" ? (
                      <span className="text-muted-foreground">unchanged</span>
                    ) : (
                      <span className="font-medium">{d.status.replace("only", "only ")}</span>
                    )}
                  </td>
                </tr>
              ))}
              {cmp.dependencies.rows.length === 0 ? (
                <tr>
                  <td className={`${td} text-muted-foreground`} colSpan={4}>
                    No dependencies in either chart.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Section>
      </main>
    </div>
  );
}
