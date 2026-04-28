import * as React from "react";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { INTERESTS, useInterests, type InterestId } from "@/lib/interests";

/**
 * Spotify-style interest picker, shown the first time a user opens the app
 * and re-openable from settings. Selection only personalises the existing
 * dashboard — it never creates new pages.
 */
export function InterestsOnboarding() {
  const { interests, setInterests, markOnboarded, showOnboarding } = useInterests();
  const [selected, setSelected] = React.useState<Set<InterestId>>(new Set(interests));

  React.useEffect(() => {
    if (showOnboarding) setSelected(new Set(interests));
  }, [showOnboarding, interests]);

  const toggle = (id: InterestId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSave = () => {
    setInterests(Array.from(selected));
    markOnboarded();
  };

  const onSkip = () => {
    // Honour current selection (may be empty) and just dismiss.
    setInterests(Array.from(selected));
    markOnboarded();
  };

  return (
    <Dialog open={showOnboarding} onOpenChange={(o) => { if (!o) markOnboarded(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-0">
        <div className="px-6 pt-6 md:px-8 md:pt-8">
          <DialogHeader>
            <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3 w-3" />
              Personalize
            </div>
            <DialogTitle className="mt-3 font-serif text-2xl md:text-3xl font-semibold">
              What do you want to focus on?
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              Pick the topics that matter most. We'll prioritise the right KPIs,
              charts and insights on your dashboard. You can change this anytime.
            </DialogDescription>
          </DialogHeader>
        </div>

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

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-6 py-4 backdrop-blur md:px-8">
          <div className="text-xs text-muted-foreground">
            {selected.size === 0
              ? "Pick at least one to get a tailored view — or skip for the default."
              : `${selected.size} selected`}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onSkip} className="rounded-xl">
              Skip
            </Button>
            <Button onClick={onSave} className="rounded-xl">
              Personalize my dashboard
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
