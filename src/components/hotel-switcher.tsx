import * as React from "react";
import { ChevronsUpDown, Building2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, setActiveHotelId, type Hotel } from "@/lib/hotel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function HotelSwitcher() {
  const [hotels, setHotels] = React.useState<Hotel[]>([]);
  const [activeId, setActiveIdState] = React.useState<string>(() => getActiveHotelId());

  React.useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("hotels")
        .select("*")
        .order("name", { ascending: true });
      setHotels((data as Hotel[]) ?? []);
    })();
  }, []);

  const active = hotels.find((h) => h.id === activeId);

  const handleSelect = (id: string) => {
    if (id === activeId) return;
    setActiveIdState(id);
    setActiveHotelId(id);
    // Hard reload so every route refetches data for the new hotel.
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex min-w-[220px] items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3.5 py-2 text-left text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2 truncate">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-3.5 w-3.5" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Hotel
            </span>
            <span className="truncate">{active?.name ?? "Select hotel"}</span>
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-2xl">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Your hotels ({hotels.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hotels.map((h) => {
          const isActive = h.id === activeId;
          return (
            <DropdownMenuItem
              key={h.id}
              onSelect={() => handleSelect(h.id)}
              className="flex items-start gap-2 rounded-xl py-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{h.name}</span>
                  {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {h.region} · {h.rooms} rooms · {h.star_rating}★
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
