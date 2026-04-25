import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, LayoutDashboard, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDesignMode, type DesignMode } from "@/lib/design-mode";

/**
 * Dropdown placed at the top-right of the app on every page.
 * Lets the user flip between the original "Classic" experience and
 * the new manager-friendly "Simple" experience without losing any data.
 */
export function DesignModeSwitcher() {
  const { mode, setMode } = useDesignMode();
  const navigate = useNavigate();

  const handleSelect = (next: DesignMode) => {
    if (next === mode) return;
    setMode(next);
    // Send the user to the home of whichever mode they picked so the
    // shell change is immediately obvious.
    if (next === "simple") {
      void navigate({ to: "/simple" });
    } else {
      void navigate({ to: "/" });
    }
  };

  const label = mode === "simple" ? "Simple" : "Classic";
  const Icon = mode === "simple" ? Sparkles : LayoutDashboard;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden sm:inline text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          View
        </span>
        <span>{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-2xl">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Choose your experience
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => handleSelect("classic")}
          className="flex items-start gap-3 rounded-xl py-2.5"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Classic</span>
              {mode === "classic" && (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Full dashboard, charts and pro tools.
            </p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => handleSelect("simple")}
          className="flex items-start gap-3 rounded-xl py-2.5"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Simple</span>
              {mode === "simple" && (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Big buttons, plain language. Made for once-a-month visits.
            </p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
