import * as React from "react";
import { Pencil, Save, X, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MONTH_NAMES, formatNumber, calculateCO2e } from "@/lib/format";
import type { MonthlyEntry } from "@/lib/hotel";

const FIELDS: {
  key: keyof Pick<
    MonthlyEntry,
    | "electricity_kwh"
    | "gas_kwh"
    | "water_m3"
    | "waste_kg"
    | "occupied_room_nights"
  >;
  label: string;
  unit: string;
}[] = [
  { key: "electricity_kwh", label: "Electricity", unit: "kWh" },
  { key: "gas_kwh", label: "Gas", unit: "kWh" },
  { key: "water_m3", label: "Water", unit: "m³" },
  { key: "waste_kg", label: "Waste", unit: "kg" },
  { key: "occupied_room_nights", label: "Room-nights", unit: "" },
];

/**
 * Calm, Simple-skin editor for past monthly entries.
 * Lists all entries with an inline edit + save flow.
 */
export function SimpleHistoryEditor({
  entries,
  onChanged,
}: {
  entries: MonthlyEntry[];
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);

  const sorted = React.useMemo(
    () =>
      [...entries].sort(
        (a, b) => (b.year - a.year) * 100 + (b.month - a.month),
      ),
    [entries],
  );

  const visible = showAll ? sorted : sorted.slice(0, 6);

  function startEdit(e: MonthlyEntry) {
    setEditingId(e.id);
    setDraft({
      electricity_kwh: e.electricity_kwh?.toString() ?? "",
      gas_kwh: e.gas_kwh?.toString() ?? "",
      water_m3: e.water_m3?.toString() ?? "",
      waste_kg: e.waste_kg?.toString() ?? "",
      occupied_room_nights: e.occupied_room_nights?.toString() ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  async function save(entry: MonthlyEntry) {
    setSaving(true);
    const num = (s: string): number | null => {
      const v = s.trim();
      if (v === "") return null;
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const updates = {
      electricity_kwh: num(draft.electricity_kwh),
      gas_kwh: num(draft.gas_kwh),
      water_m3: num(draft.water_m3),
      waste_kg: num(draft.waste_kg),
      occupied_room_nights: num(draft.occupied_room_nights),
    };
    const { error } = await supabase
      .from("monthly_entries")
      .update(updates)
      .eq("id", entry.id);
    setSaving(false);
    if (error) {
      toast.error("Could not save changes.");
      return;
    }
    toast.success(`${MONTH_NAMES[entry.month - 1]} ${entry.year} updated.`);
    setEditingId(null);
    setDraft({});
    onChanged();
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
        No past months yet. Once you log a few, you'll be able to edit them here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {visible.map((entry) => {
          const isEditing = editingId === entry.id;
          const period = `${MONTH_NAMES[entry.month - 1]} ${entry.year}`;
          const co2 = calculateCO2e(entry);
          return (
            <li
              key={entry.id}
              className="rounded-2xl border border-border/60 bg-card p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-serif text-base font-medium text-foreground">
                    {period}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatNumber(Math.round(co2))} kg CO₂e
                  </div>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground hover:text-foreground"
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void save(entry)}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(entry)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>

              {isEditing && (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="block">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {f.label}
                        {f.unit ? ` (${f.unit})` : ""}
                      </span>
                      <input
                        inputMode="decimal"
                        value={draft[f.key] ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                        }
                        className="num mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-right text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {sorted.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${showAll ? "rotate-180" : ""}`}
          />
          {showAll ? "Show fewer" : `Show all ${sorted.length} months`}
        </button>
      )}
    </div>
  );
}
