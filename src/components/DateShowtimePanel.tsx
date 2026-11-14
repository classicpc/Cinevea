import { useEffect, useRef } from "react";
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

  // Auto-scroll to showtimes when a date is selected
  useEffect(() => {
    if (selectedDate && showtimeRef.current) {
      showtimeRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedDate]);

  // Scroll panel to top when movie changes (new screen)
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [movie.id]);

  return (
    <div ref={panelRef} className="p-4 space-y-4">
      {/* Date selection */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-2.5 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-400" />
          Choose a date
        </h2>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {dates.map((d, idx) => {
            const isSelected = d.value === selectedDate;
            return (
              <button
                key={d.value}
                onClick={() => onSelectDate(d.value)}
                className={`flex flex-col items-center py-2.5 rounded-lg transition-all ${
                  isSelected
                    ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 scale-105"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
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
      {selectedDate && (
        <div ref={showtimeRef} className="animate-fade-in pt-2">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-semibold text-slate-400 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Showtimes for {movie.title}
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {movie.showtimes.map((st) => {
              const isSelected = st === selectedShowtime;
              return (
                <button
                  key={st}
                  onClick={() => onSelectShowtime(st)}
                  className={`py-3 rounded-lg text-sm font-semibold transition-all ${
                    isSelected
                      ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 scale-105"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
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
      {!selectedDate && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 py-2 animate-fade-in">
          <ChevronDown className="w-4 h-4 animate-bounce" />
          Pick a date above to see showtimes
        </div>
      )}
    </div>
  );
}
