import { useMemo, useState, useEffect } from "react";
import { addWeeks, endOfMonth, addMonths, endOfYear, format, differenceInCalendarWeeks } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type ExportFormat = "pdf" | "jpg";

type Props = {
  open: boolean;
  format: ExportFormat;
  chartStart: Date;
  requiredWeeks: number;
  defaultWeeks: number;
  onConfirm: (weeks: number) => void;
  onCancel: () => void;
};

function weeksUntil(chartStart: Date, target: Date): number {
  return Math.max(1, differenceInCalendarWeeks(target, chartStart) + 1);
}

function lastTaskEnd(chartStart: Date, requiredWeeks: number): Date {
  return addWeeks(chartStart, Math.max(0, requiredWeeks - 1));
}

export function ExportRangeDialog({
  open,
  format: fmt,
  chartStart,
  requiredWeeks,
  defaultWeeks,
  onConfirm,
  onCancel,
}: Props) {
  const defaultEnd = useMemo(
    () => addWeeks(chartStart, Math.max(0, defaultWeeks - 1)),
    [chartStart, defaultWeeks],
  );

  const [month, setMonth] = useState<number>(defaultEnd.getMonth());
  const [year, setYear] = useState<number>(defaultEnd.getFullYear());

  useEffect(() => {
    if (open) {
      setMonth(defaultEnd.getMonth());
      setYear(defaultEnd.getFullYear());
    }
  }, [open, defaultEnd]);

  const selectedDate = useMemo(() => endOfMonth(new Date(year, month, 1)), [year, month]);
  const resolvedWeeks = useMemo(
    () => weeksUntil(chartStart, selectedDate),
    [chartStart, selectedDate],
  );
  const tooShort = resolvedWeeks < 1;
  const truncates = resolvedWeeks < requiredWeeks;
  const endWeekStart = useMemo(
    () => addWeeks(chartStart, Math.max(0, resolvedWeeks - 1)),
    [chartStart, resolvedWeeks],
  );

  const suggestions = useMemo(() => {
    const lastEnd = lastTaskEnd(chartStart, requiredWeeks);
    const items: { label: string; date: Date }[] = [
      { label: "Full timeline", date: addWeeks(chartStart, Math.max(0, defaultWeeks - 1)) },
      { label: "Last task ends", date: lastEnd },
      { label: "+3 months", date: addMonths(lastEnd, 3) },
      { label: "+6 months", date: addMonths(lastEnd, 6) },
      { label: "+12 months", date: addMonths(lastEnd, 12) },
      { label: "End of year", date: endOfYear(new Date()) },
    ];
    return items.filter((it) => it.date >= chartStart);
  }, [chartStart, requiredWeeks, defaultWeeks]);

  const years = useMemo(() => {
    const startY = chartStart.getFullYear();
    const endY = Math.max(new Date().getFullYear(), startY) + 10;
    const out: number[] = [];
    for (let y = startY; y <= endY; y++) out.push(y);
    return out;
  }, [chartStart]);

  const applySuggestion = (d: Date) => {
    setMonth(d.getMonth());
    setYear(d.getFullYear());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export {fmt === "pdf" ? "PDF" : "JPG"}</DialogTitle>
          <DialogDescription>
            Choose the end date for the exported timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Suggestions</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applySuggestion(s.date)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Month</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {tooShort ? (
              <span className="text-destructive">
                End date is before the last task. Pick a later month — earliest is {format(addWeeks(chartStart, Math.max(0, requiredWeeks - 1)), "MMM yyyy")}.
              </span>
            ) : (
              <>
                Ends week of <span className="font-medium">{format(endWeekStart, "MMM d, yyyy")}</span>{" "}
                · <span className="text-muted-foreground">{resolvedWeeks} weeks</span>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button disabled={tooShort} onClick={() => onConfirm(resolvedWeeks)}>Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
