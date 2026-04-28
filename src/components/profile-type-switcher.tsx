import * as React from "react";
import { Check, ChevronDown, Hotel, Globe2, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PROFILE_TYPE_META,
  useProfileType,
  type ProfileType,
} from "@/lib/profile-type";

const ICONS: Record<ProfileType, React.ComponentType<{ className?: string }>> = {
  hotel_user: Hotel,
  vpo: Globe2,
  super_admin: ShieldCheck,
};

const ORDER: ProfileType[] = ["hotel_user", "vpo", "super_admin"];

/**
 * Dev-only role switcher — sits next to the View switcher in the header.
 * Lets us preview the same data through each profile lens without auth.
 */
export function ProfileTypeSwitcher() {
  const { profileType, setProfileType } = useProfileType();
  const meta = PROFILE_TYPE_META[profileType];
  const Icon = ICONS[profileType];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden sm:inline text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Role
        </span>
        <span>{meta.short}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-2xl">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Switch profile (dev preview)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ORDER.map((p) => {
          const m = PROFILE_TYPE_META[p];
          const RowIcon = ICONS[p];
          const active = profileType === p;
          return (
            <DropdownMenuItem
              key={p}
              onSelect={() => setProfileType(p)}
              className="flex items-start gap-3 rounded-xl py-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <RowIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{m.label}</span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground">{m.tagline}</p>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
