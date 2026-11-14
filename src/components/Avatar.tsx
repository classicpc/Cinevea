import { useEffect, useRef } from "react";

interface AvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  genre?: string | null;
}

const GENRE_GRADIENTS: Record<string, string> = {
  Action: "from-orange-500 to-red-600",
  Romance: "from-pink-400 to-rose-500",
  Horror: "from-slate-600 to-gray-900",
  "Sci-Fi": "from-cyan-500 to-blue-700",
  Animation: "from-amber-400 to-orange-500",
  Comedy: "from-yellow-400 to-orange-400",
  Adventure: "from-emerald-500 to-teal-700",
};

export function Avatar({ isSpeaking, isListening, isThinking, genre }: AvatarProps) {
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ringRef.current) return;
    if (isSpeaking) {
      ringRef.current.style.animationDuration = "0.8s";
    } else if (isListening) {
      ringRef.current.style.animationDuration = "1.5s";
    } else if (isThinking) {
      ringRef.current.style.animationDuration = "2s";
    } else {
      ringRef.current.style.animationDuration = "4s";
    }
  }, [isSpeaking, isListening, isThinking]);

  const gradient = genre ? GENRE_GRADIENTS[genre] || "from-cyan-500 to-blue-600" : "from-cyan-500 to-blue-600";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-32 h-32 sm:w-40 sm:h-40 flex items-center justify-center">
        {/* Outer pulsing ring */}
        <div
          ref={ringRef}
          className={`absolute inset-0 rounded-full bg-gradient-to-br ${gradient} opacity-30 blur-xl animate-pulse-slow`}
        />
        {/* Rotating gradient ring */}
        <div
          className={`absolute inset-2 rounded-full bg-gradient-to-br ${gradient} opacity-80 animate-spin-slow`}
          style={{ maskImage: "radial-far", WebkitMaskImage: "radial-gradient(transparent 62%, black 63%)" }}
        />
        {/* Inner orb */}
        <div
          className={`absolute inset-4 rounded-full bg-gradient-to-br ${gradient} ${
            isSpeaking ? "animate-speak" : ""
          } ${isListening ? "animate-listen" : ""} shadow-2xl`}
        >
          {/* Face glow */}
          <div className="absolute inset-3 rounded-full bg-gradient-to-br from-white/25 to-transparent" />

          {/* Eyes */}
          <div className="absolute inset-0 flex items-center justify-center gap-5">
            <div
              className={`w-3 h-3 rounded-full bg-white/90 shadow-lg ${
                isSpeaking || isThinking ? "animate-blink" : ""
              }`}
            />
            <div
              className={`w-3 h-3 rounded-full bg-white/90 shadow-lg ${
                isSpeaking || isThinking ? "animate-blink" : ""
              }`}
            />
          </div>

          {/* Mouth */}
          <div className="absolute bottom-7 left-1/2 -translate-x-1/2">
            {isSpeaking ? (
              <div className="flex items-end gap-1 h-4">
                <div className="w-1 h-2 bg-white/80 rounded-full animate-wave-1" />
                <div className="w-1 h-4 bg-white/80 rounded-full animate-wave-2" />
                <div className="w-1 h-3 bg-white/80 rounded-full animate-wave-3" />
                <div className="w-1 h-4 bg-white/80 rounded-full animate-wave-2" />
                <div className="w-1 h-2 bg-white/80 rounded-full animate-wave-1" />
              </div>
            ) : isListening ? (
              <div className="w-6 h-1.5 bg-white/70 rounded-full" />
            ) : isThinking ? (
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce-delay-1" />
                <div className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce-delay-2" />
                <div className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce-delay-3" />
              </div>
            ) : (
              <div className="w-5 h-1 bg-white/50 rounded-full" />
            )}
          </div>
        </div>

        {/* Listening indicator dots */}
        {isListening && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
          </div>
        )}
      </div>

      {/* Status label */}
      <div className="text-sm font-medium text-slate-300 h-5">
        {isSpeaking ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
            Speaking…
          </span>
        ) : isListening ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Listening…
          </span>
        ) : isThinking ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            Thinking…
          </span>
        ) : (
          <span className="text-slate-400">Cinevea Assistant</span>
        )}
      </div>
    </div>
  );
}
