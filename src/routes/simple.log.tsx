import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import {
  Bolt,
  Flame,
  Droplets,
  Trash2,
  BedDouble,
  Save,
  CheckCircle2,
  Loader2,
  Mic,
  Upload,
  Wand2,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { MONTH_NAMES } from "@/lib/format";
import { SimpleShell } from "@/components/simple-shell";
import { InvoiceUploadCard } from "@/components/invoice-upload-card";
import { VoiceLogCard } from "@/components/voice-log-card";
import { SmartPasteCard } from "@/components/smart-paste-card";

export const Route = createFileRoute("/simple/log")({
  head: () => ({
    meta: [
      { title: "Add this month — RA+ (Simple)" },
      {
        name: "description",
        content:
          "Log last month's electricity, gas, water, waste and occupancy in plain numbers.",
      },
    ],
  }),
  component: SimpleLogPage,
});

function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

interface FieldDef {
  key: keyof Pick<
    MonthlyEntry,
    "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg" | "occupied_room_nights"
  >;
  label: string;
  hint: string;
  unit: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const FIELDS: FieldDef[] = [
  {
    key: "electricity_kwh",
    label: "Electricity",
    hint: "Total kWh from your electricity bill.",
    unit: "kWh",
    Icon: Bolt,
  },
  {
    key: "gas_kwh",
    label: "Gas",
    hint: "Total kWh from your gas bill (or 0 if none).",
    unit: "kWh",
    Icon: Flame,
  },
  {
    key: "water_m3",
    label: "Water",
    hint: "Cubic metres used over the month.",
    unit: "m³",
    Icon: Droplets,
  },
  {
    key: "waste_kg",
    label: "Waste",
    hint: "Total kilograms of waste collected.",
    unit: "kg",
    Icon: Trash2,
  },
  {
    key: "occupied_room_nights",
    label: "Occupied room-nights",
    hint: "How many room-nights were sold this month.",
    unit: "nights",
    Icon: BedDouble,
  },
];

type Values = Record<FieldDef["key"], string>;

function SimpleLogPage() {
  const navigate = useNavigate();
  const [hotel, setHotel] = React.useState<Hotel | null>(null);
  const [existing, setExisting] = React.useState<MonthlyEntry | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [values, setValues] = React.useState<Values>({
    electricity_kwh: "",
    gas_kwh: "",
    water_m3: "",
    waste_kg: "",
    occupied_room_nights: "",
  });

  const expected = expectedReportingPeriod();
  const monthLabel = `${MONTH_NAMES[expected.month - 1]} ${expected.year}`;

  React.useEffect(() => {
    void (async () => {
      const hotelId = getActiveHotelId();
      const [{ data: h }, { data: e }] = await Promise.all([
        supabase.from("hotels").select("*").eq("id", hotelId).maybeSingle(),
        supabase
          .from("monthly_entries")
          .select("*")
          .eq("hotel_id", hotelId)
          .eq("year", expected.year)
          .eq("month", expected.month)
          .maybeSingle(),
      ]);
      setHotel(h as Hotel | null);
      const entry = e as MonthlyEntry | null;
      setExisting(entry);
      if (entry) {
        setValues({
          electricity_kwh: entry.electricity_kwh?.toString() ?? "",
          gas_kwh: entry.gas_kwh?.toString() ?? "",
          water_m3: entry.water_m3?.toString() ?? "",
          waste_kg: entry.waste_kg?.toString() ?? "",
          occupied_room_nights: entry.occupied_room_nights?.toString() ?? "",
        });
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filledCount = Object.values(values).filter((v) => v.trim() !== "").length;

  async function handleSave() {
    if (!hotel) return;
    setSaving(true);
    const num = (s: string): number | null => {
      const v = s.trim();
      if (v === "") return null;
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const payload = {
      hotel_id: hotel.id,
      year: expected.year,
      month: expected.month,
      electricity_kwh: num(values.electricity_kwh),
      gas_kwh: num(values.gas_kwh),
      water_m3: num(values.water_m3),
      waste_kg: num(values.waste_kg),
      occupied_room_nights: num(values.occupied_room_nights),
    };
    const { error } = existing
      ? await supabase
          .from("monthly_entries")
          .update(payload)
          .eq("id", existing.id)
      : await supabase.from("monthly_entries").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Could not save. Try again in a moment.");
      return;
    }
    toast.success(`${monthLabel} saved for ${hotel.name}.`);
    void navigate({ to: "/simple" });
  }

  return (
    <SimpleShell
      title={`Add ${monthLabel}`}
      subtitle={
        loading
          ? "Loading…"
          : hotel
            ? `For ${hotel.name}. Fill in what you know — you can save and come back to add the rest.`
            : "Pick a hotel from the top, then add this month's data."
      }
      showBack
      help="You don't have to fill in every field at once. Whatever you save here goes to the same place as the Classic view, so you can switch between the two whenever you want."
    >
      {/* Quick-entry shortcuts */}
      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <ShortcutCard
          icon={Upload}
          title="Upload bills"
          subtitle="We'll read the numbers for you."
          onClick={() => void navigate({ to: "/workspace", search: { tab: "log" } })}
        />
        <ShortcutCard
          icon={Mic}
          title="Read it out"
          subtitle="Speak the numbers, we'll fill the form."
          onClick={() => void navigate({ to: "/workspace", search: { tab: "log" } })}
        />
        <ShortcutCard
          icon={Wand2}
          title="Paste from email"
          subtitle="Drop your supplier's text and we'll parse."
          onClick={() => void navigate({ to: "/workspace", search: { tab: "log" } })}
        />
      </section>

      {/* The form */}
      <section className="rounded-3xl border border-border/60 bg-card p-5 md:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Or type it in here
          </h2>
          <span className="text-xs text-muted-foreground">
            {filledCount} of {FIELDS.length} filled
          </span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/40" />
            ))}
          </div>
        ) : (
          <ul className="space-y-3">
            {FIELDS.map((f) => (
              <FieldRow
                key={f.key}
                field={f}
                value={values[f.key]}
                onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              />
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Saved to your account. You can edit later in History.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !hotel || filledCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : existing ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving…" : existing ? "Update this month" : "Save this month"}
          </button>
        </div>
      </section>
    </SimpleShell>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const { Icon } = field;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <label className="block text-sm font-medium text-foreground">{field.label}</label>
        <p className="text-xs text-muted-foreground">{field.hint}</p>
      </div>
      <div className="flex items-center gap-2 sm:w-56">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className="num w-full rounded-xl border border-input bg-card px-3 py-2.5 text-right text-base font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="w-12 text-xs text-muted-foreground">{field.unit}</span>
      </div>
    </li>
  );
}

function ShortcutCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
