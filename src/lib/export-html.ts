import { addWeeks, format } from "date-fns";
import type { Chart, Task, Team } from "./gantt-store";

export type HtmlRow =
  | { kind: "header"; team: Team | null; count: number }
  | { kind: "task"; task: Task };

export type HtmlCapacityHealth = {
  score: number | null;
  band: "healthy" | "at-risk" | "overloaded" | "none";
  overCells: number;
  atCapCells: number;
  unstaffedCells: number;
  activeCells: number;
  coverage: number | null;
  peak: { over: number; roleName: string; teamName: string; week: number } | null;
};

export type HtmlCapacity = {
  teams: Team[];
  demandByWeek: Map<string, Map<string, number[]>>;
  health: HtmlCapacityHealth;
};

type Opts = {
  chart: Chart;
  rows: HtmlRow[];
  totalWeeks: number;
  capacity?: HtmlCapacity;
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeFile(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "chart";
}

function weekStart(chartStart: Date, w: number): Date {
  return addWeeks(chartStart, w);
}

function taskEndDate(chartStart: Date, t: Task): Date {
  const end = addWeeks(chartStart, t.startWeek + t.durationWeeks);
  end.setDate(end.getDate() - 1);
  return end;
}

/** Month/year spans across the visible weeks. */
function monthSpans(chartStart: Date, totalWeeks: number) {
  const spans: { label: string; start: number; span: number }[] = [];
  for (let w = 0; w < totalWeeks; w++) {
    const d = weekStart(chartStart, w);
    const label = format(d, "MMM yyyy");
    const last = spans[spans.length - 1];
    if (last && last.label === label) last.span += 1;
    else spans.push({ label, start: w, span: 1 });
  }
  return spans;
}

function capClass(used: number, cap: number): string {
  if (used <= 0) return "c-empty";
  if (cap <= 0) return "c-unstaffed";
  const r = used / cap;
  if (r > 1) return "c-over";
  if (r === 1) return "c-at";
  if (r > 0.85) return "c-warn";
  return "c-ok";
}

function bandLabel(band: HtmlCapacityHealth["band"]): string {
  return band === "healthy"
    ? "Healthy"
    : band === "at-risk"
      ? "At risk"
      : band === "overloaded"
        ? "Overloaded"
        : "No demand";
}

export function buildChartHtml({ chart, rows, totalWeeks, capacity }: Opts): string {
  const chartStart = new Date(chart.startDate);
  const weeks = Math.max(1, totalWeeks);
  const spans = monthSpans(chartStart, weeks);
  const taskById = new Map(chart.tasks.map((t) => [t.id, t]));
  const teamById = new Map((chart.teams ?? []).map((t) => [t.id, t]));

  /* ---------- timeline header (two tiers) ---------- */
  const monthTier = spans
    .map(
      (s) =>
        `<div class="mcell" style="grid-column:${s.start + 2} / span ${s.span}">${esc(s.label)}</div>`,
    )
    .join("");
  const weekTier = Array.from({ length: weeks }, (_, w) => {
    const d = weekStart(chartStart, w);
    return `<div class="wcell" style="grid-column:${w + 2}">${esc(format(d, "d MMM"))}</div>`;
  }).join("");

  const header = `
    <div class="hrow hrow-1">
      <div class="lbl corner">${esc(chart.name)}</div>
      ${monthTier}
    </div>
    <div class="hrow hrow-2">
      <div class="lbl corner">Week starting</div>
      ${weekTier}
    </div>`;

  /* ---------- task rows ---------- */
  const bodyRows = rows
    .map((r) => {
      if (r.kind === "header") {
        const color = r.team?.color ?? "#94a3b8";
        return `
      <div class="row grow">
        <div class="lbl team">
          <span class="dot" style="background:${esc(color)}"></span>
          <span class="tname">${esc(r.team?.name ?? "Unassigned")}</span>
          <span class="cnt">${r.count} task${r.count === 1 ? "" : "s"}</span>
        </div>
        <div class="fill" style="grid-column:2 / span ${weeks}"></div>
      </div>`;
      }
      const t = r.task;
      if (t.startWeek >= weeks) return "";
      const start = Math.max(0, t.startWeek);
      const rawEnd = t.startWeek + t.durationWeeks;
      const end = Math.min(weeks, rawEnd);
      const span = Math.max(1, end - start);
      const clipped = rawEnd > weeks;
      const team = t.teamId ? (teamById.get(t.teamId) ?? null) : null;
      const dep = t.dependsOn ? taskById.get(t.dependsOn) : null;
      const resources =
        (t.demands ?? [])
          .filter((d) => d.quantity > 0)
          .map((d) => {
            const role = team?.roles?.find((x) => x.id === d.roleId);
            return `${d.quantity}\u00d7 ${role ? role.name : "orphan role"}`;
          })
          .join(", ") || "none";
      const tip = [
        t.name,
        `${format(weekStart(chartStart, t.startWeek), "d MMM yyyy")} \u2192 ${format(taskEndDate(chartStart, t), "d MMM yyyy")}`,
        `${t.durationWeeks} week${t.durationWeeks === 1 ? "" : "s"}`,
        `Team: ${team?.name ?? "Unassigned"}`,
        `Resources: ${resources}`,
        dep ? `After: ${dep.name}` : null,
        t.tbc ? "To be confirmed" : null,
        clipped ? "Truncated by export range" : null,
      ]
        .filter(Boolean)
        .join("\n");
      return `
      <div class="row">
        <div class="lbl task${t.tbc ? " tbc" : ""}" title="${esc(tip)}">
          <span class="dot" style="background:${esc(t.color)}"></span>
          <span class="tname">${esc(t.name)}</span>
          ${t.tbc ? '<span class="badge">TBC</span>' : ""}
        </div>
        <div class="track" style="grid-column:2 / span ${weeks}">
          <div class="bar${t.tbc ? " tbc" : ""}${clipped ? " clipped" : ""}"
               style="--bar:${esc(t.color)}; left:calc(var(--w) * ${start}); width:calc(var(--w) * ${span});"
               title="${esc(tip)}">
            <span>${esc(t.name)}</span>${dep ? `<em class="dep">after: ${esc(dep.name)}</em>` : ""}
          </div>
        </div>

      </div>`;
    })
    .join("");

  /* ---------- capacity rows ---------- */
  let capacitySection = `<p class="empty">No teams with roles defined \u2014 nothing to show here.</p>`;
  if (capacity && capacity.teams.length > 0) {
    const h = capacity.health;
    const peakTxt = h.peak
      ? `${h.peak.teamName} \u00b7 ${h.peak.roleName}, +${h.peak.over} in w/c ${format(weekStart(chartStart, h.peak.week), "d MMM yyyy")}`
      : "\u2014";
    const healthBar = `
      <div class="health b-${h.band}">
        <div class="score">${h.score ?? "\u2014"}<small>/100</small></div>
        <div class="hmeta">
          <strong>${bandLabel(h.band)}</strong>
          <span>Overallocated cells: ${h.overCells}</span>
          <span>Unstaffed demand: ${h.unstaffedCells}</span>
          <span>Coverage: ${h.coverage == null ? "\u2014" : h.coverage + "%"}</span>
          <span>Peak overload: ${esc(peakTxt)}</span>
        </div>
      </div>`;

    const capRows = capacity.teams
      .map((team) => {
        const roleRows = (team.roles ?? [])
          .map((role) => {
            const arr = capacity.demandByWeek.get(team.id)?.get(role.id) ?? [];
            let peak = 0;
            const cells = Array.from({ length: weeks }, (_, w) => {
              const used = arr[w] ?? 0;
              if (used > peak) peak = used;
              const cls = capClass(used, role.headcount);
              const label = used > 0 ? `${used}/${role.headcount}` : "";
              const tip =
                used > 0
                  ? `${team.name} \u00b7 ${role.name}\nw/c ${format(weekStart(chartStart, w), "d MMM yyyy")}\n${used} needed of ${role.headcount} available`
                  : "";
              return `<div class="ccell ${cls}" style="grid-column:${w + 2}"${tip ? ` title="${esc(tip)}"` : ""}>${esc(label)}</div>`;
            }).join("");
            const over = peak > role.headcount;
            return `
      <div class="row">
        <div class="lbl role${over ? " over" : ""}">
          <span class="tname">${esc(role.name)}</span>
          <span class="cnt">${over ? `&#9888; ${peak}/${role.headcount}` : role.headcount}</span>
        </div>
        ${cells}
      </div>`;
          })
          .join("");
        return `
      <div class="row grow">
        <div class="lbl team">
          <span class="dot" style="background:${esc(team.color)}"></span>
          <span class="tname">${esc(team.name)}</span>
        </div>
        <div class="fill" style="grid-column:2 / span ${weeks}"></div>
      </div>${roleRows}`;
      })
      .join("");

    capacitySection = `${healthBar}
    <div class="scroll">
      <div class="grid" style="--weeks:${weeks}">
        ${header}
        ${capRows}
      </div>
    </div>
    <div class="legend">
      <span><i class="c-ok"></i> Under capacity</span>
      <span><i class="c-warn"></i> Near capacity</span>
      <span><i class="c-at"></i> At capacity</span>
      <span><i class="c-over"></i> Overallocated</span>
      <span><i class="c-unstaffed"></i> Unstaffed</span>
    </div>`;
  }

  const lastWeekEnd = (() => {
    const d = weekStart(chartStart, weeks);
    d.setDate(d.getDate() - 1);
    return d;
  })();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(chart.name)} — Gantt chart</title>
<style>
  :root {
    --w: 108px;         /* week column width */
    --label: 260px;     /* frozen label column width */
    --row: 34px;
    --bg: #ffffff;
    --fg: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --soft: #f8fafc;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  header.top {
    display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
    padding: 14px 16px; border-bottom: 1px solid var(--line); background: var(--soft);
    position: sticky; top: 0; z-index: 30;
  }
  h1 { font-size: 16px; margin: 0; }
  .sub { color: var(--muted); font-size: 12px; }
  .spacer { flex: 1 1 auto; }
  .tabs, .zoom { display: flex; gap: 4px; }
  button {
    font: inherit; font-size: 12px; padding: 5px 10px; cursor: pointer;
    background: #fff; color: var(--fg); border: 1px solid var(--line); border-radius: 6px;
  }
  button:hover { background: #f1f5f9; }
  button[aria-pressed="true"] { background: var(--fg); color: #fff; border-color: var(--fg); }
  .zoom span.lbl0 { font-size: 12px; color: var(--muted); align-self: center; margin-right: 4px; }

  main { padding: 12px 16px 32px; }
  section[hidden] { display: none; }

  .scroll {
    overflow: auto; max-height: calc(100vh - 190px);
    border: 1px solid var(--line); border-radius: 8px; background: #fff;
  }
  .grid {
    display: grid;
    grid-template-columns: var(--label) repeat(var(--weeks), var(--w));
    min-width: max-content;
  }
  .hrow, .row { display: contents; }

  .lbl {
    position: sticky; left: 0; z-index: 10; grid-column: 1;
    background: #fff; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line);
    display: flex; align-items: center; gap: 6px; padding: 0 10px;
    height: var(--row); overflow: hidden; white-space: nowrap;
  }
  .lbl .tname { overflow: hidden; text-overflow: ellipsis; }
  .lbl .cnt { margin-left: auto; font-size: 11px; color: var(--muted); }
  .lbl.team { background: var(--soft); font-weight: 600; }
  .lbl.role { padding-left: 24px; }
  .lbl.role.over { box-shadow: inset 2px 0 0 #dc2626; color: #b91c1c; }
  .lbl.task.tbc { font-style: italic; color: var(--muted); }
  .badge { font-size: 9px; border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; color: var(--muted); }
  .dot { width: 9px; height: 9px; border-radius: 2px; flex: 0 0 auto; }

  .corner { z-index: 25 !important; }
  .hrow-1 > * { position: sticky; top: 0; z-index: 15; background: var(--soft);
    height: 28px; border-bottom: 1px solid var(--line); }
  .hrow-1 > .lbl { z-index: 25; height: 28px; font-weight: 600; }
  .hrow-2 > * { position: sticky; top: 28px; z-index: 15; background: var(--soft);
    height: 26px; border-bottom: 1px solid var(--line); }
  .hrow-2 > .lbl { z-index: 25; height: 26px; font-size: 11px; color: var(--muted); font-weight: 500; }
  .mcell, .wcell {
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; border-left: 1px solid var(--line); white-space: nowrap;
  }
  .mcell { font-weight: 600; }
  .wcell { color: var(--muted); }

  .row > .fill { height: var(--row); background: var(--soft); border-bottom: 1px solid var(--line); }
  .track {
    position: relative; height: var(--row); border-bottom: 1px solid var(--line);
    background: repeating-linear-gradient(to right, transparent 0, transparent calc(var(--w) - 1px), var(--line) calc(var(--w) - 1px), var(--line) var(--w));
  }
  .bar {
    position: absolute; top: 3px; bottom: 3px;
    background: var(--bar); color: #fff; border-radius: 5px;
    display: flex; align-items: center; gap: 6px; padding: 0 8px;
    font-size: 12px; overflow: hidden; white-space: nowrap;
  }
  .bar span { overflow: hidden; text-overflow: ellipsis; }
  .bar em.dep { font-style: normal; font-size: 10px; opacity: .85; margin-left: auto; flex: 0 0 auto; }
  .bar.tbc {
    background: repeating-linear-gradient(45deg, var(--bar), var(--bar) 7px, rgba(255,255,255,.45) 7px, rgba(255,255,255,.45) 14px);
    color: #0f172a;
  }
  .bar.tbc span, .bar.tbc em.dep {
    background: rgba(255,255,255,.92); border-radius: 3px; padding: 0 5px;
  }
  .bar.clipped { border-radius: 5px 0 0 5px; box-shadow: inset -5px 0 0 rgba(15,23,42,.6); }



  .ccell {
    height: var(--row); display: flex; align-items: center; justify-content: center;
    font-size: 11px; border-left: 1px solid var(--line); border-bottom: 1px solid var(--line);
    font-variant-numeric: tabular-nums;
  }
  .c-empty { background: #fff; }
  .c-ok { background: #dcfce7; color: #14532d; }
  .c-warn { background: #fef9c3; color: #713f12; }
  .c-at { background: #fed7aa; color: #7c2d12; }
  .c-over { background: #fecaca; color: #7f1d1d; font-weight: 600; }
  .c-unstaffed { background: #e2e8f0; color: #334155; font-weight: 600; }

  .health { display: flex; align-items: center; gap: 16px; padding: 12px 14px; margin-bottom: 10px;
    border: 1px solid var(--line); border-radius: 8px; background: var(--soft); }
  .health .score { font-size: 26px; font-weight: 700; }
  .health .score small { font-size: 12px; font-weight: 500; color: var(--muted); }
  .health .hmeta { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--muted); }
  .health .hmeta strong { color: var(--fg); }
  .b-healthy { border-color: #86efac; }
  .b-at-risk { border-color: #fcd34d; }
  .b-overloaded { border-color: #fca5a5; }

  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; font-size: 11px; color: var(--muted); }
  .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -2px; margin-right: 4px; border: 1px solid var(--line); }
  .empty { color: var(--muted); }
  footer { padding: 0 16px 24px; font-size: 11px; color: var(--muted); }
</style>
</head>
<body>
<header class="top">
  <div>
    <h1>${esc(chart.name)}</h1>
    <div class="sub">
      ${esc(format(chartStart, "d MMM yyyy"))} &ndash; ${esc(format(lastWeekEnd, "d MMM yyyy"))}
      &middot; ${weeks} week${weeks === 1 ? "" : "s"}
      &middot; ${chart.tasks.length} task${chart.tasks.length === 1 ? "" : "s"}
    </div>
  </div>
  <div class="spacer"></div>
  <div class="tabs">
    <button id="tab-tasks" aria-pressed="true">Tasks</button>
    <button id="tab-capacity" aria-pressed="false">Capacity</button>
  </div>
  <div class="zoom">
    <span class="lbl0">Zoom</span>
    <button data-w="64">Compact</button>
    <button data-w="108" aria-pressed="true">Normal</button>
    <button data-w="170">Wide</button>
  </div>
</header>

<main>
  <section id="sec-tasks">
    <div class="scroll">
      <div class="grid" style="--weeks:${weeks}">
        ${header}
        ${bodyRows}
      </div>
    </div>
  </section>
  <section id="sec-capacity" hidden>
    ${capacitySection}
  </section>
</main>

<footer>Exported from Ganttr on ${esc(format(new Date(), "d MMM yyyy, HH:mm"))}. Scroll horizontally for later weeks &mdash; names and dates stay pinned.</footer>

<script>
(function () {
  var tabs = { tasks: document.getElementById('tab-tasks'), capacity: document.getElementById('tab-capacity') };
  var secs = { tasks: document.getElementById('sec-tasks'), capacity: document.getElementById('sec-capacity') };
  Object.keys(tabs).forEach(function (k) {
    tabs[k].addEventListener('click', function () {
      Object.keys(tabs).forEach(function (j) {
        tabs[j].setAttribute('aria-pressed', String(j === k));
        secs[j].hidden = j !== k;
      });
    });
  });
  var zoomBtns = document.querySelectorAll('.zoom button[data-w]');
  zoomBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      zoomBtns.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      document.documentElement.style.setProperty('--w', b.getAttribute('data-w') + 'px');
    });
  });
})();
</script>
</body>
</html>`;
}

export function exportChartToHtml(opts: Opts): void {
  const html = buildChartHtml(opts);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFile(opts.chart.name)}-${format(new Date(), "yyyy-MM-dd")}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
