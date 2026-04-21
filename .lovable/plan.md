
# Sustainability & Energy Management Platform for Hotels (MVP)

A premium, hotel-friendly web app that lets a single property manager log monthly utilities, see how they're doing, compare to peers, and ask an AI assistant for guidance. No authentication in v1 — we'll work as if "logged in" to one demo hotel ("The Marbella Grand", 120 rooms, Mediterranean region) so the experience feels real end-to-end.

## Visual & UX direction
- **Premium hospitality**: deep forest green primary, midnight navy secondary, warm ivory/off-white background, soft champagne accent.
- **Typography**: elegant serif for headings (e.g. Cormorant / Playfair), clean sans for UI/numbers (Inter).
- Generous whitespace, subtle gold dividers, rounded-2xl cards, soft shadows. Calm, confident, not flashy.
- Built for non-technical managers: large tap targets, plain language, never jargon, always show units (kWh, m³, kg), always show trend arrows with color.

## App structure (separate routes)
- `/` — **Dashboard** (home)
- `/log` — **Log monthly data** (guided form)
- `/history` — **History & edits** (spreadsheet-style table)
- `/benchmarks` — **Compare to peers**
- `/assistant` — **AI sustainability assistant**
- `/hotel` — **Hotel profile** (read-only summary of the demo hotel)

Persistent left sidebar (collapsible) with these 6 items + hotel name/avatar at the top. Mobile: collapses to icon rail.

## 1. Dashboard (`/`)
The "at a glance" home screen.
- Hero strip: hotel name, current month, "Sustainability Score" (0–100, with a friendly explanation tooltip).
- 4 KPI cards (this month vs last month + vs same month last year): **Electricity (kWh)**, **Gas (kWh or m³)**, **Water (m³)**, **Waste (kg)** — each with a sparkline and an arrow + % change.
- "Per occupied room" toggle so figures normalize by occupancy (very important for hoteliers).
- 12-month trend chart (stacked or toggleable per utility), with CO₂e overlay.
- "Peer position" card: "You're in the **top 28%** of similar Mediterranean 100–150 room hotels for electricity intensity." → links to `/benchmarks`.
- "This month's insights" — 2–3 short AI-generated cards (e.g. "Water use spiked 14% in July — likely irrigation. Ask the assistant →").
- CTA banner if current month isn't logged: "Log April 2026 data" → `/log`.

## 2. Log monthly data (`/log`)
Guided wizard, one screen, dead simple.
- Step header: month/year picker (defaults to most recent unlogged month).
- Four friendly input cards in sequence — Electricity, Gas, Water, Waste.
  - Each card: large number input, unit label, "Where to find this" helper (e.g. "On your utility bill, look for 'Total kWh'"), optional file upload for the bill (stored as attachment, not parsed in v1).
  - Optional sub-fields: renewable % (electricity), recycled % (waste).
- Occupancy section: occupied room-nights for the month (so we can normalize).
- Live preview panel on the right: "Here's how April compares to March" with mini deltas as they type.
- Submit → success state with confetti-light animation, "View on dashboard" / "Log another month".
- All inputs validated with zod (positive numbers, sane ranges, friendly error messages).

## 3. History & edits (`/history`)
- Spreadsheet-style table: rows = months (newest first, 24 months visible), columns = Electricity, Gas, Water, Waste, Occupancy, CO₂e, Status.
- Inline edit on click; unsaved-changes indicator; bulk paste from Excel supported.
- Filter by year, export to CSV.
- Empty months clearly marked "Not logged" with a quick "Add" link.

## 4. Benchmarks (`/benchmarks`)
Simulated peer dataset (generated deterministically from hotel size + region + season so it feels stable and realistic).
- Filter chips: hotel size band, region, star rating, season.
- Per-utility intensity charts (per occupied room): your hotel as a bold line, peer distribution as a shaded band (p25–p75) + median.
- Ranking card: "You rank **8th of 42** comparable hotels for water intensity."
- "Best-in-class" card showing what the top 10% achieve, framed as an attainable goal.
- Plain-language explainer at the top: "We compare you to hotels of similar size, region, and season. Your data is anonymized."

## 5. AI assistant (`/assistant`)
Chat experience powered by Lovable AI (default model: `google/gemini-3-flash-preview`), via a backend server function — never called from the client.
- Friendly intro, hotel context shown as a chip ("Talking about: The Marbella Grand · 120 rooms").
- Suggested starter prompts: "Why did my electricity rise last month?", "What 3 actions will cut my water use most?", "Draft a sustainability update for guests."
- Streaming responses, markdown rendering, message history kept in memory for the session.
- The server function injects the hotel's recent metrics + peer position into the system prompt so answers are grounded in real numbers.
- Insight cards on the dashboard reuse the same backend with a structured-output prompt.

## 6. Hotel profile (`/hotel`)
Simple read-only card with the demo hotel's details (name, rooms, region, star rating, climate zone) plus a "this is demo data" note so it's clear v1 is single-hotel.

## Data & backend
- **Lovable Cloud** enabled for: storing monthly entries, hotel profile, peer benchmark seed, and assistant conversation history (single demo hotel, no user scoping yet).
- **Lovable AI Gateway** for the assistant and dashboard insights, called via a server function that holds the system prompt and injects hotel context.
- Peer benchmarks generated from a deterministic seeded function (size + region + month) so charts are stable across reloads.
- All inputs validated with zod on both client and server.

## Out of scope for v1 (clearly noted, easy to add later)
- Authentication / multi-hotel accounts / roles
- Bill OCR parsing
- Email reports & monthly reminders
- Admin/portfolio view across multiple properties
