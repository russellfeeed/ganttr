import { addWeeks, formatISO, parseISO } from "date-fns";
import type { Chart, Task } from "./gantt-store";

export type Side = "a" | "b";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Normalised match key used to pair tasks, teams, roles and tags across charts. */
export function matchKey(s: string): string {
  return norm(s);
}

/**
 * Translate a week index from one chart's calendar into another's, so the
 * copied task keeps the same absolute calendar start date.
 */
export function alignedStartWeek(from: Chart, to: Chart, week: number): number {
  const weekMs = 7 * 24 * 3600 * 1000;
  const offset = Math.round(
    (parseISO(from.startDate).getTime() - parseISO(to.startDate).getTime()) / weekMs,
  );
  return week + offset;
}

export function taskEndWeek(t: Task): number {
  return t.startWeek + Math.max(1, t.durationWeeks);
}

export function weekToISO(chart: Chart, week: number): string {
  return formatISO(addWeeks(parseISO(chart.startDate), week), { representation: "date" });
}

export type TimelineSummary = {
  startISO: string;
  endISO: string | null;
  spanWeeks: number;
  taskCount: number;
};

export function summarizeTimeline(chart: Chart): TimelineSummary {
  const ends = chart.tasks.map(taskEndWeek);
  const lastWeek = ends.length ? Math.max(...ends) : 0;
  return {
    startISO: chart.startDate,
    endISO: ends.length ? weekToISO(chart, lastWeek) : null,
    spanWeeks: lastWeek,
    taskCount: chart.tasks.length,
  };
}

export type TaskDiff = {
  key: string;
  name: string;
  a?: { startISO: string; endISO: string; durationWeeks: number };
  b?: { startISO: string; endISO: string; durationWeeks: number };
  startShiftWeeks?: number;
  endShiftWeeks?: number;
  durationDeltaWeeks?: number;
  status: "both" | "onlyA" | "onlyB";
  changed: boolean;
};

function taskWindow(chart: Chart, t: Task) {
  return {
    startISO: weekToISO(chart, t.startWeek),
    endISO: weekToISO(chart, taskEndWeek(t)),
    durationWeeks: Math.max(1, t.durationWeeks),
  };
}

/** Calendar-accurate week offset between two charts' week indices. */
function absWeek(chart: Chart, week: number): number {
  const ms = parseISO(chart.startDate).getTime();
  return ms / (7 * 24 * 3600 * 1000) + week;
}

export type DependencyDiff = {
  key: string;
  name: string;
  a: string | null;
  b: string | null;
  status: "same" | "added" | "removed" | "changed" | "onlyA" | "onlyB";
};

export type TagDiff = {
  tag: string;
  aCount: number;
  bCount: number;
  delta: number;
};

export type RoleDiff = {
  name: string;
  aHeadcount: number | null;
  bHeadcount: number | null;
  aDemand: number;
  bDemand: number;
};

export type TeamDiff = {
  name: string;
  status: "both" | "onlyA" | "onlyB";
  aHeadcount: number;
  bHeadcount: number;
  aDemand: number;
  bDemand: number;
  roles: RoleDiff[];
};

export type ChartComparison = {
  timeline: { a: TimelineSummary; b: TimelineSummary; startShiftWeeks: number; endShiftWeeks: number | null };
  tasks: { both: TaskDiff[]; onlyA: TaskDiff[]; onlyB: TaskDiff[]; changedCount: number };
  teams: {
    rows: TeamDiff[];
    totals: { aHeadcount: number; bHeadcount: number; aDemand: number; bDemand: number };
  };
  tags: TagDiff[];
  dependencies: { rows: DependencyDiff[]; aCount: number; bCount: number };
};

function roleWeekDemand(chart: Chart) {
  // total role-weeks of demand per roleId
  const byRole = new Map<string, number>();
  for (const t of chart.tasks) {
    const weeks = Math.max(1, t.durationWeeks);
    for (const d of t.demands ?? []) {
      byRole.set(d.roleId, (byRole.get(d.roleId) ?? 0) + d.quantity * weeks);
    }
  }
  return byRole;
}

export function compareCharts(a: Chart, b: Chart): ChartComparison {
  const ta = summarizeTimeline(a);
  const tb = summarizeTimeline(b);
  const weekMs = 7 * 24 * 3600 * 1000;
  const startShiftWeeks = Math.round(
    (parseISO(b.startDate).getTime() - parseISO(a.startDate).getTime()) / weekMs,
  );
  const endShiftWeeks =
    ta.endISO && tb.endISO
      ? Math.round((parseISO(tb.endISO).getTime() - parseISO(ta.endISO).getTime()) / weekMs)
      : null;

  // ---- tasks ----
  const aByKey = new Map<string, Task>();
  for (const t of a.tasks) if (!aByKey.has(norm(t.name))) aByKey.set(norm(t.name), t);
  const bByKey = new Map<string, Task>();
  for (const t of b.tasks) if (!bByKey.has(norm(t.name))) bByKey.set(norm(t.name), t);

  const both: TaskDiff[] = [];
  const onlyA: TaskDiff[] = [];
  const onlyB: TaskDiff[] = [];

  for (const t of a.tasks) {
    const key = norm(t.name);
    const match = bByKey.get(key);
    if (!match) {
      onlyA.push({ key, name: t.name, a: taskWindow(a, t), status: "onlyA", changed: true });
      continue;
    }
    const startShift = Math.round(absWeek(b, match.startWeek) - absWeek(a, t.startWeek));
    const endShift = Math.round(absWeek(b, taskEndWeek(match)) - absWeek(a, taskEndWeek(t)));
    const durDelta = Math.max(1, match.durationWeeks) - Math.max(1, t.durationWeeks);
    both.push({
      key,
      name: t.name,
      a: taskWindow(a, t),
      b: taskWindow(b, match),
      startShiftWeeks: startShift,
      endShiftWeeks: endShift,
      durationDeltaWeeks: durDelta,
      status: "both",
      changed: startShift !== 0 || endShift !== 0,
    });
  }
  for (const t of b.tasks) {
    const key = norm(t.name);
    if (!aByKey.has(key)) {
      onlyB.push({ key, name: t.name, b: taskWindow(b, t), status: "onlyB", changed: true });
    }
  }

  // ---- teams & roles ----
  const aDemandByRole = roleWeekDemand(a);
  const bDemandByRole = roleWeekDemand(b);

  const teamKeys = new Set<string>();
  const aTeams = new Map<string, (typeof a.teams)[number]>();
  const bTeams = new Map<string, (typeof b.teams)[number]>();
  for (const t of a.teams ?? []) {
    aTeams.set(norm(t.name), t);
    teamKeys.add(norm(t.name));
  }
  for (const t of b.teams ?? []) {
    bTeams.set(norm(t.name), t);
    teamKeys.add(norm(t.name));
  }

  const teamRows: TeamDiff[] = [];
  const totals = { aHeadcount: 0, bHeadcount: 0, aDemand: 0, bDemand: 0 };

  for (const key of Array.from(teamKeys).sort()) {
    const at = aTeams.get(key);
    const bt = bTeams.get(key);
    const roleKeys = new Set<string>();
    const aRoles = new Map<string, { name: string; headcount: number; id: string }>();
    const bRoles = new Map<string, { name: string; headcount: number; id: string }>();
    for (const r of at?.roles ?? []) {
      aRoles.set(norm(r.name), r);
      roleKeys.add(norm(r.name));
    }
    for (const r of bt?.roles ?? []) {
      bRoles.set(norm(r.name), r);
      roleKeys.add(norm(r.name));
    }

    const roles: RoleDiff[] = [];
    let aHead = 0;
    let bHead = 0;
    let aDem = 0;
    let bDem = 0;
    for (const rk of Array.from(roleKeys).sort()) {
      const ar = aRoles.get(rk);
      const br = bRoles.get(rk);
      const ad = ar ? (aDemandByRole.get(ar.id) ?? 0) : 0;
      const bd = br ? (bDemandByRole.get(br.id) ?? 0) : 0;
      aHead += ar?.headcount ?? 0;
      bHead += br?.headcount ?? 0;
      aDem += ad;
      bDem += bd;
      roles.push({
        name: ar?.name ?? br?.name ?? rk,
        aHeadcount: ar ? ar.headcount : null,
        bHeadcount: br ? br.headcount : null,
        aDemand: ad,
        bDemand: bd,
      });
    }

    totals.aHeadcount += aHead;
    totals.bHeadcount += bHead;
    totals.aDemand += aDem;
    totals.bDemand += bDem;

    teamRows.push({
      name: at?.name ?? bt?.name ?? key,
      status: at && bt ? "both" : at ? "onlyA" : "onlyB",
      aHeadcount: aHead,
      bHeadcount: bHead,
      aDemand: aDem,
      bDemand: bDem,
      roles,
    });
  }

  // ---- tags ----
  const countTags = (chart: Chart) => {
    const m = new Map<string, { label: string; n: number }>();
    for (const t of chart.tasks) {
      for (const tag of t.tags ?? []) {
        const k = norm(tag);
        const cur = m.get(k);
        if (cur) cur.n += 1;
        else m.set(k, { label: tag, n: 1 });
      }
    }
    return m;
  };
  const at = countTags(a);
  const bt = countTags(b);
  const tagKeys = Array.from(new Set([...at.keys(), ...bt.keys()])).sort();
  const tags: TagDiff[] = tagKeys.map((k) => {
    const av = at.get(k);
    const bv = bt.get(k);
    return {
      tag: av?.label ?? bv?.label ?? k,
      aCount: av?.n ?? 0,
      bCount: bv?.n ?? 0,
      delta: (bv?.n ?? 0) - (av?.n ?? 0),
    };
  });

  // ---- dependencies ----
  const predName = (chart: Chart, t: Task) => {
    if (!t.dependsOn) return null;
    return chart.tasks.find((x) => x.id === t.dependsOn)?.name ?? null;
  };
  const depRows: DependencyDiff[] = [];
  let aDepCount = 0;
  let bDepCount = 0;
  for (const t of a.tasks) if (t.dependsOn) aDepCount++;
  for (const t of b.tasks) if (t.dependsOn) bDepCount++;

  const allTaskKeys = Array.from(new Set([...aByKey.keys(), ...bByKey.keys()])).sort();
  for (const key of allTaskKeys) {
    const at2 = aByKey.get(key);
    const bt2 = bByKey.get(key);
    const ap = at2 ? predName(a, at2) : null;
    const bp = bt2 ? predName(b, bt2) : null;
    if (!ap && !bp) continue;
    let status: DependencyDiff["status"];
    if (!at2) status = "onlyB";
    else if (!bt2) status = "onlyA";
    else if (ap && bp) status = norm(ap) === norm(bp) ? "same" : "changed";
    else if (!ap && bp) status = "added";
    else status = "removed";
    depRows.push({ key, name: at2?.name ?? bt2?.name ?? key, a: ap, b: bp, status });
  }

  return {
    timeline: { a: ta, b: tb, startShiftWeeks, endShiftWeeks },
    tasks: {
      both,
      onlyA,
      onlyB,
      changedCount: both.filter((t) => t.changed).length,
    },
    teams: { rows: teamRows, totals },
    tags,
    dependencies: { rows: depRows, aCount: aDepCount, bCount: bDepCount },
  };
}
