import { useEffect, useRef, useState } from "react";
import { MicOff, Pause } from "lucide-react";
import { speechController } from "@/lib/speech";
import {
  VoiceConversation,
  type VoiceSnapshot,
  type VoicePhase,
} from "@/lib/voiceConversation";
export function HandsFreeVoice({
  send,
  busy,
  speaking,
  onExit,
  onPhase,
}: {
  send: (t: string) => Promise<void>;
  busy: boolean;
  speaking: boolean;
  onExit: () => void;
  onPhase: (p: VoicePhase) => void;
}) {
  const latest = useRef({ send, busy, speaking, onPhase });
  latest.current = { send, busy, speaking, onPhase };
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>({
    phase: "idle",
    message: "Starting voice conversation…",
    transcript: "",
  });
  const [pauseMs, setPauseMs] = useState(1600);
  const controller = useRef<VoiceConversation | null>(null);
  const running = useRef(true);
  useEffect(() => {
    const engine = new VoiceConversation({
      speech: speechController,
      send: (t) => latest.current.send(t),
      busy: () => latest.current.busy,
      speaking: () => latest.current.speaking,
      pauseMs,
      update: (s) => {
        running.current = !["paused", "error"].includes(s.phase);
        setSnapshot(s);
        latest.current.onPhase(s.phase);
      },
    });
    controller.current = engine;
    if (running.current) engine.start();
    const pauseWhenHidden = () => {
      if (document.hidden) engine.stop();
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      engine.stop(false);
      controller.current = null;
    };
  }, [pauseMs]);
  const paused = ["paused", "error"].includes(snapshot.phase);
  return (
    <section
      className="hands-free-panel"
      aria-label="Hands-free voice conversation"
    >
      <div className={`voice-orbit phase-${snapshot.phase}`} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="voice-feedback" role="status" aria-live="polite">
        {snapshot.message}
      </p>
      <p className="small-note">
        Messages send automatically after a pause. Say “stop listening” to pause
        the microphone. You must say “confirm booking” at the review step to
        save.
      </p>
      {snapshot.transcript && (
        <div className="heard-transcript">
          <span>What I heard</span>
          <p>{snapshot.transcript}</p>
        </div>
      )}
      <div className="button-row">
        <button
          className="primary-button"
          onClick={() =>
            paused ? controller.current?.start() : controller.current?.stop()
          }
        >
          {paused ? "Resume voice" : "Pause voice"}
          {paused ? (
            <MicOff size={17} aria-hidden="true" />
          ) : (
            <Pause size={17} aria-hidden="true" />
          )}
        </button>
        <button
          className="secondary-button"
          onClick={() => {
            controller.current?.stop();
            onExit();
          }}
        >
          Use text / review mode
        </button>
      </div>
      <details>
        <summary>Pause and privacy settings</summary>
        <label className="field-label" htmlFor="voice-pause-length">
          Time to finish a sentence
        </label>
        <select
          id="voice-pause-length"
          value={pauseMs}
          onChange={(e) => setPauseMs(Number(e.target.value))}
        >
          <option value={1600}>Normal pause · 1.6 seconds</option>
          <option value={2800}>More time · 2.8 seconds</option>
          <option value={4000}>Extended pause · 4 seconds</option>
        </select>
        <p className="small-note">
          The microphone pauses while the guide speaks, on errors and when this
          panel closes. After prolonged silence it pauses automatically. This is
          browser-based turn-taking, not always-on or interruptible real-time
          audio.
        </p>
      </details>
    </section>
  );
}
