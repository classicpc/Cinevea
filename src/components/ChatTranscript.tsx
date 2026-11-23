import { useEffect, useRef } from "react";
import { Volume2 } from "lucide-react";
import type { ChatMessage } from "@/lib/conversation";
export function ChatTranscript({
  messages,
  onSpeak,
}: {
  messages: ChatMessage[];
  onSpeak?: (text: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages.length]);
  return (
    <div
      className="chat-transcript"
      ref={scroll}
      tabIndex={0}
      role="region"
      aria-label="Conversation history"
    >
      <ol>
        {messages.map((m, i) => (
          <li
            key={m.id}
            className={`chat-message ${m.role === "user" ? "from-user" : ""}`}
          >
            {m.role === "user" && <p className="chat-author">You</p>}
            <p className="chat-content">{m.text}</p>
            {m.role === "assistant" && onSpeak && (
              <button
                className="read-aloud-button"
                aria-label={`Read response ${i + 1} aloud`}
                onClick={() => onSpeak(m.text)}
              >
                <Volume2 size={16} aria-hidden="true" />
                <span>Read aloud</span>
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
