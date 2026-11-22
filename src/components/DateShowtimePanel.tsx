import { useEffect, useRef, useState } from "react";
import { getDates, type Movie } from "@/types";
import { Calendar, Clock, ChevronDown } from "lucide-react";

interface DateShowtimePanelProps {
  movie: Movie;
  selectedDate: string | null;
  selectedShowtime: string | null;
  onSelectDate: (date: string) => void;
  onSelectShowtime: (showtime: string) => void;
}

export function DateShowtimePanel({
  movie,
  selectedDate,
  selectedShowtime,
  onSelectDate,
  onSelectShowtime,
}: DateShowtimePanelProps) {
  const dates = getDates();
  const showtimeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [optimisticDate, setOptimisticDate] = useState<string | null>(selectedDate);
  const visibleDate = selectedDate ?? optimisticDate;

  useEffect(() => {
    setOptimisticDate(selectedDate);
  }, [selectedDate]);

  // Auto-scroll to showtimes when a date is selected
  useEffect(() => {
    if (visibleDate && showtimeRef.current) {
      showtimeRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [visibleDate]);

  // Scroll panel to top when movie changes (new screen)
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
    setOptimisticDate(null);
  }, [movie.id]);

  return (
    <div ref={panelRef} className="p-4 sm:p-6 space-y-5">
      {/* Date selection */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-xl shadow-black/10">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-400/80 font-semibold">
              Step 02
            </p>
            <h2 className="text-lg font-semibold text-white mt-1 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              Choose a date
            </h2>
          </div>
          <span className="text-xs text-slate-500">Next 7 days</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {dates.map((d, idx) => {
            const isSelected = d.value === selectedDate;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => {
                  setOptimisticDate(d.value);
                  onSelectDate(d.value);
                }}
                className={`flex flex-col items-center py-2.5 rounded-lg transition-all ${
                  isSelected
                    ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 scale-105"
                    : "bg-slate-800/80 text-slate-300 ring-1 ring-white/5 hover:bg-slate-700 hover:ring-cyan-400/30"
                }`}
              >
                <span className={`text-[10px] ${isSelected ? "text-cyan-100" : "text-slate-500"}`}>
                  {idx === 0 ? "Today" : idx === 1 ? "Tmrw" : d.weekday}
                </span>
                <span className="text-sm font-bold mt-0.5">{d.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Showtime selection */}
      {visibleDate && (
        <div
          ref={showtimeRef}
          aria-live="polite"
          className="animate-fade-in rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-transparent p-4 shadow-xl shadow-cyan-950/20"
        >
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Showtimes for {movie.title}
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(movie.showtimesByDate?.[visibleDate] ?? []).map(({ time: st }) => {
              const isSelected = st === selectedShowtime;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => onSelectShowtime(st)}
                  className={`py-3 rounded-lg text-sm font-semibold transition-all ${
                    isSelected
                      ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 scale-105"
                      : "bg-slate-800/90 text-slate-300 ring-1 ring-white/5 hover:bg-slate-700 hover:text-white hover:ring-cyan-400/30"
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Hint when no date selected yet */}
      {!visibleDate && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 py-2 animate-fade-in">
          <ChevronDown className="w-4 h-4 animate-bounce" />
          Pick a date above to see showtimes
        </div>
      )}
    </div>
  );
}
