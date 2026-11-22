import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/conversation";
import { Sparkles, User, Volume2 } from "lucide-react";

interface ChatTranscriptProps {
  messages: ChatMessage[];
  onSpeak?: (text: string) => void;
}

export function ChatTranscript({ messages, onSpeak }: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth"
    >
      {messages.length === 0 && (
        <div className="text-center text-slate-500 text-sm mt-8">
          Start a conversation by speaking or typing below.
        </div>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"} animate-fade-in`}
        >
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.role === "assistant"
                ? "bg-gradient-to-br from-rose-500 to-pink-600 shadow-md shadow-rose-500/25"
                : "bg-slate-700 border border-slate-600"
            }`}
          >
            {msg.role === "assistant" ? (
              <Sparkles className="w-4 h-4 text-white" />
            ) : (
              <User className="w-4 h-4 text-slate-200" />
            )}
          </div>
          <div
            className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "assistant"
                ? "bg-white/[0.06] text-slate-100 rounded-tl-sm border border-white/10 shadow-sm backdrop-blur-md"
                : "bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-tr-sm shadow-md shadow-rose-500/20"
            }`}
          >
            <span>{msg.text}</span>
            {msg.role === "assistant" && onSpeak && (
              <button
                type="button"
                onClick={() => onSpeak(msg.text)}
                className="ml-2 inline-flex rounded p-1 text-rose-300/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Read response aloud"
                title="Read response aloud"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
