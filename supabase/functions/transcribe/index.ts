const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return json({ error: "An audio recording is required." }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return json({ error: "Voice transcription is not configured on the server." }, 503);
    }

    const body = new FormData();
    body.append("file", audio, audio.name || "recording.webm");
    body.append("model", "whisper-1");
    body.append("language", "en");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    });

    const result = await response.json();
    if (!response.ok) {
      return json({ error: result?.error?.message || "Transcription failed." }, response.status);
    }
    return json({ text: result.text || "" }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed.";
    return json({ error: message }, 500);
  }
});

function json(body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
