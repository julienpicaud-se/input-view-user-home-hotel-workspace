import * as React from "react";
import { Check, Sparkles, ArrowRight, ArrowLeft, Hotel, Globe2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { INTERESTS, useInterests, type InterestId } from "@/lib/interests";
import { PROFILE_TYPE_META, useProfileType, type ProfileType } from "@/lib/profile-type";
import { PersonalizingTransition } from "@/components/personalizing-transition";

/**
 * Two-step onboarding:
 *  Step 1 (NEW): pick user type (Hotel / VPO / Central).
 *  Step 2 (UNCHANGED): pick interests — exact same UI/behavior as before.
 */
export function InterestsOnboarding() {
  const { interests, setInterests, markOnboarded, showOnboarding } = useInterests();
  const { profileType, setProfileType } = useProfileType();
  const [selected, setSelected] = React.useState<Set<InterestId>>(new Set(interests));
  const [step, setStep] = React.useState<1 | 2>(1);
  const [pickedRole, setPickedRole] = React.useState<ProfileType | null>(null);
  const [transitioning, setTransitioning] = React.useState(false);
  const wasOnboardingOpen = React.useRef(false);

  React.useEffect(() => {
    if (showOnboarding && !wasOnboardingOpen.current) {
      setSelected(new Set(interests));
      setStep(1);
      setPickedRole(profileType ?? null);
      setTransitioning(false);
    }
    wasOnboardingOpen.current = showOnboarding;
  }, [showOnboarding, interests, profileType]);

  const toggle = (id: InterestId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commit = () => {
    if (pickedRole) setProfileType(pickedRole);
    setInterests(Array.from(selected));
  };

  const onSave = () => {
    commit();
    setTransitioning(true);
  };

  const onSkip = () => {
    commit();
    setTransitioning(true);
  };

  const goNext = () => {
    if (!pickedRole) return;
    setProfileType(pickedRole);
    setStep(2);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o && !transitioning) markOnboarded();
  };

  return (
    <>
      <Dialog open={showOnboarding && !transitioning} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-0">
          <div className="px-6 pt-6 md:px-8 md:pt-8">
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
                  <Sparkles className="h-3 w-3" />
                  Personalize
                </div>
                <StepIndicator step={step} />
              </div>
              {step === 1 ? (
                <>
                  <DialogTitle className="mt-3 font-serif text-2xl md:text-3xl font-semibold">
                    Which role best describes you?
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-muted-foreground">
                    Before we personalize your dashboard, tell us which role best describes you.
                  </DialogDescription>
                </>
              ) : (
                <>
                  <DialogTitle className="mt-3 font-serif text-2xl md:text-3xl font-semibold">
                    What do you want to focus on?
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-muted-foreground">
                    Pick the topics that matter most. We'll prioritise the right KPIs, charts and
                    insights on your dashboard. You can change this anytime.
                  </DialogDescription>
                </>
              )}
            </DialogHeader>
          </div>

          {step === 1 ? (
            <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-3 md:p-8 md:pt-4">
              {ROLE_OPTIONS.map((opt) => {
                const isOn = pickedRole === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPickedRole(opt.id)}
                    aria-pressed={isOn}
                    className={[
                      "group relative overflow-hidden rounded-2xl border p-5 text-left transition-all",
                      isOn
                        ? "border-primary ring-2 ring-primary/30 bg-primary/[0.04]"
                        : "border-border/60 hover:border-border bg-card hover:bg-muted/40",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={[
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                          isOn
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground border border-border/60",
                        ].join(" ")}
                      >
                        {isOn ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          {PROFILE_TYPE_META[opt.id].label}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{opt.description}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 p-6 md:grid-cols-2 md:p-8 md:pt-4 lg:grid-cols-3">
              {INTERESTS.map((it) => {
                const isOn = selected.has(it.id);
                const Icon = it.icon;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggle(it.id)}
                    aria-pressed={isOn}
                    className={[
                      "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all",
                      isOn
                        ? "border-primary ring-2 ring-primary/30 bg-primary/[0.04]"
                        : "border-border/60 hover:border-border bg-card hover:bg-muted/40",
                    ].join(" ")}
                  >
                    <div
                      aria-hidden
                      className={[
                        "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity",
                        it.accent,
                        isOn ? "opacity-90" : "opacity-30 group-hover:opacity-60",
                      ].join(" ")}
                    />
                    <div className="relative flex items-start gap-3">
                      <span
                        className={[
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                          isOn
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-foreground border border-border/60",
                        ].join(" ")}
                      >
                        {isOn ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">{it.label}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{it.tagline}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-6 py-4 backdrop-blur md:px-8">
            <div className="text-xs text-muted-foreground">
              {step === 1
                ? pickedRole
                  ? PROFILE_TYPE_META[pickedRole].tagline
                  : "Pick the role that matches your scope to continue."
                : selected.size === 0
                  ? "Pick at least one to get a tailored view — or skip for the default."
                  : `${selected.size} selected`}
            </div>
            <div className="flex items-center gap-2">
              {step === 2 && (
                <Button variant="ghost" onClick={() => setStep(1)} className="rounded-xl">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
              )}
              {step === 1 ? (
                <Button onClick={goNext} disabled={!pickedRole} className="rounded-xl">
                  Continue
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={onSkip} className="rounded-xl">
                    Skip
                  </Button>
                  <Button onClick={onSave} className="rounded-xl">
                    Personalize my dashboard
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PersonalizingTransition
        show={transitioning}
        onDone={() => {
          setTransitioning(false);
          markOnboarded();
        }}
      />
    </>
  );
}

function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Step {step} of 2
      </span>
      <div className="flex items-center gap-1">
        <span
          className={[
            "h-1.5 w-6 rounded-full transition-colors",
            step >= 1 ? "bg-primary" : "bg-muted",
          ].join(" ")}
        />
        <span
          className={[
            "h-1.5 w-6 rounded-full transition-colors",
            step >= 2 ? "bg-primary" : "bg-muted",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

const ROLE_OPTIONS: Array<{
  id: ProfileType;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    id: "hotel_user",
    icon: Hotel,
    description: "I manage one hotel and focus on operational performance.",
  },
  {
    id: "vpo",
    icon: Globe2,
    description: "I oversee several hotels and compare performance.",
  },
  {
    id: "super_admin",
    icon: ShieldCheck,
    description: "I monitor performance and program health at group level.",
  },
];
