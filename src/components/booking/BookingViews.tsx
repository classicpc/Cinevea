import { paymentLabel, type DemoPaymentMethod } from "@/lib/payment";
import { MovieTicket } from "@/components/booking/MovieTicket";
import { useState, useRef, useEffect, type ReactNode, type KeyboardEvent } from "react";
import { journey, readableDate } from "@/lib/bookingPresentation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  MapPin,
  Search,
  Ticket,
  CalendarDays,
  Clock3,
} from "lucide-react";
import {
  computeTicketCount,
  computeTicketPrice,
  getDates,
  SEAT_ROWS,
  SEAT_COLS,
  TICKET_TYPES,
  type BookingState,
  type Movie,
} from "@/types";

export type SeatStatus = "available" | "held" | "booked";
export type SeatPreference = "middle" | "front" | "back" | "center";
export type SeatRecommendation = {
  seats: Array<{ row: string; col: number }>;
  score: number;
  explanation: string;
};
export type EditStep = "movie" | "date" | "showtime" | "tickets" | "seats";
export function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="section-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
    </div>
  );
}
function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      className={`notice ${error ? "notice-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
export function Progress({ index }: { index: number }) {
  return (
    <nav aria-label="Booking progress" className="journey-progress">
      <div className="progress-caption">
        <span>YOUR BOOKING</span>
        <span>
          {index === 7
            ? "Complete"
            : `Step ${index + 1} of 7 · ${journey[index]}`}
        </span>
      </div>
      <ol>
        {journey.slice(0, 7).map((label, i) => (
          <li
            key={label}
            aria-current={i === index ? "step" : undefined}
            className={i < index ? "complete" : i === index ? "current" : ""}
          >
            <span className="step-dot">
              {i < index ? <Check size={14} aria-hidden="true" /> : i + 1}
            </span>
            <span className="step-name">{label}</span>
            <span className="sr-only">
              {i < index
                ? " completed"
                : i === index
                  ? " current step"
                  : " upcoming"}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function LocationPicker({
  locations,
  loading,
  error,
  onSelect,
}: {
  locations: Array<{ id: string; name: string; city: string; country: string }>;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const trackRef = useRef<HTMLUListElement>(null);

  const matches = locations.filter((l) =>
    `${l.name} ${l.city} ${l.country}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  const scrollTo = (index: number) => {
    const clamped = Math.max(0, Math.min(index, matches.length - 1));
    setCurrentIndex(clamped);
    if (trackRef.current) {
      const cards = trackRef.current.children;
      if (cards[clamped]) {
        (cards[clamped] as HTMLElement).scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "start",
        });
      }
    }
  };

  const handleScroll = () => {
    if (!trackRef.current) return;
    const scrollLeft = trackRef.current.scrollLeft;
    const cardWidth = trackRef.current.firstElementChild?.clientWidth || 280;
    const index = Math.round(scrollLeft / (cardWidth + 16));
    if (index >= 0 && index < matches.length && index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  return (
    <section>
      <SectionTitle
        eyebrow="A GOOD NIGHT STARTS HERE"
        title="Where are you watching?"
        description="Choose a location to find your next movie."
      />
      <label className="field-label" htmlFor="location-search">
        Search locations
      </label>
      <div className="search-field">
        <Search size={20} aria-hidden="true" />
        <input
          id="location-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrentIndex(0);
          }}
          placeholder="Enter a city or location"
        />
      </div>
      {loading ? (
        <Notice>Loading locations…</Notice>
      ) : error ? (
        <Notice error>{error}</Notice>
      ) : !matches.length ? (
        <Notice>
          {locations.length
            ? "No matching locations. Try another city."
            : "No locations are available yet. Please try again later."}
        </Notice>
      ) : (
        <div className="carousel-wrapper location-carousel-wrapper" role="region" aria-label="Locations carousel">
          <div className="carousel-top-bar">
            <span className="carousel-tag" role="status" aria-live="polite">
              Location {currentIndex + 1} of {matches.length}
            </span>
            <div className="carousel-nav-buttons">
              <button
                type="button"
                className="carousel-arrow-btn"
                onClick={() => scrollTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                aria-label="Previous locations"
                title="Previous location"
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="carousel-arrow-btn"
                onClick={() => scrollTo(currentIndex + 1)}
                disabled={currentIndex >= matches.length - 1}
                aria-label="Next locations"
                title="Next location"
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <ul
            className="location-list location-carousel"
            ref={trackRef}
            onScroll={handleScroll}
            tabIndex={0}
          >
            {matches.map((l, idx) => (
              <li
                key={l.id}
                className={`carousel-slide-item ${idx === currentIndex ? "is-active" : ""}`}
              >
                <button
                  className="location-card"
                  onClick={() => onSelect(l.id)}
                  aria-label={`Select ${l.name}, ${l.city}, ${l.country}`}
                >
                  <span className="location-icon">
                    <MapPin size={22} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{l.name}</strong>
                    <span className="muted">
                      {l.city}, {l.country}
                    </span>
                  </span>
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {matches.length > 1 && (
            <div className="carousel-dots-indicator" role="tablist" aria-label="Locations pagination">
              {matches.map((l, idx) => (
                <button
                  key={l.id}
                  type="button"
                  className={`carousel-dot-btn ${idx === currentIndex ? "active" : ""}`}
                  onClick={() => scrollTo(idx)}
                  aria-label={`Go to location ${idx + 1}: ${l.name}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <p className="small-note">
        No location permissions needed. Choose any supported location.
      </p>
    </section>
  );
}
export function MoviePicker({
  movies,
  loading,
  error,
  onSelect,
  onChangeLocation,
  onRefresh,
}: {
  movies: Movie[];
  loading: boolean;
  error: string | null;
  onSelect: (m: Movie) => void;
  onChangeLocation: () => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [sort, setSort] = useState("default");
  const [currentIndex, setCurrentIndex] = useState(0);
  const trackRef = useRef<HTMLUListElement>(null);

  const visible = movies
    .filter(
      (m) =>
        m.title.toLowerCase().includes(query.toLowerCase()) &&
        (genre === "All" || m.genre === genre),
    )
    .sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : 0));

  const scrollTo = (index: number) => {
    const clamped = Math.max(0, Math.min(index, visible.length - 1));
    setCurrentIndex(clamped);
    if (trackRef.current) {
      const cards = trackRef.current.children;
      if (cards[clamped]) {
        (cards[clamped] as HTMLElement).scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "start",
        });
      }
    }
  };

  const handleScroll = () => {
    if (!trackRef.current) return;
    const scrollLeft = trackRef.current.scrollLeft;
    const cardWidth = trackRef.current.firstElementChild?.clientWidth || 240;
    const index = Math.round(scrollLeft / (cardWidth + 16));
    if (index >= 0 && index < visible.length && index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  return (
    <section>
      <div className="heading-with-action">
        <SectionTitle
          eyebrow="NOW SHOWING"
          title="Find your next favourite."
          description="Pick a movie. We’ll take it one step at a time."
        />
        <div className="catalog-actions">
          <button
            className="text-button"
            disabled={loading}
            onClick={onRefresh}
          >
            Refresh listings
          </button>
          <button className="text-button" onClick={onChangeLocation}>
            Change location
          </button>
        </div>
      </div>
      <label className="field-label" htmlFor="movie-search">
        Search movies
      </label>
      <div className="search-field">
        <Search size={20} aria-hidden="true" />
        <input
          id="movie-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrentIndex(0);
          }}
          placeholder="Search by movie title"
        />
      </div>
      <details className="filter-disclosure">
        <summary>Filter and sort</summary>
        <div className="filter-fields">
          <label>
            Genre
            <select
              value={genre}
              onChange={(e) => {
                setGenre(e.target.value);
                setCurrentIndex(0);
              }}
            >
              {["All", ...new Set(movies.map((m) => m.genre))].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label>
            Sort by
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setCurrentIndex(0);
              }}
            >
              <option value="default">Featured order</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
        </div>
      </details>
      {loading ? (
        <Notice>Loading movies…</Notice>
      ) : error ? (
        <Notice error>{error}</Notice>
      ) : !visible.length ? (
        <Notice>
          {movies.length
            ? "No movies match. Clear your search or filters."
            : "No upcoming screenings at this location. Try another location."}
        </Notice>
      ) : (
        <div className="carousel-wrapper movie-carousel-wrapper" role="region" aria-label="Movies carousel">
          <div className="carousel-top-bar">
            <p className="results-count" role="status">
              {visible.length} movie{visible.length === 1 ? "" : "s"} available
              <span className="carousel-tag" aria-live="polite">
                · Slide {currentIndex + 1} of {visible.length}
              </span>
            </p>
            <div className="carousel-nav-buttons">
              <button
                type="button"
                className="carousel-arrow-btn"
                onClick={() => scrollTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                aria-label="Previous movies"
                title="Previous movie"
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="carousel-arrow-btn"
                onClick={() => scrollTo(currentIndex + 1)}
                disabled={currentIndex >= visible.length - 1}
                aria-label="Next movies"
                title="Next movie"
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <ul
            className="movie-grid movie-carousel"
            ref={trackRef}
            onScroll={handleScroll}
            tabIndex={0}
          >
            {visible.map((m, idx) => (
              <li
                key={m.id}
                className={`carousel-slide-item ${idx === currentIndex ? "is-active" : ""}`}
              >
                <button
                  className="movie-card"
                  onClick={() => onSelect(m)}
                  aria-label={`Choose ${m.title}, ${m.rating}, ${m.duration} minutes`}
                >
                  <MoviePoster src={m.poster} title={m.title} />
                  <span className="movie-info">
                    <span className="movie-genre">{m.genre}</span>
                    <strong>{m.title}</strong>
                    <span className="muted">
                      {m.rating} <span aria-hidden="true">·</span>{" "}
                      {m.duration ? `${m.duration} min` : "Runtime unavailable"}
                    </span>
                    <span className="movie-cta">
                      Choose movie <ChevronRight size={16} aria-hidden="true" />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {visible.length > 1 && (
            <div className="carousel-dots-indicator" role="tablist" aria-label="Movies pagination">
              {visible.map((m, idx) => (
                <button
                  key={m.id}
                  type="button"
                  className={`carousel-dot-btn ${idx === currentIndex ? "active" : ""}`}
                  onClick={() => scrollTo(idx)}
                  aria-label={`Go to movie ${idx + 1}: ${m.title}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <p className="small-note">
        Listings from the shared project database · Prototype bookings. Refresh
        checks saved listings; provider updates are managed separately.
      </p>
    </section>
  );
}
function MoviePoster({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(!src);
  return failed ? (
    <div className="poster-placeholder">
      <Film size={36} aria-hidden="true" />
      <span>{title}</span>
    </div>
  ) : (
    <img
      className="movie-poster"
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
export function DatePicker({
  movie,
  dates,
  selected,
  onSelect,
}: {
  movie: Movie;
  dates: ReturnType<typeof getDates>;
  selected: string | null;
  onSelect: (d: string) => void;
}) {
  // Include every available screening date, including dates outside the initial seven-day strip.
  const keys = [
    ...new Set([
      ...dates.map((d) => d.value),
      ...Object.keys(movie.showtimesByDate ?? {}),
    ]),
  ]
    .filter((d) => (movie.showtimesByDate?.[d] ?? []).length)
    .sort();
  return (
    <section>
      <SectionTitle
        eyebrow={movie.title}
        title="What day works for you?"
        description="Only dates with available screenings are shown."
      />
      {!keys.length ? (
        <Notice>
          No upcoming dates for this movie. Use Back to choose another.
        </Notice>
      ) : (
        <div className="choice-grid">
          {keys.map((key) => (
            <button
              className="choice-card date-choice"
              key={key}
              onClick={() => onSelect(key)}
              aria-pressed={selected === key}
            >
              <CalendarDays size={22} aria-hidden="true" />
              <strong>{readableDate(key)}</strong>
              <span className="muted">
                {movie.showtimesByDate![key].length} showtime
                {movie.showtimesByDate![key].length === 1 ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
export function ShowtimePicker({
  movie,
  date,
  onSelect,
  onChangeDate,
}: {
  movie: Movie;
  date: string;
  onSelect: (t: string) => void;
  onChangeDate: () => void;
}) {
  const times = movie.showtimesByDate?.[date] ?? [];
  return (
    <section>
      <SectionTitle
        eyebrow={`${movie.title} · ${readableDate(date)}`}
        title="Choose your showtime."
        description="Times are displayed in your device’s local time zone."
      />
      {!times.length ? (
        <>
          <Notice>No screenings available on this date.</Notice>
          <button className="secondary-button" onClick={onChangeDate}>
            Choose another date
          </button>
        </>
      ) : (
        <div className="choice-grid">
          {times.map(({ time }) => (
            <button
              className="choice-card"
              key={time}
              onClick={() => onSelect(time)}
            >
              <Clock3 size={22} aria-hidden="true" />
              <strong>{time}</strong>
              <span className="muted">Choose time</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
export function TicketPicker({
  onSelect,
  initial = {},
}: {
  onSelect: (b: Record<string, number>) => void;
  initial?: Record<string, number>;
}) {
  const [counts, setCounts] = useState(initial);
  const total = computeTicketCount(counts);
  return (
    <section>
      <SectionTitle
        eyebrow="MAKE IT A MOVIE NIGHT"
        title="Who’s coming along?"
        description="Choose up to 10 tickets in total."
      />
      <div className="ticket-list">
        {TICKET_TYPES.map((t) => (
          <div className="ticket-row" key={t.code}>
            <div>
              <h3>{t.label}</h3>
              <p className="muted">${t.price.toFixed(2)} per ticket</p>
            </div>
            <div
              className="stepper"
              role="group"
              aria-label={`${t.label} tickets`}
            >
              <button
                className="secondary-button"
                aria-label={`Remove one ${t.label} ticket`}
                disabled={!counts[t.code]}
                onClick={() =>
                  setCounts((c) => ({
                    ...c,
                    [t.code]: Math.max(0, (c[t.code] ?? 0) - 1),
                  }))
                }
              >
                −
              </button>
              <output aria-label={`${t.label} ticket count`}>
                {counts[t.code] ?? 0}
              </output>
              <button
                className="secondary-button"
                aria-label={`Add one ${t.label} ticket`}
                disabled={total >= 10}
                onClick={() =>
                  setCounts((c) => ({ ...c, [t.code]: (c[t.code] ?? 0) + 1 }))
                }
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="total-line" role="status">
        <span>
          {total} ticket{total === 1 ? "" : "s"}
        </span>
        <strong>${computeTicketPrice(counts).toFixed(2)}</strong>
      </div>
      <div className="step-actions">
        <button
          className="primary-button"
          disabled={total < 1 || total > 10}
          onClick={() => onSelect(counts)}
        >
          Continue to seats <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
export function SeatPicker({
  booking,
  seatStatuses,
  loading,
  preference,
  recommendations,
  recommendationIndex,
  onPreferenceChange,
  onFindBest,
  onSelectRecommendation,
  onAlternative,
  onToggle,
  onConfirm,
  busy = false,
}: {
  booking: BookingState;
  seatStatuses: Record<string, SeatStatus>;
  loading: boolean;
  preference: SeatPreference;
  recommendations: SeatRecommendation[];
  recommendationIndex: number;
  onPreferenceChange: (p: SeatPreference) => void;
  onFindBest: () => void;
  onSelectRecommendation: (r: SeatRecommendation) => void;
  onAlternative: () => void;
  onToggle: (r: string, c: number) => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const [view, setView] = useState<"map" | "list">("map");
  const [listRow, setListRow] = useState("");
  const [focusedSeat, setFocusedSeat] = useState("");
  const rows = [
    ...new Set(Object.keys(seatStatuses).map((k) => k.split("-")[0])),
  ].sort();
  const seatRows = rows.length ? rows : SEAT_ROWS;
  const cols = rows.length
    ? Math.max(...Object.keys(seatStatuses).map((k) => Number(k.split("-")[1])))
    : SEAT_COLS;
  const rec = recommendations[recommendationIndex];
  const selected = (r: string, c: number) =>
    booking.seats.some((s) => s.row === r && s.col === c);
  const status = (r: string, c: number) =>
    seatStatuses[`${r}-${c}`] ?? "unavailable";
  const isEnabled = (r: string, c: number) =>
    !loading &&
    !busy &&
    (selected(r, c) ||
      (status(r, c) === "available" &&
        booking.seats.length < booking.ticketCount));
  const enabledSeats = seatRows
    .flatMap((r) => Array.from({ length: cols }, (_, i) => ({ r, c: i + 1 })))
    .filter((s) => isEnabled(s.r, s.c));
  const tabStop = enabledSeats.some((s) => `${s.r}-${s.c}` === focusedSeat)
    ? focusedSeat
    : enabledSeats[0]
      ? `${enabledSeats[0].r}-${enabledSeats[0].c}`
      : "";
  const navigate = (
    event: KeyboardEvent<HTMLButtonElement>,
    r: string,
    c: number,
  ) => {
    if (
      view !== "map" ||
      ![
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    const controls = Array.from(
      event.currentTarget
        .closest(".seat-map")
        ?.querySelectorAll<HTMLButtonElement>(
          "button[data-seat]:not(:disabled)",
        ) ?? [],
    );
    let candidates = controls;
    if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
      candidates = controls.filter((b) => b.dataset.row === r);
    else candidates = controls.filter((b) => Number(b.dataset.col) === c);
    let next: HTMLButtonElement | undefined;
    if (event.key === "Home") next = candidates[0];
    else if (event.key === "End") next = candidates[candidates.length - 1];
    else {
      const direction = ["ArrowRight", "ArrowDown"].includes(event.key)
        ? 1
        : -1;
      const index = candidates.indexOf(event.currentTarget);
      next = candidates[index + direction];
    }
    next?.focus();
  };
  const button = (r: string, c: number) => {
    const picked = selected(r, c);
    const state = status(r, c);
    const blocked =
      loading ||
      busy ||
      (!picked &&
        (state !== "available" || booking.seats.length >= booking.ticketCount));
    return (
      <button
        key={c}
        style={
          view === "map" && c === Math.floor(cols / 2)
            ? { marginRight: 20 }
            : undefined
        }
        type="button"
        data-seat={`${r}-${c}`}
        data-row={r}
        data-col={c}
        tabIndex={view === "map" ? (tabStop === `${r}-${c}` ? 0 : -1) : 0}
        onFocus={() => setFocusedSeat(`${r}-${c}`)}
        onKeyDown={(e) => navigate(e, r, c)}
        className={`seat ${picked ? "seat-selected" : ""} ${state !== "available" && !picked ? "seat-unavailable" : ""}`}
        aria-pressed={picked}
        aria-label={`Row ${r}, seat ${c}, ${picked ? "selected" : state}`}
        disabled={blocked}
        onClick={() => onToggle(r, c)}
      >
        <span className="seat-number">
          {r}
          {c}
        </span>
        <span className="seat-accessible-label sr-only">
          {picked ? "Selected" : state}
        </span>
      </button>
    );
  };
  return (
    <section>
      <SectionTitle
        eyebrow="A PLACE FOR EVERYONE"
        title="Choose your seats."
        description={`Select ${booking.ticketCount} seat${booking.ticketCount === 1 ? "" : "s"}. You can choose on the map or use the row list.`}
      />
      <details className="recommendation-tools">
        <summary>Help me find seats together</summary>
        <div className="filter-fields">
          <label>
            Preferred area
            <select
              value={preference}
              onChange={(e) =>
                onPreferenceChange(e.target.value as SeatPreference)
              }
            >
              <option value="middle">Middle rows</option>
              <option value="center">Centre of the row</option>
              <option value="front">Front rows</option>
              <option value="back">Back rows</option>
            </select>
          </label>
          <button
            className="secondary-button"
            onClick={onFindBest}
            disabled={loading || busy}
          >
            Find seats
          </button>
        </div>
        {rec && (
          <div className="recommendation-result">
            <strong>
              {rec.seats.map((s) => `${s.row}${s.col}`).join(", ")}
            </strong>
            <p className="muted">{rec.explanation}</p>
            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => onSelectRecommendation(rec)}
                disabled={busy}
              >
                Use these seats
              </button>
              {recommendations.length > 1 && (
                <button
                  className="secondary-button"
                  onClick={onAlternative}
                  disabled={busy}
                >
                  Another option
                </button>
              )}
            </div>
          </div>
        )}
      </details>
      <div className="seat-toolbar">
        <div
          className="segmented"
          role="group"
          aria-label="Seat selection view"
        >
          <button aria-pressed={view === "map"} onClick={() => setView("map")}>
            Seat map
          </button>
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            Row list
          </button>
        </div>
        <p role="status">
          {booking.seats.length} of {booking.ticketCount} selected
        </p>
      </div>
      {loading ? (
        <Notice>Checking seat availability…</Notice>
      ) : !rows.length ? (
        <Notice error>
          Seat availability could not be loaded. Go back and select the showtime
          again.
        </Notice>
      ) : view === "list" ? (
        <div>
          <label className="field-label" htmlFor="seat-row">
            Choose a row
          </label>
          <select
            id="seat-row"
            value={listRow || seatRows[0]}
            onChange={(e) => setListRow(e.target.value)}
          >
            {seatRows.map((r) => (
              <option key={r} value={r}>
                Row {r}
              </option>
            ))}
          </select>
          <div
            className="seat-list"
            role="group"
            aria-label={`Seats in row ${listRow || seatRows[0]}`}
          >
            {Array.from({ length: cols }, (_, i) =>
              button(listRow || seatRows[0], i + 1),
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="cinema-screen">
            <span>SCREEN</span>
            <span aria-hidden="true">Enjoy the view</span>
          </div>
          <p className="small-note">
            Front rows are nearest the screen. Scroll sideways to see every
            seat.
          </p>
          <div
            className="seat-map"
            tabIndex={0}
            role="region"
            aria-label="Seat map, horizontally scrollable"
          >
            <div className="seat-map-inner">
              {seatRows.map((r) => (
                <div
                  className="seat-row"
                  key={r}
                  role="group"
                  aria-label={`Row ${r}`}
                >
                  <span className="row-label">{r}</span>
                  {Array.from({ length: cols }, (_, i) => button(r, i + 1))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="seat-legend">
        <span>
          <i className="legend-free" />
          Available
        </span>
        <span>
          <i className="legend-selected" />
          Selected
        </span>
        <span>
          <i>×</i>Unavailable
        </span>
      </div>
      <p className="selected-seat-text" role="status">
        {booking.seats.length
          ? `Your seats: ${booking.seats.map((s) => `${s.row}${s.col}`).join(", ")}. Select a chosen seat again to remove it.`
          : "No seats selected yet."}
      </p>
      <div className="step-actions">
        <button
          className="primary-button"
          disabled={
            loading ||
            busy ||
            booking.ticketCount < 1 ||
            booking.seats.length !== booking.ticketCount
          }
          onClick={onConfirm}
        >
          {busy ? "Holding seats…" : "Review booking"}{" "}
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
export function BookingDetails({
  booking,
  onEdit,
  disabled = false,
}: {
  booking: BookingState;
  onEdit?: (s: EditStep) => void;
  disabled?: boolean;
}) {
  const tickets = TICKET_TYPES.filter(
    (t) => (booking.ticketBreakdown[t.code] ?? 0) > 0,
  )
    .map((t) => `${booking.ticketBreakdown[t.code]} ${t.label}`)
    .join(", ");
  const rows: Array<[string, string, EditStep]> = [
    ["Movie", booking.movie?.title ?? "Not selected", "movie"],
    ["Date", readableDate(booking.date), "date"],
    ["Time", booking.showtime ?? "Not selected", "showtime"],
    ["Tickets", tickets || "Not selected", "tickets"],
    [
      "Seats",
      booking.seats.map((s) => `${s.row}${s.col}`).join(", ") || "Not selected",
      "seats",
    ],
  ];
  return (
    <dl className="booking-details">
      {rows.map(([label, value, step]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value}
            {onEdit && (
              <button
                className="text-button"
                aria-label={`Edit ${label.toLowerCase()}`}
                disabled={disabled}
                onClick={() => onEdit(step)}
              >
                Edit
              </button>
            )}
          </dd>
        </div>
      ))}
      <div className="booking-total">
        <dt>Total</dt>
        <dd>${computeTicketPrice(booking.ticketBreakdown).toFixed(2)}</dd>
      </div>
    </dl>
  );
}
export function Review({
  booking,
  onConfirm,
  saving,
  onEdit,
  onPayment,
}: {
  booking: BookingState;
  onConfirm: () => void;
  saving: boolean;
  onEdit: (s: EditStep) => void;
  onPayment: (method: DemoPaymentMethod) => void;
}) {
  return (
    <section>
      <SectionTitle
        eyebrow="ONE LAST LOOK"
        title="Everything look right?"
        description="Review your choices before confirming your booking."
      />
      <fieldset className="payment-choice">
        <legend>
          How would you like to pay? <span>Simulation only</span>
        </legend>
        <p id="payment-help">
          Choose a method for the demonstration. No money is charged and no card
          details are collected.
        </p>
        {(
          [
            ["venue", "Pay at venue (demo)"],
            ["card_demo", "Card payment (simulation)"],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="demo-payment"
              value={value}
              checked={booking.paymentMethod === value}
              disabled={saving}
              aria-describedby="payment-help"
              onChange={() => onPayment(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <BookingDetails booking={booking} onEdit={onEdit} disabled={saving} />
      <div className="payment-summary">
        <span>Payment method</span>
        <strong>{paymentLabel(booking.paymentMethod)}</strong>
      </div>
      <p className="notice">
        Seats are held temporarily. If the hold expires, we’ll ask you to select
        them again. Changing an earlier choice may require new seats.
      </p>
      <div className="step-actions">
        <button
          className="primary-button"
          disabled={saving || !booking.paymentMethod}
          onClick={onConfirm}
        >
          {saving ? "Saving booking…" : "Confirm booking"}{" "}
          <Check size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="small-note">
        Project prototype · No payment will be collected.
      </p>
    </section>
  );
}
export function Confirmation({
  reference,
  onRestart,
  booking,
  location,
}: {
  reference: string;
  onRestart: () => void;
  booking: BookingState;
  location: string;
}) {
  return (
    <section className="ticket-confirmation">
      <div className="success-mark">
        <Check size={30} aria-hidden="true" />
      </div>
      <SectionTitle
        eyebrow="YOU’RE ALL SET"
        title="It’s a movie date."
        description="Your booking is saved. Here’s your movie ticket."
      />
      <MovieTicket
        booking={booking}
        reference={reference}
        location={location}
      />
      <div className="step-actions">
        <button className="secondary-button" onClick={onRestart}>
          Book another movie <Ticket size={18} aria-hidden="true" />
        </button>
        <button className="primary-button" onClick={() => window.print()}>
          Print movie ticket
        </button>
      </div>
      <p className="small-note">
        Save as PDF or print. The QR code contains your prototype reference; it
        is not connected to a real cinema entry scanner.
      </p>
    </section>
  );
}
