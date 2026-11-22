import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Action protocol shared with src/lib/conversation.ts (parseAssistantReply).
const actionInstructions = `
When the user's intent is clear, append exactly one action JSON object on its own final line:
ACTION: {"type":"select_movie","movieId":"..."}
ACTION: {"type":"select_date","date":"YYYY-MM-DD"}
ACTION: {"type":"select_showtime","showtime":"..."}
ACTION: {"type":"set_tickets","count":1}
ACTION: {"type":"select_seats","seats":["A5","A6"]}
ACTION: {"type":"confirm_booking"}
ACTION: {"type":"go_back"}
ACTION: {"type":"restart"}
Only emit an action when the user's intent is clear. Never invent IDs, dates, showtimes, or seat numbers.
Use movie ids, YYYY-MM-DD dates and showtime strings exactly as they appear in the catalog. Only emit the action that matches the current booking step (select_movie at the start, then select_date, select_showtime, set_tickets, select_seats, confirm_booking). Only emit confirm_booking when the user explicitly confirms on the review step.
At the showtime step, use only catalog.movies[].showtimesByDate[state.date]. Never list, suggest, or emit a showtime from another date or an unlisted showtime. If the selected date has no showtimes, say that no showtimes are available for that date and do not emit a select_showtime action.
If the selected date has no showtimes, proactively offer to choose another date. If the user asks for another date, a different date, or says to change the date, emit go_back so the UI returns to date selection. Also offer restart as an alternative.
For date requests, resolve relative words and labels such as "today", "tomorrow", "22nd", "Nov 22", and "November 22" only against catalog.dateLabels or catalog.dates. Never convert a bare number to a date unless it exactly matches a displayed day. If the catalog has no matching date, ask for clarification instead of emitting an action.
For movie requests, map bare numbers and phrases such as "1", "movie 2", "number 3", or "the second movie" to that position in catalog.movies. Never guess a movie position outside the catalog length.
`;

const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const userText = typeof body.userText === "string" ? body.userText.trim() : "";
    if (!userText) return json({ error: "A message is required." }, 400);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OpenAI chat is not configured on the server." }, 503);

    const state = body.state && typeof body.state === "object" ? body.state : {};
    const history = Array.isArray(body.history)
      ? body.history
        .filter((message: unknown): message is { role: "user" | "assistant"; text: string } =>
          typeof message === "object"
          && message !== null
          && ((message as { role?: unknown }).role === "user" || (message as { role?: unknown }).role === "assistant")
          && typeof (message as { text?: unknown }).text === "string")
        .slice(-10)
      : [];
    // Prefer the catalog the UI is showing (matches ids/showtime strings the client can act on);
    // fall back to a database lookup for older clients.
    const catalogContext = isClientCatalog(body.catalog)
      ? body.catalog
      : await getCatalogContext(request, userText);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: `You are Cinevea, a friendly movie booking assistant. Help users choose a movie, date, showtime, ticket count, seats, and confirm a booking. Keep responses concise (1-3 sentences) and never claim a booking is confirmed unless the user has explicitly confirmed it. Only state movie or showtime availability when supported by the catalog context below. If the context has no matching records, say that you could not find a matching live result. Dates must be chosen from catalog.dates. When state.date is set, only suggest or emit showtimes from catalog.movies for that exact YYYY-MM-DD date. Never show or accept a showtime from another date. Current booking state: ${JSON.stringify(state)}. Catalog context: ${JSON.stringify(catalogContext)}. ${actionInstructions}`,
          },
          ...history.map((message) => ({ role: message.role, content: message.text })),
          { role: "user", content: userText },
        ],
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("OpenAI chat request failed", response.status, result?.error?.message || result);
      return json({ error: result?.error?.message || "OpenAI chat request failed." }, response.status);
    }

    const text = result?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return json({ error: "OpenAI returned an empty response." }, 502);
    return json({ text }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat request failed.";
    console.error("Chat function failed", message);
    return json({ error: message }, 500);
  }
});

function isClientCatalog(value: unknown): value is { movies: unknown[] } {
  return typeof value === "object" && value !== null && Array.isArray((value as { movies?: unknown }).movies);
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getCatalogContext(request: Request, userText: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return { movies: [] };

  const auth = request.headers.get("Authorization");
  if (!auth) return { movies: [] };

  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const terms = userText
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term: string) => term.length >= 3)
    .slice(0, 5);
  const filters = terms.flatMap((term: string) => [
    `title.ilike.%${term}%`,
    `genre.ilike.%${term}%`,
    `language.ilike.%${term}%`,
  ]);
  const baseQuery = () => db
    .from("movies")
    .select("id,title,genre,language,age_rating,rating,synopsis,showtimes(id,starts_at,format,ticket_price)")
    .eq("is_coming_soon", false)
    .limit(12);
  let query = baseQuery();
  if (filters.length) query = query.or(filters.join(","));
  let { data, error } = await query;
  if (!error && !data?.length && filters.length) {
    // Greetings like "hello" match nothing; give the model the general catalog instead.
    ({ data, error } = await baseQuery());
  }
  if (error) {
    console.error("Catalog context lookup failed", error.message);
    throw new Error("Could not retrieve live catalog context.");
  }
  const now = Date.now();
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return {
    movies: (data ?? []).map((movie: Record<string, unknown>) => {
      const showtimesByDate: Record<string, { time: string; id: string }[]> = {};
      for (const showtime of (movie.showtimes as Array<Record<string, unknown>> | undefined) ?? []) {
        const startsAt = typeof showtime.starts_at === "string" ? showtime.starts_at : "";
        const startDate = new Date(startsAt);
        if (!startsAt || Number.isNaN(startDate.getTime()) || startDate.getTime() <= now) continue;
        const dateParts = dateFormatter.formatToParts(startDate);
        const part = (type: string) => dateParts.find((item) => item.type === type)?.value ?? "";
        const dateKey = `${part("year")}-${part("month")}-${part("day")}`;
        const time = timeFormatter.format(startDate);
        const entries = showtimesByDate[dateKey] ??= [];
        if (!entries.some((entry) => entry.time === time)) {
          entries.push({ id: String(showtime.id), time });
        }
      }
      return { ...movie, showtimesByDate };
    }),
  };
}
