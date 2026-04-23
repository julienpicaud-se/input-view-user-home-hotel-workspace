import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  explainAnomalies,
  type AnomalyExplanation,
} from "@/server/assistant.functions";

// Input shape — a flattened union of the home page's anomalies and any
// data-quality issues the user wants explained.
export interface ExplainableAnomaly {
  id: string;
  hotelId: string;
  hotelName: string;
  kind:
    | "spike"
    | "missing-month"
    | "zero-or-negative"
    | "implausible-range"
    | "low-occupancy"
    | "huge-jump"
    | "stale-data";
  severity: "critical" | "warning" | "info";
  title: string;
  detail?: string;
  year?: number;
  month?: number;
  utility?: string;
  pctChange?: number;
}

interface Props {
  anomalies: ExplainableAnomaly[];
  loading: boolean; // page-level loading (still pulling data)
  onOpenHotel: (hotelId: string) => void;
}

// Build a stable signature so we cache & only refetch when the set changes.
function signatureOf(items: ExplainableAnomaly[]): string {
  return items
    .map((a) => `${a.id}:${a.severity}:${a.pctChange ?? ""}`)
    .sort()
    .join("|");
}

const STORAGE_PREFIX = "ra-plus-anomaly-insights:";

export function AnomalyInsightsPanel({
  anomalies,
  loading,
  onOpenHotel,
}: Props) {
  const callExplain = useServerFn(explainAnomalies);

  const sig = React.useMemo(() => signatureOf(anomalies), [anomalies]);

  const [explanations, setExplanations] = React.useState<AnomalyExplanation[]>(
    [],
  );
  const [fetchState, setFetchState] = React.useState<
    "idle" | "loading" | "refreshing" | "error"
  >("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const fetchExplanations = React.useCallback(
    async (force: boolean) => {
      if (anomalies.length === 0) {
        setExplanations([]);
        setFetchState("idle");
        setError(null);
        return;
      }

      const cacheKey = `${STORAGE_PREFIX}${sig}`;

      // Try cache first unless forcing a refresh
      if (!force && typeof window !== "undefined") {
        try {
          const cached = window.localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached) as AnomalyExplanation[];
            setExplanations(parsed);
            setFetchState("idle");
            setError(null);
            return;
          }
        } catch {
          // ignore parse errors and refetch
        }
      }

      setFetchState(force && explanations.length > 0 ? "refreshing" : "loading");
      setError(null);
      try {
        const res = await callExplain({
          data: {
            anomalies: anomalies.map((a) => ({
              id: a.id,
              hotelId: a.hotelId,
              hotelName: a.hotelName,
              kind: a.kind,
              severity: a.severity,
              title: a.title,
              detail: a.detail,
              year: a.year,
              month: a.month,
              utility: a.utility,
              pctChange: a.pctChange,
            })),
          },
        });
        if (res.ok) {
          setExplanations(res.explanations);
          setFetchState("idle");
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(
                cacheKey,
                JSON.stringify(res.explanations),
              );
            } catch {
              // quota — ignore
            }
          }
          // Auto-expand the first item on a fresh load so users see content
          if (res.explanations.length > 0) {
            setExpandedId((cur) => cur ?? res.explanations[0].id);
          }
        } else {
          setFetchState("error");
          setError(res.error);
        }
      } catch (e) {
        console.error("Anomaly insights fetch failed:", e);
        setFetchState("error");
        setError("Insights are temporarily unavailable.");
      }
    },
    // explanations is intentionally not in deps — we only re-run when the
    // anomaly signature changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anomalies, sig, callExplain],
  );

  // Auto-fetch on signature change
  React.useEffect(() => {
    void fetchExplanations(false);
  }, [sig, fetchExplanations]);

  // Empty state — no anomalies at all
  if (!loading && anomalies.length === 0) {
    return (
      <Card className="rounded-2xl border-border/60 bg-gradient-to-br from-background to-muted/20 p-8 text-center">
        <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-5 w-5 text-success" />
        </div>
        <h3 className="mt-3 font-serif text-lg font-semibold text-foreground">
          No anomalies to explain
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your portfolio looks clean. Sera will flag and explain anything
          unusual the moment it appears.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border/60 bg-gradient-to-br from-primary/5 to-transparent px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              AI insights · Sera
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Why this is happening, and what to do next
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {anomalies.length} {anomalies.length === 1 ? "signal" : "signals"}{" "}
              flagged across your portfolio.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 rounded-xl"
          onClick={() => void fetchExplanations(true)}
          disabled={fetchState === "loading" || fetchState === "refreshing"}
        >
          {fetchState === "refreshing" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5 text-xs">Refresh</span>
        </Button>
      </div>

      {/* Body */}
      <div className="divide-y divide-border/60">
        {loading || fetchState === "loading" ? (
          Array.from({ length: Math.max(1, Math.min(anomalies.length, 3)) }).map(
            (_, i) => (
              <div key={i} className="space-y-2 p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ),
          )
        ) : fetchState === "error" ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertTriangle className="h-6 w-6 text-warning" />
            <p className="text-sm text-muted-foreground">
              {error ?? "Insights couldn't be generated."}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void fetchExplanations(true)}
            >
              Try again
            </Button>
          </div>
        ) : explanations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No insights generated.
          </div>
        ) : (
          explanations.map((exp) => (
            <InsightRow
              key={exp.id}
              explanation={exp}
              expanded={expandedId === exp.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === exp.id ? null : exp.id))
              }
              onOpenHotel={() => onOpenHotel(exp.hotelId)}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function InsightRow({
  explanation,
  expanded,
  onToggle,
  onOpenHotel,
}: {
  explanation: AnomalyExplanation;
  expanded: boolean;
  onToggle: () => void;
  onOpenHotel: () => void;
}) {
  const sevTone =
    explanation.severity === "critical"
      ? "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
      : explanation.severity === "warning"
        ? "bg-warning/15 text-warning-foreground ring-1 ring-warning/30"
        : "bg-muted text-muted-foreground";

  const sevLabel =
    explanation.severity === "critical"
      ? "Critical"
      : explanation.severity === "warning"
        ? "Warning"
        : "Info";

  const confTone =
    explanation.confidence === "high"
      ? "text-success"
      : explanation.confidence === "low"
        ? "text-muted-foreground"
        : "text-foreground";

  return (
    <div className="px-5 py-4 transition-colors hover:bg-muted/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${sevTone}`}
            >
              {sevLabel}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {explanation.hotelName}
            </span>
          </div>
          <h4 className="mt-1 text-sm font-semibold text-foreground">
            {explanation.title}
          </h4>
        </div>
        <div className="shrink-0 pt-0.5 text-muted-foreground">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 pl-0">
          {/* Why */}
          {explanation.why && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Why
              </div>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {explanation.why}
              </p>
            </div>
          )}

          {/* Actions */}
          {explanation.actions.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                What to do next
              </div>
              <ul className="mt-1.5 space-y-1.5">
                {explanation.actions.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-foreground"
                  >
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-primary" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer: confidence + open-hotel CTA */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className={`text-[11px] ${confTone}`}>
              Sera's confidence:{" "}
              <span className="font-medium capitalize">
                {explanation.confidence}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={(e) => {
                e.stopPropagation();
                onOpenHotel();
              }}
            >
              Open hotel
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
