import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Home, Building2, ChevronLeft, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: "/" | "/workspace" | "/profile";
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
}

const NAV: NavItem[] = [
  { label: "Home", to: "/", icon: Home },
  { label: "Hotel workspace", to: "/workspace", icon: Building2, matchPrefix: "/workspace" },
];

const PROFILE_ITEM: NavItem = {
  label: "Profile & settings",
  to: "/profile",
  icon: UserCircle2,
  matchPrefix: "/profile",
};

const STORAGE_KEY = "ra-plus-sidebar-collapsed";

export function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 border-r border-border/60 bg-card/40 backdrop-blur-sm transition-[width] duration-200 md:flex md:flex-col",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div
        className={cn(
          "flex items-center border-b border-border/60 px-3 py-4",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed && (
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="font-serif text-lg font-semibold">V</span>
            </div>
            <div className="leading-tight">
              <div className="font-serif text-base">RA+</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Sustainability
              </div>
            </div>
          </Link>
        )}
        {collapsed && (
          <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-serif text-lg font-semibold">V</span>
          </Link>
        )}
        {!collapsed && (
          <button
            type="button"
            aria-label="Collapse sidebar"
            onClick={toggle}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV.map((item) => {
          const Icon = item.icon;
          const path = location.pathname;
          const isActive =
            item.to === "/"
              ? path === "/"
              : item.matchPrefix
                ? path === item.matchPrefix || path.startsWith(item.matchPrefix + "/")
                : path === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {collapsed && (
        <div className="border-t border-border/60 p-2">
          <button
            type="button"
            aria-label="Expand sidebar"
            onClick={toggle}
            className="flex h-9 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4 rotate-180" />
          </button>
        </div>
      )}
    </aside>
  );
}
