import { jsPDF } from "jspdf";
import { addWeeks, format } from "date-fns";
import type { Chart, Task, Team } from "./gantt-store";

export type PdfRow =
  | { kind: "header"; team: Team | null; count: number }
  | { kind: "task"; task: Task };

export type PdfCapacityHealth = {
  score: number;
  band: "healthy" | "at-risk" | "overloaded";
  overCells: number;
  atCapCells: number;
  unstaffedCells: number;
  totalCells: number;
  allocatedCells: number;
  peak: { over: number; roleName: string; teamName: string; week: number } | null;
};

export type PdfCapacity = {
  teams: Team[];
  // team.id -> role.id -> weeks[]
  demandByWeek: Map<string, Map<string, number[]>>;
  health: PdfCapacityHealth;
};

type Opts = {
  chart: Chart;
  rows: PdfRow[];
  totalWeeks: number;
  viewMode: "list" | "swimlanes";
  capacity?: PdfCapacity;
};

// A4 landscape in mm
const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 10;
const HEADER_H = 16;
const TIMELINE_HEADER_H = 10;
const ROW_H = 7;
const LEFT_PANEL_W = 78;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return [100, 116, 139]; // slate-500 fallback
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function truncate(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let s = text;
  while (s.length > 1 && doc.getTextWidth(s + "…") > maxW) s = s.slice(0, -1);
  return s + "…";
}

type MonthColumn = {
  startWeek: number;
  weekCount: number;
  label: string;
};

function buildMonthColumns(chartStart: Date, totalWeeks: number): MonthColumn[] {
  const months: MonthColumn[] = [];
  for (let w = 0; w < totalWeeks; w++) {
    const date = addWeeks(chartStart, w);
    const label = format(date, "MMM yyyy");
    const last = months[months.length - 1];
    if (!last || last.label !== label) {
      months.push({ startWeek: w, weekCount: 1, label });
    } else {
      last.weekCount++;
    }
  }
  return months;
}

export function exportChartToPdf({ chart, rows, totalWeeks, viewMode, capacity }: Opts) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const timelineX = MARGIN + LEFT_PANEL_W;
  const timelineW = PAGE_W - MARGIN - timelineX;
  const weekW = timelineW / Math.max(1, totalWeeks);

  const contentTop = MARGIN + HEADER_H + TIMELINE_HEADER_H;
  const contentBottom = PAGE_H - MARGIN;
  const rowsPerPage = Math.max(1, Math.floor((contentBottom - contentTop) / ROW_H));

  const chartStart = new Date(chart.startDate);
  const months = buildMonthColumns(chartStart, totalWeeks);

  const drawHeader = (pageNum: number, totalPages: number) => {
    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text(truncate(doc, chart.name || "Gantt chart", PAGE_W - MARGIN * 2 - 80), MARGIN, MARGIN + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    const meta = `Start: ${format(chartStart, "MMM d, yyyy")}  ·  Exported: ${format(new Date(), "MMM d, yyyy HH:mm")}  ·  View: ${viewMode === "swimlanes" ? "Swimlanes" : "List"}`;
    doc.text(meta, MARGIN, MARGIN + 12);

    if (totalPages > 1) {
      const p = `Page ${pageNum} / ${totalPages}`;
      doc.text(p, PAGE_W - MARGIN - doc.getTextWidth(p), MARGIN + 6);
    }

    // Month header row
    const yTop = MARGIN + HEADER_H;
    // Left panel label
    doc.setDrawColor(220);
    doc.setFillColor(245, 245, 247);
    doc.rect(MARGIN, yTop, LEFT_PANEL_W, TIMELINE_HEADER_H, "F");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "bold");
    doc.text("Task", MARGIN + 2, yTop + 6);

    // Month cells
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (let i = 0; i < months.length; i++) {
      const month = months[i];
      const x = timelineX + month.startWeek * weekW;
      const w = month.weekCount * weekW;
      doc.setFillColor(i % 2 === 0 ? 250 : 245, i % 2 === 0 ? 250 : 245, i % 2 === 0 ? 252 : 247);
      doc.rect(x, yTop, w, TIMELINE_HEADER_H, "F");
      doc.setDrawColor(225);
      doc.line(x, yTop, x, yTop + TIMELINE_HEADER_H);
      // Week separator lines inside the month (subtle)
      doc.setDrawColor(235);
      for (let k = 1; k < month.weekCount; k++) {
        const wx = x + k * weekW;
        doc.line(wx, yTop, wx, yTop + TIMELINE_HEADER_H);
      }
      doc.setTextColor(80, 80, 80);
      const label = truncate(doc, month.label, w - 2);
      const tw = doc.getTextWidth(label);
      if (tw < w - 1) {
        doc.text(label, x + (w - tw) / 2, yTop + 6);
      }
    }
    // Border around header
    doc.setDrawColor(200);
    doc.rect(MARGIN, yTop, LEFT_PANEL_W + timelineW, TIMELINE_HEADER_H);
  };

  const drawRow = (row: PdfRow, y: number) => {
    // Row separator
    doc.setDrawColor(235);
    doc.line(MARGIN, y + ROW_H, MARGIN + LEFT_PANEL_W + timelineW, y + ROW_H);

    if (row.kind === "header") {
      // Team lane header
      const color = row.team?.color ?? "#94a3b8";
      const [r, g, b] = hexToRgb(color);
      doc.setFillColor(r, g, b);
      doc.rect(MARGIN, y, 2, ROW_H, "F");
      doc.setFillColor(248, 248, 250);
      doc.rect(MARGIN + 2, y, LEFT_PANEL_W - 2 + timelineW, ROW_H, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      const name = row.team?.name ?? "Unassigned";
      doc.text(truncate(doc, `${name} (${row.count})`, LEFT_PANEL_W - 6), MARGIN + 5, y + 4.8);
      return;
    }

    const task = row.task;
    // Left panel
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(truncate(doc, task.name || "Untitled", LEFT_PANEL_W - 22), MARGIN + 2, y + 4.5);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    const dur = `${task.durationWeeks}w`;
    doc.text(dur, MARGIN + LEFT_PANEL_W - 2 - doc.getTextWidth(dur), y + 4.5);

    // Timeline background zebra by month
    for (let i = 0; i < months.length; i++) {
      if (i % 2 === 1) {
        const m = months[i];
        doc.setFillColor(250, 250, 252);
        doc.rect(timelineX + m.startWeek * weekW, y, m.weekCount * weekW, ROW_H, "F");
      }
    }
    // Bar
    const [br, bg, bb] = hexToRgb(task.color);
    const bx = timelineX + Math.max(0, task.startWeek) * weekW;
    const bw = Math.max(0.5, task.durationWeeks * weekW);
    const barH = ROW_H - 2.5;
    const by = y + 1.25;
    if (task.tbc) {
      // Shaded fill for TBC: lower opacity + dashed outline
      doc.setFillColor(br, bg, bb);
      doc.setGState(new (doc as any).GState({ opacity: 0.3 }));
      doc.roundedRect(bx, by, bw, barH, 1, 1, "F");
      doc.setGState(new (doc as any).GState({ opacity: 1 }));
      doc.setDrawColor(br, bg, bb);
      doc.setLineDashPattern([0.9, 0.9], 0);
      doc.setLineWidth(0.3);
      doc.roundedRect(bx, by, bw, barH, 1, 1, "S");
      doc.setLineDashPattern([], 0);
      doc.setLineWidth(0.2);
    } else {
      doc.setFillColor(br, bg, bb);
      doc.roundedRect(bx, by, bw, barH, 1, 1, "F");
    }

    // Bar label if fits
    if (bw > 12) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      if (task.tbc) {
        doc.setTextColor(40, 40, 40);
        const label = truncate(doc, `${task.name || ""} (TBC)`, bw - 2);
        doc.text(label, bx + 1.5, by + barH / 2 + 1.2);
      } else {
        const lum = 0.299 * br + 0.587 * bg + 0.114 * bb;
        doc.setTextColor(lum > 160 ? 30 : 255, lum > 160 ? 30 : 255, lum > 160 ? 30 : 255);
        doc.text(truncate(doc, task.name || "", bw - 2), bx + 1.5, by + barH / 2 + 1.2);
      }
    }
  };

  // Precompute page slicing
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) doc.addPage();
    drawHeader(p + 1, totalPages);
    const slice = rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    let y = contentTop;
    for (const row of slice) {
      drawRow(row, y);
      y += ROW_H;
    }
    // Outer border for timeline area
    doc.setDrawColor(210);
    doc.rect(MARGIN, MARGIN + HEADER_H, LEFT_PANEL_W + timelineW, TIMELINE_HEADER_H + slice.length * ROW_H);
    // Vertical divider between panel and timeline
    doc.line(timelineX, MARGIN + HEADER_H, timelineX, MARGIN + HEADER_H + TIMELINE_HEADER_H + slice.length * ROW_H);
  }

  const safe = (chart.name || "chart").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "chart";
  doc.save(`${safe}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
