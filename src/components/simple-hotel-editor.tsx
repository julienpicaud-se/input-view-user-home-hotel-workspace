import * as React from "react";
import { Save, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Hotel } from "@/lib/hotel";

const CLIMATE_OPTIONS = [
  "Mediterranean",
  "Tropical",
  "Continental",
  "Arid",
  "Temperate",
  "Alpine",
];
const SIZE_BANDS = ["<50", "50-100", "100-150", "150-250", "250+"];
const STAR_OPTIONS = [3, 4, 5];

/**
 * Calm, Simple-skin form to edit a single hotel's details.
 * Mirrors the fields available in the Classic hotel-settings tab,
 * minus the power-user knobs (year built, total surface, etc.).
 */
export function SimpleHotelEditor({
  hotel,
  onSaved,
}: {
  hotel: Hotel;
  onSaved: (h: Hotel) => void;
}) {
  const [draft, setDraft] = React.useState({
    name: hotel.name,
    region: hotel.region,
    rooms: String(hotel.rooms),
    star_rating: hotel.star_rating,
    climate_zone: hotel.climate_zone,
    size_band: hotel.size_band,
  });
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  // Reset draft if a different hotel is selected.
  React.useEffect(() => {
    setDraft({
      name: hotel.name,
      region: hotel.region,
      rooms: String(hotel.rooms),
      star_rating: hotel.star_rating,
      climate_zone: hotel.climate_zone,
      size_band: hotel.size_band,
    });
    setSavedAt(null);
  }, [hotel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    draft.name !== hotel.name ||
    draft.region !== hotel.region ||
    Number(draft.rooms) !== hotel.rooms ||
    draft.star_rating !== hotel.star_rating ||
    draft.climate_zone !== hotel.climate_zone ||
    draft.size_band !== hotel.size_band;

  async function save() {
    setSaving(true);
    const updates = {
      name: draft.name.trim() || hotel.name,
      region: draft.region.trim() || hotel.region,
      rooms: Number(draft.rooms) || hotel.rooms,
      star_rating: draft.star_rating,
      climate_zone: draft.climate_zone,
      size_band: draft.size_band,
    };
    const { data, error } = await supabase
      .from("hotels")
      .update(updates)
      .eq("id", hotel.id)
      .select("*")
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error("Could not save. Try again.");
      return;
    }
    toast.success("Hotel details saved.");
    setSavedAt(Date.now());
    if (data) onSaved(data as Hotel);
  }

  return (
    <div className="space-y-4 rounded-3xl border border-border/60 bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hotel name">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Region or city">
          <input
            type="text"
            value={draft.region}
            onChange={(e) => setDraft((d) => ({ ...d, region: e.target.value }))}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Number of rooms">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.rooms}
            onChange={(e) => setDraft((d) => ({ ...d, rooms: e.target.value }))}
            className="num w-full rounded-xl border border-input bg-background px-3 py-2 text-right text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Star rating">
          <div className="flex gap-1.5">
            {STAR_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, star_rating: s }))}
                className={`flex-1 rounded-xl border px-2 py-2 text-sm font-medium transition ${
                  draft.star_rating === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {s}★
              </button>
            ))}
          </div>
        </Field>
        <Field label="Size band (rooms)">
          <select
            value={draft.size_band}
            onChange={(e) =>
              setDraft((d) => ({ ...d, size_band: e.target.value }))
            }
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {SIZE_BANDS.map((b) => (
              <option key={b} value={b}>
                {b} rooms
              </option>
            ))}
          </select>
        </Field>
        <Field label="Climate zone">
          <select
            value={draft.climate_zone}
            onChange={(e) =>
              setDraft((d) => ({ ...d, climate_zone: e.target.value }))
            }
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {CLIMATE_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          These details power your peer benchmarks.
        </p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : savedAt && !dirty ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving
            ? "Saving…"
            : savedAt && !dirty
              ? "Saved"
              : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
