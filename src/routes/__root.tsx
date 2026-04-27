import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import * as React from "react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/app-sidebar";
import { DesignModeProvider, useDesignMode } from "@/lib/design-mode";
import { DesignModeSwitcher } from "@/components/design-mode-switcher";

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
            Back to Home
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

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/85 px-5 py-4 backdrop-blur-md md:hidden">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="font-serif text-lg font-semibold">A</span>
        </div>
        <div className="leading-tight">
          <div className="font-serif text-lg">RA+</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Sustainability
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-2 text-xs">
        <Link
          to="/"
          className="rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          activeProps={{ className: "rounded-lg px-2.5 py-1.5 bg-primary text-primary-foreground" }}
          activeOptions={{ exact: true }}
        >
          Home
        </Link>
        <Link
          to="/workspace"
          className="rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          activeProps={{ className: "rounded-lg px-2.5 py-1.5 bg-primary text-primary-foreground" }}
        >
          Workspace
        </Link>
        <DesignModeSwitcher />
      </div>
    </header>
  );
}

function RootComponent() {
  return (
    <DesignModeProvider>
      <TooltipProvider delayDuration={200}>
        <ModeAwareShell />
        <Toaster richColors position="top-center" />
      </TooltipProvider>
    </DesignModeProvider>
  );
}

function ModeAwareShell() {
  const { mode, setMode } = useDesignMode();
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const isSimplePath = path === "/simple" || path.startsWith("/simple/");
  const isEasyPath = path === "/easy" || path.startsWith("/easy/");
  const isAIPath = path === "/ai" || path.startsWith("/ai/");
  const isTheoryPath = path === "/theory" || path.startsWith("/theory/");
  const shellMode = isSimplePath
    ? "simple"
    : isEasyPath
      ? "extra-simple"
      : isAIPath
        ? "ai-first"
        : isTheoryPath
          ? "ai-theory"
          : mode;

  // Redirect when the current path doesn't match the active design mode.
  React.useEffect(() => {
    if (isSimplePath && mode !== "simple") {
      setMode("simple");
      return;
    }
    if (isEasyPath && mode !== "extra-simple") {
      setMode("extra-simple");
      return;
    }
    if (isAIPath && mode !== "ai-first") {
      setMode("ai-first");
      return;
    }
    if (isTheoryPath && mode !== "ai-theory") {
      setMode("ai-theory");
      return;
    }
    if (mode === "simple" && !isSimplePath) {
      void navigate({ to: "/simple" });
    } else if (mode === "extra-simple" && !isEasyPath) {
      void navigate({ to: "/easy" });
    } else if (mode === "ai-first" && !isAIPath) {
      void navigate({ to: "/ai" });
    } else if (mode === "ai-theory" && !isTheoryPath) {
      void navigate({ to: "/theory" });
    }
  }, [mode, isSimplePath, isEasyPath, isAIPath, isTheoryPath, navigate, setMode]);

  if (shellMode === "simple" || shellMode === "extra-simple" || shellMode === "ai-first" || shellMode === "ai-theory") {
    // These modes own their own header + nav.
    return <Outlet />;
  }

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        {/* Floating switcher so the user can flip from Standard too. */}
        <div className="pointer-events-none fixed right-4 top-3 z-40 hidden md:block">
          <div className="pointer-events-auto">
            <DesignModeSwitcher />
          </div>
        </div>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

