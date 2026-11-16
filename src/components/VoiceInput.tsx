import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX, AlertCircle, X } from "lucide-react";
import { speechController, type SpeechRecognitionResult } from "@/lib/speech";

interface VoiceInputProps {
  onSendMessage: (text: string) => void;
  disabled: boolean;
  ttsEnabled: boolean;
  onToggleTts: () => void;
}

export function VoiceInput({ onSendMessage, disabled, ttsEnabled, onToggleTts }: VoiceInputProps) {
  const voiceSupported = speechController.recognitionSupported;
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const interimRef = useRef("");

  useEffect(() => () => {
    speechController.stopListening(false);
  }, []);

  const startListening = useCallback(() => {
    setMicError(null);
    setInterim("");

    speechController.startListening({
      onResult: (result: SpeechRecognitionResult) => {
        if (result.isFinal) {
          interimRef.current = "";
          setInterim("");
          setText((current) => `${current}${current ? " " : ""}${result.transcript}`.trim());
        } else {
          interimRef.current = result.transcript;
          setInterim(result.transcript);
        }
      },
      onError: (error: string) => {
        interimRef.current = "";
        setIsListening(false);
        setInterim("");
        setMicError(error);
      },
      onStart: () => {
        setIsListening(true);
      },
      onEnd: () => {
        const pending = interimRef.current.trim();
        if (pending) {
          setText((current) => `${current}${current ? " " : ""}${pending}`.trim());
        }
        interimRef.current = "";
        setIsListening(false);
        setInterim("");
      },
    });
  }, []);

  const toggleListening = () => {
    if (isListening) {
      speechController.stopListening();
    } else {
      setMicError(null);
      setIsListening(true);
      startListening();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setText("");
  };

  const displayText = interim
    ? `${text}${text ? " " : ""}${interim}`
    : text;

  return (
    <div className="sticky bottom-0 z-10 border-t border-white/10 bg-[#091525]/95 px-4 py-4 backdrop-blur-xl">
      {/* Mic error banner */}
      {micError && (
        <div className="mb-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 animate-fade-in">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{micError}</span>
          <button
            onClick={() => setMicError(null)}
            className="text-red-400/60 hover:text-red-400 flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {/* Mic button */}
        <button
          type="button"
          onClick={toggleListening}
          className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all ${
            isListening
              ? "bg-red-500 hover:bg-red-600 animate-pulse"
              : voiceSupported
              ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
              : "bg-slate-800 text-slate-500 hover:bg-slate-700"
          }`}
          aria-label={isListening ? "Stop listening" : "Start voice input"}
          title={
            voiceSupported
              ? isListening
                ? "Stop listening"
                : "Speak"
              : "Voice input is not supported in this browser"
          }
        >
          {isListening ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Text input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={displayText}
            onChange={(e) => !isListening && setText(e.target.value)}
            placeholder={
              isListening
                ? "Listening…"
                : voiceSupported
                ? "Type or speak your message…"
                : "Type your message…"
            }
            disabled={disabled && !isListening}
            aria-label="Message the Cinevea assistant"
            className="w-full rounded-xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-slate-100 placeholder-slate-500 transition-all focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/20"
          />
          {isListening && interim && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-cyan-400">
              live
            </span>
          )}
        </div>

        {/* TTS toggle */}
        <button
          type="button"
          onClick={onToggleTts}
          disabled={disabled}
          className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all ${
            ttsEnabled
              ? "bg-cyan-600 hover:bg-cyan-500 text-white"
              : "bg-slate-800 hover:bg-slate-700 text-slate-400"
          }`}
          title={ttsEnabled ? "Mute voice" : "Unmute voice"}
        >
          {ttsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        {/* Send button */}
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="flex-shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-lg shadow-cyan-500/20"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </form>
      {!voiceSupported && (
        <p className="text-xs text-slate-500 mt-2 px-1">
          Voice input isn't available in this browser — you can still type to chat.
        </p>
      )}
      {isListening && (
        <p className="mt-2 px-1 text-xs text-cyan-300" role="status" aria-live="polite">
          Listening — speak now
        </p>
      )}
      {!isListening && !micError && voiceSupported && (
        <p className="mt-2 px-1 text-xs text-slate-500">
          Press the microphone, then speak.
        </p>
      )}
    </div>
  );
}
