import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { Building2, UserCircle2, History, ArrowRight, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Hotel } from "@/lib/hotel";
import { SimpleShell } from "@/components/simple-shell";

export const Route = createFileRoute("/simple/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RA+ (Simple)" },
      {
        name: "description",
        content: "Manage your hotels, profile and view history.",
      },
    ],
  }),
  component: SimpleSettingsPage,
});

function SimpleSettingsPage() {
  const [hotels, setHotels] = React.useState<Hotel[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("hotels")
        .select("*")
        .order("name", { ascending: true });
      setHotels((data as Hotel[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <SimpleShell
      title="Settings"
      subtitle="Manage your hotels, profile, and look back at older months."
      showBack
      help="Anything you change here applies to both Simple and Classic views — they share the same data."
    >
      {/* Hotels */}
      <section className="mb-10">
        <h2 className="mb-4 font-serif text-xl font-semibold text-foreground md:text-2xl">
          Your hotels
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/40" />
            ))}
          </div>
        ) : hotels.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
            No hotels yet. Open the full settings to add one.
          </div>
        ) : (
          <ul className="space-y-3">
            {hotels.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-base font-semibold text-foreground">
                    {h.name}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {h.region} · {h.rooms} rooms · {h.star_rating}★
                  </p>
                </div>
                <Link
                  to="/workspace"
                  search={{ tab: "settings" } as never}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Edit
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick links to classic settings & history */}
      <section className="grid gap-3 sm:grid-cols-2">
        <SettingsLink
          to="/profile"
          icon={UserCircle2}
          title="Your profile"
          subtitle="Name, time zone, notifications."
        />
        <SettingsLink
          to="/history"
          icon={History}
          title="Past months"
          subtitle="Edit older entries or look back at your data."
        />
        <SettingsLink
          to="/workspace"
          search={{ tab: "settings" } as never}
          icon={Settings2}
          title="Hotel details"
          subtitle="Size, region, star rating used for benchmarks."
        />
        <SettingsLink
          to="/workspace"
          search={{ tab: "log" } as never}
          icon={Building2}
          title="Power tools"
          subtitle="Bill upload, voice logging, smart paste."
        />
      </section>
    </SimpleShell>
  );
}

function SettingsLink({
  to,
  search,
  icon: Icon,
  title,
  subtitle,
}: {
  to: "/profile" | "/history" | "/workspace";
  search?: never;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  const props = search ? { to, search } : { to };
  return (
    <Link
      {...(props as { to: "/profile" | "/history" | "/workspace" })}
      className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
