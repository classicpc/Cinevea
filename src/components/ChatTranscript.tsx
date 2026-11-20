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
      className="min-h-0 flex-1 overflow-y-auto px-5 py-5 space-y-3 scroll-smooth"
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
                ? "bg-gradient-to-br from-cyan-500 to-blue-600"
                : "bg-slate-700"
            }`}
          >
            {msg.role === "assistant" ? (
              <Sparkles className="w-4 h-4 text-white" />
            ) : (
              <User className="w-4 h-4 text-slate-300" />
            )}
          </div>
          <div
            className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "assistant"
                ? "bg-slate-800/80 text-slate-100 rounded-tl-sm border border-slate-700/50"
                : "bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-tr-sm"
            }`}
          >
            <span>{msg.text}</span>
            {msg.role === "assistant" && onSpeak && (
              <button
                type="button"
                onClick={() => onSpeak(msg.text)}
                className="ml-2 inline-flex rounded p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
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
