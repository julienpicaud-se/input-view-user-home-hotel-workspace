import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import {
  Building2,
  UserCircle2,
  Settings2,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Hotel } from "@/lib/hotel";
import { SimpleShell } from "@/components/simple-shell";
import { SimpleHotelEditor } from "@/components/simple-hotel-editor";
import { SimpleProfileEditor } from "@/components/simple-profile-editor";

export const Route = createFileRoute("/simple/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RA+ (Simple)" },
      {
        name: "description",
        content:
          "Edit your hotel details, profile, and past months — all in one calm place.",
      },
    ],
  }),
  component: SimpleSettingsPage,
});

type Section = "hotels" | "history" | "profile";

function SimpleSettingsPage() {
  const [hotels, setHotels] = React.useState<Hotel[]>([]);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [activeHotelId, setActiveHotelId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState<Section | null>("hotels");

  const reload = React.useCallback(async () => {
    const [{ data: hs }, { data: es }] = await Promise.all([
      supabase.from("hotels").select("*").order("name", { ascending: true }),
      supabase
        .from("monthly_entries")
        .select("*")
        .order("year", { ascending: true })
        .order("month", { ascending: true }),
    ]);
    const list = (hs as Hotel[] | null) ?? [];
    setHotels(list);
    setEntries((es as MonthlyEntry[] | null) ?? []);
    setActiveHotelId((prev) => prev ?? list[0]?.id ?? null);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const activeHotel = hotels.find((h) => h.id === activeHotelId) ?? null;
  const activeHotelEntries = React.useMemo(
    () => entries.filter((e) => e.hotel_id === activeHotelId),
    [entries, activeHotelId],
  );

  return (
    <SimpleShell
      title="Settings"
      subtitle="Hotel details, profile, and a place to fix older months."
      showBack
      help="Anything you change here applies everywhere — Simple, Classic and the AI views all share the same data."
    >
      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* HOTELS */}
          <SectionDisclosure
            icon={Building2}
            title="Hotel details"
            subtitle="Rooms, region, star rating and size band."
            open={open === "hotels"}
            onToggle={() =>
              setOpen((v) => (v === "hotels" ? null : "hotels"))
            }
          >
            {hotels.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
                No hotels yet.
              </div>
            ) : (
              <>
                {hotels.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {hotels.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setActiveHotelId(h.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          h.id === activeHotelId
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <Building2 className="h-3 w-3" />
                        {h.name}
                      </button>
                    ))}
                  </div>
                )}
                {activeHotel && (
                  <SimpleHotelEditor
                    hotel={activeHotel}
                    onSaved={(h) =>
                      setHotels((list) =>
                        list.map((x) => (x.id === h.id ? h : x)),
                      )
                    }
                  />
                )}
              </>
            )}
          </SectionDisclosure>

          {/* PROFILE */}
          <SectionDisclosure
            icon={UserCircle2}
            title="Your profile"
            subtitle="Name, time zone, units and reminders."
            open={open === "profile"}
            onToggle={() =>
              setOpen((v) => (v === "profile" ? null : "profile"))
            }
          >
            <SimpleProfileEditor />
          </SectionDisclosure>

          {/* Footer note about other modes */}
          <p className="px-2 pt-2 text-center text-xs text-muted-foreground">
            <Settings2 className="mr-1 inline h-3 w-3 align-[-1px]" />
            Looking for power-user knobs? Switch to Classic from the top-right.
          </p>
        </div>
      )}
    </SimpleShell>
  );
}

function SectionDisclosure({
  icon: Icon,
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border/60 bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
      >
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            open ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-lg font-semibold text-foreground">
            {title}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-border/60 bg-background/50 p-4 md:p-5">
          {children}
        </div>
      )}
    </section>
  );
}
