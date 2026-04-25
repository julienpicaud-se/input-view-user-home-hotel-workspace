import * as React from "react";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  MONTH_NAMES,
  MONTH_SHORT,
  formatNumber,
  calculateCO2e,
} from "@/lib/format";
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
  { key: "electricity_kwh", label: "Elec", unit: "kWh" },
  { key: "gas_kwh", label: "Gas", unit: "kWh" },
  { key: "water_m3", label: "Water", unit: "m³" },
  { key: "waste_kg", label: "Waste", unit: "kg" },
  { key: "occupied_room_nights", label: "Nights", unit: "" },
];

export function TheoryHistory({
  entries,
  onChanged,
}: {
  entries: MonthlyEntry[];
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const sorted = React.useMemo(
    () =>
      [...entries].sort(
        (a, b) => (b.year - a.year) * 100 + (b.month - a.month),
      ),
    [entries],
  );

  function startEdit(e: MonthlyEntry) {
    setEditingId(e.id);
    setDraft({
      electricity_kwh: String(e.electricity_kwh ?? ""),
      gas_kwh: String(e.gas_kwh ?? ""),
      water_m3: String(e.water_m3 ?? ""),
      waste_kg: String(e.waste_kg ?? ""),
      occupied_room_nights: String(e.occupied_room_nights ?? ""),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  async function saveEdit(e: MonthlyEntry) {
    setSaving(true);
    const updates: Partial<MonthlyEntry> = {};
    for (const f of FIELDS) {
      const raw = draft[f.key];
      if (raw === undefined) continue;
      const v = raw.trim() === "" ? null : Number(raw.replace(/[, ]/g, ""));
      if (v !== null && Number.isNaN(v)) {
        toast.error(`${f.label}: invalid number`);
        setSaving(false);
        return;
      }
      (updates as any)[f.key] = v;
    }
    const { error } = await supabase
      .from("monthly_entries")
      .update(updates)
      .eq("id", e.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save: " + error.message);
      return;
    }
    toast.success(`Updated ${MONTH_NAMES[e.month - 1]} ${e.year}.`);
    setEditingId(null);
    setDraft({});
    onChanged();
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
        No past entries yet. After your first log, you'll be able to browse and edit prior months here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-white/45">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2.5 text-left font-medium">Month</th>
              {FIELDS.map((f) => (
                <th key={f.key} className="px-3 py-2.5 text-right font-medium">
                  {f.label}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium">CO₂e</th>
              <th className="px-3 py-2.5 text-right font-medium">Edit</th>
            </tr>
          </thead>
          <tbody className="text-white/80">
            {sorted.map((e) => {
              const isEdit = editingId === e.id;
              return (
                <tr
                  key={e.id}
                  className="border-b border-white/5 last:border-0"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                    {MONTH_SHORT[e.month - 1]} {e.year}
                  </td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className="px-3 py-1.5 text-right tabular-nums">
                      {isEdit ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft[f.key] ?? ""}
                          onChange={(ev) =>
                            setDraft((d) => ({ ...d, [f.key]: ev.target.value }))
                          }
                          className="w-20 rounded-lg border border-white/15 bg-white/[0.05] px-2 py-1 text-right text-white focus:border-violet-300/50 focus:outline-none"
                        />
                      ) : (
                        <>
                          {formatNumber(e[f.key] as number | null | undefined)}
                          {f.unit && (
                            <span className="ml-0.5 text-[10px] text-white/35">
                              {f.unit}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-violet-200">
                    {formatNumber(calculateCO2e(e) / 1000, 2)}t
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {isEdit ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => saveEdit(e)}
                          disabled={saving}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
                          aria-label="Save"
                        >
                          {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] text-white/70 transition hover:bg-white/10"
                          aria-label="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(e)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] text-white/70 transition hover:border-violet-300/40 hover:bg-violet-500/15 hover:text-white"
                        aria-label={`Edit ${MONTH_NAMES[e.month - 1]} ${e.year}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
