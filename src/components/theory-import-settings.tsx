import * as React from "react";
import { Upload, FileText, Loader2, Save, Sparkles, Bolt, Flame, Droplets, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MONTH_NAMES } from "@/lib/format";
import type { Hotel, MonthlyEntry } from "@/lib/hotel";
import { extractBillData, extractSmartInput, type BillUtility } from "@/server/assistant.functions";

const UTILS: { key: BillUtility; field: keyof MonthlyEntry; label: string; unit: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "electricity", field: "electricity_kwh", label: "Electricity", unit: "kWh", Icon: Bolt },
  { key: "gas", field: "gas_kwh", label: "Gas", unit: "kWh", Icon: Flame },
  { key: "water", field: "water_m3", label: "Water", unit: "m³", Icon: Droplets },
  { key: "waste", field: "waste_kg", label: "Waste", unit: "kg", Icon: Trash2 },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

export function TheoryImport({
  hotelId,
  onSaved,
}: {
  hotelId: string;
  onSaved: () => void;
}) {
  const extract = useServerFn(extractBillData);
  const extractSmart = useServerFn(extractSmartInput);
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [utility, setUtility] = React.useState<BillUtility>("electricity");
  const [busy, setBusy] = React.useState(false);
  const [paste, setPaste] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  async function handleBill(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB).");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await extract({ data: { imageDataUrl: dataUrl, utilityHint: utility } });
      if (!res.ok) { toast.error(res.error); return; }
      const ext = res.extraction;
      if (ext.value === null) { toast.error("Couldn't find a value on that bill."); return; }
      const u = ext.utility ?? utility;
      const meta = UTILS.find((x) => x.key === u)!;
      let y = year, mo = month;
      const periodIso = ext.period_end ?? ext.period_start;
      const m = periodIso ? /^(\d{4})-(\d{2})-\d{2}$/.exec(periodIso) : null;
      if (m) { y = Number(m[1]); mo = Number(m[2]); }
      await upsert(y, mo, { [meta.field]: ext.value } as Partial<MonthlyEntry>);
      toast.success(`Saved ${ext.value.toLocaleString()} ${meta.unit} of ${meta.label.toLowerCase()} for ${MONTH_NAMES[mo - 1]} ${y}.`);
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error("Couldn't read that file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handlePaste() {
    const text = paste.trim();
    if (!text) return;
    setBusy(true);
    try {
      const res = await extractSmart({ data: { text, currentYear: now.getFullYear() } });
      if (!res.ok) { toast.error(res.error); return; }
      const groups = new Map<string, Partial<MonthlyEntry> & { year: number; month: number }>();
      for (const e of res.extraction.entries) {
        const key = `${e.year}-${e.month}`;
        const cur = groups.get(key) ?? { year: e.year, month: e.month };
        (cur as any)[e.metric] = e.value;
        groups.set(key, cur);
      }
      let saved = 0;
      for (const g of groups.values()) {
        const { year: y, month: mo, ...rest } = g;
        await upsert(y, mo, rest as Partial<MonthlyEntry>);
        saved++;
      }
      toast.success(`Sera parsed and saved ${saved} ${saved === 1 ? "month" : "months"}.`);
      setPaste("");
      onSaved();
    } catch {
      toast.error("Sera couldn't parse that.");
    } finally {
      setBusy(false);
    }
  }

  async function upsert(y: number, mo: number, fields: Partial<MonthlyEntry>) {
    const { data: existing } = await supabase
      .from("monthly_entries").select("*")
      .eq("hotel_id", hotelId).eq("year", y).eq("month", mo).maybeSingle();
    if (existing) {
      await supabase.from("monthly_entries").update(fields).eq("id", (existing as MonthlyEntry).id);
    } else {
      await supabase.from("monthly_entries").insert({ hotel_id: hotelId, year: y, month: mo, ...fields } as never);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Bill upload */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
          <FileText className="h-3.5 w-3.5" /> Drop a bill
        </div>
        <h3 className="mt-2 font-serif text-xl text-white">Upload an invoice</h3>
        <p className="mt-1 text-xs text-white/55">Photo or PDF. Sera reads the value, utility, and period.</p>

        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {UTILS.map((u) => {
            const active = utility === u.key;
            return (
              <button
                key={u.key}
                onClick={() => setUtility(u.key)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] transition ${
                  active
                    ? "border-violet-300/40 bg-violet-500/15 text-white"
                    : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"
                }`}
              >
                <u.Icon className="h-4 w-4" /> {u.label}
              </button>
            );
          })}
        </div>

        <label
          className={`mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed p-4 transition ${
            busy ? "border-violet-300/40 bg-violet-500/10" : "border-white/15 hover:border-violet-300/40 hover:bg-violet-500/5"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            disabled={busy}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleBill(f); }}
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-white/80">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          </div>
          <div className="text-sm">
            <p className="font-medium text-white">{busy ? "Sera is reading…" : "Drop or click to upload"}</p>
            <p className="text-xs text-white/55">{busy ? "5–10 seconds" : "Electricity, gas, water or waste."}</p>
          </div>
        </label>
      </div>

      {/* Smart paste */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
          <Sparkles className="h-3.5 w-3.5" /> Paste anything
        </div>
        <h3 className="mt-2 font-serif text-xl text-white">Paste data, CSV, or notes</h3>
        <p className="mt-1 text-xs text-white/55">Sera figures out months, metrics, and units automatically.</p>

        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={"e.g.\nMarch electricity 12,400 kWh\nMarch water 380 m3\n820 occupied nights"}
          rows={5}
          className="mt-3 w-full resize-none rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-violet-300/50 focus:outline-none"
        />
        <button
          onClick={handlePaste}
          disabled={busy || !paste.trim()}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Parse & save
        </button>
      </div>
    </div>
  );
}

export function TheoryHotelSettings({
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
    star_rating: String(hotel.star_rating),
    climate_zone: hotel.climate_zone,
    size_band: hotel.size_band,
  });
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    const updates = {
      name: draft.name.trim(),
      region: draft.region.trim(),
      rooms: Number(draft.rooms) || hotel.rooms,
      star_rating: Number(draft.star_rating) || hotel.star_rating,
      climate_zone: draft.climate_zone,
      size_band: draft.size_band,
    };
    const { data, error } = await supabase
      .from("hotels").update(updates).eq("id", hotel.id).select("*").maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Hotel settings saved.");
    if (data) onSaved(data as Hotel);
  }

  function field(label: string, key: keyof typeof draft, type: "text" | "number" = "text") {
    return (
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</span>
        <input
          type={type}
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          className="mt-1 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-white focus:border-violet-300/50 focus:outline-none"
        />
      </label>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("Name", "name")}
        {field("Region", "region")}
        {field("Rooms", "rooms", "number")}
        {field("Star rating", "star_rating", "number")}
        {field("Climate zone", "climate_zone")}
        {field("Size band", "size_band")}
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save settings
      </button>
    </div>
  );
}
