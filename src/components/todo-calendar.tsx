import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface CalendarTodo {
  id: string;
  title: string;
  done: boolean;
  tone: "primary" | "warning" | "muted" | "danger";
  dueDate?: Date;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Build a 6×7 grid (42 cells) starting on the Monday on/before the 1st of the
// displayed month. Cells outside the month are still rendered, but greyed out.
function buildGrid(viewMonth: Date): Date[] {
  const first = startOfMonth(viewMonth);
  // 0 = Sunday → shift so Monday is 0
  const dow = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - dow);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

function dotClass(tone: CalendarTodo["tone"], done: boolean): string {
  if (done) return "bg-muted-foreground/40";
  if (tone === "danger") return "bg-destructive";
  if (tone === "warning") return "bg-warning";
  if (tone === "muted") return "bg-muted-foreground/60";
  return "bg-primary";
}

export function TodoCalendar({
  todos,
  onSelectDay,
}: {
  todos: CalendarTodo[];
  onSelectDay?: (date: Date) => void;
}) {
  const today = React.useMemo(() => startOfDay(new Date()), []);
  const [viewMonth, setViewMonth] = React.useState<Date>(() => startOfMonth(today));

  // Group todos by yyyy-mm-dd of their due date (skip ones without a date)
  const todosByDay = React.useMemo(() => {
    const map = new Map<string, CalendarTodo[]>();
    for (const t of todos) {
      if (!t.dueDate) continue;
      const d = startOfDay(t.dueDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [todos]);

  const grid = React.useMemo(() => buildGrid(viewMonth), [viewMonth]);

  const monthLabel = `${MONTH_NAMES[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;

  function shiftMonth(delta: number): void {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  // Counts in the visible month (open vs done) for the small summary
  const monthOpen = React.useMemo(() => {
    let count = 0;
    for (const t of todos) {
      if (!t.dueDate || t.done) continue;
      if (
        t.dueDate.getFullYear() === viewMonth.getFullYear() &&
        t.dueDate.getMonth() === viewMonth.getMonth()
      )
        count += 1;
    }
    return count;
  }, [todos, viewMonth]);

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[160px] text-center font-serif text-base font-semibold text-foreground">
            {monthLabel}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 h-8 rounded-lg text-xs"
            onClick={() => setViewMonth(startOfMonth(today))}
          >
            Today
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {monthOpen} open {monthOpen === 1 ? "task" : "tasks"} this month
        </div>
      </div>

      {/* Weekday headings */}
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2 text-center">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {grid.map((day, i) => {
          const inMonth = day.getMonth() === viewMonth.getMonth();
          const isToday = isSameDay(day, today);
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dayTodos = todosByDay.get(key) ?? [];
          const open = dayTodos.filter((t) => !t.done);
          const isOverdue = day < today && open.length > 0;
          const visibleDots = dayTodos.slice(0, 4);

          const tooltip =
            dayTodos.length > 0
              ? dayTodos
                  .map(
                    (t) =>
                      `${t.done ? "✓ " : isOverdue ? "⚠ " : "• "}${t.title}`,
                  )
                  .join("\n")
              : undefined;

          const isLastRow = i >= 35;
          const isLastCol = i % 7 === 6;

          return (
            <button
              key={i}
              type="button"
              title={tooltip}
              onClick={() => {
                if (dayTodos.length > 0 && onSelectDay) onSelectDay(day);
              }}
              className={[
                "relative flex h-20 flex-col items-start gap-1 px-2 py-1.5 text-left transition-colors",
                !isLastCol && "border-r border-border/60",
                !isLastRow && "border-b border-border/60",
                inMonth ? "bg-card" : "bg-muted/20",
                dayTodos.length > 0
                  ? "hover:bg-muted/60 cursor-pointer"
                  : "cursor-default",
                isOverdue && inMonth && "bg-destructive/5",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={[
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50",
                  ].join(" ")}
                >
                  {day.getDate()}
                </span>
                {open.length > 0 && (
                  <span
                    className={[
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      isOverdue
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-foreground",
                    ].join(" ")}
                  >
                    {open.length}
                  </span>
                )}
              </div>
              {visibleDots.length > 0 && (
                <div className="mt-auto flex flex-wrap items-center gap-1">
                  {visibleDots.map((t) => (
                    <span
                      key={t.id}
                      className={`h-1.5 w-1.5 rounded-full ${dotClass(t.tone, t.done)}`}
                    />
                  ))}
                  {dayTodos.length > visibleDots.length && (
                    <span className="text-[10px] text-muted-foreground">
                      +{dayTodos.length - visibleDots.length}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-5 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Anomaly
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Logging
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Engagement
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> Done
        </span>
      </div>
    </Card>
  );
}
