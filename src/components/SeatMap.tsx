import { SEAT_ROWS, SEAT_COLS, type Seat } from "@/types";
import { Check, Sofa, X } from "lucide-react";

interface SeatMapProps {
  occupiedSeats: Set<string>;
  selectedSeats: Seat[];
  ticketCount: number;
  onToggleSeat: (row: string, col: number) => void;
  onConfirm: () => void;
}

export function SeatMap({
  occupiedSeats,
  selectedSeats,
  ticketCount,
  onToggleSeat,
  onConfirm,
}: SeatMapProps) {
  const selectedLabels = new Set(selectedSeats.map((s) => `${s.row}${s.col}`));
  const allSelected = selectedSeats.length === ticketCount;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-400 flex items-center gap-2">
          <Sofa className="w-4 h-4 text-cyan-400" />
          Select {ticketCount} seat{ticketCount > 1 ? "s" : ""}
        </h2>
        <span className={`text-xs font-medium ${allSelected ? "text-emerald-400" : "text-slate-500"}`}>
          {selectedSeats.length} / {ticketCount} chosen
        </span>
      </div>

      {/* Screen */}
      <div className="relative mb-5">
        <div className="h-2 bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent rounded-full mx-6" />
        <div className="h-6 bg-gradient-to-b from-cyan-500/10 to-transparent rounded-b-3xl mx-2" />
        <p className="text-center text-[10px] text-slate-500 mt-1 uppercase tracking-widest">Screen</p>
      </div>

      {/* Seats */}
      <div className="space-y-1.5 overflow-x-auto pb-2">
        {SEAT_ROWS.map((row) => (
          <div key={row} className="flex items-center justify-center gap-1">
            <span className="w-5 text-[11px] text-slate-500 font-medium text-right pr-1">{row}</span>
            {Array.from({ length: SEAT_COLS }, (_, i) => {
              const col = i + 1;
              const label = `${row}${col}`;
              const isOccupied = occupiedSeats.has(label);
              const isSelected = selectedLabels.has(label);
              const isAisle = i === 5;
              return (
                <div key={col} className="contents">
                  {isAisle && <div className="w-2" />}
                  <button
                    onClick={() => !isOccupied && onToggleSeat(row, col)}
                    disabled={isOccupied}
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md text-[9px] font-semibold flex items-center justify-center transition-all ${
                      isOccupied
                        ? "bg-slate-800/50 text-slate-700 cursor-not-allowed"
                        : isSelected
                        ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 scale-105"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    {isOccupied ? <X className="w-3 h-3" /> : isSelected ? <Check className="w-3 h-3" /> : col}
                  </button>
                </div>
              );
            })}
            <span className="w-5 text-[11px] text-slate-500 font-medium text-left pl-1">{row}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-slate-800" /> Available
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-gradient-to-br from-cyan-500 to-blue-600" /> Selected
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-slate-800/50" /> Taken
        </span>
      </div>

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        disabled={!allSelected}
        className={`w-full mt-4 py-3 rounded-xl text-sm font-semibold transition-all ${
          allSelected
            ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20"
            : "bg-slate-800 text-slate-600 cursor-not-allowed"
        }`}
      >
        {allSelected ? "Confirm Seats" : `Select ${ticketCount - selectedSeats.length} more seat${ticketCount - selectedSeats.length > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
