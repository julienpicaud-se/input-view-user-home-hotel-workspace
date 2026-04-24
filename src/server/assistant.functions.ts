import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEMO_HOTEL_ID } from "@/lib/hotel";

interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

async function getHotelContext(hotelId: string): Promise<string> {
  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("*")
    .eq("id", hotelId)
    .maybeSingle();

  const { data: entries } = await supabaseAdmin
    .from("monthly_entries")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(12);

  if (!hotel) return "No hotel configured.";

  const recent =
    (entries ?? [])
      .map(
        (e) =>
          `${e.year}-${String(e.month).padStart(2, "0")}: elec ${e.electricity_kwh ?? "—"}kWh, gas ${
            e.gas_kwh ?? "—"
          }kWh, water ${e.water_m3 ?? "—"}m³, waste ${e.waste_kg ?? "—"}kg, occupied room-nights ${
            e.occupied_room_nights ?? "—"
          }, renewable ${e.renewable_pct ?? 0}%`
      )
      .join("\n") || "No data logged yet.";

  return `Hotel: ${hotel.name}
Rooms: ${hotel.rooms}
Region: ${hotel.region} (${hotel.climate_zone})
Star rating: ${hotel.star_rating}
Recent monthly utility data (most recent first):
${recent}`;
}

const SYSTEM_PROMPT = `You are Sera, a sustainability and energy consultant for hotel managers.
You speak in warm, plain language — never use jargon.
You always ground your answers in the hotel's actual data when relevant.
Use bullet points and short paragraphs. When you give advice, prioritise actions by impact and ease.
Always include units (kWh, m³, kg, %).`;

async function callLovableAI(messages: ChatMsg[], stream = false): Promise<Response> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      stream,
    }),
  });
}

export const sendAssistantMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      message: z.string().min(1).max(2000),
      hotelId: z.string().min(1).optional(),
      history: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(8000),
          })
        )
        .max(40)
        .default([]),
    })
  )
  .handler(async ({ data }) => {
    const hotelId = data.hotelId ?? DEMO_HOTEL_ID;
    const context = await getHotelContext(hotelId);

    const messages: ChatMsg[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nHOTEL CONTEXT:\n${context}` },
      ...data.history,
      { role: "user", content: data.message },
    ];

    let res: Response;
    try {
      res = await callLovableAI(messages, false);
    } catch (e) {
      console.error("AI call failed:", e);
      return { ok: false as const, error: "The assistant is temporarily unavailable." };
    }

    if (res.status === 429) {
      return { ok: false as const, error: "Rate limit hit. Please try again in a moment." };
    }
    if (res.status === 402) {
      return {
        ok: false as const,
        error: "AI credits exhausted. Add credits in your Lovable workspace.",
      };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("AI error:", res.status, text);
      return { ok: false as const, error: "The assistant returned an error." };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";

    // Persist both messages
    await supabaseAdmin.from("assistant_messages").insert([
      { hotel_id: hotelId, role: "user", content: data.message },
      { hotel_id: hotelId, role: "assistant", content },
    ]);

    return { ok: true as const, content };
  });

export const generateInsights = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      hotelId: z.string().min(1).optional(),
    }).default({}),
  )
  .handler(async ({ data }) => {
    const hotelId = data.hotelId ?? DEMO_HOTEL_ID;
    const context = await getHotelContext(hotelId);

    const messages: ChatMsg[] = [
      {
        role: "system",
        content: `You are Sera, a sustainability consultant. Based on the hotel data below, produce EXACTLY 3 short insight cards. Return ONLY valid JSON of shape: {"insights":[{"title":"...","body":"...","tone":"positive"|"warning"|"neutral"}]}. Each title <= 8 words, body <= 22 words, mention real numbers from the data.\n\n${context}`,
      },
      { role: "user", content: "Generate this month's insights." },
    ];

    let res: Response;
    try {
      res = await callLovableAI(messages, false);
    } catch (e) {
      console.error("Insights AI call failed:", e);
      return { insights: [] as Insight[] };
    }
    if (!res.ok) {
      console.error("Insights error:", res.status);
      return { insights: [] as Insight[] };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json\s*|```/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned) as { insights: Insight[] };
      return { insights: (parsed.insights ?? []).slice(0, 3) };
    } catch {
      return { insights: [] as Insight[] };
    }
  });

export interface Insight {
  title: string;
  body: string;
  tone: "positive" | "warning" | "neutral";
}

export const explainChart = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      chartId: z.enum(["consumption", "co2e", "intensity", "peer"]),
      hotelId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const hotelId = data.hotelId ?? DEMO_HOTEL_ID;
    const context = await getHotelContext(hotelId);

    const chartBriefs: Record<string, string> = {
      consumption:
        "12-month stacked area chart of electricity, gas, water and waste, with a CO₂e line overlay. X axis = months, Y axis = consumption volumes (mixed units, stacked).",
      co2e:
        "Monthly bar chart of estimated CO₂e emissions in kilograms, derived from electricity, gas, water and waste with standard emission factors.",
      intensity:
        "Line chart of consumption per occupied room-night for electricity (kWh/rn), gas (kWh/rn) and water (m³/rn). Normalises away occupancy effects.",
      peer:
        "Peer comparison cards showing your latest intensity per room-night vs the P10/P50/P90 of similar hotels (size band, region, star rating).",
    };

    const messages: ChatMsg[] = [
      {
        role: "system",
        content: `You are Sera. Explain the selected chart to a hotel manager in plain language. Return ONLY valid JSON: {"summary":"1 short sentence on what the chart shows","read":["3 bullet points on how to read it"],"signals":["2-3 bullet points on what to look for in THIS hotel's data, citing real numbers/months when possible"],"actions":["3-5 SPECIFIC action ideas tailored to the drivers visible in THIS hotel's data — each must reference the concrete utility/driver/month it targets and start with a concrete verb (Switch, Audit, Replace, Schedule, Reduce, Calibrate…). Avoid generic advice."]}. Keep every bullet under 22 words. Use units (kWh, m³, kg, %).\n\nCHART: ${chartBriefs[data.chartId]}\n\nHOTEL CONTEXT:\n${context}`,
      },
      { role: "user", content: `Explain the "${data.chartId}" chart.` },
    ];

    let res: Response;
    try {
      res = await callLovableAI(messages, false);
    } catch (e) {
      console.error("explainChart AI call failed:", e);
      return { ok: false as const, error: "Explanation unavailable." };
    }
    if (!res.ok) {
      return { ok: false as const, error: "Explanation unavailable." };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json\s*|```/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned) as ChartExplanation;
      return { ok: true as const, explanation: parsed };
    } catch {
      return { ok: false as const, error: "Could not parse explanation." };
    }
  });

export interface ChartExplanation {
  summary: string;
  read: string[];
  signals: string[];
  actions: string[];
}

export interface BriefingPayload {
  headline: string;
  summary: string;
  highlights: { label: string; tone: "positive" | "warning" | "neutral" }[];
  focus: string;
  questions: string[];
}

async function getPortfolioContext(): Promise<{
  context: string;
  signature: string;
  hasData: boolean;
}> {
  const { data: hotels } = await supabaseAdmin
    .from("hotels")
    .select("*")
    .order("name", { ascending: true });

  const { data: entries } = await supabaseAdmin
    .from("monthly_entries")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(60);

  const hotelList = hotels ?? [];
  const entryList = entries ?? [];

  if (hotelList.length === 0) {
    return { context: "No hotels yet.", signature: "empty", hasData: false };
  }

  // Latest period across portfolio
  const sorted = [...entryList].sort((a, b) =>
    a.year !== b.year ? b.year - a.year : b.month - a.month
  );
  const latest = sorted[0];
  const latestKey = latest ? `${latest.year}-${latest.month}` : "none";
  const prevKey = latest
    ? latest.month === 1
      ? `${latest.year - 1}-12`
      : `${latest.year}-${latest.month - 1}`
    : "none";

  // Aggregate latest month vs prior month
  const sumFor = (y: number, m: number) => {
    const rows = entryList.filter((e) => e.year === y && e.month === m);
    let elec = 0,
      gas = 0,
      water = 0,
      waste = 0,
      rn = 0;
    for (const e of rows) {
      elec += Number(e.electricity_kwh ?? 0);
      gas += Number(e.gas_kwh ?? 0);
      water += Number(e.water_m3 ?? 0);
      waste += Number(e.waste_kg ?? 0);
      rn += Number(e.occupied_room_nights ?? 0);
    }
    return { elec, gas, water, waste, rn, count: rows.length };
  };

  const latestTotals = latest ? sumFor(latest.year, latest.month) : null;
  const prevYear = latest && latest.month === 1 ? latest.year - 1 : latest?.year;
  const prevMonth = latest && latest.month === 1 ? 12 : (latest?.month ?? 0) - 1;
  const prevTotals = latest && prevYear ? sumFor(prevYear, prevMonth) : null;

  // Per-hotel snapshot (latest month per hotel)
  const perHotel = hotelList.map((h) => {
    const hEntries = entryList
      .filter((e) => e.hotel_id === h.id)
      .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
    const last = hEntries[0];
    const prior = hEntries[1];
    const intensity = (val: number | null | undefined, rn: number | null | undefined) =>
      rn && Number(rn) > 0 ? Number(val ?? 0) / Number(rn) : null;
    return {
      name: h.name,
      rooms: h.rooms,
      region: h.region,
      last: last
        ? {
            period: `${last.year}-${String(last.month).padStart(2, "0")}`,
            elec: last.electricity_kwh,
            gas: last.gas_kwh,
            water: last.water_m3,
            waste: last.waste_kg,
            rn: last.occupied_room_nights,
            renewable: last.renewable_pct,
            elecPerRn: intensity(last.electricity_kwh, last.occupied_room_nights),
          }
        : null,
      delta: last && prior && Number(prior.electricity_kwh ?? 0) > 0
        ? ((Number(last.electricity_kwh ?? 0) - Number(prior.electricity_kwh ?? 0)) /
            Number(prior.electricity_kwh ?? 0)) *
          100
        : null,
    };
  });

  const hotelSummary = perHotel
    .map(
      (h) =>
        `- ${h.name} (${h.rooms} rooms, ${h.region}): ${
          h.last
            ? `latest ${h.last.period} — elec ${h.last.elec ?? "—"}kWh${
                h.last.elecPerRn !== null
                  ? ` (${h.last.elecPerRn.toFixed(2)}kWh/rn)`
                  : ""
              }, water ${h.last.water ?? "—"}m³, waste ${h.last.waste ?? "—"}kg, renewable ${h.last.renewable ?? 0}%${
                h.delta !== null
                  ? `, electricity ${h.delta >= 0 ? "+" : ""}${h.delta.toFixed(1)}% MoM`
                  : ""
              }`
            : "no data logged yet"
        }`
    )
    .join("\n");

  const portfolioMoM =
    latestTotals && prevTotals && prevTotals.elec > 0
      ? ((latestTotals.elec - prevTotals.elec) / prevTotals.elec) * 100
      : null;

  const ctx = `Portfolio: ${hotelList.length} hotel(s), ${hotelList.reduce(
    (a, h) => a + (h.rooms ?? 0),
    0
  )} rooms total.
Latest reporting period across portfolio: ${
    latest ? `${latest.year}-${String(latest.month).padStart(2, "0")}` : "none"
  }.
${
  latestTotals
    ? `Latest-month totals: electricity ${Math.round(latestTotals.elec)}kWh, gas ${Math.round(
        latestTotals.gas
      )}kWh, water ${Math.round(latestTotals.water)}m³, waste ${Math.round(latestTotals.waste)}kg, ${Math.round(latestTotals.rn)} occupied room-nights across ${latestTotals.count} hotel(s).`
    : ""
}
${
  portfolioMoM !== null
    ? `Portfolio electricity MoM change: ${portfolioMoM >= 0 ? "+" : ""}${portfolioMoM.toFixed(1)}%.`
    : ""
}

Per-hotel snapshot:
${hotelSummary}`;

  return {
    context: ctx,
    signature: `${latestKey}|${prevKey}|${hotelList.length}|${entryList.length}`,
    hasData: entryList.length > 0,
  };
}

export const generateBriefing = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        firstName: z.string().min(1).max(80).optional(),
        todos: z
          .array(
            z.object({
              title: z.string().max(200),
              description: z.string().max(400).optional(),
              done: z.boolean().optional(),
              tone: z.enum(["primary", "warning", "muted", "danger"]).optional(),
            })
          )
          .max(40)
          .optional(),
        issues: z
          .array(
            z.object({
              hotelName: z.string().max(120),
              severity: z.enum(["critical", "warning", "info"]),
              title: z.string().max(200),
              detail: z.string().max(400).optional(),
            })
          )
          .max(40)
          .optional(),
      })
      .default({})
  )
  .handler(async ({ data }): Promise<{ ok: true; briefing: BriefingPayload; signature: string } | { ok: false; error: string }> => {
    const { context, signature, hasData } = await getPortfolioContext();
    const name = data.firstName?.trim() || "there";
    const todos = data.todos ?? [];
    const issues = data.issues ?? [];

    const openTodos = todos.filter((t) => !t.done);
    const todosBlock =
      openTodos.length === 0
        ? "No open to-dos right now."
        : openTodos
            .slice(0, 20)
            .map(
              (t, i) =>
                `${i + 1}. [${t.tone ?? "primary"}] ${t.title}${
                  t.description ? ` — ${t.description}` : ""
                }`
            )
            .join("\n");

    const issuesBlock =
      issues.length === 0
        ? "No data quality issues detected."
        : issues
            .slice(0, 20)
            .map(
              (i, idx) =>
                `${idx + 1}. [${i.severity}] ${i.hotelName}: ${i.title}${
                  i.detail ? ` — ${i.detail}` : ""
                }`
            )
            .join("\n");

    if (!hasData) {
      return {
        ok: true as const,
        signature,
        briefing: {
          headline: `Welcome, ${name} — let's get your first numbers in.`,
          summary:
            "There's no monthly data logged yet. Add electricity, gas, water and waste for one month and Sera will start spotting trends and savings for you.",
          highlights: [
            { label: "0 months logged", tone: "warning" },
            { label: "Ready when you are", tone: "neutral" },
          ],
          focus: "Log your most recent month for one hotel to unlock benchmarks.",
          questions: [
            "What data do I need to log first?",
            "How will Sera help once I add data?",
            "Which utilities matter most for my CO₂e?",
          ],
        },
      };
    }

    const messages: ChatMsg[] = [
      {
        role: "system",
        content: `You are Sera, a warm sustainability consultant briefing a hotel manager named ${name}. Your ONLY job in this briefing is to focus them on (a) their open to-dos and (b) their data quality issues. Do NOT summarise consumption or CO₂e trends — those live elsewhere on the page. Speak directly to ${name} by first name. Be specific, cite hotel names and the exact issues/to-dos listed below. No jargon, no fluff.

Return ONLY valid JSON of shape:
{
  "headline": "one sentence, <= 14 words, addressed to ${name}, naming the single most pressing to-do or data issue today",
  "summary": "2 short sentences (<= 45 words total) explaining what needs ${name}'s attention across to-dos and data quality, grouped sensibly",
  "highlights": [
    {"label": "<= 7 words referencing a real to-do or issue (e.g. '3 critical data issues', 'April missing for Costa Azul')", "tone": "positive" | "warning" | "neutral"}
  ],
  "focus": "one sentence telling ${name} the single best next action today drawn from the to-dos or issues, <= 20 words",
  "questions": [
    "4 short follow-up questions ${name} would naturally ask about these to-dos or data issues — each <= 10 words, first person ('Why is...', 'How do I fix...', 'What should I do about...'), grounded in the specific items below"
  ]
}
Return exactly 3 highlights and exactly 4 questions. Use "warning" for critical issues or overdue to-dos, "neutral" for routine items, "positive" only when the to-do/issue list is genuinely light. If there are no to-dos and no issues, say so warmly and suggest one optional next step (e.g. reviewing peer benchmarks).
Questions must reference a specific hotel name, to-do, or issue from the lists below — never generic.

OPEN TO-DOS (${openTodos.length}):
${todosBlock}

DATA QUALITY ISSUES (${issues.length}):
${issuesBlock}

PORTFOLIO CONTEXT (for grounding only — do not summarise):
${context}`,
      },
      { role: "user", content: `Brief me on what needs my attention today.` },
    ];

    let res: Response;
    try {
      res = await callLovableAI(messages, false);
    } catch (e) {
      console.error("Briefing AI call failed:", e);
      return { ok: false as const, error: "Briefing unavailable right now." };
    }

    if (res.status === 429) {
      return { ok: false as const, error: "Rate limit hit — try again in a moment." };
    }
    if (res.status === 402) {
      return { ok: false as const, error: "AI credits exhausted. Add credits in your Lovable workspace." };
    }
    if (!res.ok) {
      console.error("Briefing error:", res.status);
      return { ok: false as const, error: "Briefing unavailable right now." };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json\s*|```/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned) as BriefingPayload;
      return {
        ok: true as const,
        signature,
        briefing: {
          headline: String(parsed.headline ?? "").slice(0, 200),
          summary: String(parsed.summary ?? "").slice(0, 500),
          highlights: (parsed.highlights ?? []).slice(0, 3).map((h) => ({
            label: String(h.label ?? "").slice(0, 80),
            tone: h.tone === "positive" || h.tone === "warning" ? h.tone : "neutral",
          })),
          focus: String(parsed.focus ?? "").slice(0, 240),
          questions: (parsed.questions ?? [])
            .slice(0, 4)
            .map((q) => String(q ?? "").slice(0, 120))
            .filter((q) => q.length > 0),
        },
      };
    } catch {
      return { ok: false as const, error: "Could not parse briefing." };
    }
  });

/* -------------------- Bill extraction (Sera-guided log) -------------------- */

export type BillUtility = "electricity" | "gas" | "water" | "waste";

export interface BillExtraction {
  utility: BillUtility | null;
  value: number | null;
  unit: string | null;
  period_start: string | null; // YYYY-MM-DD
  period_end: string | null; // YYYY-MM-DD
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

export const extractBillData = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      // data URL (e.g. "data:image/png;base64,iVBOR...") or a remote https:// URL
      imageDataUrl: z.string().min(20).max(15_000_000),
      utilityHint: z.enum(["electricity", "gas", "water", "waste"]).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; extraction: BillExtraction } | { ok: false; error: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI not configured." };
    }

    const utilHintText = data.utilityHint
      ? `The user is logging a ${data.utilityHint} bill — prioritise that utility.`
      : "Detect which utility this bill is for.";

    const systemPrompt = `You are Sera, parsing a utility bill for a hotel. Extract the TOTAL CONSUMPTION for the billing period (not the cost). ${utilHintText}

Return ONLY valid JSON of shape:
{
  "utility": "electricity" | "gas" | "water" | "waste" | null,
  "value": number | null,
  "unit": "kWh" | "m3" | "kg" | null,
  "period_start": "YYYY-MM-DD" | null,
  "period_end": "YYYY-MM-DD" | null,
  "confidence": "high" | "medium" | "low",
  "notes": "1 short sentence on what you saw, e.g. 'Read 2,140 kWh for 1–31 March from Enel bill.'"
}

Conversion rules:
- Electricity & gas → kWh. If gas is in m³, convert using 10.55 kWh/m³ (typical natural gas calorific value) and mention the conversion in notes.
- Water → m³. If in litres, divide by 1000.
- Waste → kg. If in tonnes, multiply by 1000.

If you cannot read the bill or it's not a utility bill, set every field to null and confidence "low".`;

    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract the consumption from this bill." },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
        }),
      });
    } catch (e) {
      console.error("extractBillData fetch failed:", e);
      return { ok: false as const, error: "Could not reach the AI service." };
    }

    if (res.status === 429) {
      return { ok: false as const, error: "Rate limit hit. Try again in a moment." };
    }
    if (res.status === 402) {
      return { ok: false as const, error: "AI credits exhausted." };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("extractBillData error:", res.status, text);
      return { ok: false as const, error: "The AI couldn't read this bill." };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json\s*|```/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned) as Partial<BillExtraction>;
      const utility =
        parsed.utility === "electricity" ||
        parsed.utility === "gas" ||
        parsed.utility === "water" ||
        parsed.utility === "waste"
          ? parsed.utility
          : null;
      const value =
        typeof parsed.value === "number" && Number.isFinite(parsed.value) && parsed.value >= 0
          ? parsed.value
          : null;
      const confidence: "high" | "medium" | "low" =
        parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low";
      return {
        ok: true as const,
        extraction: {
          utility,
          value,
          unit: parsed.unit ?? null,
          period_start: parsed.period_start ?? null,
          period_end: parsed.period_end ?? null,
          confidence,
          notes: parsed.notes ? String(parsed.notes).slice(0, 240) : null,
        },
      };
    } catch {
      return { ok: false as const, error: "Couldn't parse the bill — try a clearer photo." };
    }
  });

/* -------------------- Smart paste — multi-metric, multi-month extractor -------------------- */

export type SmartMetric = "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg" | "occupied_room_nights";

export interface SmartEntry {
  year: number;
  month: number; // 1-12
  metric: SmartMetric;
  value: number;
  original_unit: string | null;
  note: string | null;
  confidence?: "high" | "medium" | "low";
  confidence_reason?: string | null;
}

export interface SmartExtraction {
  entries: SmartEntry[];
  summary: string;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

export const extractSmartInput = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      text: z.string().min(2).max(8000).optional(),
      imageDataUrl: z.string().min(20).max(15_000_000).optional(),
      currentYear: z.number().int().min(2000).max(2100).optional(),
      sourceLanguage: z.enum(["en", "fr"]).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; extraction: SmartExtraction } | { ok: false; error: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI not configured." };
    if (!data.text && !data.imageDataUrl) {
      return { ok: false as const, error: "Paste some text or attach a screenshot." };
    }

    const refYear = data.currentYear ?? new Date().getFullYear();
    const langHint =
      data.sourceLanguage === "fr"
        ? `\nThe input is in FRENCH. French month names (janvier..décembre), French units (mètres cubes, kilowattheures, tonnes, déchets, nuitées) and French spelled-out numbers ("douze mille quatre cents" = 12 400, "deux virgule trois" = 2.3) are common. The decimal separator is the comma. Treat "k" or "K" after a number as ×1000.`
        : data.sourceLanguage === "en"
          ? `\nThe input is in ENGLISH. Decimal separator is a dot.`
          : "";

    const systemPrompt = `You are Sera, an expert at parsing free-form sustainability data from hotel managers.
The user pastes ANYTHING: emails, spreadsheet rows, screenshots, a quick "April elec 12,400 kWh, water 230 m3", a forwarded utility summary covering several months, or a voice transcript with spelled-out numbers like "twelve thousand four hundred" / "douze mille quatre cents".
${langHint}
Extract every (month, metric, value) triple you can find. Reference year is ${refYear} when not specified.

Conversion rules (always normalise to canonical units):
- electricity_kwh: kWh. MWh × 1000, GWh × 1_000_000.
- gas_kwh: kWh. m³ of natural gas × 10.55. therm × 29.3. MWh × 1000.
- water_m3: cubic metres. litres ÷ 1000. US gal × 0.003785. ft³ × 0.02832.
- waste_kg: kilograms. tonnes × 1000. lb × 0.4536.
- occupied_room_nights: integer count (French: "nuitées").

For EACH extracted entry, also report a per-field confidence:
- "high": value, unit and month are all unambiguous in the source.
- "medium": you had to convert units, infer the year, parse spelled-out numbers, or the phrasing left small ambiguity.
- "low": the metric, month or value was unclear, you guessed, or the number is suspicious (extreme outlier, missing unit, possible mishearing in a voice transcript).
Always include a brief confidence_reason (max 80 chars) when confidence is medium or low — explain WHY in one short phrase the user can act on (e.g. "no unit stated, assumed kWh", "spelled-out number, possible mishearing", "year inferred").

Return ONLY valid JSON via the tool call. Months are 1-12. Always reply in English regardless of input language. Skip values you cannot confidently identify and add a warning instead.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "save_extracted_metrics",
          description: "Return all extracted metric entries.",
          parameters: {
            type: "object",
            properties: {
              entries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    year: { type: "integer", minimum: 2000, maximum: 2100 },
                    month: { type: "integer", minimum: 1, maximum: 12 },
                    metric: {
                      type: "string",
                      enum: ["electricity_kwh", "gas_kwh", "water_m3", "waste_kg", "occupied_room_nights"],
                    },
                    value: { type: "number", minimum: 0 },
                    original_unit: { type: "string" },
                    note: { type: "string" },
                    confidence: {
                      type: "string",
                      enum: ["high", "medium", "low"],
                      description: "Per-entry confidence in the extracted value, unit and month.",
                    },
                    confidence_reason: {
                      type: "string",
                      description: "Short explanation when confidence is medium or low.",
                    },
                  },
                  required: ["year", "month", "metric", "value", "confidence"],
                  additionalProperties: false,
                },
              },
              summary: { type: "string", description: "1 short friendly sentence on what was found." },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              warnings: {
                type: "array",
                items: { type: "string" },
                description: "Anything ambiguous, skipped, or that needs the user's review.",
              },
            },
            required: ["entries", "summary", "confidence", "warnings"],
            additionalProperties: false,
          },
        },
      },
    ];

    const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
    if (data.text) userContent.push({ type: "text", text: data.text });
    if (data.imageDataUrl) {
      userContent.push({ type: "text", text: "Also extract anything visible in this screenshot:" });
      userContent.push({ type: "image_url", image_url: { url: data.imageDataUrl } });
    }

    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          tools,
          tool_choice: { type: "function", function: { name: "save_extracted_metrics" } },
        }),
      });
    } catch (e) {
      console.error("extractSmartInput fetch failed:", e);
      return { ok: false as const, error: "Could not reach the AI service." };
    }

    if (res.status === 429) return { ok: false as const, error: "Rate limit hit. Try again in a moment." };
    if (res.status === 402) return { ok: false as const, error: "AI credits exhausted." };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("extractSmartInput error:", res.status, text);
      return { ok: false as const, error: "The AI couldn't parse that input." };
    }

    const json = (await res.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const argStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "";

    try {
      const parsed = JSON.parse(argStr) as Partial<SmartExtraction>;
      const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
      const entries: SmartEntry[] = rawEntries
        .map((e) => {
          const year = Number((e as SmartEntry).year);
          const month = Number((e as SmartEntry).month);
          const value = Number((e as SmartEntry).value);
          const metric = (e as SmartEntry).metric;
          const validMetric = ["electricity_kwh", "gas_kwh", "water_m3", "waste_kg", "occupied_room_nights"].includes(metric);
          if (!validMetric) return null;
          if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
          if (!Number.isFinite(month) || month < 1 || month > 12) return null;
          if (!Number.isFinite(value) || value < 0) return null;
          const rawConf = (e as SmartEntry).confidence;
          const entryConfidence: "high" | "medium" | "low" =
            rawConf === "high" || rawConf === "medium" || rawConf === "low" ? rawConf : "medium";
          return {
            year,
            month,
            metric,
            value,
            original_unit: (e as SmartEntry).original_unit ? String((e as SmartEntry).original_unit).slice(0, 24) : null,
            note: (e as SmartEntry).note ? String((e as SmartEntry).note).slice(0, 200) : null,
            confidence: entryConfidence,
            confidence_reason: (e as SmartEntry).confidence_reason
              ? String((e as SmartEntry).confidence_reason).slice(0, 120)
              : null,
          } as SmartEntry;
        })
        .filter((x): x is SmartEntry => x !== null)
        .slice(0, 60);

      const confidence: "high" | "medium" | "low" =
        parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low";

      return {
        ok: true as const,
        extraction: {
          entries,
          summary: parsed.summary ? String(parsed.summary).slice(0, 240) : "Here's what Sera found.",
          confidence,
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((w) => String(w).slice(0, 200)).slice(0, 6) : [],
        },
      };
    } catch (e) {
      console.error("extractSmartInput parse failed:", e, argStr);
      return { ok: false as const, error: "Couldn't parse the AI response — try rephrasing." };
    }
  });

/* -------------------- Autopilot — parse a single conversational reply -------------------- */

/**
 * Used by the "Sera on Autopilot" data input mode. The client already shows a
 * predicted value (e.g. ~14,200 kWh) and the user replies freeform: "yes",
 * "same", "+5%", "12500", "around twelve thousand", "a bit lower". We parse
 * obvious cases client-side; this server function is the fallback when the
 * regex didn't match — we let Gemini turn the sentence into a number anchored
 * on the prediction.
 */
export const parseAutopilotReply = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      reply: z.string().min(1).max(400),
      metric: z.enum(["electricity_kwh", "gas_kwh", "water_m3", "waste_kg", "occupied_room_nights"]),
      unit: z.string().min(1).max(16),
      predicted: z.number().nonnegative().nullable(),
      lastYear: z.number().nonnegative().nullable(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      | { ok: true; value: number | null; intent: "value" | "skip" | "unknown"; note: string | null }
      | { ok: false; error: string }
    > => {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) return { ok: false, error: "AI not configured." };

      const systemPrompt = `You convert a hotel manager's casual reply into a single numeric value for ONE metric.
You are given:
- The metric being asked about (e.g. electricity_kwh in kWh).
- A predicted baseline (Sera's best guess based on history) — may be null.
- Last year's same-month value — may be null.
- The user's reply.

Decide one of three intents:
- "value": the reply implies a specific number. Return it in the canonical unit.
- "skip": the user doesn't know, wants to skip, or says "no idea" / "later".
- "unknown": the reply is unrelated, nonsensical or you cannot decide.

Rules:
- "yes", "same", "as expected", "looks right", "ok" → value = predicted (if available).
- "+5%", "5% more", "up 5" → predicted * 1.05.
- "-10%", "10% less", "down 10" → predicted * 0.90.
- "like last year" → lastYear value.
- Spelled-out numbers ("twelve thousand four hundred") → 12400.
- Plain numbers respect K/k = ×1000.
- "a bit more" / "a bit less" without a number → adjust predicted by ±5%.
- Never return a negative value.
Always include a brief note (max 60 chars) explaining how you interpreted the reply.`;

      const tools = [
        {
          type: "function",
          function: {
            name: "submit_value",
            description: "Return the parsed numeric reply.",
            parameters: {
              type: "object",
              properties: {
                intent: { type: "string", enum: ["value", "skip", "unknown"] },
                value: {
                  type: "number",
                  description: "Canonical-unit number when intent='value'. Omit otherwise.",
                  minimum: 0,
                },
                note: { type: "string", description: "How you interpreted the reply (≤60 chars)." },
              },
              required: ["intent", "note"],
              additionalProperties: false,
            },
          },
        },
      ];

      let res: Response;
      try {
        res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `Metric: ${data.metric} (unit: ${data.unit})
Predicted baseline: ${data.predicted ?? "null"}
Last year same month: ${data.lastYear ?? "null"}
User reply: "${data.reply}"`,
              },
            ],
            tools,
            tool_choice: { type: "function", function: { name: "submit_value" } },
          }),
        });
      } catch (e) {
        console.error("parseAutopilotReply fetch failed:", e);
        return { ok: false, error: "Could not reach the AI service." };
      }

      if (res.status === 429) return { ok: false, error: "Rate limit hit. Try again in a moment." };
      if (res.status === 402) return { ok: false, error: "AI credits exhausted." };
      if (!res.ok) {
        console.error("parseAutopilotReply error:", res.status);
        return { ok: false, error: "The AI couldn't parse that reply." };
      }

      const json = (await res.json()) as {
        choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
      };
      const argStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "";
      try {
        const parsed = JSON.parse(argStr) as { intent?: string; value?: number; note?: string };
        const intent =
          parsed.intent === "value" || parsed.intent === "skip" || parsed.intent === "unknown"
            ? parsed.intent
            : "unknown";
        const value =
          intent === "value" && typeof parsed.value === "number" && Number.isFinite(parsed.value)
            ? Math.max(0, parsed.value)
            : null;
        return {
          ok: true as const,
          intent,
          value,
          note: parsed.note ? String(parsed.note).slice(0, 80) : null,
        };
      } catch (e) {
        console.error("parseAutopilotReply parse failed:", e, argStr);
        return { ok: false, error: "Couldn't parse the AI response." };
      }
    },
  );

