import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Sun, Building2, Sparkles, LayoutGrid, Hotel } from "lucide-react";
import { DesignModeSwitcher } from "@/components/design-mode-switcher";
import { ProfileTypeSwitcher } from "@/components/profile-type-switcher";
import { cn } from "@/lib/utils";

/**
 * Sticky header for /easy with a prominent two-way toggle between
 * "Portfolio Home" (overview of all hotels) and "Hotel Workspace"
 * (focused single-hotel view). The active view is unmistakable.
 */
type EasyView = "/easy" | "/easy/workspace";

const VIEWS: {
  to: EasyView;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    to: "/easy",
    label: "Home",
    short: "Home",
    icon: LayoutGrid,
    description: "Overview of all your hotels",
  },
  {
    to: "/easy/workspace",
    label: "Hotel Workspace",
    short: "Workspace",
    icon: Hotel,
    description: "Log & analyze one hotel",
  },
];

function isActive(navTo: EasyView, pathname: string) {
  if (navTo === "/easy") return pathname === "/easy" || pathname === "/easy/";
  return pathname === navTo || pathname.startsWith(`${navTo}/`);
}

function useActiveView(): (typeof VIEWS)[number] {
  const location = useLocation();
  return VIEWS.find((v) => isActive(v.to, location.pathname)) ?? VIEWS[0];
}

export function EasyHeader() {
  const location = useLocation();
  const active = useActiveView();
  const ActiveIcon = active.icon;

  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/90 backdrop-blur-md">
      {/* Top row: brand + utilities */}
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-5 py-3">
        <Link to="/easy" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-success/15 text-success">
            <Sun className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="font-serif text-lg">RA+</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Extra simple
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <ProfileTypeSwitcher />
          <DesignModeSwitcher />
        </div>
      </div>

      {/* Toggle row: the main switcher between the two views */}
      <div className="mx-auto w-full max-w-4xl px-5 pb-3">
        <div
          role="tablist"
          aria-label="Switch view"
          className="grid grid-cols-2 gap-1 rounded-2xl border border-border/60 bg-muted/40 p-1"
        >
          {VIEWS.map((view) => {
            const isOn = isActive(view.to, location.pathname);
            const Icon = view.icon;
            return (
              <Link
                key={view.to}
                to={view.to}
                role="tab"
                aria-selected={isOn}
                aria-current={isOn ? "page" : undefined}
                className={cn(
                  "group flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all sm:justify-start sm:px-4",
                  isOn
                    ? "bg-card text-foreground shadow-sm ring-1 ring-primary/30"
                    : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                    isOn
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:bg-card",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-[13px] font-semibold">
                    <span className="sm:hidden">{view.short}</span>
                    <span className="hidden sm:inline">{view.label}</span>
                  </span>
                  <span className="hidden text-[10.5px] font-normal text-muted-foreground sm:block">
                    {view.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>

        {/* Contextual sub-bar — confirms the active view in plain language */}
        <div className="mt-2 flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <ActiveIcon className="h-3 w-3" />
          <span>
            You are viewing:{" "}
            <span className="font-semibold text-foreground">{active.label}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

/**
 * Optional inline cross-link used inside page bodies (e.g. row CTAs).
 */
export function EasyCrossLink({
  to,
  label,
  hint,
}: {
  to: EasyView;
  label: string;
  hint: string;
}) {
  const Icon = to === "/easy" ? LayoutGrid : Building2;
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="text-foreground">{label}</span>
      <span className="text-muted-foreground">— {hint}</span>
      <Sparkles className="h-3 w-3 text-primary opacity-70 transition group-hover:opacity-100" />
    </Link>
  );
}
