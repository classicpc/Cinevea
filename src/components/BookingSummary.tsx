import {
  type BookingState,
  formatDuration,
  getDates,
} from "@/types";
import { Calendar, Clock, Sofa, Ticket, Check, RotateCcw } from "lucide-react";

interface BookingSummaryProps {
  booking: BookingState;
  onConfirm: () => void;
  onEdit: (step: "movie" | "date" | "showtime" | "tickets" | "seats") => void;
}

export function BookingSummary({ booking, onConfirm, onEdit }: BookingSummaryProps) {
  const { movie, date, showtime, ticketCount, seats } = booking;
  if (!movie) return null;

  const dateInfo = getDates().find((d) => d.value === date);
  const seatLabels = seats.map((s) => `${s.row}${s.col}`).join(", ");
  const totalPrice = ticketCount * 14.99;

  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
        <Ticket className="w-4 h-4 text-cyan-400" />
        Review Your Booking
      </h2>

      <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
        {/* Movie header */}
        <div className="flex gap-3 p-3 border-b border-slate-700/50">
          <img
            src={movie.poster}
            alt={movie.title}
            className="w-16 h-24 rounded-lg object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-white leading-tight">{movie.title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {movie.genre} · {movie.rating} · {formatDuration(movie.duration)}
            </p>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{movie.description}</p>
          </div>
        </div>

        {/* Details rows */}
        <div className="divide-y divide-slate-700/30">
          <SummaryRow
            icon={<Calendar className="w-4 h-4 text-cyan-400" />}
            label="Date"
            value={dateInfo ? `${dateInfo.weekday}, ${dateInfo.label}` : "—"}
            onEdit={() => onEdit("date")}
          />
          <SummaryRow
            icon={<Clock className="w-4 h-4 text-cyan-400" />}
            label="Showtime"
            value={showtime || "—"}
            onEdit={() => onEdit("showtime")}
          />
          <SummaryRow
            icon={<Ticket className="w-4 h-4 text-cyan-400" />}
            label="Tickets"
            value={`${ticketCount} × $14.99`}
            onEdit={() => onEdit("tickets")}
          />
          <SummaryRow
            icon={<Sofa className="w-4 h-4 text-cyan-400" />}
            label="Seats"
            value={seatLabels || "—"}
            onEdit={() => onEdit("seats")}
          />
        </div>

        {/* Total */}
        <div className="flex items-center justify-between p-3 bg-slate-900/50 border-t border-slate-700/50">
          <span className="text-sm text-slate-400">Total</span>
          <span className="text-lg font-bold text-white">${totalPrice.toFixed(2)}</span>
        </div>
      </div>

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
      >
        <Check className="w-5 h-5" />
        Confirm Booking
      </button>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  onEdit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 group">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white truncate">{value}</span>
        <button
          onClick={onEdit}
          className="text-[11px] text-slate-500 hover:text-cyan-400 px-2 py-0.5 rounded transition-all"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

interface ConfirmationProps {
  booking: BookingState;
  bookingId: string;
  onRestart: () => void;
}

export function Confirmation({ booking, bookingId, onRestart }: ConfirmationProps) {
  const { movie, date, showtime, ticketCount, seats } = booking;
  const dateInfo = getDates().find((d) => d.value === date);
  const seatLabels = seats.map((s) => `${s.row}${s.col}`).join(", ");
  const totalPrice = ticketCount * 14.99;

  return (
    <div className="p-4 animate-fade-in">
      {/* Success animation */}
      <div className="flex flex-col items-center mb-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce-in">
          <Check className="w-9 h-9 text-white" strokeWidth={3} />
        </div>
        <h2 className="text-xl font-bold text-white mt-3">Booking Confirmed!</h2>
        <p className="text-sm text-slate-400 mt-1">Your tickets have been reserved</p>
      </div>

      {/* Ticket card */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 overflow-hidden shadow-2xl">
        {/* Top perforation */}
        <div className="flex justify-between items-center px-4 py-2.5 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-b border-dashed border-slate-600">
          <span className="text-xs font-bold text-cyan-400 tracking-widest">CINEVEA</span>
          <span className="text-xs text-slate-400 font-mono">#{bookingId}</span>
        </div>

        {/* Movie info */}
        <div className="flex gap-3 p-4">
          <img src={movie?.poster} alt={movie?.title} className="w-20 h-28 rounded-lg object-cover" />
          <div className="flex-1">
            <h3 className="text-base font-bold text-white leading-tight">{movie?.title}</h3>
            <p className="text-xs text-slate-400 mt-1">{movie?.genre} · {movie?.rating}</p>
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                {dateInfo ? `${dateInfo.weekday}, ${dateInfo.label}` : ""}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                {showtime}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Sofa className="w-3.5 h-3.5 text-cyan-400" />
                {seatLabels}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Ticket className="w-3.5 h-3.5 text-cyan-400" />
                {ticketCount} ticket{ticketCount > 1 ? "s" : ""} · ${totalPrice.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Barcode */}
        <div className="px-4 pb-4">
          <div className="flex gap-px h-10 items-end">
            {Array.from({ length: 40 }, (_, i) => (
              <div
                key={i}
                className="bg-slate-400"
                style={{
                  width: "2px",
                  height: `${30 + ((i * 37) % 50)}%`,
                  opacity: 0.4 + ((i * 13) % 60) / 100,
                }}
              />
            ))}
          </div>
          <p className="text-center text-[10px] text-slate-500 mt-1 font-mono">{bookingId}</p>
        </div>
      </div>

      <button
        onClick={onRestart}
        className="w-full mt-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-all flex items-center justify-center gap-2"
      >
        <RotateCcw className="w-4 h-4" />
        Book Another Movie
      </button>
    </div>
  );
}
