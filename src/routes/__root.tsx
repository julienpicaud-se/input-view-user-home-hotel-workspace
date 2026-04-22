import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import appCss from "../styles.css?url";

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
      { title: "RA+ — Sustainability for Hotels" },
      {
        name: "description",
        content:
          "Track gas, electricity, water and waste, benchmark against peers, and get AI-driven sustainability insights for your hotel.",
      },
      { name: "author", content: "RA+" },
      { property: "og:title", content: "RA+ — Sustainability for Hotels" },
      {
        property: "og:description",
        content:
          "A premium sustainability and energy management platform for hotel managers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
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

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 md:px-10">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-serif text-lg font-semibold">V</span>
          </div>
          <div className="leading-tight">
            <div className="font-serif text-lg">RA+</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Hotel workspace
            </div>
          </div>
        </Link>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          All systems live
        </div>
      </div>
    </header>
  );
}

function RootComponent() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen w-full bg-background text-foreground">
        <TopBar />
        <main>
          <Outlet />
        </main>
      </div>
      <Toaster richColors position="top-center" />
    </TooltipProvider>
  );
}
