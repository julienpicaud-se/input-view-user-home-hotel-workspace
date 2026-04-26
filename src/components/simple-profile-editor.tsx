import * as React from "react";
import { Save, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DEMO_PROFILE_ID,
  TIMEZONES,
  type UserProfile,
} from "@/lib/user-profile";

/**
 * Calm, Simple-skin profile editor.
 * Loads (or creates) the demo profile row and lets the user
 * tweak name, company, time zone, units and email notifications.
 */
export function SimpleProfileEditor() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [draft, setDraft] = React.useState({
    display_name: "",
    email: "",
    company_name: "",
    company_role: "",
    timezone: "Europe/Rome",
    preferred_units: "metric",
    email_notifications: true,
  });

  React.useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", DEMO_PROFILE_ID)
        .maybeSingle();
      const p = data as UserProfile | null;
      setProfile(p);
      if (p) {
        setDraft({
          display_name: p.display_name ?? "",
          email: p.email ?? "",
          company_name: p.company_name ?? "",
          company_role: p.company_role ?? "",
          timezone: p.timezone ?? "Europe/Rome",
          preferred_units: p.preferred_units ?? "metric",
          email_notifications: p.email_notifications ?? true,
        });
      }
      setLoading(false);
    })();
  }, []);

  const dirty =
    !profile ||
    draft.display_name !== (profile.display_name ?? "") ||
    draft.email !== (profile.email ?? "") ||
    draft.company_name !== (profile.company_name ?? "") ||
    draft.company_role !== (profile.company_role ?? "") ||
    draft.timezone !== profile.timezone ||
    draft.preferred_units !== profile.preferred_units ||
    draft.email_notifications !== profile.email_notifications;

  async function save() {
    setSaving(true);
    const payload = {
      id: DEMO_PROFILE_ID,
      display_name: draft.display_name.trim() || null,
      email: draft.email.trim() || null,
      company_name: draft.company_name.trim() || null,
      company_role: draft.company_role.trim() || null,
      timezone: draft.timezone,
      preferred_units: draft.preferred_units,
      email_notifications: draft.email_notifications,
    };
    const { data, error } = await supabase
      .from("user_profiles")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error("Could not save profile.");
      return;
    }
    toast.success("Profile saved.");
    setSavedAt(Date.now());
    if (data) setProfile(data as UserProfile);
  }

  if (loading) {
    return (
      <div className="space-y-3 rounded-3xl border border-border/60 bg-card p-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-border/60 bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name">
          <input
            type="text"
            value={draft.display_name}
            onChange={(e) =>
              setDraft((d) => ({ ...d, display_name: e.target.value }))
            }
            placeholder="e.g. Marta Conti"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            placeholder="you@hotel.com"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Company">
          <input
            type="text"
            value={draft.company_name}
            onChange={(e) =>
              setDraft((d) => ({ ...d, company_name: e.target.value }))
            }
            placeholder="Optional"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Your role">
          <input
            type="text"
            value={draft.company_role}
            onChange={(e) =>
              setDraft((d) => ({ ...d, company_role: e.target.value }))
            }
            placeholder="e.g. General manager"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Time zone">
          <select
            value={draft.timezone}
            onChange={(e) =>
              setDraft((d) => ({ ...d, timezone: e.target.value }))
            }
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Units">
          <div className="flex gap-1.5">
            {(
              [
                { value: "metric", label: "Metric (kWh, m³, kg)" },
                { value: "imperial", label: "Imperial" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setDraft((d) => ({ ...d, preferred_units: opt.value }))
                }
                className={`flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition ${
                  draft.preferred_units === opt.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background px-4 py-3">
        <div>
          <div className="text-sm font-medium text-foreground">
            Email me reminders
          </div>
          <p className="text-xs text-muted-foreground">
            A short nudge once a month when it's time to log new data.
          </p>
        </div>
        <input
          type="checkbox"
          checked={draft.email_notifications}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              email_notifications: e.target.checked,
            }))
          }
          className="h-5 w-5 cursor-pointer accent-primary"
        />
      </label>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : savedAt && !dirty ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving…" : savedAt && !dirty ? "Saved" : "Save profile"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
