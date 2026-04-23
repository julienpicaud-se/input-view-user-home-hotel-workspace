import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Bolt,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Droplets,
  Flame,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

interface SeraGuidedLogProps {
  entries: MonthlyEntry[];
  rooms: number;
  onSaved: () => void;
}

type StepKey =
  | "intro"
  | "month"
  | "occupancy"
  | "electricity"
  | "gas"
  | "water"
  | "waste"
  | "review"
  | "done";

interface UtilityStepConfig {
  key: BillUtility;
  field: keyof Pick<
    MonthlyEntry,
    "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg"
  >;
  label: string;
  unit: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
  question: string;
  hint: string;
}

const UTILITY_STEPS: UtilityStepConfig[] = [
  {
    key: "electricity",
    field: "electricity_kwh",
    label: "Electricity",
    unit: "kWh",
    icon: Bolt,
    color: "var(--chart-3)",
    question: "How much electricity did you use this month?",
    hint: "Look for 'Total energy', 'Consumo', or 'kWh used' on your last bill — usually under the main usage chart.",
  },
  {
    key: "gas",
    field: "gas_kwh",
    label: "Gas",
    unit: "kWh",
    icon: Flame,
    color: "var(--chart-1)",
    question: "And for gas?",
    hint: "If your bill is in m³, snap a photo and I'll convert it to kWh for you (1 m³ ≈ 10.55 kWh of natural gas).",
  },
  {
    key: "water",
    field: "water_m3",
    label: "Water",
    unit: "m³",
    icon: Droplets,
    color: "var(--chart-2)",
    question: "How much water did the property consume?",
    hint: "Water is usually in m³ on the bill — sometimes shown as 'cubic metres'. If it's in litres, divide by 1000.",
  },
  {
    key: "waste",
    field: "waste_kg",
    label: "Waste",
    unit: "kg",
    icon: Trash2,
    color: "var(--chart-5)",
    question: "Last one — total waste produced?",
    hint: "If your hauler reports in tonnes, multiply by 1000. No bill? An estimate based on bins × pickups works too.",
  },
];

interface DraftValues {
  year: number;
  month: number;
  occupied_room_nights: number | null;
  electricity_kwh: number | null;
  gas_kwh: number | null;
  water_m3: number | null;
  waste_kg: number | null;
  notes: string;
}

const STEP_ORDER: StepKey[] = [
  "intro",
  "month",
  "occupancy",
  "electricity",
  "gas",
  "water",
  "waste",
  "review",
  "done",
];

export function SeraGuidedLog({ entries, rooms, onSaved }: SeraGuidedLogProps) {
  const today = React.useMemo(() => new Date(), []);
  const sortedEntries = React.useMemo(
    () =>
      [...entries].sort((a, b) =>
        a.year !== b.year ? b.year - a.year : b.month - a.month,
      ),
    [entries],
  );
  const lastEntry: MonthlyEntry | undefined = sortedEntries[0];

  const [stepIndex, setStepIndex] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftValues>({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    occupied_room_nights: null,
    electricity_kwh: null,
    gas_kwh: null,
    water_m3: null,
    waste_kg: null,
    notes: "",
  });

  const currentStep = STEP_ORDER[stepIndex];
  const totalSteps = STEP_ORDER.length - 2; // exclude intro & done from progress
  const progressIndex = Math.max(0, Math.min(totalSteps, stepIndex));

  function next() {
    setStepIndex((i) => Math.min(STEP_ORDER.length - 1, i + 1));
  }
  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      const { error } = await supabase.from("monthly_entries").upsert(
        {
          hotel_id: getActiveHotelId(),
          year: draft.year,
          month: draft.month,
          electricity_kwh: draft.electricity_kwh,
          gas_kwh: draft.gas_kwh,
          water_m3: draft.water_m3,
          waste_kg: draft.waste_kg,
          occupied_room_nights: draft.occupied_room_nights,
          notes: draft.notes.trim() || null,
        },
        { onConflict: "hotel_id,year,month" },
      );
      if (error) throw error;
      toast.success(`${MONTH_NAMES[draft.month - 1]} ${draft.year} saved with Sera`);
      onSaved();
      setStepIndex(STEP_ORDER.length - 1);
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues[0].message : "Couldn't save";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDraft({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      occupied_room_nights: null,
      electricity_kwh: null,
      gas_kwh: null,
      water_m3: null,
      waste_kg: null,
      notes: "",
    });
    setStepIndex(0);
  }

  return (
    <Card className="relative overflow-hidden rounded-3xl border-border/70 bg-gradient-to-br from-primary/5 via-card to-accent/10 p-0">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-accent/15 blur-3xl"
      />

      {/* Header strip */}
      <div className="relative flex items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Sera · Guided log
            </div>
            <div className="font-serif text-base font-semibold text-foreground">
              {currentStep === "done"
                ? "All done — beautifully captured."
                : currentStep === "intro"
                  ? "Let's log this month together."
                  : `Step ${progressIndex} of ${totalSteps}`}
            </div>
          </div>
        </div>
        {currentStep !== "intro" && currentStep !== "done" && (
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            Start over
          </button>
        )}
      </div>

      {/* Progress bar */}
      {currentStep !== "intro" && currentStep !== "done" && (
        <div className="relative h-1 w-full bg-border/40">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-secondary"
            initial={false}
            animate={{ width: `${(progressIndex / totalSteps) * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      )}

      <div className="relative min-h-[28rem] px-6 py-8 md:px-10 md:py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {currentStep === "intro" && (
              <IntroStep
                onStart={next}
                lastMonthLabel={
                  lastEntry
                    ? `${MONTH_NAMES[lastEntry.month - 1]} ${lastEntry.year}`
                    : null
                }
              />
            )}

            {currentStep === "month" && (
              <MonthStep
                draft={draft}
                setDraft={setDraft}
                onNext={next}
                onBack={back}
              />
            )}

            {currentStep === "occupancy" && (
              <OccupancyStep
                draft={draft}
                setDraft={setDraft}
                rooms={rooms}
                lastEntry={lastEntry}
                onNext={next}
                onBack={back}
              />
            )}

            {(currentStep === "electricity" ||
              currentStep === "gas" ||
              currentStep === "water" ||
              currentStep === "waste") && (
              <UtilityStep
                step={UTILITY_STEPS.find((u) => u.key === currentStep)!}
                draft={draft}
                setDraft={setDraft}
                lastEntry={lastEntry}
                onNext={next}
                onBack={back}
              />
            )}

            {currentStep === "review" && (
              <ReviewStep
                draft={draft}
                rooms={rooms}
                onBack={back}
                onSave={handleSave}
                submitting={submitting}
              />
            )}

            {currentStep === "done" && <DoneStep draft={draft} onAgain={reset} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}

/* ---------- Intro ---------- */

function IntroStep({
  onStart,
  lastMonthLabel,
}: {
  onStart: () => void;
  lastMonthLabel: string | null;
}) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Wand2 className="h-7 w-7" />
      </div>
      <h2 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">
        Hi — I'm Sera. Let's log this month in 5 minutes.
      </h2>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:text-[15px]">
        I'll walk you through each utility one at a time. Snap a photo of any
        bill and I'll read the numbers for you. You can also type values
        directly — your call.
      </p>

      {lastMonthLabel && (
        <p className="mt-3 text-xs text-muted-foreground">
          Last month logged: <span className="font-medium text-foreground">{lastMonthLabel}</span>
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { icon: Upload, label: "Upload a bill", desc: "Photo or PDF" },
          { icon: Sparkles, label: "I'll extract", desc: "kWh, m³, kg" },
          { icon: CheckCircle2, label: "You confirm", desc: "Edit if needed" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border/60 bg-background/60 p-4 text-left"
          >
            <s.icon className="mb-2 h-5 w-5 text-primary" />
            <div className="text-sm font-semibold text-foreground">{s.label}</div>
            <div className="text-xs text-muted-foreground">{s.desc}</div>
          </div>
        ))}
      </div>

      <Button
        onClick={onStart}
        className="mt-8 h-11 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
      >
        Start with Sera
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

/* ---------- Month picker ---------- */

function MonthStep({
  draft,
  setDraft,
  onNext,
  onBack,
}: {
  draft: DraftValues;
  setDraft: React.Dispatch<React.SetStateAction<DraftValues>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const today = new Date();
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  return (
    <StepFrame
      narration={`First — which month are we logging? I've put us on ${MONTH_NAMES[draft.month - 1]} ${draft.year} as a starting point.`}
      onBack={onBack}
      onNext={onNext}
      nextLabel="Continue"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Month
          </Label>
          <Select
            value={String(draft.month)}
            onValueChange={(v) => setDraft((d) => ({ ...d, month: Number(v) }))}
          >
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Year
          </Label>
          <Select
            value={String(draft.year)}
            onValueChange={(v) => setDraft((d) => ({ ...d, year: Number(v) }))}
          >
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
    </StepFrame>
  );
}

/* ---------- Occupancy ---------- */

function OccupancyStep({
  draft,
  setDraft,
  rooms,
  lastEntry,
  onNext,
  onBack,
}: {
  draft: DraftValues;
  setDraft: React.Dispatch<React.SetStateAction<DraftValues>>;
  rooms: number;
  lastEntry: MonthlyEntry | undefined;
  onNext: () => void;
  onBack: () => void;
}) {
  const lastRn = lastEntry?.occupied_room_nights ?? null;
  const value =
    draft.occupied_room_nights === null ? "" : String(draft.occupied_room_nights);

  return (
    <StepFrame
      narration={`How many room-nights did the hotel sell in ${MONTH_NAMES[draft.month - 1]}? This is the denominator for every intensity metric.`}
      onBack={onBack}
      onNext={onNext}
      nextDisabled={draft.occupied_room_nights === null}
      nextLabel="Continue"
      icon={Users}
      iconColor="var(--chart-4)"
    >
      <div className="space-y-3">
        <div>
          <Label className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Occupied room-nights
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="e.g. 1,840"
            value={value}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                occupied_room_nights:
                  e.target.value.trim() === "" ? null : Number(e.target.value),
              }))
            }
            className="h-12 rounded-xl text-base"
          />
          {rooms > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              For reference: {rooms} rooms × ~30 nights = {rooms * 30} max
              room-nights this month.
            </p>
          )}
        </div>

        {lastRn && (
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({ ...d, occupied_room_nights: lastRn }))
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
          >
            <Sparkles className="h-3 w-3" />
            Same as last month ({lastRn.toLocaleString()})
          </button>
        )}
      </div>
    </StepFrame>
  );
}

/* ---------- Utility step (with bill upload) ---------- */

function UtilityStep({
  step,
  draft,
  setDraft,
  lastEntry,
  onNext,
  onBack,
}: {
  step: UtilityStepConfig;
  draft: DraftValues;
  setDraft: React.Dispatch<React.SetStateAction<DraftValues>>;
  lastEntry: MonthlyEntry | undefined;
  onNext: () => void;
  onBack: () => void;
}) {
  const extract = useServerFn(extractBillData);
  const [extracting, setExtracting] = React.useState(false);
  const [extracted, setExtracted] = React.useState<{
    value: number;
    confidence: "high" | "medium" | "low";
    notes: string | null;
    fileName: string;
  } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const currentValue = draft[step.field];
  const inputValue = currentValue === null ? "" : String(currentValue);
  const lastValue = lastEntry?.[step.field] ?? null;

  // Anomaly hint vs prior month
  const anomaly = React.useMemo(() => {
    if (currentValue === null || lastValue === null || lastValue === 0) return null;
    const ratio = currentValue / lastValue;
    if (ratio > 2.5) {
      return {
        tone: "warning" as const,
        text: `That's ${ratio.toFixed(1)}× last month (${lastValue.toLocaleString()} ${step.unit}). Worth a double-check?`,
      };
    }
    if (ratio < 0.4) {
      return {
        tone: "info" as const,
        text: `That's only ${Math.round(ratio * 100)}% of last month — a big drop. Confirm if it's right.`,
      };
    }
    return null;
  }, [currentValue, lastValue, step.unit]);

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image is too large (max 10MB). Try a smaller file.");
      return;
    }
    setExtracting(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await extract({
        data: { imageDataUrl: dataUrl, utilityHint: step.key },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const ext = res.extraction;
      if (ext.value === null) {
        toast.error("I couldn't find a clear consumption value on that bill.");
        return;
      }
      setExtracted({
        value: ext.value,
        confidence: ext.confidence,
        notes: ext.notes,
        fileName: file.name,
      });
      setDraft((d) => ({ ...d, [step.field]: ext.value }));
    } catch (e) {
      console.error(e);
      toast.error("Couldn't process that file.");
    } finally {
      setExtracting(false);
    }
  }

  const Icon = step.icon;

  return (
    <StepFrame
      narration={step.question}
      subtext={step.hint}
      onBack={onBack}
      onNext={onNext}
      nextLabel={currentValue === null ? "Skip for now" : "Continue"}
      icon={Icon}
      iconColor={step.color}
    >
      <div className="space-y-4">
        {/* Upload zone */}
        <div
          className={`relative rounded-2xl border-2 border-dashed p-5 transition ${
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
              // reset so same file can be picked again
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
                    Sera is reading your bill…
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Usually takes 5–10 seconds.
                  </div>
                </>
              ) : extracted ? (
                <>
                  <div className="text-sm font-semibold text-foreground">
                    Extracted {extracted.value.toLocaleString()} {step.unit}{" "}
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
                    Drop a bill, or click to upload
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
                  setExtracted(null);
                  setDraft((d) => ({ ...d, [step.field]: null }));
                  if (fileInputRef.current) fileInputRef.current.value = "";
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
        <div>
          <Label className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Or enter the value yourself ({step.unit})
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder={`e.g. ${
              step.key === "electricity"
                ? "12,400"
                : step.key === "gas"
                  ? "5,200"
                  : step.key === "water"
                    ? "180"
                    : "320"
            }`}
            value={inputValue}
            onChange={(e) => {
              const v = e.target.value.trim() === "" ? null : Number(e.target.value);
              setDraft((d) => ({ ...d, [step.field]: v }));
              if (extracted) setExtracted(null);
            }}
            className="h-12 rounded-xl text-base"
          />
        </div>

        {/* Last month reference */}
        {lastValue !== null && (
          <button
            type="button"
            onClick={() => {
              setDraft((d) => ({ ...d, [step.field]: lastValue }));
              setExtracted(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
          >
            <Sparkles className="h-3 w-3" />
            Use last month ({lastValue.toLocaleString()} {step.unit})
          </button>
        )}

        {/* Anomaly hint */}
        {anomaly && (
          <div
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
              anomaly.tone === "warning"
                ? "border-warning/30 bg-warning/10 text-foreground"
                : "border-border bg-muted/50 text-foreground"
            }`}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>{anomaly.text}</span>
          </div>
        )}
      </div>
    </StepFrame>
  );
}

/* ---------- Review ---------- */

function ReviewStep({
  draft,
  rooms,
  onBack,
  onSave,
  submitting,
}: {
  draft: DraftValues;
  rooms: number;
  onBack: () => void;
  onSave: () => void;
  submitting: boolean;
}) {
  const filled = UTILITY_STEPS.filter((u) => draft[u.field] !== null).length;
  return (
    <StepFrame
      narration={`Here's what we'll save for ${MONTH_NAMES[draft.month - 1]} ${draft.year}. Anything missing? Step back to add it.`}
      subtext={`You filled ${filled} of 4 utilities${draft.occupied_room_nights ? ` and ${draft.occupied_room_nights.toLocaleString()} room-nights` : ""}.`}
      onBack={onBack}
      onNext={onSave}
      nextLabel={submitting ? "Saving…" : "Save this month"}
      nextDisabled={submitting}
      icon={ClipboardCheck}
      iconColor="var(--chart-4)"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {UTILITY_STEPS.map((u) => {
          const v = draft[u.field];
          const Icon = u.icon;
          return (
            <div
              key={u.key}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 p-3"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: `color-mix(in oklab, ${u.color} 15%, transparent)`,
                }}
              >
                <Icon className="h-5 w-5" style={{ color: u.color }} />
              </div>
              <div className="flex-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {u.label}
                </div>
                <div className="font-serif text-base font-semibold text-foreground">
                  {v === null ? (
                    <span className="text-muted-foreground">Not logged</span>
                  ) : (
                    <>
                      {v.toLocaleString()}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {u.unit}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 p-3 sm:col-span-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Users className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Occupied room-nights
            </div>
            <div className="font-serif text-base font-semibold text-foreground">
              {draft.occupied_room_nights === null ? (
                <span className="text-muted-foreground">Not logged</span>
              ) : (
                draft.occupied_room_nights.toLocaleString()
              )}
              {rooms > 0 && draft.occupied_room_nights !== null && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {Math.round(
                    (draft.occupied_room_nights / (rooms * 30)) * 100,
                  )}
                  % occupancy
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </StepFrame>
  );
}

/* ---------- Done ---------- */

function DoneStep({
  draft,
  onAgain,
}: {
  draft: DraftValues;
  onAgain: () => void;
}) {
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h2 className="font-serif text-2xl font-semibold text-foreground">
        {MONTH_NAMES[draft.month - 1]} {draft.year} is in.
      </h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Beautiful. Your dashboards have refreshed — head to the Analyze tab to
        see how this month moved your score.
      </p>
      <Button
        onClick={onAgain}
        variant="outline"
        className="mt-6 h-11 rounded-full px-6 text-sm"
      >
        Log another month
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

/* ---------- Shared step frame ---------- */

function StepFrame({
  narration,
  subtext,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  icon: Icon,
  iconColor,
}: {
  narration: string;
  subtext?: string;
  children: React.ReactNode;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconColor?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          style={
            iconColor
              ? {
                  backgroundColor: `color-mix(in oklab, ${iconColor} 15%, transparent)`,
                  color: iconColor,
                }
              : { background: "var(--primary)", color: "var(--primary-foreground)" }
          }
        >
          {Icon ? <Icon className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <p className="font-serif text-lg leading-snug text-foreground md:text-xl">
            {narration}
          </p>
          {subtext && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {subtext}
            </p>
          )}
        </div>
      </div>

      <div className="mb-8">{children}</div>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="h-10 rounded-full px-4 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="h-11 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          {nextLabel}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
