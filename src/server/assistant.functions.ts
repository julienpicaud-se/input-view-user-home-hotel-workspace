import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEMO_HOTEL_ID } from "@/lib/hotel";

interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

async function getHotelContext(): Promise<string> {
  const { data: hotel } = await supabaseAdmin
    .from("hotels")
    .select("*")
    .eq("id", DEMO_HOTEL_ID)
    .maybeSingle();

  const { data: entries } = await supabaseAdmin
    .from("monthly_entries")
    .select("*")
    .eq("hotel_id", DEMO_HOTEL_ID)
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
    const context = await getHotelContext();

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
      { hotel_id: DEMO_HOTEL_ID, role: "user", content: data.message },
      { hotel_id: DEMO_HOTEL_ID, role: "assistant", content },
    ]);

    return { ok: true as const, content };
  });

export const generateInsights = createServerFn({ method: "POST" }).handler(
  async () => {
    const context = await getHotelContext();

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
  }
);

export interface Insight {
  title: string;
  body: string;
  tone: "positive" | "warning" | "neutral";
}

export const explainChart = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      chartId: z.enum(["consumption", "co2e", "intensity", "peer"]),
    }),
  )
  .handler(async ({ data }) => {
    const context = await getHotelContext();

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
        content: `You are Sera. Explain the selected chart to a hotel manager in plain language. Return ONLY valid JSON: {"summary":"1 short sentence on what the chart shows","read":["3 bullet points on how to read it"],"signals":["2-3 bullet points on what to look for in THIS hotel's data, citing real numbers/months when possible"],"actions":["2 short next-step actions"]}. Keep every bullet under 18 words. Use units (kWh, m³, kg, %).\n\nCHART: ${chartBriefs[data.chartId]}\n\nHOTEL CONTEXT:\n${context}`,
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
