import {
  AlertTriangle,
  ArrowRight,
  Minus,
  RefreshCw,
  Sparkles,
  TrendingDown,
  Wand2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BriefingPayload } from "@/server/assistant.functions";

interface SeraBriefingCardProps {
  firstName: string;
  loading: boolean;
  refreshing: boolean;
  briefing: BriefingPayload | null;
  error: string | null;
  onRefresh: () => void;
  onAsk: () => void;
}

export function SeraBriefingCard({
  firstName,
  loading,
  refreshing,
  briefing,
  error,
  onRefresh,
  onAsk,
}: SeraBriefingCardProps) {
  return (
    <Card className="relative overflow-hidden rounded-2xl border-border/60 bg-gradient-to-br from-primary/8 via-card to-accent/12 p-5 md:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Sera · Your daily briefing
              </div>
              <div className="font-serif text-lg font-semibold text-foreground">
                Personalised for {firstName}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Refresh briefing"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{refreshing ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="flex flex-wrap gap-2 pt-1">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-28" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        ) : briefing ? (
          <>
            <p className="font-serif text-xl leading-snug text-foreground md:text-2xl">
              {briefing.headline}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground md:text-[15px]">
              {briefing.summary}
            </p>

            {briefing.highlights.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {briefing.highlights.map((h, i) => {
                  const tone =
                    h.tone === "positive"
                      ? "border-success/30 bg-success/10 text-success"
                      : h.tone === "warning"
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : "border-border/60 bg-muted text-foreground";
                  const Icon =
                    h.tone === "positive"
                      ? TrendingDown
                      : h.tone === "warning"
                        ? AlertTriangle
                        : Minus;
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
                    >
                      <Icon className="h-3 w-3" />
                      {h.label}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col items-start gap-3 rounded-xl border border-border/50 bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-sm text-foreground">
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="font-medium">Today's focus:</span>{" "}
                  <span className="text-muted-foreground">{briefing.focus}</span>
                </span>
              </div>
              <Button size="sm" variant="default" onClick={onAsk} className="shrink-0">
                Ask Sera
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
