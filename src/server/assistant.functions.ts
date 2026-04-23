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

