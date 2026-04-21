import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, MapPin, Star, ChevronRight, ChevronLeft, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Hotel } from "@/lib/hotel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ra-plus-onboarding-completed-v1";

const REGIONS = [
  "Mediterranean",
  "Northern Europe",
  "Central Europe",
  "Tropical",
  "Arid / Desert",
  "Temperate Coastal",
  "Mountain / Alpine",
];

const SIZE_BANDS: { value: string; label: string; hint: string }[] = [
  { value: "<50", label: "Boutique", hint: "Under 50 rooms" },
  { value: "50-100", label: "Small", hint: "50–100 rooms" },
  { value: "100-150", label: "Mid", hint: "100–150 rooms" },
  { value: "150-250", label: "Large", hint: "150–250 rooms" },
  { value: "250-500", label: "Resort", hint: "250–500 rooms" },
  { value: "500+", label: "Mega", hint: "500+ rooms" },
];

const STARS: { value: number; label: string; segment: string }[] = [
  { value: 3, label: "3-star", segment: "Midscale" },
  { value: 4, label: "4-star", segment: "Upscale" },
  { value: 5, label: "5-star", segment: "Luxury" },
];

export function OnboardingWizard({
  hotel,
  onCompleted,
}: {
  hotel: Hotel | null;
  onCompleted: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [region, setRegion] = React.useState<string>("");
  const [sizeBand, setSizeBand] = React.useState<string>("");
  const [starRating, setStarRating] = React.useState<number>(0);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!hotel) return;
    if (typeof window === "undefined") return;
    const done = window.localStorage.getItem(STORAGE_KEY);
    if (done) return;
    setRegion(hotel.region || "");
    setSizeBand(hotel.size_band || "");
    setStarRating(hotel.star_rating || 0);
    setOpen(true);
  }, [hotel]);

  const totalSteps = 4; // welcome + 3 questions
  const canNext =
    step === 0 ||
    (step === 1 && !!region) ||
    (step === 2 && !!sizeBand) ||
    (step === 3 && starRating > 0);

  async function handleFinish() {
    if (!hotel) return;
    setSaving(true);
    const { error } = await supabase
      .from("hotels")
      .update({ region, size_band: sizeBand, star_rating: starRating })
      .eq("id", hotel.id);
    setSaving(false);
    if (error) {
      toast.error("Could not save your profile");
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    }
    toast.success("Hotel profile saved");
    setOpen(false);
    onCompleted();
  }

  function handleSkip() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "skipped");
    }
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_40px_120px_-30px_color-mix(in_oklab,var(--primary)_50%,transparent)]"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", damping: 22, stiffness: 220 }}
          >
            {/* Progress bar */}
            <div className="h-1 w-full bg-muted">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-secondary"
                animate={{ width: `${((step + 1) / totalSteps) * 100}%` }}
                transition={{ type: "spring", damping: 24, stiffness: 220 }}
              />
            </div>

            <div className="px-8 pb-2 pt-7">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>Setup · Step {step + 1} of {totalSteps}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={handleSkip}
                >
                  Skip
                </button>
              </div>
            </div>

            <div className="min-h-[340px] px-8 pb-8 pt-4">
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <StepShell key="welcome" icon={Sparkles} eyebrow="Welcome">
                    <h2 className="font-serif text-3xl font-semibold leading-tight">
                      Let's tune your benchmarks
                    </h2>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Three quick questions about your property so we can compare
                      you against the most similar hotels. Takes under 30 seconds.
                    </p>
                    <ul className="mt-5 space-y-2 text-sm">
                      <BulletItem>Pick your region</BulletItem>
                      <BulletItem>Confirm your size band</BulletItem>
                      <BulletItem>Choose your star rating</BulletItem>
                    </ul>
                  </StepShell>
                )}

                {step === 1 && (
                  <StepShell key="region" icon={MapPin} eyebrow="Question 1 of 3">
                    <h2 className="font-serif text-3xl font-semibold leading-tight">
                      What's your region?
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Determines climate-adjusted peer cohorts.
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-2">
                      {REGIONS.map((r) => (
                        <OptionCard
                          key={r}
                          selected={region === r}
                          onClick={() => setRegion(r)}
                          title={r}
                        />
                      ))}
                    </div>
                  </StepShell>
                )}

                {step === 2 && (
                  <StepShell key="size" icon={Building2} eyebrow="Question 2 of 3">
                    <h2 className="font-serif text-3xl font-semibold leading-tight">
                      How large is your property?
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      We benchmark against properties in the same size band.
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {SIZE_BANDS.map((s) => (
                        <OptionCard
                          key={s.value}
                          selected={sizeBand === s.value}
                          onClick={() => setSizeBand(s.value)}
                          title={s.label}
                          hint={s.hint}
                        />
                      ))}
                    </div>
                  </StepShell>
                )}

                {step === 3 && (
                  <StepShell key="star" icon={Star} eyebrow="Question 3 of 3">
                    <h2 className="font-serif text-3xl font-semibold leading-tight">
                      What's your star rating?
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Higher segments typically run more energy-intensive amenities.
                    </p>
                    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {STARS.map((s) => (
                        <OptionCard
                          key={s.value}
                          selected={starRating === s.value}
                          onClick={() => setStarRating(s.value)}
                          title={s.label}
                          hint={s.segment}
                        />
                      ))}
                    </div>
                  </StepShell>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-card/60 px-8 py-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>

              {step < totalSteps - 1 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canNext}
                  className="gap-1"
                >
                  {step === 0 ? "Get started" : "Continue"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleFinish}
                  disabled={!canNext || saving}
                  className="gap-1"
                >
                  {saving ? "Saving…" : "Save profile"}
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepShell({
  icon: Icon,
  eyebrow,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {eyebrow}
      </div>
      {children}
    </motion.div>
  );
}

function OptionCard({
  selected,
  onClick,
  title,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-background hover:border-primary/50 hover:bg-muted/40"
      )}
    >
      <span className="text-sm font-medium text-foreground">{title}</span>
      {hint && (
        <span className="mt-0.5 text-[11px] text-muted-foreground">{hint}</span>
      )}
      {selected && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-muted-foreground">
      <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-primary" />
      <span>{children}</span>
    </li>
  );
}
