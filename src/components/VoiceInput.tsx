import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Mic, Square, ArrowUp, RotateCcw, AudioLines } from "lucide-react";
import { speechController } from "@/lib/speech";

interface VoiceInputProps {
  onSendMessage: (text: string) => void;
  disabled: boolean;
  ttsEnabled: boolean;
  onToggleTts: () => void;
  onStartHandsFree?: () => void;
}
export function VoiceInput({
  onSendMessage,
  disabled,
  onStartHandsFree,
}: VoiceInputProps) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [state, setState] = useState<
    "idle" | "starting" | "listening" | "stopping"
  >("idle");
  const [error, setError] = useState("");
  const [heard, setHeard] = useState(false);
  const finalRef = useRef("");
  const focusDraftRef = useRef(false);
  const pendingRef = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = state !== "idle";
  const supported = speechController.recognitionSupported;
  const clearTimer = () => {
    if (startTimer.current) {
      clearTimeout(startTimer.current);
      startTimer.current = null;
    }
  };
  useEffect(
    () => () => {
      speechController.stopListening(false);
      clearTimer();
    },
    [],
  );
  useEffect(() => {
    if (disabled) {
      speechController.stopListening(false);
      setState("idle");
      setInterim("");
    } else if (focusDraftRef.current) {
      focusDraftRef.current = false;
      inputRef.current?.focus();
    }
  }, [disabled]);
  const start = useCallback(() => {
    clearTimer();
    setError("");
    setInterim("");
    setHeard(false);
    pendingRef.current = "";
    finalRef.current = text;
    setState("starting");
    startTimer.current = setTimeout(() => {
      speechController.stopListening(false);
      setState("idle");
      setError("The microphone did not start. Try again or type your message.");
    }, 8000);
    speechController.startListening({
      onStart: () => {
        clearTimer();
        setState("listening");
      },
      onResult: (r) => {
        if (r.isFinal) {
          finalRef.current = `${finalRef.current} ${r.transcript}`.trim();
          pendingRef.current = "";
          setText(finalRef.current);
          setInterim("");
          setHeard(true);
        } else {
          pendingRef.current = r.transcript;
          setInterim(r.transcript);
        }
      },
      onError: (message) => {
        clearTimer();
        setError(message);
        setState("idle");
        setInterim("");
        pendingRef.current = "";
      },
      onEnd: () => {
        clearTimer();
        const pending = pendingRef.current.trim();
        if (pending) {
          setText(`${finalRef.current} ${pending}`.trim());
          setHeard(true);
        }
        pendingRef.current = "";
        setInterim("");
        setState("idle");
        inputRef.current?.focus();
      },
    });
  }, [text]);
  const stop = () => {
    clearTimer();
    setState("stopping");
    speechController.stopListening();
    startTimer.current = setTimeout(() => {
      speechController.stopListening(false);
      if (pendingRef.current)
        setText(`${finalRef.current} ${pendingRef.current}`.trim());
      pendingRef.current = "";
      setInterim("");
      setState("idle");
      inputRef.current?.focus();
    }, 2000);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled || active) return;
    focusDraftRef.current = true;
    onSendMessage(text.trim());
    setText("");
    finalRef.current = "";
    setHeard(false);
  };
  return (
    <form className="voice-composer modern-composer" onSubmit={submit}>
      <p className="voice-feedback sr-only" role="status" aria-live="polite">
        {disabled
          ? "Please wait for the current step…"
          : state === "starting"
            ? "Connecting to microphone…"
            : state === "listening"
              ? "Listening. Select Stop when you’re finished."
              : state === "stopping"
                ? "Finishing your recording…"
                : heard
                  ? "Check what we heard. Edit it, then select Send."
                  : "Type a message or use your microphone."}
      </p>
      {error && (
        <div className="notice notice-error composer-error-alert" role="alert">
          <p>{error}</p>
          {supported && (
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={start}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Try microphone again
            </button>
          )}
        </div>
      )}
      <div className="composer-card">
        <label htmlFor="assistant-message" className="sr-only">
          Your message
        </label>
        <textarea
          ref={inputRef}
          id="assistant-message"
          rows={2}
          value={interim ? `${text} ${interim}`.trim() : text}
          readOnly={active}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            finalRef.current = e.target.value;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          placeholder="Message movie guide..."
          aria-label="Your message"
          aria-describedby="voice-hint"
        />
        <div className="composer-bottom-row">
          <div className="composer-icons-group">
            <button
              type="button"
              className={`composer-icon-button ${active ? "active-listening" : ""}`}
              disabled={disabled || !supported || state === "stopping"}
              onClick={active ? stop : start}
              aria-label={state === "stopping" ? "Stopping…" : active ? "Stop" : "Speak"}
              title={active ? "Stop listening" : "Speak"}
            >
              {active ? (
                <Square size={20} aria-hidden="true" />
              ) : (
                <Mic size={20} aria-hidden="true" />
              )}
              <span className="sr-only">
                {state === "stopping" ? "Stopping…" : active ? "Stop" : "Speak"}
              </span>
            </button>
            {onStartHandsFree && (
              <button
                type="button"
                className="composer-icon-button"
                disabled={disabled || !supported}
                onClick={onStartHandsFree}
                aria-label="Hands-free mode"
                title="Hands-free voice mode"
              >
                <AudioLines size={20} aria-hidden="true" />
                <span className="sr-only">Hands-free mode</span>
              </button>
            )}
            <button
              type="submit"
              className="composer-send-button"
              disabled={!text.trim() || disabled || active}
              aria-label="Send"
              title="Send message"
            >
              <ArrowUp size={20} strokeWidth={2.8} aria-hidden="true" />
              <span className="sr-only">Send</span>
            </button>
          </div>
        </div>
      </div>
      <p id="voice-hint" className="sr-only">
        {supported
          ? "Voice input uses your browser’s speech service. Messages are sent only when you select Send."
          : "Voice input is unavailable in this browser. You can complete every step by typing or clicking."}
      </p>
    </form>
  );
}
