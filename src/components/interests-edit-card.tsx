import * as React from "react";
import { Sparkles, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useInterests, INTEREST_META } from "@/lib/interests";

/**
 * Settings-page card that lets the user re-open the interest onboarding.
 */
export function InterestsEditCard() {
  const { interests, reopenOnboarding } = useInterests();

  return (
    <Card className="rounded-3xl border-border/60 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-semibold text-foreground">
              Your interests
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Topics we use to prioritize KPIs, charts and insights on your dashboard.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={reopenOnboarding}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit interests
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {interests.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No interests selected — your dashboard uses the default order.
          </span>
        ) : (
          interests.map((id) => {
            const meta = INTEREST_META[id];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground"
              >
                <Icon className="h-3 w-3 text-primary" />
                {meta.label}
              </span>
            );
          })
        )}
      </div>
    </Card>
  );
}
