import { Fragment, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ArrowLeft, ArrowRight, GitCompare } from "lucide-react";
import { toast } from "sonner";
import { useGanttStore, normalizeTags, type Chart, type Task } from "@/lib/gantt-store";
import { alignedStartWeek, compareCharts, matchKey } from "@/lib/compare-charts";
import { Button } from "@/components/ui/button";
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

type CopyOption = { disabled?: string; run: () => void };

function CopyCell({ toB, toA }: { toB: CopyOption; toA: CopyOption }) {
  return (
    <td className={`${td} whitespace-nowrap text-right`}>
      <span className="inline-flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!!toB.disabled}
          title={toB.disabled ?? "Copy A → B"}
          aria-label={toB.disabled ?? "Copy A to B"}
          onClick={toB.run}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!!toA.disabled}
          title={toA.disabled ?? "Copy B → A"}
          aria-label={toA.disabled ?? "Copy B to A"}
          onClick={toA.run}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
      </span>
    </td>
  );
}

type Pending = {
  title: string;
  body: React.ReactNode;
  run: () => void;
  successMessage: string;
};

function findTask(chart: Chart, name: string): Task | undefined {
  const key = matchKey(name);
  return chart.tasks.find((t) => matchKey(t.name) === key);
}

function ComparePage() {
  const { a: aId, b: bId } = Route.useSearch();
  const charts = useGanttStore((s) => s.charts);
  const addTask = useGanttStore((s) => s.addTask);
  const updateTask = useGanttStore((s) => s.updateTask);
  const addTeam = useGanttStore((s) => s.addTeam);
  const addRole = useGanttStore((s) => s.addRole);
  const setRoleHeadcount = useGanttStore((s) => s.setRoleHeadcount);
  const [pending, setPending] = useState<Pending | null>(null);

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
  const sides = (dir: "ab" | "ba") => (dir === "ab" ? { src: a, dst: b } : { src: b, dst: a });

  // ---------- tasks ----------
  function copyTaskTiming(dir: "ab" | "ba", name: string) {
    const { src, dst } = sides(dir);
    const st = findTask(src, name);
    if (!st) return;
    const dt = findTask(dst, name);
    const raw = alignedStartWeek(src, dst, st.startWeek);
    const week = Math.max(0, raw);
    const clamped = raw < 0;
    const startFrom = dt ? fmt(weekISO(dst, dt.startWeek)) : null;
    const startTo = fmt(weekISO(dst, week));

    setPending({
      title: dt ? `Copy timing to ${dst.name}?` : `Create "${st.name}" in ${dst.name}?`,
      body: (
        <>
          <span className="font-medium text-foreground">{st.name}</span>{" "}
          {dt ? "timing will be overwritten in " : "will be added to "}
          <span className="font-medium text-foreground">{dst.name}</span>: start{" "}
          {startFrom ? `${startFrom} → ` : ""}
          {startTo}, duration {dt ? `${dt.durationWeeks}w → ` : ""}
          {st.durationWeeks}w.
          {clamped
            ? " The source start is before this chart begins, so it is clamped to the first week."
            : ""}
          {dt ? " Name, team, tags and resources are left unchanged." : ""}
        </>
      ),
      successMessage: `Copied to ${dst.name}`,
      run: () => {
        if (dt) {
          updateTask(dst.id, dt.id, { startWeek: week, durationWeeks: st.durationWeeks });
        } else {
          addTask(dst.id, {
            name: st.name,
            startWeek: week,
            durationWeeks: st.durationWeeks,
            color: st.color,
          });
        }
      },
    });
  }

  function weekISO(chart: Chart, week: number) {
    const ms = parseISO(chart.startDate).getTime() + week * 7 * 24 * 3600 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  const taskCopy = (name: string, identical: boolean) => ({
    toB: {
      disabled: identical ? "Timing already matches" : undefined,
      run: () => copyTaskTiming("ab", name),
    },
    toA: {
      disabled: identical ? "Timing already matches" : undefined,
      run: () => copyTaskTiming("ba", name),
    },
  });

  // ---------- teams & roles ----------
  function ensureTeam(chart: Chart, name: string): string {
    const key = matchKey(name);
    const existing = (chart.teams ?? []).find((t) => matchKey(t.name) === key);
    if (existing) return existing.id;
    return addTeam(chart.id, name);
  }

  function ensureRole(chartId: string, teamId: string, name: string, headcount: number) {
    const chart = useGanttStore.getState().charts[chartId];
    const team = (chart?.teams ?? []).find((t) => t.id === teamId);
    const key = matchKey(name);
    const role = (team?.roles ?? []).find((r) => matchKey(r.name) === key);
    if (role) setRoleHeadcount(chartId, teamId, role.id, headcount);
    else addRole(chartId, teamId, name, headcount);
  }

  function copyRole(dir: "ab" | "ba", teamName: string, roleName: string, headcount: number | null) {
    if (headcount == null) return;
    const { dst } = sides(dir);
    setPending({
      title: `Copy ${roleName} headcount to ${dst.name}?`,
      body: (
        <>
          <span className="font-medium text-foreground">{roleName}</span> in team{" "}
          <span className="font-medium text-foreground">{teamName}</span> will be set to{" "}
          {numFmt(headcount)} in <span className="font-medium text-foreground">{dst.name}</span>. The
          team or role is created there if it doesn't exist yet.
        </>
      ),
      successMessage: `Copied to ${dst.name}`,
      run: () => {
        const teamId = ensureTeam(dst, teamName);
        ensureRole(dst.id, teamId, roleName, headcount);
      },
    });
  }

  function copyTeam(dir: "ab" | "ba", teamName: string) {
    const { src, dst } = sides(dir);
    const key = matchKey(teamName);
    const srcTeam = (src.teams ?? []).find((t) => matchKey(t.name) === key);
    if (!srcTeam) return;
    setPending({
      title: `Copy team ${srcTeam.name} to ${dst.name}?`,
      body: (
        <>
          {srcTeam.roles.length} role{srcTeam.roles.length === 1 ? "" : "s"} from{" "}
          <span className="font-medium text-foreground">{srcTeam.name}</span> will have their
          headcount copied into <span className="font-medium text-foreground">{dst.name}</span>.
          Missing roles are created; extra roles there are left alone.
        </>
      ),
      successMessage: `Copied to ${dst.name}`,
      run: () => {
        const teamId = ensureTeam(dst, srcTeam.name);
        for (const r of srcTeam.roles) ensureRole(dst.id, teamId, r.name, r.headcount);
      },
    });
  }

  // ---------- tags ----------
  function tagTargets(dir: "ab" | "ba", tag: string) {
    const { src, dst } = sides(dir);
    const key = matchKey(tag);
    const changes: { task: Task; nextTags: string[] }[] = [];
    for (const st of src.tasks) {
      const dt = findTask(dst, st.name);
      if (!dt) continue;
      const has = (st.tags ?? []).some((t) => matchKey(t) === key);
      const current = normalizeTags(dt.tags);
      const already = current.some((t) => matchKey(t) === key);
      if (has === already) continue;
      const nextTags = has
        ? [...current, (st.tags ?? []).find((t) => matchKey(t) === key)!]
        : current.filter((t) => matchKey(t) !== key);
      changes.push({ task: dt, nextTags });
    }
    return { src, dst, changes };
  }

  function copyTag(dir: "ab" | "ba", tag: string) {
    const { dst, changes } = tagTargets(dir, tag);
    setPending({
      title: `Copy tag "${tag}" to ${dst.name}?`,
      body: (
        <>
          {changes.length} matched task{changes.length === 1 ? "" : "s"} in{" "}
          <span className="font-medium text-foreground">{dst.name}</span> will have the tag{" "}
          <span className="font-medium text-foreground">{tag}</span> added or removed so it mirrors
          the other chart. Tasks that exist on only one side are skipped.
        </>
      ),
      successMessage: `Tag copied to ${dst.name}`,
      run: () => {
        for (const c of changes) updateTask(dst.id, c.task.id, { tags: normalizeTags(c.nextTags) });
      },
    });
  }

  // ---------- dependencies ----------
  function depPlan(dir: "ab" | "ba", taskName: string) {
    const { src, dst } = sides(dir);
    const st = findTask(src, taskName);
    const dt = findTask(dst, taskName);
    if (!st || !dt) return { src, dst, error: "Task missing on one side" as const };
    const srcPredName = st.dependsOn
      ? (src.tasks.find((x) => x.id === st.dependsOn)?.name ?? null)
      : null;
    if (!srcPredName) return { src, dst, st, dt, predName: null, predId: undefined };
    const pred = findTask(dst, srcPredName);
    if (!pred) return { src, dst, error: `"${srcPredName}" doesn't exist in ${dst.name}` as const };
    if (pred.id === dt.id) return { src, dst, error: "Would depend on itself" as const };
    return { src, dst, st, dt, predName: srcPredName, predId: pred.id };
  }

  function copyDependency(dir: "ab" | "ba", taskName: string) {
    const plan = depPlan(dir, taskName);
    if ("error" in plan && plan.error) return;
    const { dst, dt, predName, predId } = plan as {
      dst: Chart;
      dt: Task;
      predName: string | null;
      predId?: string;
    };
    setPending({
      title: `Copy dependency to ${dst.name}?`,
      body: (
        <>
          <span className="font-medium text-foreground">{dt.name}</span> in{" "}
          <span className="font-medium text-foreground">{dst.name}</span> will{" "}
          {predName ? (
            <>
              depend on <span className="font-medium text-foreground">{predName}</span>.
            </>
          ) : (
            "have its dependency cleared."
          )}
        </>
      ),
      successMessage: `Dependency copied to ${dst.name}`,
      run: () => updateTask(dst.id, dt.id, { dependsOn: predId }),
    });
  }

  const depCopy = (name: string, same: boolean) => {
    const ab = depPlan("ab", name);
    const ba = depPlan("ba", name);
    return {
      toB: {
        disabled: same
          ? "Dependencies already match"
          : "error" in ab && ab.error
            ? ab.error
            : undefined,
        run: () => copyDependency("ab", name),
      },
      toA: {
        disabled: same
          ? "Dependencies already match"
          : "error" in ba && ba.error
            ? ba.error
            : undefined,
        run: () => copyDependency("ba", name),
      },
    };
  };

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
          subtitle={`${cmp.tasks.both.length} matched by name · ${cmp.tasks.changedCount} shifted · ${cmp.tasks.onlyA.length} only in A · ${cmp.tasks.onlyB.length} only in B · use the arrows to copy timing between charts`}
        >
          <table className="w-full min-w-[940px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Task</th>
                <th className={th}>A start → end</th>
                <th className={th}>B start → end</th>
                <th className={th}>Start shift</th>
                <th className={th}>End shift</th>
                <th className={th}>Duration</th>
                <th className={`${th} text-right`}>Copy</th>
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
                  <CopyCell
                    {...taskCopy(t.name, t.startShiftWeeks === 0 && t.durationDeltaWeeks === 0)}
                  />
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
                  <CopyCell
                    toB={{ run: () => copyTaskTiming("ab", t.name) }}
                    toA={{ disabled: "Task only exists in A", run: () => {} }}
                  />
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
                  <CopyCell
                    toB={{ disabled: "Task only exists in B", run: () => {} }}
                    toA={{ run: () => copyTaskTiming("ba", t.name) }}
                  />
                </tr>
              ))}
              {cmp.tasks.both.length + cmp.tasks.onlyA.length + cmp.tasks.onlyB.length === 0 ? (
                <tr>
                  <td className={`${td} text-muted-foreground`} colSpan={7}>
                    Neither chart has tasks.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Section>

        <Section
          title="Teams & resources"
          subtitle="Headcount is total people per team. Demand is total role-weeks required by tasks and is copied only by moving tasks."
        >
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Team / role</th>
                <th className={th}>A headcount</th>
                <th className={th}>B headcount</th>
                <th className={th}>A demand (role-weeks)</th>
                <th className={th}>B demand (role-weeks)</th>
                <th className={`${th} text-right`}>Copy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cmp.teams.rows.map((team) => (
                <Fragment key={team.name}>
                  <tr className="bg-muted/40">
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
                    <CopyCell
                      toB={{
                        disabled: team.status === "onlyB" ? "Team only exists in B" : undefined,
                        run: () => copyTeam("ab", team.name),
                      }}
                      toA={{
                        disabled: team.status === "onlyA" ? "Team only exists in A" : undefined,
                        run: () => copyTeam("ba", team.name),
                      }}
                    />
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
                      <CopyCell
                        toB={{
                          disabled:
                            r.aHeadcount == null
                              ? "Role only exists in B"
                              : r.aHeadcount === r.bHeadcount
                                ? "Headcount already matches"
                                : undefined,
                          run: () => copyRole("ab", team.name, r.name, r.aHeadcount),
                        }}
                        toA={{
                          disabled:
                            r.bHeadcount == null
                              ? "Role only exists in A"
                              : r.aHeadcount === r.bHeadcount
                                ? "Headcount already matches"
                                : undefined,
                          run: () => copyRole("ba", team.name, r.name, r.bHeadcount),
                        }}
                      />
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="border-t-2 border-border font-medium">
                <td className={td}>Total</td>
                <td className={td}>{numFmt(cmp.teams.totals.aHeadcount)}</td>
                <td className={td}>{numFmt(cmp.teams.totals.bHeadcount)}</td>
                <td className={td}>{numFmt(cmp.teams.totals.aDemand)}</td>
                <td className={td}>{numFmt(cmp.teams.totals.bDemand)}</td>
                <td className={td} />
              </tr>
              {cmp.teams.rows.length === 0 ? (
                <tr>
                  <td className={`${td} text-muted-foreground`} colSpan={6}>
                    Neither chart defines teams.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Section>

        <Section title="Tags" subtitle="Number of tasks carrying each tag. Copying applies the tag to matched tasks only.">
          <table className="w-full min-w-[620px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Tag</th>
                <th className={th}>A</th>
                <th className={th}>B</th>
                <th className={th}>Delta</th>
                <th className={`${th} text-right`}>Copy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cmp.tags.map((t) => {
                const ab = tagTargets("ab", t.tag).changes.length;
                const ba = tagTargets("ba", t.tag).changes.length;
                return (
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
                    <CopyCell
                      toB={{
                        disabled: ab === 0 ? "Nothing to change in B" : undefined,
                        run: () => copyTag("ab", t.tag),
                      }}
                      toA={{
                        disabled: ba === 0 ? "Nothing to change in A" : undefined,
                        run: () => copyTag("ba", t.tag),
                      }}
                    />
                  </tr>
                );
              })}
              {cmp.tags.length === 0 ? (
                <tr>
                  <td className={`${td} text-muted-foreground`} colSpan={5}>
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
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Task</th>
                <th className={th}>Depends on (A)</th>
                <th className={th}>Depends on (B)</th>
                <th className={th}>Change</th>
                <th className={`${th} text-right`}>Copy</th>
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
                  <CopyCell {...depCopy(d.name, d.status === "same")} />
                </tr>
              ))}
              {cmp.dependencies.rows.length === 0 ? (
                <tr>
                  <td className={`${td} text-muted-foreground`} colSpan={5}>
                    No dependencies in either chart.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Section>
      </main>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pending) return;
                pending.run();
                toast.success(pending.successMessage);
                setPending(null);
              }}
            >
              Copy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
