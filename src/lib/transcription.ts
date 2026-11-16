import { supabase } from "@/lib/supabase";

export async function transcribeAudio(audio: Blob): Promise<string> {
  if (!supabase) {
    throw new Error("Supabase is not configured for voice transcription.");
  }

  const form = new FormData();
  form.append("audio", audio, "cinevea-voice.webm");
  const { data, error } = await supabase.functions.invoke("transcribe", {
    body: form,
  });

  if (error) {
    const response = "context" in error && error.context instanceof Response ? error.context : null;
    if (response) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message);
  }
  if (!data?.text || typeof data.text !== "string") {
    throw new Error("The transcription service returned no text.");
  }
  return data.text.trim();
}
