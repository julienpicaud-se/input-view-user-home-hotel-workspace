import * as React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CalendarX,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Gauge,
  Info,
  MinusCircle,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DataQualityIssue, DqKind, DqSeverity } from "@/lib/data-quality";
import { summariseIssues } from "@/lib/data-quality";

interface DataQualityCardProps {
  loading: boolean;
  issues: DataQualityIssue[];
  onIssueClick: (issue: DataQualityIssue) => void;
}

const severityStyle: Record<
  DqSeverity,
  { chip: string; iconColor: string }
> = {
  critical: {
    chip: "border-destructive/30 bg-destructive/10 text-destructive",
    iconColor: "text-destructive",
  },
  warning: {
    chip: "border-warning/30 bg-warning/10 text-warning",
    iconColor: "text-warning",
  },
  info: {
    chip: "border-border/60 bg-muted text-muted-foreground",
    iconColor: "text-muted-foreground",
  },
};

const SEVERITY_LABEL: Record<DqSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

const KIND_META: Record<
  DqKind,
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  "missing-month": { icon: CalendarX, label: "Missing month" },
  "zero-or-negative": { icon: MinusCircle, label: "Negative value" },
  "implausible-range": { icon: Gauge, label: "Out of range" },
  "low-occupancy": { icon: Users, label: "Low occupancy" },
  "huge-jump": { icon: TrendingUp, label: "Sudden jump" },
  "stale-data": { icon: Clock, label: "Stale data" },
};

const SEVERITY_RANK: Record<DqSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Build a "diversified" preview list: pick the worst issue of each kind first
 * so the collapsed view shows variety (e.g. one missing-month, one out-of-range,
 * one jump) instead of three identical rows.
 */
function diversifyIssues(issues: DataQualityIssue[], n: number): DataQualityIssue[] {
  if (issues.length <= n) return issues;
  const seenKinds = new Set<DqKind>();
  const picked: DataQualityIssue[] = [];
  // First pass: one of each kind (issues are already severity-sorted)
  for (const i of issues) {
    if (picked.length >= n) break;
    if (!seenKinds.has(i.kind)) {
      picked.push(i);
      seenKinds.add(i.kind);
    }
  }
  // Second pass: fill remainder with next-most-severe regardless of kind
  if (picked.length < n) {
    const pickedIds = new Set(picked.map((p) => p.id));
    for (const i of issues) {
      if (picked.length >= n) break;
      if (!pickedIds.has(i.id)) picked.push(i);
    }
  }
  // Re-sort the preview by severity so critical stays on top
  picked.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return picked;
}

export function DataQualityCard({ loading, issues, onIssueClick }: DataQualityCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  // Show out-of-range values AND month-over-month spikes in this card.
  const rangeIssues = React.useMemo(
    () => issues.filter((i) => i.kind === "implausible-range" || i.kind === "huge-jump"),
    [issues]
  );
  const summary = React.useMemo(() => summariseIssues(rangeIssues), [rangeIssues]);

  const previewIssues = React.useMemo(() => diversifyIssues(rangeIssues, 3), [rangeIssues]);
  const visibleIssues = expanded ? rangeIssues : previewIssues;
  const hasMore = rangeIssues.length > previewIssues.length;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-5">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              summary.total === 0
                ? "bg-success/15 text-success"
                : summary.critical > 0
                  ? "bg-destructive/15 text-destructive"
                  : "bg-warning/15 text-warning"
            }`}
          >
            {summary.total === 0 ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Data quality · out of range &amp; spikes
            </div>
            <h2 className="font-serif text-2xl font-semibold text-foreground">
              {loading
                ? "Checking your data…"
                : summary.total === 0
                  ? "No out-of-range values or spikes"
                  : `${summary.total} ${summary.total === 1 ? "value" : "values"} to review`}
            </h2>
          </div>
        </div>
        {!loading && summary.total > 0 && (
          <div className="flex flex-wrap gap-2">
            {summary.critical > 0 && (
              <SeverityPill severity="critical" count={summary.critical} />
            )}
            {summary.warning > 0 && (
              <SeverityPill severity="warning" count={summary.warning} />
            )}
            {summary.info > 0 && <SeverityPill severity="info" count={summary.info} />}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rangeIssues.length === 0 ? (
        <div className="flex items-center gap-3 p-6">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <p className="text-sm text-muted-foreground">
            All logged values are within range and stable month-over-month.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {visibleIssues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} onClick={() => onIssueClick(issue)} />
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((s) => !s)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-border/60 bg-muted/20 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Show all {rangeIssues.length} out-of-range values{" "}
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/** Compact number formatter for chip values. */
function fmt(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  // Trim to 2 decimals max, drop trailing zeros
  return n
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .toString();
}

function IssueRow({
  issue,
  onClick,
}: {
  issue: DataQualityIssue;
  onClick: () => void;
}) {
  const sev = severityStyle[issue.severity];
  const kindMeta = KIND_META[issue.kind];
  const KindIcon = kindMeta.icon;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40"
      >
        <span
          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${sev.chip}`}
          aria-label={SEVERITY_LABEL[issue.severity]}
          title={SEVERITY_LABEL[issue.severity]}
        >
          <KindIcon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-foreground">{issue.title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
              {kindMeta.label}
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">{issue.hotelName}</span>
          </div>
          {issue.observed && issue.expected && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${sev.chip}`}
                title="Observed value"
              >
                <span className="font-sans text-[10px] uppercase tracking-wide opacity-70">
                  Got
                </span>
                {fmt(issue.observed.value)}
                <span className="opacity-70">{issue.observed.unit}</span>
              </span>
              <span className="text-[11px] text-muted-foreground/70">vs</span>
              <span
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground"
                title="Expected range"
              >
                <span className="font-sans text-[10px] uppercase tracking-wide opacity-70">
                  Expected
                </span>
                {fmt(issue.expected.min)}–{fmt(issue.expected.max)}
                <span className="opacity-70">{issue.expected.unit}</span>
              </span>
            </div>
          )}
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </button>
    </li>
  );
}

function SeverityPill({ severity, count }: { severity: DqSeverity; count: number }) {
  const sev = severityStyle[severity];
  const Icon =
    severity === "critical" ? AlertOctagon : severity === "warning" ? AlertTriangle : Info;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${sev.chip}`}
    >
      <Icon className="h-3 w-3" />
      {count} {SEVERITY_LABEL[severity].toLowerCase()}
    </span>
  );
}
