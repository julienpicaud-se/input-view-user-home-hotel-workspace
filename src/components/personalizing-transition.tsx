import * as React from "react";
import { Sparkles, Check } from "lucide-react";

interface Props {
  show: boolean;
  onDone: () => void;
  /** Total duration in ms. Defaults to ~3.2s. */
  duration?: number;
}

const STEPS = [
  "Applying your role view",
  "Prioritizing your focus areas",
  "Preparing your insights",
];

/**
 * Full-page transition shown once after onboarding completes.
 * Soft motion + cycling acknowledgments → brief "Your dashboard is ready."
 */
export function PersonalizingTransition({ show, onDone, duration = 3200 }: Props) {
  const [stepIdx, setStepIdx] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    if (!show) {
      setStepIdx(0);
      setReady(false);
      setLeaving(false);
      return;
    }
    const perStep = Math.max(600, Math.floor((duration - 700) / STEPS.length));
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => setStepIdx(i), perStep * i));
    });
    timers.push(setTimeout(() => setReady(true), duration - 600));
    timers.push(
      setTimeout(() => setLeaving(true), duration - 300),
    );
    timers.push(setTimeout(() => onDone(), duration));
    return () => timers.forEach(clearTimeout);
  }, [show, duration, onDone]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed inset-0 z-[100] flex items-center justify-center",
        "bg-background/95 backdrop-blur-md",
        leaving ? "animate-[ptFadeOut_0.3s_ease-out_forwards]" : "animate-[ptFadeIn_0.25s_ease-out]",
      ].join(" ")}
    >
      {/* Soft ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 40%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center px-6 text-center">
        {/* Animated configuration cues */}
        <ConfigCues ready={ready} />

        <div className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
          <Sparkles className="h-3 w-3" />
          Personalize
        </div>

        <h2 className="mt-3 font-serif text-2xl md:text-3xl font-semibold text-foreground">
          {ready ? "Your dashboard is ready." : "Personalizing your dashboard…"}
        </h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {ready
            ? "Bringing you in."
            : "Organizing insights based on your role and interests."}
        </p>

        {/* Cycling acknowledgments */}
        <div className="relative mt-6 h-5 w-full max-w-xs overflow-hidden">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={[
                "absolute inset-0 flex items-center justify-center text-xs text-muted-foreground transition-all duration-500",
                i === stepIdx && !ready
                  ? "opacity-100 translate-y-0"
                  : i < stepIdx || ready
                    ? "opacity-0 -translate-y-2"
                    : "opacity-0 translate-y-2",
              ].join(" ")}
            >
              {s}
            </div>
          ))}
          <div
            className={[
              "absolute inset-0 flex items-center justify-center gap-1.5 text-xs font-medium text-primary transition-all duration-500",
              ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
            ].join(" ")}
          >
            <Check className="h-3.5 w-3.5" />
            All set
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigCues({ ready }: { ready: boolean }) {
  // 6 blocks that gently float, then "snap" into a tidy row when ready.
  return (
    <div className="relative h-24 w-64">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const finalX = (i % 3) * 80 - 80; // -80, 0, 80
        const finalY = i < 3 ? -22 : 22;
        return (
          <span
            key={i}
            className={[
              "absolute left-1/2 top-1/2 h-10 w-16 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/60",
              "bg-card shadow-sm transition-all duration-700 ease-out",
              ready ? "" : "animate-[ptFloat_2.4s_ease-in-out_infinite]",
            ].join(" ")}
            style={{
              transform: ready
                ? `translate(calc(-50% + ${finalX}px), calc(-50% + ${finalY}px)) scale(1)`
                : undefined,
              animationDelay: ready ? undefined : `${i * 180}ms`,
              background: ready
                ? "color-mix(in oklab, var(--primary) 8%, var(--card))"
                : undefined,
              borderColor: ready
                ? "color-mix(in oklab, var(--primary) 35%, var(--border))"
                : undefined,
            }}
          >
            <span className="block h-1.5 w-8 rounded-full bg-muted-foreground/30 mx-auto mt-2" />
            <span className="block h-1.5 w-5 rounded-full bg-muted-foreground/20 mx-auto mt-1.5" />
          </span>
        );
      })}
    </div>
  );
}
