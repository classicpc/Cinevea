import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX, AlertCircle, X } from "lucide-react";
import { speechController, type SpeechRecognitionResult } from "@/lib/speech";
import { transcribeAudio } from "@/lib/transcription";

interface VoiceInputProps {
  onSendMessage: (text: string) => void;
  disabled: boolean;
  ttsEnabled: boolean;
  onToggleTts: () => void;
}

export function VoiceInput({ onSendMessage, disabled, ttsEnabled, onToggleTts }: VoiceInputProps) {
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const onSendMessageRef = useRef(onSendMessage);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      startListening();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (type) => MediaRecorder.isTypeSupported(type)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        recorderRef.current = null;
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!audio.size) return;
        setIsTranscribing(true);
        try {
          const transcript = await transcribeAudio(audio);
          if (transcript) onSendMessageRef.current(transcript);
        } catch (error) {
          setMicError(error instanceof Error ? error.message : "Voice transcription failed. Please type your message.");
        } finally {
          setIsTranscribing(false);
        }
      };
      recorder.start();
      setIsListening(true);
    } catch (error) {
      setIsListening(false);
      setMicError(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Microphone access was blocked. Allow microphone access and try again."
        : "Could not access the microphone. Please type your message instead.");
    }
  }, [startListening]);

  const toggleListening = () => {
    if (isListening) {
      if (recorderRef.current) {
        stopRecording();
      } else {
        speechController.stopListening();
      }
      setIsListening(false);
      setInterim("");
    } else {
      setMicError(null);
      void startRecording();
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
              : speechController.recognitionSupported
              ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
              : "bg-slate-800 text-slate-500 hover:bg-slate-700"
          }`}
          aria-label={isListening ? "Stop listening" : "Start voice input"}
          title={
            speechController.recognitionSupported
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
                : speechController.recognitionSupported
                ? "Type or speak your message…"
                : "Type your message…"
            }
            disabled={(disabled || isTranscribing) && !isListening}
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
      {isTranscribing && (
        <p className="text-xs text-cyan-300 mt-2 px-1">Transcribing your message…</p>
      )}
      {!speechController.recognitionSupported && typeof MediaRecorder === "undefined" && (
        <p className="text-xs text-slate-500 mt-2 px-1">
          Voice input isn't available in this browser — you can still type to chat.
        </p>
      )}
    </div>
  );
}
