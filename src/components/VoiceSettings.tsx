import { useEffect, useState } from "react";
import { speechController } from "@/lib/speech";
export function VoiceSettings({ onPreview }: { onPreview: () => void }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settings, setSettings] = useState(() =>
    speechController.getVoiceSettings(),
  );
  useEffect(() => {
    const load = () => setVoices(speechController.availableVoices());
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () =>
      window.speechSynthesis?.removeEventListener("voiceschanged", load);
  }, []);
  const update = (uri: string, rate: number) => {
    setSettings({ uri, rate });
    speechController.setVoiceSettings(uri, rate);
  };
  return (
    <details className="voice-settings">
      <summary>Voice and reading speed</summary>
      {voices.length ? (
        <>
          <label className="field-label" htmlFor="guide-voice">
            Guide voice
          </label>
          <select
            id="guide-voice"
            value={settings.uri}
            onChange={(e) => update(e.target.value, settings.rate)}
          >
            <option value="">Recommended softer voice</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} · {v.lang}
              </option>
            ))}
          </select>
        </>
      ) : (
        <p className="small-note">
          Your browser has not supplied any voices yet. You can still read every
          reply on screen.
        </p>
      )}
      <label className="field-label" htmlFor="guide-rate">
        Reading speed
      </label>
      <select
        id="guide-rate"
        value={settings.rate}
        onChange={(e) => update(settings.uri, Number(e.target.value))}
      >
        <option value={0.8}>Slow · 0.8×</option>
        <option value={0.94}>Gentle · 0.94×</option>
        <option value={1}>Normal · 1×</option>
        <option value={1.1}>Faster · 1.1×</option>
      </select>
      <button
        className="secondary-button"
        disabled={!speechController.speechSupported}
        onClick={onPreview}
      >
        Preview voice
      </button>
      <p className="small-note">
        Available voices depend on your device. Named feminine voices are
        preferred when available; you can choose the one you find most
        comfortable.
      </p>
    </details>
  );
}
