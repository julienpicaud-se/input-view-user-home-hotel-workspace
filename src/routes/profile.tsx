import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Save, UserCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEMO_PROFILE_ID,
  TIMEZONES,
  type UserProfile,
} from "@/lib/user-profile";
import { PageContainer, PageHeader } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile & settings — RA+" },
      {
        name: "description",
        content:
          "Manage your name, timezone, company information and notification preferences.",
      },
    ],
  }),
  component: ProfilePage,
});

const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(100, { message: "Name must be less than 100 characters" })
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(255, { message: "Email must be less than 255 characters" })
    .email({ message: "Invalid email address" })
    .optional()
    .or(z.literal("")),
  timezone: z.string().min(1, { message: "Pick a timezone" }),
  company_name: z
    .string()
    .trim()
    .max(120, { message: "Company name must be less than 120 characters" })
    .optional()
    .or(z.literal("")),
  company_role: z
    .string()
    .trim()
    .max(120, { message: "Role must be less than 120 characters" })
    .optional()
    .or(z.literal("")),
  preferred_units: z.enum(["metric", "imperial"]),
  email_notifications: z.boolean(),
});

function ProfilePage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);

  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [timezone, setTimezone] = React.useState("Europe/Rome");
  const [companyName, setCompanyName] = React.useState("");
  const [companyRole, setCompanyRole] = React.useState("");
  const [preferredUnits, setPreferredUnits] = React.useState<"metric" | "imperial">("metric");
  const [emailNotifications, setEmailNotifications] = React.useState(true);

  const hydrate = React.useCallback((p: UserProfile) => {
    setProfile(p);
    setDisplayName(p.display_name ?? "");
    setEmail(p.email ?? "");
    setTimezone(p.timezone || "Europe/Rome");
    setCompanyName(p.company_name ?? "");
    setCompanyRole(p.company_role ?? "");
    setPreferredUnits((p.preferred_units === "imperial" ? "imperial" : "metric"));
    setEmailNotifications(Boolean(p.email_notifications));
  }, []);

  React.useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", DEMO_PROFILE_ID)
        .maybeSingle();
      if (error) {
        toast.error("Couldn't load your profile");
        setLoading(false);
        return;
      }
      if (data) {
        hydrate(data as UserProfile);
      }
      setLoading(false);
    })();
  }, [hydrate]);

  const onSave = async () => {
    const parsed = profileSchema.safeParse({
      display_name: displayName,
      email,
      timezone,
      company_name: companyName,
      company_role: companyRole,
      preferred_units: preferredUnits,
      email_notifications: emailNotifications,
    });

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? "Please check your inputs");
      return;
    }

    setSaving(true);
    const payload = {
      id: DEMO_PROFILE_ID,
      display_name: parsed.data.display_name?.trim() || null,
      email: parsed.data.email?.trim() || null,
      timezone: parsed.data.timezone,
      company_name: parsed.data.company_name?.trim() || null,
      company_role: parsed.data.company_role?.trim() || null,
      preferred_units: parsed.data.preferred_units,
      email_notifications: parsed.data.email_notifications,
    };

    const { data, error } = await supabase
      .from("user_profiles")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .maybeSingle();

    setSaving(false);
    if (error) {
      toast.error("Couldn't save your profile");
      return;
    }
    if (data) hydrate(data as UserProfile);
    toast.success("Profile updated");
  };

  const initials = React.useMemo(() => {
    const source = displayName || email || "U";
    return source
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "U";
  }, [displayName, email]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Account"
        title="Profile & settings"
        subtitle="Update your personal details, timezone and how RA+ behaves for you."
      />

      {/* Identity card */}
      <Card className="rounded-3xl border-border/60 p-6 md:p-8">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <span className="font-serif text-2xl font-semibold">{initials}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl font-semibold text-foreground">
              {displayName || "Your profile"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {companyRole || "Role"}
              {companyName ? ` · ${companyName}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="display_name">Full name</Label>
            <Input
              id="display_name"
              value={displayName}
              maxLength={100}
              placeholder="e.g. Maria Rossi"
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              maxLength={255}
              placeholder="you@hotel.com"
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone} disabled={loading}>
              <SelectTrigger id="timezone" className="w-full">
                <SelectValue placeholder="Select a timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for monthly reporting periods and timestamps.
            </p>
          </div>
        </div>
      </Card>

      {/* Company card */}
      <Card className="mt-6 rounded-3xl border-border/60 p-6 md:p-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-semibold text-foreground">
              Company preferences
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              How your organisation appears across RA+.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="company_name">Company name</Label>
            <Input
              id="company_name"
              value={companyName}
              maxLength={120}
              placeholder="e.g. RA+ Hospitality Group"
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_role">Your role</Label>
            <Input
              id="company_role"
              value={companyRole}
              maxLength={120}
              placeholder="e.g. Sustainability Manager"
              onChange={(e) => setCompanyRole(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preferred_units">Preferred units</Label>
            <Select
              value={preferredUnits}
              onValueChange={(v) => setPreferredUnits(v === "imperial" ? "imperial" : "metric")}
              disabled={loading}
            >
              <SelectTrigger id="preferred_units" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="metric">Metric (kWh, m³, kg)</SelectItem>
                <SelectItem value="imperial">Imperial (kBtu, gal, lb)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
            <div className="pr-4">
              <Label htmlFor="email_notifications" className="text-sm font-medium">
                Email notifications
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Monthly summaries and benchmark updates.
              </p>
            </div>
            <Switch
              id="email_notifications"
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
              disabled={loading}
            />
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-border/60 pt-6">
          <Button
            variant="ghost"
            onClick={() => profile && hydrate(profile)}
            disabled={loading || saving}
          >
            Reset
          </Button>
          <Button onClick={onSave} disabled={loading || saving} className="rounded-xl">
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save changes
          </Button>
        </div>
      </Card>
    </PageContainer>
  );
}
