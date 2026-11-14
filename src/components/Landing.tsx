import { MOVIES, GENRE_COLORS, formatDuration, type Movie } from "@/types";
import { Star, Clock, MapPin, Calendar } from "lucide-react";

interface LandingProps {
  onSelectMovie: (movie: Movie) => void;
}

export function Landing({ onSelectMovie }: LandingProps) {
  const today = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dateStr = `${weekdays[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}`;

  return (
    <div className="p-4 sm:p-6">
      {/* Header section */}
      <div className="mb-5">
        <div className="flex items-center gap-2 text-xs text-cyan-400 mb-1">
          <MapPin className="w-3.5 h-3.5" />
          <span>Now Showing in Canada</span>
          <Calendar className="w-3.5 h-3.5 ml-2" />
          <span className="text-slate-500">{dateStr}</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Latest Movies
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Browse what's playing and tap a movie to start booking, or just ask the assistant.
        </p>
      </div>

      {/* Featured movie (first) */}
      <FeaturedMovie movie={MOVIES[0]} onSelect={onSelectMovie} />

      {/* Grid of remaining movies */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-400 mb-3">Also Playing</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {MOVIES.slice(1).map((movie, idx) => (
            <button
              key={movie.id}
              onClick={() => onSelectMovie(movie)}
              className="group relative rounded-xl overflow-hidden text-left transition-all duration-300 ring-1 ring-slate-700 hover:ring-cyan-500/50 hover:scale-[1.02]"
            >
              <div className="relative aspect-[2/3] overflow-hidden">
                <img
                  src={movie.poster}
                  alt={movie.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                <div
                  className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-gradient-to-r ${GENRE_COLORS[movie.genre]} shadow-lg`}
                >
                  {movie.genre}
                </div>
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-[11px] font-bold text-white">
                  {idx + 2}
                </div>
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
          ))}
        </div>
      </div>
    </div>
  );
}

function FeaturedMovie({ movie, onSelect }: { movie: Movie; onSelect: (m: Movie) => void }) {
  return (
    <button
      onClick={() => onSelect(movie)}
      className="group relative w-full rounded-2xl overflow-hidden text-left transition-all duration-300 ring-1 ring-slate-700 hover:ring-cyan-400/60 hover:ring-2"
    >
      <div className="relative h-48 sm:h-56 overflow-hidden">
        <img
          src={movie.poster}
          alt={movie.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <div
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold text-white bg-gradient-to-r ${GENRE_COLORS[movie.genre]} shadow-lg`}
          >
            {movie.genre}
          </div>
          <div className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-cyan-300 bg-black/60 backdrop-blur">
            Featured
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-1">
            {movie.title}
          </h3>
          <p className="text-sm text-slate-300 mb-2 line-clamp-2 max-w-md">
            {movie.description}
          </p>
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <span className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              {movie.rating}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDuration(movie.duration)}
            </span>
            <span className="text-cyan-400 font-medium">
              {movie.showtimes.length} showtimes today
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
