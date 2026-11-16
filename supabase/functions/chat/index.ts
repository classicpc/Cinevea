const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const actionInstructions = `
When the user's intent is clear, append one action JSON object on a new line:
ACTION: {"type":"select_movie","movieId":"..."}
ACTION: {"type":"select_date","date":"YYYY-MM-DD"}
ACTION: {"type":"select_showtime","showtime":"..."}
ACTION: {"type":"set_tickets","count":1}
ACTION: {"type":"select_seats","seats":["A5","A6"]}
ACTION: {"type":"confirm_booking"}
ACTION: {"type":"go_back"}
ACTION: {"type":"restart"}
Only emit an action when the user's intent is clear. Never invent IDs, dates, showtimes, or seat numbers.
`;

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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: `You are Cinevea, a friendly movie booking assistant. Help users choose a movie, date, showtime, ticket count, seats, and confirm a booking. Keep responses concise and never claim a booking is confirmed unless the user has explicitly confirmed it. Current booking state: ${JSON.stringify(state)}. ${actionInstructions}`,
          },
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

function json(body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
