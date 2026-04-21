import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import appCss from "../styles.css?url";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/log", label: "Log data" },
  { to: "/history", label: "History" },
  { to: "/benchmarks", label: "Benchmarks" },
  { to: "/assistant", label: "Assistant" },
  { to: "/hotel", label: "Hotel" },
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

function RootShell({ children }: { children: ReactNode }) {
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

function TopNav() {
  const location = useLocation();
  const path = location.pathname;
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-5 py-4 md:px-10">
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-serif text-lg font-semibold">V</span>
          </div>
          <div className="hidden sm:block leading-tight">
            <div className="font-serif text-lg">Verdance</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              The Marbella Grand
            </div>
          </div>
        </Link>

        <nav className="flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active =
                item.to === "/" ? path === "/" : path.startsWith(item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={`inline-flex shrink-0 items-center rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

function RootComponent() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen w-full bg-background text-foreground">
        <TopNav />
        <main>
          <Outlet />
        </main>
      </div>
      <Toaster richColors position="top-center" />
    </TooltipProvider>
  );
}
