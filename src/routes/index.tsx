import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import {
  ArrowRight,
  Building2,
  Sparkles,
  BarChart3,
  ClipboardList,
  Users,
  Leaf,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type Hotel } from "@/lib/hotel";
import { PageContainer, PageHeader } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — RA+" },
      {
        name: "description",
        content:
          "Your RA+ home — jump into your hotel workspace, review insights, and manage your portfolio.",
      },
    ],
  }),
  component: HomePage,
});

interface QuickLink {
  title: string;
  description: string;
  to: string;
  search?: Record<string, string>;
  icon: React.ComponentType<{ className?: string }>;
}

const QUICK_LINKS: QuickLink[] = [
  {
    title: "Open hotel workspace",
    description: "Overview, KPIs and trends for your active property.",
    to: "/workspace",
    search: { tab: "overview" },
    icon: BarChart3,
  },
  {
    title: "Add this month's data",
    description: "Log electricity, gas, water, waste and occupancy.",
    to: "/workspace",
    search: { tab: "log" },
    icon: ClipboardList,
  },
  {
    title: "See peer benchmarks",
    description: "Compare your performance against similar hotels.",
    to: "/workspace",
    search: { tab: "benchmarks" },
    icon: Users,
  },
  {
    title: "Hotel insights",
    description: "AI-driven analysis of your sustainability footprint.",
    to: "/workspace",
    search: { tab: "analyze" },
    icon: Sparkles,
  },
];

function HomePage() {
  const [hotel, setHotel] = React.useState<Hotel | null>(null);
  const [hotelCount, setHotelCount] = React.useState<number>(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    void (async () => {
      const activeId = getActiveHotelId();
      const [{ data: h }, { count }] = await Promise.all([
        supabase.from("hotels").select("*").eq("id", activeId).maybeSingle(),
        supabase.from("hotels").select("*", { count: "exact", head: true }),
      ]);
      setHotel(h as Hotel | null);
      setHotelCount(count ?? 0);
      setLoading(false);
    })();
  }, []);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Welcome back"
        title="Your sustainability home"
        subtitle="Pick up where you left off, or jump into a specific area of your hotel workspace."
      />

      {/* Hero card — active hotel */}
      <Card className="overflow-hidden rounded-3xl border-border/60 bg-gradient-to-br from-primary/5 via-card to-accent/10 p-0">
        <div className="grid gap-0 md:grid-cols-[1.4fr_1fr]">
          <div className="p-8 md:p-10">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-primary">
              <Leaf className="h-3 w-3" />
              Active hotel
            </div>
            <h2 className="font-serif text-3xl md:text-4xl font-semibold leading-tight text-foreground">
              {loading
                ? "Loading…"
                : hotel?.name ?? "No hotel selected"}
            </h2>
            {hotel && (
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                {hotel.rooms} rooms
                {hotel.property_type ? ` · ${hotel.property_type}` : ""}
                {hotel.region ? ` · ${hotel.region}` : ""}
              </p>
            )}
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-xl">
                <Link to="/workspace" search={{ tab: "overview" } as never}>
                  Open workspace
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl">
                <Link to="/workspace" search={{ tab: "log" } as never}>
                  Log new data
                </Link>
              </Button>
            </div>
          </div>
          <div className="hidden items-center justify-center border-l border-border/40 bg-card/50 p-10 md:flex">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Building2 className="h-8 w-8" />
              </div>
              <div className="font-serif text-5xl font-semibold text-foreground">
                {hotelCount}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {hotelCount === 1 ? "Property in portfolio" : "Properties in portfolio"}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Quick links */}
      <div className="mt-10">
        <h3 className="mb-4 font-serif text-2xl font-semibold text-foreground">
          Quick actions
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.title}
                to={link.to}
                search={link.search as never}
                className="group block rounded-2xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-base font-semibold text-foreground">
                        {link.title}
                      </h4>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {link.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </PageContainer>
  );
}
