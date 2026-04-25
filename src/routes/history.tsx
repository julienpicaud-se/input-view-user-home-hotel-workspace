import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type MonthlyEntry } from "@/lib/hotel";
import {
  MONTH_SHORT,
  calculateCO2e,
  formatNumber,
} from "@/lib/format";
import { PageContainer, PageHeader } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type HighlightField =
  | "electricity_kwh"
  | "gas_kwh"
  | "water_m3"
  | "waste_kg"
  | "occupied_room_nights";

interface HistorySearch {
  hy?: number;
  hm?: number;
  hf?: HighlightField;
}

const FIELD_KEYS: HighlightField[] = [
  "electricity_kwh",
  "gas_kwh",
  "water_m3",
  "waste_kg",
  "occupied_room_nights",
];

export const Route = createFileRoute("/history")({
  validateSearch: (search: Record<string, unknown>): HistorySearch => {
    const out: HistorySearch = {};
    if (typeof search.hy === "number") out.hy = search.hy;
    else if (typeof search.hy === "string" && /^\d+$/.test(search.hy))
      out.hy = Number(search.hy);
    if (typeof search.hm === "number") out.hm = search.hm;
    else if (typeof search.hm === "string" && /^\d+$/.test(search.hm))
      out.hm = Number(search.hm);
    if (typeof search.hf === "string" && (FIELD_KEYS as string[]).includes(search.hf))
      out.hf = search.hf as HighlightField;
    return out;
  },
  head: () => ({
    meta: [
      { title: "History — RA+" },
      {
        name: "description",
        content: "All your monthly utility entries in one editable table.",
      },
    ],
  }),
  component: HistoryPage,
});

interface Row {
  year: number;
  month: number;
  entry?: MonthlyEntry;
}

const FIELD_TO_COL: Record<HighlightField, number> = {
  electricity_kwh: 1,
  gas_kwh: 2,
  water_m3: 3,
  waste_kg: 4,
  occupied_room_nights: 5,
};

function HistoryPage() {
  const search = Route.useSearch();
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [filterYear, setFilterYear] = React.useState<string>("all");
  const [edited, setEdited] = React.useState<Record<string, Partial<MonthlyEntry>>>({});
  const [saving, setSaving] = React.useState(false);
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({});
  const [highlightKey, setHighlightKey] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    void supabase
      .from("monthly_entries")
      .select("*")
      .eq("hotel_id", getActiveHotelId())
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .then(({ data }) => setEntries((data as MonthlyEntry[]) ?? []));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const rows: Row[] = React.useMemo(() => {
    const now = new Date();
    const out: Row[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const entry = entries.find((e) => e.year === y && e.month === m);
      out.push({ year: y, month: m, entry });
    }
    return out;
  }, [entries]);

  const filtered = filterYear === "all" ? rows : rows.filter((r) => r.year === Number(filterYear));

  const years = Array.from(new Set(rows.map((r) => r.year)));

  const cellKey = (y: number, m: number) => `${y}-${m}`;

  // Scroll to and highlight the targeted row/cell once entries are loaded
  React.useEffect(() => {
    if (!search.hy || !search.hm) return;
    if (entries.length === 0) return;
    const k = cellKey(search.hy, search.hm);
    // Ensure the row's year is visible if a year filter is set
    if (filterYear !== "all" && Number(filterYear) !== search.hy) {
      setFilterYear("all");
    }
    // Wait a tick for render
    const t = window.setTimeout(() => {
      const el = rowRefs.current[k];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightKey(k);
        // Focus the targeted input field if specified
        if (search.hf) {
          const colIndex = FIELD_TO_COL[search.hf];
          const input = el.querySelectorAll<HTMLInputElement>("input")[colIndex - 1];
          input?.focus();
          input?.select();
        }
        // Auto-fade highlight after 4s
        window.setTimeout(() => setHighlightKey(null), 4000);
      }
    }, 100);
    return () => window.clearTimeout(t);
  }, [search.hy, search.hm, search.hf, entries.length, filterYear]);

  function getValue(r: Row, key: keyof MonthlyEntry): number | null {
    const k = cellKey(r.year, r.month);
    if (k in edited && key in edited[k]!) {
      const v = edited[k]![key];
      return typeof v === "number" ? v : v === null ? null : null;
    }
    return (r.entry?.[key] as number | null) ?? null;
  }

  function setValue(r: Row, key: keyof MonthlyEntry, value: string) {
    const k = cellKey(r.year, r.month);
    const num = value.trim() === "" ? null : Number(value);
    setEdited((prev) => ({
      ...prev,
      [k]: { ...prev[k], [key]: num },
    }));
  }

  async function saveChanges() {
    setSaving(true);
    try {
      const records = Object.entries(edited).map(([k, vals]) => {
        const [y, m] = k.split("-").map(Number);
        const existing = entries.find((e) => e.year === y && e.month === m);
        return {
          hotel_id: getActiveHotelId(),
          year: y,
          month: m,
          electricity_kwh: existing?.electricity_kwh ?? null,
          gas_kwh: existing?.gas_kwh ?? null,
          water_m3: existing?.water_m3 ?? null,
          waste_kg: existing?.waste_kg ?? null,
          occupied_room_nights: existing?.occupied_room_nights ?? null,
          renewable_pct: existing?.renewable_pct ?? null,
          recycled_pct: existing?.recycled_pct ?? null,
          ...vals,
        };
      });
      const { error } = await supabase
        .from("monthly_entries")
        .upsert(records, { onConflict: "hotel_id,year,month" });
      if (error) throw error;
      toast.success(`Saved ${records.length} change${records.length === 1 ? "" : "s"}`);
      setEdited({});
      load();
    } catch {
      toast.error("Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  function exportCSV() {
    const headers = [
      "Year",
      "Month",
      "Electricity (kWh)",
      "Gas (kWh)",
      "Water (m³)",
      "Waste (kg)",
      "Occupied room-nights",
      "Renewable %",
      "Recycled %",
      "CO2e (kg)",
    ];
    const lines = [headers.join(",")];
    filtered.forEach((r) => {
      if (!r.entry) return;
      lines.push(
        [
          r.year,
          r.month,
          r.entry.electricity_kwh ?? "",
          r.entry.gas_kwh ?? "",
          r.entry.water_m3 ?? "",
          r.entry.waste_kg ?? "",
          r.entry.occupied_room_nights ?? "",
          r.entry.renewable_pct ?? "",
          r.entry.recycled_pct ?? "",
          calculateCO2e(r.entry).toFixed(0),
        ].join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `verdance-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const editedCount = Object.keys(edited).length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="History"
        title="All entries"
        subtitle="The last 24 months of utility data. Click any cell to edit; not-logged months show a quick-add link."
        actions={
          <>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-32 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCSV} className="rounded-xl">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </>
        }
      />

      {editedCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-accent bg-accent/15 px-4 py-3">
          <span className="text-sm">
            {editedCount} unsaved change{editedCount === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEdited({})}>
              Discard
            </Button>
            <Button size="sm" onClick={saveChanges} disabled={saving} className="rounded-lg">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden rounded-2xl border-border/70 p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/95 px-4 py-3 font-medium backdrop-blur-sm">Period</th>
                <th className="px-4 py-3 font-medium">Electricity</th>
                <th className="px-4 py-3 font-medium">Gas</th>
                <th className="px-4 py-3 font-medium">Water</th>
                <th className="px-4 py-3 font-medium">Waste</th>
                <th className="px-4 py-3 font-medium">Occupancy</th>
                <th className="px-4 py-3 font-medium">CO₂e</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const k = cellKey(r.year, r.month);
                const isLogged = !!r.entry || k in edited;
                const co2 = r.entry ? calculateCO2e(r.entry) : null;
                const isHighlighted = highlightKey === k;
                return (
                  <tr
                    key={k}
                    ref={(el) => {
                      rowRefs.current[k] = el;
                    }}
                    className={`border-t border-border transition-colors ${
                      isHighlighted
                        ? "bg-warning/15 ring-2 ring-warning/40"
                        : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                      {MONTH_SHORT[r.month - 1]} {r.year}
                    </td>
                    <CellInput
                      value={getValue(r, "electricity_kwh")}
                      unit="kWh"
                      onChange={(v) => setValue(r, "electricity_kwh", v)}
                      highlighted={isHighlighted && search.hf === "electricity_kwh"}
                    />
                    <CellInput
                      value={getValue(r, "gas_kwh")}
                      unit="kWh"
                      onChange={(v) => setValue(r, "gas_kwh", v)}
                      highlighted={isHighlighted && search.hf === "gas_kwh"}
                    />
                    <CellInput
                      value={getValue(r, "water_m3")}
                      unit="m³"
                      onChange={(v) => setValue(r, "water_m3", v)}
                      highlighted={isHighlighted && search.hf === "water_m3"}
                    />
                    <CellInput
                      value={getValue(r, "waste_kg")}
                      unit="kg"
                      onChange={(v) => setValue(r, "waste_kg", v)}
                      highlighted={isHighlighted && search.hf === "waste_kg"}
                    />
                    <CellInput
                      value={getValue(r, "occupied_room_nights")}
                      unit="rn"
                      onChange={(v) => setValue(r, "occupied_room_nights", v)}
                      highlighted={isHighlighted && search.hf === "occupied_room_nights"}
                    />
                    <td className="num whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                      {co2 ? `${formatNumber(co2)} kg` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {isLogged ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          Logged
                        </span>
                      ) : (
                        <Link
                          to="/log"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Plus className="h-3 w-3" /> Add
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </PageContainer>
  );
}

function CellInput({
  value,
  unit,
  onChange,
  highlighted = false,
}: {
  value: number | null;
  unit: string;
  onChange: (v: string) => void;
  highlighted?: boolean;
}) {
  return (
    <td className="px-2 py-1">
      <div
        className={`group relative flex items-baseline gap-1 rounded-lg px-2 py-1.5 focus-within:bg-card focus-within:ring-1 focus-within:ring-ring ${
          highlighted
            ? "bg-warning/20 ring-2 ring-warning/60"
            : "hover:bg-card"
        }`}
      >
        <input
          type="number"
          value={value === null ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className="num w-20 bg-transparent text-right text-sm tabular-nums focus:outline-none"
        />
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </td>
  );
}
