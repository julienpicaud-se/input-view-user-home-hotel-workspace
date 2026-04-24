import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bolt,
  CheckCircle2,
  ClipboardPaste,
  Droplets,
  Flame,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  Trash,
  Users,
  Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type MonthlyEntry } from "@/lib/hotel";
import { MONTH_NAMES } from "@/lib/format";
import {
  extractSmartInput,
  type SmartEntry,
  type SmartMetric,
} from "@/server/assistant.functions";

interface SmartPasteCardProps {
  entries: MonthlyEntry[];
  onSaved: () => void;
}

const METRIC_META: Record<
  SmartMetric,
  { label: string; unit: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; color: string }
> = {
  electricity_kwh: { label: "Electricity", unit: "kWh", icon: Bolt, color: "var(--chart-3)" },
  gas_kwh: { label: "Gas", unit: "kWh", icon: Flame, color: "var(--chart-1)" },
  water_m3: { label: "Water", unit: "m³", icon: Droplets, color: "var(--chart-2)" },
  waste_kg: { label: "Waste", unit: "kg", icon: Trash2, color: "var(--chart-5)" },
  occupied_room_nights: { label: "Occupied room-nights", unit: "nights", icon: Users, color: "var(--chart-4)" },
};

const EXAMPLES = [
  "April 2025 electricity 12,400 kWh, gas 320 m3, water 230 m3, waste 1.2 t. Occupied room-nights 2,150.",
  "Q1 2025 — Jan elec 14.2 MWh / Feb 13.8 MWh / Mar 12.1 MWh. Water for the same months: 245, 230, 210 m³.",
  "Forwarded utility summary: March bill — 2 140 kWh elec; gas 1 850 kWh; water 198 m3.",
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type DraftRow = SmartEntry & { id: string; selected: boolean };

export function SmartPasteCard({ entries: _entries, onSaved }: SmartPasteCardProps) {
  const extract = useServerFn(extractSmartInput);
  const [text, setText] = React.useState("");
  const [imagePreview, setImagePreview] = React.useState<{ name: string; dataUrl: string } | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftRow[] | null>(null);
  const [summary, setSummary] = React.useState<string>("");
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [confidence, setConfidence] = React.useState<"high" | "medium" | "low">("low");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const years = React.useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 3, y - 2, y - 1, y, y + 1];
  }, []);

  function reset() {
    setText("");
    setImagePreview(null);
    setDraft(null);
    setSummary("");
    setWarnings([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAttachImage(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large (max 10MB).");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setImagePreview({ name: file.name, dataUrl });
  }

  async function handleExtract() {
    if (!text.trim() && !imagePreview) {
      toast.error("Paste some text or attach a screenshot first.");
      return;
    }
    setExtracting(true);
    setDraft(null);
    try {
      const res = await extract({
        data: {
          text: text.trim() || undefined,
          imageDataUrl: imagePreview?.dataUrl,
          currentYear: new Date().getFullYear(),
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const ext = res.extraction;
      if (ext.entries.length === 0) {
        toast.error("Sera couldn't find any metrics. Try adding more context (month, units).");
        if (ext.warnings.length > 0) setWarnings(ext.warnings);
        return;
      }
      setDraft(
        ext.entries.map((e, i) => ({
          ...e,
          id: `${e.year}-${e.month}-${e.metric}-${i}`,
          selected: true,
        })),
      );
      setSummary(ext.summary);
      setConfidence(ext.confidence);
      setWarnings(ext.warnings);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't process that input.");
    } finally {
      setExtracting(false);
    }
  }

  function updateRow(id: string, patch: Partial<DraftRow>) {
    setDraft((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) : prev));
  }

  function removeRow(id: string) {
    setDraft((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
  }

  async function handleSaveAll() {
    if (!draft) return;
    const toSave = draft.filter((r) => r.selected);
    if (toSave.length === 0) {
      toast.error("Select at least one row to save.");
      return;
    }
    setSaving(true);
    const hotelId = getActiveHotelId();

    // Group by (year, month) so we issue one upsert per period
    const byPeriod = new Map<string, DraftRow[]>();
    for (const r of toSave) {
      const key = `${r.year}-${r.month}`;
      const arr = byPeriod.get(key) ?? [];
      arr.push(r);
      byPeriod.set(key, arr);
    }

    let savedCount = 0;
    let firstError: string | null = null;

    for (const [key, rows] of byPeriod) {
      const [year, month] = key.split("-").map(Number);
      const updates: Partial<MonthlyEntry> = {};
      for (const r of rows) updates[r.metric] = r.value;

      const { data: existing } = await supabase
        .from("monthly_entries")
        .select("*")
        .eq("hotel_id", hotelId)
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();

      let error;
      if (existing) {
        ({ error } = await supabase
          .from("monthly_entries")
          .update(updates)
          .eq("id", (existing as MonthlyEntry).id));
      } else {
        ({ error } = await supabase.from("monthly_entries").insert({
          hotel_id: hotelId,
          year,
          month,
          ...updates,
        }));
      }

      if (error && !firstError) firstError = error.message;
      else savedCount += rows.length;
    }

    setSaving(false);
    if (firstError) {
      toast.error(`Saved ${savedCount} of ${toSave.length}. Error: ${firstError}`);
    } else {
      toast.success(`Saved ${savedCount} ${savedCount === 1 ? "entry" : "entries"} across ${byPeriod.size} ${byPeriod.size === 1 ? "month" : "months"}.`);
    }
    reset();
    onSaved();
  }

  // Group draft rows by period for nicer rendering
  const grouped = React.useMemo(() => {
    if (!draft) return null;
    const map = new Map<string, DraftRow[]>();
    for (const r of draft) {
      const k = `${r.year}-${String(r.month).padStart(2, "0")}`;
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [draft]);

  const selectedCount = draft?.filter((r) => r.selected).length ?? 0;

  return (
    <Card className="border-border/60 bg-card/60 p-6 sm:p-8">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Smart data input
            </span>
            <span className="rounded-full bg-gradient-to-r from-primary to-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
              AI · New
            </span>
          </div>
          <h2 className="mt-1 font-serif text-2xl font-semibold leading-tight">
            Paste anything — Sera turns it into clean data
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop an email, a sentence, a few rows of a spreadsheet, or a screenshot.
            Sera reads multiple metrics across multiple months in one go, converts units, and shows
            you a tidy preview before saving.
          </p>
        </div>
      </div>

      {/* Input area */}
      {!draft && (
        <div className="mt-6 space-y-3">
          <div className="relative rounded-2xl border border-border bg-background/60 transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={extracting}
              placeholder={`Examples\n• April 2025 elec 12,400 kWh, gas 320 m3, water 230 m3\n• Jan/Feb/Mar electricity: 14.2, 13.8, 12.1 MWh\n• Waste March 1.2 tonnes, recycled 38%`}
              className="min-h-[150px] w-full resize-y rounded-2xl bg-transparent px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-60"
            />
            {imagePreview && (
              <div className="mx-3 mb-3 flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
                <img
                  src={imagePreview.dataUrl}
                  alt="attached"
                  className="h-10 w-10 rounded-md object-cover"
                />
                <div className="flex-1 truncate text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{imagePreview.name}</span> attached as visual context
                </div>
                <button
                  type="button"
                  onClick={() => setImagePreview(null)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                  aria-label="Remove attached image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleExtract}
              disabled={extracting || (!text.trim() && !imagePreview)}
              className="gap-2"
            >
              {extracting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sera is reading…
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Extract with Sera
                </>
              )}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleAttachImage(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              className="gap-1.5 text-muted-foreground"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Add screenshot
            </Button>

            <button
              type="button"
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText();
                  if (t) {
                    setText((prev) => (prev ? `${prev}\n${t}` : t));
                    textareaRef.current?.focus();
                  }
                } catch {
                  toast.error("Clipboard unavailable — paste manually.");
                }
              }}
              disabled={extracting}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste from clipboard
            </button>
          </div>

          {/* Inline examples */}
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Try one of these
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setText(ex)}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {ex.length > 70 ? ex.slice(0, 70) + "…" : ex}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Draft preview */}
      <AnimatePresence>
        {draft && grouped && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-6 space-y-4"
          >
            {/* Summary banner */}
            <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold">Sera found {draft.length} {draft.length === 1 ? "value" : "values"}</div>
                    <span
                      className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                        confidence === "high"
                          ? "border-success/40 bg-success/10 text-success"
                          : confidence === "medium"
                            ? "border-warning/40 bg-warning/10 text-warning"
                            : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {confidence} confidence
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-full bg-background/80 p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Discard and start over"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-warning">
                  Heads up
                </div>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Grouped rows */}
            <div className="space-y-4">
              {grouped.map(([key, rows]) => {
                const [y, m] = key.split("-").map(Number);
                return (
                  <div key={key} className="rounded-2xl border border-border bg-background/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold">
                        {MONTH_NAMES[m - 1]} {y}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {rows.length} {rows.length === 1 ? "metric" : "metrics"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {rows.map((r) => {
                        const meta = METRIC_META[r.metric];
                        const Icon = meta.icon;
                        return (
                          <div
                            key={r.id}
                            className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 transition ${
                              r.selected
                                ? "border-border bg-card"
                                : "border-border/40 bg-muted/20 opacity-60"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={r.selected}
                              onChange={(e) => updateRow(r.id, { selected: e.target.checked })}
                              className="h-4 w-4 rounded border-border accent-primary"
                              aria-label={`Include ${meta.label}`}
                            />
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                backgroundColor: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
                                color: meta.color,
                              }}
                            >
                              <Icon className="h-4 w-4" />
                            </div>

                            <div className="min-w-[120px] flex-1">
                              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                Metric
                              </div>
                              <Select
                                value={r.metric}
                                onValueChange={(v) => updateRow(r.id, { metric: v as SmartMetric })}
                              >
                                <SelectTrigger className="h-9 rounded-lg">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {(Object.keys(METRIC_META) as SmartMetric[]).map((k) => (
                                    <SelectItem key={k} value={k}>
                                      {METRIC_META[k].label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="w-32">
                              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                Value
                              </div>
                              <div className="relative">
                                <Input
                                  type="number"
                                  step="any"
                                  value={r.value}
                                  onChange={(e) => updateRow(r.id, { value: Number(e.target.value) })}
                                  className="h-9 rounded-lg pr-12 font-mono"
                                />
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
                                  {meta.unit}
                                </span>
                              </div>
                              {r.original_unit && r.original_unit.toLowerCase() !== meta.unit.toLowerCase() && (
                                <div className="mt-0.5 text-[10px] text-muted-foreground">
                                  from {r.original_unit}
                                </div>
                              )}
                            </div>

                            <div className="w-28">
                              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                Month
                              </div>
                              <Select
                                value={String(r.month)}
                                onValueChange={(v) => updateRow(r.id, { month: Number(v) })}
                              >
                                <SelectTrigger className="h-9 rounded-lg">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {MONTH_NAMES.map((n, i) => (
                                    <SelectItem key={i + 1} value={String(i + 1)}>
                                      {n}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="w-24">
                              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                Year
                              </div>
                              <Select
                                value={String(r.year)}
                                onValueChange={(v) => updateRow(r.id, { year: Number(v) })}
                              >
                                <SelectTrigger className="h-9 rounded-lg">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {years.map((yy) => (
                                    <SelectItem key={yy} value={String(yy)}>
                                      {yy}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeRow(r.id)}
                              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Remove row"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{selectedCount}</span> of {draft.length} selected ·{" "}
                {grouped.length} {grouped.length === 1 ? "month" : "months"}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={reset} disabled={saving}>
                  Discard
                </Button>
                <Button type="button" onClick={handleSaveAll} disabled={saving || selectedCount === 0} className="gap-2">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Save {selectedCount} {selectedCount === 1 ? "entry" : "entries"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
