import * as React from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, ClipboardList, Sparkles, Settings2, ArrowLeft, HelpCircle, Building2 } from "lucide-react";
import { DesignModeSwitcher } from "@/components/design-mode-switcher";
import { HotelSwitcher } from "@/components/hotel-switcher";
import { cn } from "@/lib/utils";

/**
 * Top-level shell for the Simple design mode.
 * Goal: feel like a friendly app you might use once a month.
 *  - Calm, lots of whitespace.
 *  - One job per screen.
 *  - Clear "where am I" + "how do I go back".
 *  - Big buttons, plain English labels.
 */

interface SimpleShellProps {
  children: React.ReactNode;
  /** Page title shown in the header. */
  title: string;
  /** Optional friendly subtitle. */
  subtitle?: string;
  /** When true, show a back arrow that returns to /simple. */
  showBack?: boolean;
  /** Optional help text rendered in a small help popover. */
  help?: string;
}

const NAV: { to: "/simple" | "/simple/workspace" | "/simple/log" | "/simple/insights" | "/simple/settings"; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { to: "/simple", label: "Home", icon: Home },
  { to: "/simple/workspace", label: "Hotel", icon: Building2 },
  { to: "/simple/log", label: "Add this month", icon: ClipboardList },
  { to: "/simple/insights", label: "How am I doing?", icon: Sparkles },
  { to: "/simple/settings", label: "Settings", icon: Settings2 },
];

export function SimpleShell({ children, title, subtitle, showBack, help }: SimpleShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Top header — calm, generous spacing */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-3 md:py-4">
          <Link to="/simple" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <span className="font-serif text-lg font-semibold">A</span>
            </div>
            <div className="leading-tight">
              <div className="font-serif text-lg">RA+</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Simple view
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden md:block">
              <HotelSwitcher />
            </div>
            <DesignModeSwitcher />
          </div>
        </div>

        {/* Bottom nav strip on desktop, hidden on small screens (mobile uses bottom bar) */}
        <nav className="hidden border-t border-border/40 bg-background/60 md:block">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-5 py-2">
            {NAV.map((item) => {
              const active =
                item.to === "/simple"
                  ? location.pathname === "/simple"
                  : location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-3xl px-5 pb-32 pt-6 md:pt-10">
        {/* Page header */}
        <div className="mb-6 md:mb-10">
          {showBack && (
            <button
              type="button"
              onClick={() => navigate({ to: "/simple" })}
              className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to home
            </button>
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground md:text-4xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-2 text-sm text-muted-foreground md:text-base">
                  {subtitle}
                </p>
              )}
            </div>
            {help && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setHelpOpen((v) => !v)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Help"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
                {helpOpen && (
                  <div className="absolute right-0 top-11 z-20 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-4 text-sm text-popover-foreground shadow-xl">
                    <div className="mb-1 font-serif text-base">Need a hand?</div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{help}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {children}
      </main>

      {/* Bottom nav for mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur md:hidden">
        <div className="mx-auto flex w-full max-w-5xl items-stretch justify-around px-2 py-1.5">
          {NAV.map((item) => {
            const active =
              item.to === "/simple"
                ? location.pathname === "/simple"
                : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
