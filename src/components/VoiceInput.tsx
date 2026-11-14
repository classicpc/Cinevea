import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX, AlertCircle, X } from "lucide-react";
import { speechController, type SpeechRecognitionResult } from "@/lib/speech";

interface VoiceInputProps {
  onSendMessage: (text: string) => void;
  disabled: boolean;
  ttsEnabled: boolean;
  onToggleTts: () => void;
}

export function VoiceInput({ onSendMessage, disabled, ttsEnabled, onToggleTts }: VoiceInputProps) {
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const onSendMessageRef = useRef(onSendMessage);

  // Keep the latest onSendMessage without re-creating the start handler
  onSendMessageRef.current = onSendMessage;

  const startListening = useCallback(() => {
    setMicError(null);
    setInterim("");

    speechController.startListening({
      onResult: (result: SpeechRecognitionResult) => {
        if (result.isFinal) {
          setInterim("");
          setIsListening(false);
          onSendMessageRef.current(result.transcript);
        } else {
          setInterim(result.transcript);
        }
      },
      onError: (error: string) => {
        setIsListening(false);
        setInterim("");
        setMicError(error);
      },
      onEnd: () => {
        // Recognition ended without a final result — reset the listening state
        setIsListening(false);
        setInterim("");
      },
    });
  }, []);

  const toggleListening = () => {
    if (isListening) {
      speechController.stopListening();
      setIsListening(false);
      setInterim("");
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

  const displayText = isListening && interim ? interim : text;

  return (
    <div className="border-t border-slate-800 bg-slate-900/95 backdrop-blur px-3 py-3">
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
          disabled={!speechController.recognitionSupported}
          className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all ${
            isListening
              ? "bg-red-500 hover:bg-red-600 animate-pulse"
              : speechController.recognitionSupported
              ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
              : "bg-slate-800/50 text-slate-600 cursor-not-allowed"
          }`}
          title={
            speechController.recognitionSupported
              ? isListening
                ? "Stop listening"
                : "Speak"
              : "Voice input not supported in this browser"
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
                : speechController.recognitionSupported
                ? "Type or speak your message…"
                : "Type your message…"
            }
            disabled={disabled && !isListening}
            className="w-full px-4 py-2.5 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all text-sm"
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
      {!speechController.recognitionSupported && (
        <p className="text-xs text-slate-500 mt-2 px-1">
          Voice input isn't available in this browser — you can still type to chat. For the full voice experience, try Chrome.
        </p>
      )}
    </div>
  );
}
