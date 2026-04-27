import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Sun, Building2, Sparkles } from "lucide-react";
import { DesignModeSwitcher } from "@/components/design-mode-switcher";
import { cn } from "@/lib/utils";

/**
 * Slim sticky header used on every /easy screen.
 * Gives the user two clear destinations — "Home" (the long page)
 * and "Hotel" (the focused workspace) — so capabilities are not hidden.
 */
const NAV: {
  to: "/easy" | "/easy/workspace";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { to: "/easy", label: "Home", icon: Sun },
  { to: "/easy/workspace", label: "Hotel", icon: Building2 },
];

function isActive(navTo: string, pathname: string) {
  if (navTo === "/easy") return pathname === "/easy" || pathname === "/easy/";
  return pathname === navTo || pathname.startsWith(`${navTo}/`);
}

export function EasyHeader() {
  const location = useLocation();
  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-3">
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
          <nav
            aria-label="Extra simple sections"
            className="hidden rounded-full border border-border/60 bg-card/70 p-1 sm:flex"
          >
            {NAV.map((item) => {
              const active = isActive(item.to, location.pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <DesignModeSwitcher />
        </div>
      </div>

      {/* Mobile nav strip — visible under the logo so the two destinations are obvious */}
      <nav
        aria-label="Extra simple sections"
        className="border-t border-border/40 bg-background/70 sm:hidden"
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-3 py-1.5">
          {NAV.map((item) => {
            const active = isActive(item.to, location.pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

/**
 * Small inline component used in the body of /easy pages to invite the user
 * into the hotel workspace (or back to home), in addition to the header nav.
 */
export function EasyCrossLink({
  to,
  label,
  hint,
}: {
  to: "/easy" | "/easy/workspace";
  label: string;
  hint: string;
}) {
  const Icon = to === "/easy" ? Sun : Building2;
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
