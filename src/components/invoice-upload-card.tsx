import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bolt,
  CalendarDays,
  CheckCircle2,
  Droplets,
  FileText,
  Flame,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { extractBillData, type BillUtility } from "@/server/assistant.functions";

interface InvoiceUploadCardProps {
  entries: MonthlyEntry[];
  onSaved: () => void;
}

interface UtilityMeta {
  key: BillUtility;
  field: keyof Pick<
    MonthlyEntry,
    "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg"
  >;
  label: string;
  unit: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
}

const UTILITIES: UtilityMeta[] = [
  { key: "electricity", field: "electricity_kwh", label: "Electricity", unit: "kWh", icon: Bolt, color: "var(--chart-3)" },
  { key: "gas", field: "gas_kwh", label: "Gas", unit: "kWh", icon: Flame, color: "var(--chart-1)" },
  { key: "water", field: "water_m3", label: "Water", unit: "m³", icon: Droplets, color: "var(--chart-2)" },
  { key: "waste", field: "waste_kg", label: "Waste", unit: "kg", icon: Trash2, color: "var(--chart-5)" },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function InvoiceUploadCard({ entries, onSaved }: InvoiceUploadCardProps) {
  const extract = useServerFn(extractBillData);
  const now = new Date();
  const [year, setYear] = React.useState<number>(now.getFullYear());
  const [month, setMonth] = React.useState<number>(now.getMonth() + 1);
  const [utility, setUtility] = React.useState<BillUtility>("electricity");
  const [extracting, setExtracting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [extracted, setExtracted] = React.useState<{
    value: number;
    confidence: "high" | "medium" | "low";
    notes: string | null;
    fileName: string;
    detectedUtility: BillUtility | null;
    detectedPeriod: boolean; // true if month/year were auto-derived from the bill
  } | null>(null);
  const [manualValue, setManualValue] = React.useState<string>("");
  const [showPeriodEdit, setShowPeriodEdit] = React.useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const meta = UTILITIES.find((u) => u.key === utility)!;
  const Icon = meta.icon;

  const years = React.useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finalValue =
    manualValue.trim() !== ""
      ? Number(manualValue)
      : (extracted?.value ?? null);

  function reset() {
    setExtracted(null);
    setManualValue("");
    setShowPeriodEdit(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is too large (max 10MB).");
      return;
    }
    setExtracting(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await extract({
        data: { imageDataUrl: dataUrl, utilityHint: utility },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const ext = res.extraction;
      if (ext.value === null) {
        toast.error("I couldn't find a clear consumption value on that invoice.");
        return;
      }
      // If the AI detected a different utility, gently switch and tell the user
      if (ext.utility && ext.utility !== utility) {
        setUtility(ext.utility);
      }
      // Try to derive month/year from period_end (preferred) or period_start
      let detectedPeriod = false;
      const periodIso = ext.period_end ?? ext.period_start;
      if (periodIso) {
        const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodIso);
        if (m) {
          const y = Number(m[1]);
          const mo = Number(m[2]);
          if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12) {
            setYear(y);
            setMonth(mo);
            detectedPeriod = true;
          }
        }
      }
      setExtracted({
        value: ext.value,
        confidence: ext.confidence,
        notes: ext.notes,
        fileName: file.name,
        detectedUtility: ext.utility,
        detectedPeriod,
      });
      setManualValue("");
      setShowPeriodEdit(false);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't process that file.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (finalValue === null || Number.isNaN(finalValue)) {
      toast.error("Add a value first — upload a bill or type one in.");
      return;
    }
    setSaving(true);
    const hotelId = getActiveHotelId();
    const targetField = UTILITIES.find((u) => u.key === utility)!.field;

    // Look for an existing row for this hotel/year/month and merge
    const { data: existing } = await supabase
      .from("monthly_entries")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    const updates: Partial<MonthlyEntry> = { [targetField]: finalValue };

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

    setSaving(false);
    if (error) {
      toast.error("Couldn't save: " + error.message);
      return;
    }
    toast.success(
      `Saved ${finalValue.toLocaleString()} ${meta.unit} of ${meta.label.toLowerCase()} for ${MONTH_NAMES[month - 1]} ${year}.`,
    );
    reset();
    onSaved();
  }

  return (
    <Card className="border-border/60 bg-card/60 p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Guided invoice upload
          </div>
          <h2 className="mt-1 font-serif text-2xl font-semibold leading-tight">
            Upload a bill, Sera fills the rest
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop one utility invoice — Sera reads the consumption and the
            billing period, then saves it to the right month.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Utility
          </Label>
          <Select value={utility} onValueChange={(v) => { setUtility(v as BillUtility); reset(); }}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UTILITIES.map((u) => (
                <SelectItem key={u.key} value={u.key}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Month
          </Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Year
          </Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-11 rounded-xl">
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
      </div>

      {/* Upload zone */}
      <div
        className={`relative mt-5 rounded-2xl border-2 border-dashed p-5 transition ${
          extracting
            ? "border-primary/50 bg-primary/5"
            : extracted
              ? "border-success/50 bg-success/5"
              : "border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <div className="pointer-events-none flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              extracting
                ? "bg-primary/15 text-primary"
                : extracted
                  ? "bg-success/15 text-success"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {extracting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : extracted ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1">
            {extracting ? (
              <>
                <div className="text-sm font-semibold text-foreground">
                  Sera is reading your invoice…
                </div>
                <div className="text-xs text-muted-foreground">
                  Usually takes 5–10 seconds.
                </div>
              </>
            ) : extracted ? (
              <>
                <div className="text-sm font-semibold text-foreground">
                  Extracted {extracted.value.toLocaleString()} {meta.unit}{" "}
                  <span
                    className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                      extracted.confidence === "high"
                        ? "border-success/40 bg-success/10 text-success"
                        : extracted.confidence === "medium"
                          ? "border-warning/40 bg-warning/10 text-warning"
                          : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {extracted.confidence}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {extracted.notes ?? extracted.fileName}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-foreground">
                  Drop an invoice, or click to upload
                </div>
                <div className="text-xs text-muted-foreground">
                  Photo, PDF, or scan — Sera reads them all.
                </div>
              </>
            )}
          </div>
          {extracted && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                reset();
              }}
              className="pointer-events-auto rounded-full bg-background/80 p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Clear extracted value"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Manual override */}
      <div className="mt-5">
        <Label className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          Or enter the value yourself ({meta.unit})
        </Label>
        <div className="flex items-center gap-2">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `color-mix(in oklab, ${meta.color} 15%, transparent)`, color: meta.color }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <Input
            type="number"
            inputMode="decimal"
            placeholder={
              utility === "electricity"
                ? "e.g. 12,400"
                : utility === "gas"
                  ? "e.g. 5,200"
                  : utility === "water"
                    ? "e.g. 180"
                    : "e.g. 320"
            }
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            className="h-11 rounded-xl text-base"
          />
        </div>
      </div>

      {/* Review + save */}
      <AnimatePresence>
        {finalValue !== null && !Number.isNaN(finalValue) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4"
          >
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="text-sm leading-relaxed">
                Saving{" "}
                <span className="font-semibold text-foreground">
                  {finalValue.toLocaleString()} {meta.unit}
                </span>{" "}
                of <span className="font-semibold">{meta.label.toLowerCase()}</span>{" "}
                for{" "}
                <span className="font-semibold text-foreground">
                  {MONTH_NAMES[month - 1]} {year}
                </span>
                . Other utilities for that month stay untouched.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={reset} disabled={saving || (!extracted && manualValue.trim() === "")}>
          Clear
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || finalValue === null || Number.isNaN(finalValue)}
          className="rounded-xl"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Save to {MONTH_NAMES[month - 1]} {year}
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
