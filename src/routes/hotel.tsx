import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Building2, MapPin, Star, Sun, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_HOTEL_ID, type Hotel } from "@/lib/hotel";
import { PageContainer, PageHeader } from "@/components/page-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/hotel")({
  head: () => ({
    meta: [
      { title: "Hotel profile — RA+" },
      { name: "description", content: "Your property's profile and configuration." },
    ],
  }),
  component: HotelPage,
});

function HotelPage() {
  const [hotel, setHotel] = React.useState<Hotel | null>(null);

  React.useEffect(() => {
    void supabase
      .from("hotels")
      .select("*")
      .eq("id", DEMO_HOTEL_ID)
      .maybeSingle()
      .then(({ data }) => setHotel(data as Hotel | null));
  }, []);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Property"
        title="Hotel profile"
        subtitle="The details we use to benchmark your performance against similar properties."
      />

      {hotel && (
        <Card className="overflow-hidden rounded-3xl border-border/70 p-0">
          <div className="bg-gradient-to-br from-secondary to-primary px-8 py-10 text-primary-foreground">
            <div className="flex items-start gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-foreground/15 backdrop-blur">
                <Building2 className="h-8 w-8" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-primary-foreground/70">
                  Property name
                </div>
                <h2 className="mt-1 font-serif text-4xl font-semibold leading-tight">
                  {hotel.name}
                </h2>
                <div className="mt-2 flex items-center gap-1.5 text-sm text-primary-foreground/80">
                  <MapPin className="h-3.5 w-3.5" />
                  {hotel.region} · {hotel.climate_zone} climate
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Hash} label="Rooms" value={String(hotel.rooms)} />
            <Stat icon={Star} label="Star rating" value={`${hotel.star_rating} stars`} />
            <Stat icon={Building2} label="Size band" value={`${hotel.size_band} rooms`} />
            <Stat icon={Sun} label="Climate zone" value={hotel.climate_zone} />
          </div>
        </Card>
      )}

      <Card className="mt-6 rounded-2xl border-dashed bg-card/50 p-5 text-sm text-muted-foreground">
        <strong className="text-foreground">Demo property.</strong> In v1, RA+
        manages a single hotel. Multi-property management, user accounts and
        roles arrive in a future release.
      </Card>
    </PageContainer>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-card px-6 py-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 font-serif text-2xl font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}
