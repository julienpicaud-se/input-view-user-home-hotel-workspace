import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import {
  Building2,
  ClipboardList,
  Sparkles,
  ArrowRight,
  Loader2,
  Bolt,
  Flame,
  Droplets,
  Trash2,
  BedDouble,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Leaf,
  MapPin,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getActiveHotelId,
  setActiveHotelId,
  type Hotel,
  type MonthlyEntry,
} from "@/lib/hotel";
import {
  MONTH_NAMES,
  formatNumber,
  pctChange,
  calculateCO2e,
} from "@/lib/format";
import { SimpleShell } from "@/components/simple-shell";

export const Route = createFileRoute("/simple/workspace")({
  head: () => ({
    meta: [
      { title: "Hotel workspace — RA+ (Simple)" },
      {
        name: "description",
        content:
          "Everything for one hotel in one place: this month's data, last entries, and how you're doing.",
      },
    ],
  }),
  component: SimpleWorkspacePage,
});

function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const FIELDS = [
  { key: "electricity_kwh", label: "Electricity", unit: "kWh", Icon: Bolt },
  { key: "gas_kwh", label: "Gas", unit: "kWh", Icon: Flame },
  { key: "water_m3", label: "Water", unit: "m³", Icon: Droplets },
  { key: "waste_kg", label: "Waste", unit: "kg", Icon: Trash2 },
  { key: "occupied_room_nights", label: "Room-nights", unit: "nights", Icon: BedDouble },
] as const;

function SimpleWorkspacePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [hotels, setHotels] = React.useState<Hotel[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);

  const expected = expectedReportingPeriod();
  const monthLabel = `${MONTH_NAMES[expected.month - 1]} ${expected.year}`;

  React.useEffect(() => {
    void (async () => {
      const [{ data: hotelsData }, { data: entriesData }] = await Promise.all([
        supabase.from("hotels").select("*").order("name", { ascending: true }),
        supabase
          .from("monthly_entries")
          .select("*")
          .order("year", { ascending: true })
          .order("month", { ascending: true }),
      ]);
      const hs = (hotelsData as Hotel[] | null) ?? [];
      setHotels(hs);
      setEntries((entriesData as MonthlyEntry[] | null) ?? []);
      const stored = getActiveHotelId();
      const initial =
        hs.find((h) => h.id === stored)?.id ?? hs[0]?.id ?? null;
      setActiveId(initial);
      if (initial) setActiveHotelId(initial);
      setLoading(false);
    })();
  }, []);

  const hotel = hotels.find((h) => h.id === activeId) ?? null;
  const hotelEntries = entries
    .filter((e) => e.hotel_id === activeId)
    .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
  const thisMonth =
    hotelEntries.find(
      (e) => e.year === expected.year && e.month === expected.month,
    ) ?? null;
  const prevDate = new Date(expected.year, expected.month - 2, 1);
  const lastMonth =
    hotelEntries.find(
      (e) => e.year === prevDate.getFullYear() && e.month === prevDate.getMonth() + 1,
    ) ?? null;
  const filledFields = thisMonth
    ? [
        thisMonth.electricity_kwh,
        thisMonth.gas_kwh,
        thisMonth.water_m3,
        thisMonth.waste_kg,
        thisMonth.occupied_room_nights,
      ].filter((v) => v !== null && v !== undefined && Number(v) > 0).length
    : 0;
  const allDone = filledFields === 5;
  const co2eThis = thisMonth ? calculateCO2e(thisMonth) : 0;
  const co2ePrev = lastMonth ? calculateCO2e(lastMonth) : 0;
  const co2eChange = pctChange(co2eThis, co2ePrev);

  return (
    <SimpleShell
      title={loading ? "Loading hotel…" : hotel?.name ?? "Pick a hotel"}
      subtitle={
        loading
          ? undefined
          : hotel
            ? `Everything we know about this property, just for ${monthLabel}.`
            : "Choose one of your hotels to see its workspace."
      }
      help="The workspace is one focused page for a single hotel: this month's status, last month's numbers, and a button to log new data."
    >
      {/* Hotel switcher chips */}
      {hotels.length > 1 && (
        <section className="mb-6">
          <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Your hotels
          </div>
          <div className="flex flex-wrap gap-1.5">
            {hotels.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setActiveId(h.id);
                  setActiveHotelId(h.id);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  h.id === activeId
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Building2 className="h-3 w-3" />
                {h.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !hotel ? (
        <EmptyHotel />
      ) : (
        <>
          {/* Hotel summary card */}
          <section className="mb-8 overflow-hidden rounded-3xl border border-border/60 bg-card">
            <div className="bg-gradient-to-br from-secondary to-primary px-6 py-7 text-primary-foreground">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-foreground/15 backdrop-blur">
                  <Building2 className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-primary-foreground/70">
                    Property
                  </div>
                  <h2 className="mt-1 font-serif text-2xl font-semibold leading-tight md:text-3xl">
                    {hotel.name}
                  </h2>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-primary-foreground/80">
                    <MapPin className="h-3 w-3" />
                    {hotel.region} · {hotel.rooms} rooms · {hotel.star_rating}★
                  </div>
                </div>
              </div>
            </div>

            {/* This month status */}
            <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
              <StatusCell
                label={`${monthLabel} status`}
                value={
                  allDone
                    ? "Complete"
                    : filledFields > 0
                      ? `${filledFields} of 5 fields`
                      : "Not started"
                }
                tone={allDone ? "success" : filledFields > 0 ? "warning" : "muted"}
                Icon={
                  allDone ? CheckCircle2 : filledFields > 0 ? AlertTriangle : ClipboardList
                }
              />
              <StatusCell
                label={`${monthLabel} carbon`}
                value={
                  thisMonth
                    ? `${formatNumber(Math.round(co2eThis))} kg CO₂e`
                    : "—"
                }
                tone="muted"
                Icon={Leaf}
              />
              <StatusCell
                label="vs last month"
                value={
                  co2eChange == null
                    ? "—"
                    : `${co2eChange > 0 ? "+" : ""}${co2eChange.toFixed(0)}%`
                }
                tone={
                  co2eChange == null
                    ? "muted"
                    : co2eChange <= 0
                      ? "success"
                      : "warning"
                }
                Icon={
                  co2eChange == null
                    ? Leaf
                    : co2eChange <= 0
                      ? TrendingDown
                      : TrendingUp
                }
              />
            </div>
          </section>

          {/* Big actions */}
          <section className="mb-8 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                if (activeId) setActiveHotelId(activeId);
                void navigate({ to: "/simple/log" });
              }}
              className="group flex items-start gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-5 text-left transition-all hover:border-primary/60 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-lg font-semibold text-foreground">
                  {allDone ? `Update ${monthLabel}` : `Add ${monthLabel}`}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Type, paste or upload last month's bills.
                </p>
              </div>
              <ArrowRight className="mt-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </button>
            <Link
              to="/simple/insights"
              className="group flex items-start gap-4 rounded-3xl border border-border/60 bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-lg font-semibold text-foreground">
                  How is this hotel doing?
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  See peer comparison and AI-suggested actions.
                </p>
              </div>
              <ArrowRight className="mt-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          </section>

          {/* Latest 6 entries */}
          <section className="mb-10">
            <h2 className="mb-1 font-serif text-xl font-semibold text-foreground md:text-2xl">
              Recent months
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              The last entries you've logged for {hotel.name}.
            </p>

            {hotelEntries.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
                No data yet. Tap{" "}
                <span className="font-medium text-foreground">Add {monthLabel}</span>{" "}
                to log your first month.
              </div>
            ) : (
              <ul className="space-y-2">
                {hotelEntries.slice(0, 6).map((e) => (
                  <RecentEntryRow key={e.id} entry={e} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </SimpleShell>
  );
}

function StatusCell({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "muted";
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-muted-foreground";
  return (
    <div className="flex items-center gap-3 bg-card px-5 py-4">
      <Icon className={`h-5 w-5 shrink-0 ${toneClass}`} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-sm font-semibold text-foreground">
          {value}
        </div>
      </div>
    </div>
  );
}

function RecentEntryRow({ entry }: { entry: MonthlyEntry }) {
  const period = `${MONTH_NAMES[entry.month - 1]} ${entry.year}`;
  const filled = FIELDS.filter((f) => {
    const v = entry[f.key as keyof MonthlyEntry] as number | null;
    return v !== null && v !== undefined && Number(v) > 0;
  }).length;
  const co2e = calculateCO2e(entry);
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="font-serif text-base font-medium text-foreground">
          {period}
        </div>
        <div className="text-xs text-muted-foreground">
          {filled} of 5 fields · {formatNumber(Math.round(co2e))} kg CO₂e
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {filled === 5 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            <CheckCircle2 className="h-3 w-3" /> Complete
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
            <AlertTriangle className="h-3 w-3" /> Partial
          </span>
        )}
      </div>
    </li>
  );
}

function EmptyHotel() {
  return (
    <div className="rounded-3xl border border-dashed border-border/60 bg-card p-8 text-center">
      <h3 className="font-serif text-lg text-foreground">No hotels yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Add your first hotel in settings to see its workspace.
      </p>
      <Link
        to="/simple/settings"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Open settings
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
