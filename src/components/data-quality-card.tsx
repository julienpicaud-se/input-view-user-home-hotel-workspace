import * as React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DataQualityIssue, DqSeverity } from "@/lib/data-quality";
import { summariseIssues } from "@/lib/data-quality";

interface DataQualityCardProps {
  loading: boolean;
  issues: DataQualityIssue[];
  onIssueClick: (issue: DataQualityIssue) => void;
}

const severityStyle: Record<
  DqSeverity,
  { chip: string; icon: React.ComponentType<{ className?: string }> }
> = {
  critical: {
    chip: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: AlertOctagon,
  },
  warning: {
    chip: "border-warning/30 bg-warning/10 text-warning",
    icon: AlertTriangle,
  },
  info: {
    chip: "border-border/60 bg-muted text-muted-foreground",
    icon: Info,
  },
};

const SEVERITY_LABEL: Record<DqSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

export function DataQualityCard({ loading, issues, onIssueClick }: DataQualityCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const summary = React.useMemo(() => summariseIssues(issues), [issues]);

  const visibleIssues = expanded ? issues : issues.slice(0, 3);
  const hasMore = issues.length > 3;

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
              Data quality
            </div>
            <h2 className="font-serif text-2xl font-semibold text-foreground">
              {loading
                ? "Checking your data…"
                : summary.total === 0
                  ? "No issues found"
                  : `${summary.total} ${summary.total === 1 ? "issue" : "issues"} to review`}
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
      ) : issues.length === 0 ? (
        <div className="flex items-center gap-3 p-6">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <p className="text-sm text-muted-foreground">
            All logged data passes the basic quality checks. Nothing to fix.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {visibleIssues.map((issue) => {
              const sev = severityStyle[issue.severity];
              const Icon = sev.icon;
              return (
                <li key={issue.id}>
                  <button
                    type="button"
                    onClick={() => onIssueClick(issue)}
                    className="group flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <span
                      className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${sev.chip}`}
                      aria-label={SEVERITY_LABEL[issue.severity]}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-medium text-foreground">
                          {issue.title}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          · {issue.hotelName}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {issue.detail}
                      </p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </button>
                </li>
              );
            })}
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
                  Show all {issues.length} issues <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function SeverityPill({ severity, count }: { severity: DqSeverity; count: number }) {
  const sev = severityStyle[severity];
  const Icon = sev.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${sev.chip}`}
    >
      <Icon className="h-3 w-3" />
      {count} {SEVERITY_LABEL[severity].toLowerCase()}
    </span>
  );
}
