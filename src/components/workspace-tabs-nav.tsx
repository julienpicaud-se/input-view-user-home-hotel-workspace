import { Link } from "@tanstack/react-router";
import { HotelSwitcher } from "@/components/hotel-switcher";

type TabKey = "overview" | "log" | "analyze" | "benchmarks";

const TABS: { key: TabKey; label: string; to: string; search?: Record<string, string> }[] = [
  { key: "overview", label: "Overview", to: "/", search: { tab: "overview" } },
  { key: "log", label: "Log data", to: "/", search: { tab: "log" } },
  { key: "analyze", label: "Hotel Insights", to: "/", search: { tab: "analyze" } },
  { key: "benchmarks", label: "Peers Benchmark", to: "/benchmarks" },
];

export function WorkspaceTabsNav({ active }: { active: TabKey }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex h-auto w-full justify-start gap-1 rounded-2xl border border-border bg-card p-1.5 sm:w-auto">
        {TABS.map((t) => {
          const isActive = t.key === active;
          const className = `inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            isActive
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`;
          return (
            <Link
              key={t.key}
              to={t.to}
              search={t.search as never}
              className={className}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <HotelSwitcher />
    </div>
  );
}
