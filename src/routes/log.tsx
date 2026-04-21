import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import {
  Bolt,
  Flame,
  Droplets,
  Trash2,
  Users,
  CheckCircle2,
  ArrowRight,
  Info,
  Loader2,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_HOTEL_ID, type MonthlyEntry } from "@/lib/hotel";
import { MONTH_NAMES, formatNumber, pctChange, formatPct } from "@/lib/format";
import { PageContainer, PageHeader } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/log")({
  head: () => ({
    meta: [
      { title: "Log monthly data — RA+" },
      {
        name: "description",
        content: "Enter your hotel's monthly utility consumption in two minutes.",
      },
    ],
  }),
  component: LogPage,
});

const entrySchema = z.object({
  year: z.number().int().min(2020).max(2030),
  month: z.number().int().min(1).max(12),
  electricity_kwh: z.number().min(0).max(10_000_000).nullable(),
  gas_kwh: z.number().min(0).max(10_000_000).nullable(),
  water_m3: z.number().min(0).max(1_000_000).nullable(),
  waste_kg: z.number().min(0).max(10_000_000).nullable(),
  occupied_room_nights: z.number().int().min(0).max(100_000).nullable(),
  renewable_pct: z.number().min(0).max(100).nullable(),
  recycled_pct: z.number().min(0).max(100).nullable(),
  notes: z.string().max(2000).nullable(),
});

type FormState = {
  year: number;
  month: number;
  electricity_kwh: string;
  gas_kwh: string;
  water_m3: string;
  waste_kg: string;
  occupied_room_nights: string;
  renewable_pct: string;
  recycled_pct: string;
  notes: string;
};

function LogPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [form, setForm] = React.useState<FormState>(() => {
    const now = new Date();
    let m = now.getMonth(); // previous month (zero-indexed = current-1)
    let y = now.getFullYear();
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    return {
      year: y,
      month: m,
      electricity_kwh: "",
      gas_kwh: "",
      water_m3: "",
      waste_kg: "",
      occupied_room_nights: "",
      renewable_pct: "",
      recycled_pct: "",
      notes: "",
    };
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    void supabase
      .from("monthly_entries")
      .select("*")
      .eq("hotel_id", DEMO_HOTEL_ID)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .then(({ data }) => setEntries((data as MonthlyEntry[]) ?? []));
  }, []);

  // Default selected period to most recent unlogged month
  React.useEffect(() => {
    if (entries.length === 0) return;
    const now = new Date();
    const targetY = now.getFullYear();
    const targetM = now.getMonth() === 0 ? 12 : now.getMonth();
    const targetYY = now.getMonth() === 0 ? targetY - 1 : targetY;
    // walk backwards 24 months from current to find first unlogged
    for (let i = 0; i < 24; i++) {
      const d = new Date(targetYY, targetM - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (!entries.find((e) => e.year === y && e.month === m)) {
        setForm((f) => ({ ...f, year: y, month: m }));
        break;
      }
    }
  }, [entries]);

  const prevEntry = entries.find(
    (e) =>
      (e.year === form.year && e.month === form.month - 1) ||
      (form.month === 1 && e.year === form.year - 1 && e.month === 12)
  );

  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const liveValues = {
    electricity_kwh: num(form.electricity_kwh),
    gas_kwh: num(form.gas_kwh),
    water_m3: num(form.water_m3),
    waste_kg: num(form.waste_kg),
    occupied_room_nights: num(form.occupied_room_nights),
    renewable_pct: num(form.renewable_pct),
    recycled_pct: num(form.recycled_pct),
  };

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const parsed = entrySchema.parse({
        year: form.year,
        month: form.month,
        electricity_kwh: liveValues.electricity_kwh,
        gas_kwh: liveValues.gas_kwh,
        water_m3: liveValues.water_m3,
        waste_kg: liveValues.waste_kg,
        occupied_room_nights: liveValues.occupied_room_nights,
        renewable_pct: liveValues.renewable_pct,
        recycled_pct: liveValues.recycled_pct,
        notes: form.notes.trim() === "" ? null : form.notes.trim(),
      });

      const { error } = await supabase.from("monthly_entries").upsert(
        {
          hotel_id: DEMO_HOTEL_ID,
          ...parsed,
        },
        { onConflict: "hotel_id,year,month" }
      );
      if (error) throw error;
      setSuccess(true);
      toast.success("Saved", {
        description: `${MONTH_NAMES[form.month - 1]} ${form.year} data logged successfully.`,
      });
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues[0].message : "Could not save data";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <PageContainer>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto max-w-xl py-16 text-center"
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h1 className="mt-6 font-serif text-4xl font-semibold">All saved.</h1>
          <p className="mt-3 text-muted-foreground">
            {MONTH_NAMES[form.month - 1]} {form.year} data is in your dashboard.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild className="rounded-xl">
              <Link to="/">View on dashboard</Link>
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setSuccess(false);
                void navigate({ to: "/log" });
              }}
            >
              Log another month
            </Button>
          </div>
        </motion.div>
      </PageContainer>
    );
  }

  const years = [2024, 2025, 2026];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Monthly entry"
        title="Log this month's data"
        subtitle="It only takes 2 minutes. Enter what you have — you can always add more later."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card className="rounded-2xl border-border/70 p-6">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Period
            </Label>
            <div className="mt-3 flex gap-3">
              <Select
                value={String(form.month)}
                onValueChange={(v) => setForm((f) => ({ ...f, month: Number(v) }))}
              >
                <SelectTrigger className="w-44 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((n, i) => (
                    <SelectItem key={n} value={String(i + 1)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(form.year)}
                onValueChange={(v) => setForm((f) => ({ ...f, year: Number(v) }))}
              >
                <SelectTrigger className="w-32 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          <UtilityCard
            icon={Bolt}
            color="var(--chart-3)"
            title="Electricity"
            unit="kWh"
            helper="Found on your electricity bill — usually labelled 'Total consumption' or 'kWh used'."
            value={form.electricity_kwh}
            onChange={(v) => setForm((f) => ({ ...f, electricity_kwh: v }))}
            extra={
              <ExtraField
                label="Renewable share"
                unit="%"
                value={form.renewable_pct}
                onChange={(v) => setForm((f) => ({ ...f, renewable_pct: v }))}
                hint="Optional — % from solar, wind or green tariff."
              />
            }
          />

          <UtilityCard
            icon={Flame}
            color="var(--chart-1)"
            title="Gas"
            unit="kWh"
            helper="From your gas supplier statement. If shown in m³, multiply by ~10.5 to get kWh."
            value={form.gas_kwh}
            onChange={(v) => setForm((f) => ({ ...f, gas_kwh: v }))}
          />

          <UtilityCard
            icon={Droplets}
            color="var(--chart-2)"
            title="Water"
            unit="m³"
            helper="From your water bill. 1 m³ = 1,000 litres."
            value={form.water_m3}
            onChange={(v) => setForm((f) => ({ ...f, water_m3: v }))}
          />

          <UtilityCard
            icon={Trash2}
            color="var(--chart-5)"
            title="Waste"
            unit="kg"
            helper="Total weight from your waste collection invoice."
            value={form.waste_kg}
            onChange={(v) => setForm((f) => ({ ...f, waste_kg: v }))}
            extra={
              <ExtraField
                label="Recycled share"
                unit="%"
                value={form.recycled_pct}
                onChange={(v) => setForm((f) => ({ ...f, recycled_pct: v }))}
                hint="Optional — % diverted from landfill."
              />
            }
          />

          <Card className="rounded-2xl border-border/70 p-6">
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: "color-mix(in oklab, var(--secondary) 15%, transparent)" }}
              >
                <Users className="h-5 w-5" style={{ color: "var(--secondary)" }} />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-semibold">Occupancy</h3>
                <p className="text-sm text-muted-foreground">
                  Occupied room-nights — used to compare you fairly against
                  similar hotels.
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-3">
              <Input
                type="number"
                value={form.occupied_room_nights}
                onChange={(e) =>
                  setForm((f) => ({ ...f, occupied_room_nights: e.target.value }))
                }
                placeholder="0"
                className="num h-14 rounded-xl border-border bg-background text-2xl font-medium"
              />
              <span className="text-sm text-muted-foreground">room-nights</span>
            </div>
          </Card>

          <Card className="rounded-2xl border-border/70 p-6">
            <Label className="text-sm font-medium">Notes (optional)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Boiler service in week 2, unusually hot weekend…"
              className="mt-2 min-h-[80px] rounded-xl"
            />
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-xl px-6 py-6 text-base"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save {MONTH_NAMES[form.month - 1]} {form.year}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <Card className="rounded-2xl border-border/70 bg-secondary/5 p-6">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Live comparison
            </div>
            <h3 className="mt-1 font-serif text-xl font-semibold">
              {MONTH_NAMES[form.month - 1]} vs{" "}
              {prevEntry
                ? MONTH_NAMES[prevEntry.month - 1]
                : "previous month"}
            </h3>
            <div className="mt-4 space-y-3">
              <PreviewRow
                label="Electricity"
                unit="kWh"
                cur={liveValues.electricity_kwh}
                prev={prevEntry?.electricity_kwh ?? null}
              />
              <PreviewRow
                label="Gas"
                unit="kWh"
                cur={liveValues.gas_kwh}
                prev={prevEntry?.gas_kwh ?? null}
              />
              <PreviewRow
                label="Water"
                unit="m³"
                cur={liveValues.water_m3}
                prev={prevEntry?.water_m3 ?? null}
              />
              <PreviewRow
                label="Waste"
                unit="kg"
                cur={liveValues.waste_kg}
                prev={prevEntry?.waste_kg ?? null}
              />
            </div>
            <div className="mt-5 h-px gold-divider opacity-60" />
            <p className="mt-4 text-xs text-muted-foreground">
              Numbers update as you type. We never share your raw data — peers
              see anonymised aggregates only.
            </p>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function UtilityCard({
  icon: Icon,
  color,
  title,
  unit,
  helper,
  value,
  onChange,
  extra,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  unit: string;
  helper: string;
  value: string;
  onChange: (v: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-border/70 p-6">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)` }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-lg font-semibold">{title}</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{helper}</TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm text-muted-foreground">{helper}</p>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-3">
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="num h-14 rounded-xl border-border bg-background text-2xl font-medium"
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>

      {extra}

      <button
        type="button"
        className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <Paperclip className="h-3.5 w-3.5" />
        Attach bill (optional)
      </button>
    </Card>
  );
}

function ExtraField({
  label,
  unit,
  value,
  onChange,
  hint,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="num h-9 rounded-lg bg-background"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  unit,
  cur,
  prev,
}: {
  label: string;
  unit: string;
  cur: number | null;
  prev: number | null;
}) {
  const change = pctChange(cur, prev);
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">
          prev {prev === null ? "—" : `${formatNumber(prev)} ${unit}`}
        </div>
      </div>
      <div className="text-right">
        <div className="num font-serif text-lg font-semibold">
          {cur === null ? "—" : `${formatNumber(cur)}`}
          <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
        </div>
        {change !== null && (
          <div
            className={`text-xs font-medium ${
              change < 0 ? "text-success" : change > 0 ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {formatPct(change)}
          </div>
        )}
      </div>
    </div>
  );
}
