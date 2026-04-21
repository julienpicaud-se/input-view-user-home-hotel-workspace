import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import {
  LayoutDashboard,
  PenSquare,
  Table2,
  BarChart3,
  Sparkles,
  Hotel,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import appCss from "../styles.css?url";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/log", label: "Log data", icon: PenSquare },
  { to: "/history", label: "History", icon: Table2 },
  { to: "/benchmarks", label: "Benchmarks", icon: BarChart3 },
  { to: "/assistant", label: "AI assistant", icon: Sparkles },
  { to: "/hotel", label: "Hotel profile", icon: Hotel },
] as const;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-7xl font-semibold text-foreground">404</h1>
        <h2 className="mt-4 font-serif text-2xl text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Verdance — Sustainability for Hotels" },
      {
        name: "description",
        content:
          "Track gas, electricity, water and waste, benchmark against peers, and get AI-driven sustainability insights for your hotel.",
      },
      { name: "author", content: "Verdance" },
      { property: "og:title", content: "Verdance — Sustainability for Hotels" },
      {
        property: "og:description",
        content:
          "A premium sustainability and energy management platform for hotel managers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Sidebar() {
  const location = useLocation();
  const path = location.pathname;
  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <span className="font-serif text-xl font-semibold">V</span>
          </div>
          <div>
            <div className="font-serif text-xl leading-tight">Verdance</div>
            <div className="text-xs text-sidebar-foreground/60">
              Sustainability suite
            </div>
          </div>
        </div>
        <div className="mt-6 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/40 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/60">
            Property
          </div>
          <div className="mt-1 font-serif text-base leading-tight">
            The Marbella Grand
          </div>
          <div className="text-xs text-sidebar-foreground/70">
            120 rooms · Mediterranean
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.to === "/" ? path === "/" : path.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                    active
                      ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      active
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/60 group-hover:text-sidebar-primary"
                    }`}
                  />
                  <span>{item.label}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-6 py-6 text-[11px] text-sidebar-foreground/50">
        <div className="mb-2 h-px gold-divider opacity-40" />
        Demo data · v1 preview
      </div>
    </aside>
  );
}

function MobileTopBar() {
  const location = useLocation();
  const path = location.pathname;
  const current =
    NAV_ITEMS.find((i) =>
      i.to === "/" ? path === "/" : path.startsWith(i.to)
    ) ?? NAV_ITEMS[0];
  return (
    <div className="md:hidden sticky top-0 z-30 bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-serif">
            V
          </div>
          <span className="font-serif text-base">Verdance</span>
        </div>
        <span className="text-xs text-sidebar-foreground/70">
          {current.label}
        </span>
      </div>
      <div className="flex overflow-x-auto border-t border-sidebar-border/40">
        {NAV_ITEMS.map((item) => {
          const active =
            item.to === "/" ? path === "/" : path.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs ${
                active
                  ? "text-sidebar-primary font-medium"
                  : "text-sidebar-foreground/70"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function RootComponent() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster richColors position="top-center" />
    </TooltipProvider>
  );
}
