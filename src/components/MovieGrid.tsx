import { MOVIES, GENRE_COLORS, formatDuration, type Movie } from "@/types";
import { Clock, Star, Ticket } from "lucide-react";

interface MovieGridProps {
  selectedMovieId: string | null;
  onSelect: (movie: Movie) => void;
}

export function MovieGrid({ selectedMovieId, onSelect }: MovieGridProps) {
  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
        <Ticket className="w-4 h-4 text-cyan-400" />
        Now Showing — tap or say a movie title
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {MOVIES.map((movie, idx) => {
          const isSelected = movie.id === selectedMovieId;
          return (
            <button
              key={movie.id}
              onClick={() => onSelect(movie)}
              className={`group relative rounded-xl overflow-hidden text-left transition-all duration-300 ${
                isSelected
                  ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900 scale-[1.02]"
                  : "ring-1 ring-slate-700 hover:ring-cyan-500/50 hover:scale-[1.02]"
              }`}
            >
              <div className="relative aspect-[2/3] overflow-hidden">
                <img
                  src={movie.poster}
                  alt={movie.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                {/* Genre badge */}
                <div
                  className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-gradient-to-r ${GENRE_COLORS[movie.genre]} shadow-lg`}
                >
                  {movie.genre}
                </div>
                {/* Number badge */}
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-[11px] font-bold text-white">
                  {idx + 1}
                </div>
                {/* Title overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <h3 className="text-sm font-bold text-white leading-tight mb-1">{movie.title}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-300">
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400" />
                      {movie.rating}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(movie.duration)}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
