import { STEP_ORDER, STEP_LABELS, type BookingStep } from "@/types";
import { Check } from "lucide-react";

interface ProgressBarProps {
  currentStep: BookingStep;
}

export function ProgressBar({ currentStep }: ProgressBarProps) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="px-5 py-3 border-b border-white/10 bg-slate-950/45 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-1">
        {STEP_ORDER.map((step, idx) => {
          const isComplete = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                    isComplete
                      ? "bg-emerald-500 text-white"
                      : isCurrent
                      ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white ring-4 ring-cyan-500/20"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {isComplete ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <span
                  className={`text-[10px] hidden sm:block ${
                    isCurrent ? "text-cyan-400 font-medium" : isComplete ? "text-emerald-400" : "text-slate-600"
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>
              {idx < STEP_ORDER.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1.5 rounded-full transition-all ${
                    idx < currentIdx ? "bg-emerald-500" : "bg-slate-800"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
