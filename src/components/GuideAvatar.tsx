import { useId } from "react";
export function GuideAvatar({
  speaking = false,
  small = false,
  mood = "idle",
  genre,
}: {
  speaking?: boolean;
  small?: boolean;
  mood?: "idle" | "listening" | "thinking" | "happy";
  genre?: string | null;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <div
      className={`guide-avatar mood-${mood} ${small ? "small" : ""} ${speaking ? "is-speaking" : ""}`}
      data-genre={genre || "default"}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" focusable="false">
        <defs>
          <linearGradient id={`${id}-halo`} x2="1" y2="1">
            <stop stopColor="#ffebbc" />
            <stop offset="1" stopColor="#f3b84c" />
          </linearGradient>
          <linearGradient id={`${id}-face`} x2="0" y2="1">
            <stop stopColor="#fff6dd" />
            <stop offset="1" stopColor="#f6d799" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="47"
          fill={`url(#${id}-halo)`}
          opacity=".15"
        />
        <path
          d="M20 42C20 19 80 19 80 42v18c0 28-60 28-60 0z"
          fill={`url(#${id}-face)`}
        />
        <path d="M27 42c0-15 46-15 46 0v15c0 15-46 15-46 0z" fill="#371b24" />
        <g className="guide-eyes" fill="#fff3cd">
          <ellipse cx="39" cy="48" rx="3.2" ry="4.4" />
          {mood === "happy" ? (
            <path
              d="M57 48q4-5 8 0"
              fill="none"
              stroke="#fff3cd"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ) : (
            <ellipse cx="61" cy="48" rx="3.2" ry="4.4" />
          )}
        </g>
        <path
          className="guide-mouth"
          d="M44 58q6 5 12 0"
          fill="none"
          stroke="#ffe3ac"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="31" cy="55" r="3" fill="#df9ccc" opacity=".65" />
        <circle cx="69" cy="55" r="3" fill="#df9ccc" opacity=".65" />
        <rect x="12" y="42" width="6" height="20" rx="3" fill="#c44247" />
        <rect x="82" y="42" width="6" height="20" rx="3" fill="#c44247" />
        <path d="M51 26v-7" stroke="#dd6e67" strokeWidth="3" />
        <circle cx="51" cy="15" r="4" fill="#ffda78" />
        <path d="m77 18 2-5 2 5 5 2-5 2-2 5-2-5-5-2z" fill="#ffe1a0" />
      </svg>
    </div>
  );
}
