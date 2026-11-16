import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Film,
  Loader2,
  Mic2,
  Minimize2,
  ArrowLeft,
  Search,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AuthScreen } from "@/components/AuthScreen";
import { Header } from "@/components/Header";
import { VoiceInput } from "@/components/VoiceInput";
import { useAuth } from "@/hooks/useAuth";
import { getDates, SEAT_COLS, SEAT_ROWS, type BookingState, type Movie } from "@/types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { ruleBasedRespond } from "@/lib/conversation";
import { speechController } from "@/lib/speech";

type Message = { id: number; role: "assistant" | "user"; text: string };
type SeatStatus = "available" | "held" | "booked";
const steps = ["movie", "date", "showtime", "tickets", "seats", "review", "confirmed"] as const;

const initialBooking: BookingState = {
  movie: null,
  date: null,
  showtime: null,
  ticketCount: 0,
  seats: [],
  step: "greeting",
};

function App() {
  const { session, loading } = useAuth();

  if (!isSupabaseConfigured) return <SetupScreen />;
  if (loading) {
    return <div className="min-h-screen bg-slate-950 grid place-items-center"><Loader2 className="animate-spin text-rose-400" /></div>;
  }
  return session ? <BookingApp /> : <AuthScreen />;
}

function SetupScreen() {
  return (
    <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
      <section className="max-w-lg rounded-3xl border border-white/10 bg-white/[0.05] p-8 shadow-2xl">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-rose-500"><Film /></div>
        <h1 className="text-2xl font-bold">Cinevea setup required</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Add your Supabase connection settings to <code>.env.local</code>, then reload the app.</p>
        <pre className="mt-5 rounded-2xl bg-slate-950 p-4 text-xs text-rose-300">{`VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...`}</pre>
      </section>
    </main>
  );
}

function BookingApp() {
  const [booking, setBooking] = useState<BookingState>(initialBooking);
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [tts, setTts] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [bookingRef, setBookingRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; city: string; country: string }>>([]);
  const [locationId, setLocationId] = useState("");
  const [catalogMovies, setCatalogMovies] = useState<Movie[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [seatStatuses, setSeatStatuses] = useState<Record<string, SeatStatus>>({});
  const [seatLoading, setSeatLoading] = useState(false);
  const initialized = useRef(false);
  const messageId = useRef(0);

  const dates = useMemo(() => getDates(), []);
  const currentIndex = steps.indexOf(booking.step as (typeof steps)[number]);

  const addMessage = useCallback((role: Message["role"], text: string) => {
    messageId.current += 1;
    setMessages((items) => [...items, { id: messageId.current, role, text }]);
  }, []);

  const speak = useCallback((text: string) => {
    if (!tts) return;
    setSpeaking(true);
    speechController.speak(text, () => setSpeaking(false));
  }, [tts]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    addMessage("assistant", "Welcome to Cinevea. Choose a movie below or type what you would like to watch.");
  }, [addMessage]);

  useEffect(() => {
    let active = true;
    async function loadLocations() {
      if (!supabase) return;
      const { data, error } = await supabase.from("locations").select("id,name,city,country").order("city");
      if (!active) return;
      if (error) setCatalogError(error.message);
      else setLocations(data ?? []);
      setCatalogLoading(false);
    }
    void loadLocations();
    return () => { active = false; };
  }, []);

  const chooseLocation = useCallback(async (id: string) => {
    if (!supabase) return;
    setLocationId(id);
    window.sessionStorage.setItem("cinevea-location", id);
    setCatalogLoading(true);
    setCatalogError(null);
    setCatalogMovies([]);
    const { data: theatres, error: theatreError } = await supabase
      .from("theatres")
      .select("id")
      .eq("location_id", id);
    if (theatreError) {
      setCatalogError(theatreError.message);
      setCatalogLoading(false);
      return;
    }
    const theatreIds = (theatres ?? []).map((theatre) => theatre.id);
    const { data: auditoriums, error: auditoriumError } = await supabase
      .from("auditoriums")
      .select("id")
      .in("theatre_id", theatreIds.length ? theatreIds : ["00000000-0000-0000-0000-000000000000"]);
    if (auditoriumError) {
      setCatalogError(auditoriumError.message);
      setCatalogLoading(false);
      return;
    }
    const auditoriumIds = (auditoriums ?? []).map((auditorium) => auditorium.id);
    const { data: showtimes, error: showtimeError } = await supabase
      .from("showtimes")
      .select("id,movie_id,starts_at")
      .in("auditorium_id", auditoriumIds.length ? auditoriumIds : ["00000000-0000-0000-0000-000000000000"])
      .gt("starts_at", new Date().toISOString())
      .order("starts_at");
    if (showtimeError) {
      setCatalogError(showtimeError.message);
      setCatalogLoading(false);
      return;
    }
    const movieIds = [...new Set((showtimes ?? []).map((showtime) => showtime.movie_id))];
    if (!movieIds.length) {
      setCatalogLoading(false);
      return;
    }
    const { data: movies, error: movieError } = await supabase
      .from("movies")
      .select("id,title,poster_url,genre,language,runtime_minutes,age_rating,synopsis,rating")
      .in("id", movieIds)
      .eq("is_coming_soon", false);
    if (movieError) setCatalogError(movieError.message);
    else {
      const mapped = (movies ?? []).map((movie) => ({
        id: movie.id,
        title: movie.title,
        genre: (movie.genre || "Action") as Movie["genre"],
        rating: movie.age_rating || "Not rated",
        duration: movie.runtime_minutes || 0,
        poster: movie.poster_url || "",
        description: movie.synopsis || "Details unavailable.",
        showtimes: (showtimes ?? [])
          .filter((showtime) => showtime.movie_id === movie.id)
          .map((showtime) => new Date(showtime.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })),
        showtimeIds: Object.fromEntries((showtimes ?? [])
          .filter((showtime) => showtime.movie_id === movie.id)
          .map((showtime) => [new Date(showtime.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), showtime.id])),
      }));
      setCatalogMovies(mapped);
    }
    setCatalogLoading(false);
  }, []);

  const announce = useCallback((text: string) => {
    addMessage("assistant", text);
    speak(text);
  }, [addMessage, speak]);

  const chooseMovie = useCallback((movie: Movie) => {
    setBooking((state) => ({ ...state, movie, date: null, showtime: null, ticketCount: 0, seats: [], step: "date" }));
    announce(`${movie.title} selected. Choose a date to see available showtimes.`);
  }, [announce]);

  const chooseDate = useCallback((date: string) => {
    setBooking((state) => ({ ...state, date, showtime: null, ticketCount: 0, seats: [], step: "showtime" }));
    const formatted = dates.find((item) => item.value === date)?.label ?? date;
    announce(`Showtimes for ${formatted} are now available. Choose a time.`);
  }, [announce, dates]);

  const chooseShowtime = useCallback(async (showtime: string) => {
    const showtimeId = booking.movie?.showtimeIds?.[showtime] ?? null;
    setBooking((state) => ({ ...state, showtime, showtimeId, holdToken: null, ticketCount: 0, seats: [], step: "tickets" }));
    setSeatStatuses({});
    if (showtimeId && supabase) {
      setSeatLoading(true);
      const { data, error } = await supabase
        .from("showtime_seats")
        .select("row_label,seat_number,status")
        .eq("showtime_id", showtimeId);
      setSeatLoading(false);
      if (error) {
        announce(`I could not load live seat availability: ${error.message}`);
      } else {
        setSeatStatuses(Object.fromEntries((data ?? []).map((seat) => [`${seat.row_label}-${seat.seat_number}`, seat.status as SeatStatus])));
      }
    }
    announce(`${showtime} selected. How many tickets do you need?`);
  }, [announce, booking.movie]);

  const chooseTickets = useCallback((count: number) => {
    setBooking((state) => ({ ...state, ticketCount: count, seats: [], step: "seats" }));
    announce(`${count} ticket${count === 1 ? "" : "s"} selected. Choose your seats.`);
  }, [announce]);

  const toggleSeat = useCallback((row: string, col: number) => {
    setBooking((state) => {
      if (state.step !== "seats") return state;
      const status = seatStatuses[`${row}-${col}`] ?? "available";
      if (status !== "available" && !state.seats.some((seat) => seat.row === row && seat.col === col)) return state;
      const exists = state.seats.some((seat) => seat.row === row && seat.col === col);
      const seats = exists
        ? state.seats.filter((seat) => !(seat.row === row && seat.col === col))
        : state.seats.length < state.ticketCount
          ? [...state.seats, { row, col, status: "selected" as const }]
          : state.seats;
      return { ...state, seats };
    });
  }, [seatStatuses]);

  const recommendSeats = useCallback(() => {
    if (booking.ticketCount < 1) return;
    const preferredRows = ["D", "E", "C", "F", "B", "G", "A", "H"];
    const row = preferredRows.find((candidate) => Array.from({ length: SEAT_COLS - booking.ticketCount + 1 }, (_, index) =>
      Array.from({ length: booking.ticketCount }, (_, offset) => seatStatuses[`${candidate}-${index + offset + 1}`] ?? "available").every((status) => status === "available"),
    ).some(Boolean));
    if (!row) {
      announce("There are not enough adjacent available seats for this ticket count.");
      return;
    }
    const start = Array.from({ length: SEAT_COLS - booking.ticketCount + 1 }, (_, index) =>
      Array.from({ length: booking.ticketCount }, (_, offset) => seatStatuses[`${row}-${index + offset + 1}`] ?? "available").every((status) => status === "available"),
    ).findIndex(Boolean) + 1;
    setBooking((state) => ({
      ...state,
      seats: Array.from({ length: state.ticketCount }, (_, index) => ({
        row,
        col: start + index,
        status: "selected" as const,
      })),
    }));
    announce(`I selected ${booking.ticketCount} centered seats in row ${row}. You can adjust them manually.`);
  }, [announce, booking.ticketCount, seatStatuses]);

  const review = useCallback(async () => {
    if (booking.seats.length !== booking.ticketCount) return;
    if (booking.showtimeId && supabase) {
      const { data, error } = await supabase.rpc("reserve_showtime_seats", {
        p_showtime_id: booking.showtimeId,
        p_seats: booking.seats.map((seat) => ({ row: seat.row, number: seat.col })),
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) {
        announce(`Those seats are no longer available: ${error.message}`);
        return;
      }
      setBooking((state) => ({ ...state, holdToken: data?.hold_token ?? null, step: "review" }));
      announce("Your seats are temporarily held for five minutes. Review your booking before confirming.");
      return;
    }
    setBooking((state) => ({ ...state, step: "review" }));
    announce("Your seats are selected. Review your booking before confirming.");
  }, [announce, booking.seats, booking.showtimeId, booking.ticketCount]);

  const confirm = useCallback(async () => {
    if (!booking.movie || !booking.date || !booking.showtime || booking.ticketCount < 1) return;
    if (!supabase) {
      announce("I could not save this booking because Supabase is not configured.");
      return;
    }

    const reference = `CV-${Date.now().toString(36).slice(-7).toUpperCase()}`;
    setSaving(true);
    let error;
    if (booking.holdToken) {
      const result = await supabase.rpc("confirm_held_booking", {
        p_hold_token: booking.holdToken,
        p_booking_ref: reference,
        p_movie_title: booking.movie.title,
        p_movie_genre: booking.movie.genre,
        p_movie_rating: booking.movie.rating,
        p_ticket_count: booking.ticketCount,
        p_total_price: booking.ticketCount * 14.99,
      });
      error = result.error;
    } else {
      ({ error } = await supabase.from("bookings").insert({
      booking_ref: reference,
      movie_title: booking.movie.title,
      movie_genre: booking.movie.genre,
      movie_rating: booking.movie.rating,
      show_date: booking.date,
      showtime: booking.showtime,
      ticket_count: booking.ticketCount,
      seats: booking.seats.map((seat) => `${seat.row}${seat.col}`),
      total_price: booking.ticketCount * 14.99,
      }));
    }
    setSaving(false);

    if (error) {
      announce(`I could not save the booking: ${error.message}`);
      return;
    }

    setBooking((state) => ({ ...state, step: "confirmed" }));
    setBookingRef(reference);
    announce(`Booking confirmed. Your reference is ${reference}. Enjoy the show!`);
  }, [announce, booking]);

  const restart = useCallback(() => {
    speechController.stopSpeaking();
    setSpeaking(false);
    setBooking(initialBooking);
    setMessages([]);
    initialized.current = false;
    setBookingRef("");
  }, []);

  const goBack = useCallback(() => {
    setBooking((state) => {
      if (state.step === "review") return { ...state, step: "seats" };
      if (state.step === "seats") return { ...state, step: "tickets", seats: [] };
      if (state.step === "tickets") return { ...state, step: "showtime", ticketCount: 0 };
      if (state.step === "showtime") return { ...state, step: "date", showtime: null };
      if (state.step === "date") return { ...state, step: "greeting", movie: null, date: null };
      return state;
    });
  }, []);

  const sendText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    addMessage("user", trimmed);
    speechController.stopSpeaking();
    setSpeaking(false);
    setThinking(true);
    window.setTimeout(() => {
      const response = ruleBasedRespond(trimmed, booking);
      setThinking(false);
      const action = response.action;
      if (action?.type === "select_movie") {
        const movie = catalogMovies.find((item) => item.id === action.movieId);
        if (movie) chooseMovie(movie);
      } else if (action?.type === "select_date") {
        chooseDate(action.date);
      } else if (action?.type === "select_showtime") {
        chooseShowtime(action.showtime);
      } else if (action?.type === "set_tickets") {
        chooseTickets(action.count);
      } else {
        announce(response.text);
      }
    }, 250);
  }, [announce, booking, catalogMovies, chooseDate, chooseMovie, chooseShowtime, chooseTickets, thinking, addMessage]);

  return (
    <div className="min-h-screen bg-[#171923] text-slate-100">
      <Header />
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-10">
        <div className="mb-5 flex items-end justify-between border-b border-white/10 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-300">Cinevea Cinemas · Online booking</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Your next great night out.</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">Reserve seats in seconds, with a personal assistant to guide every step.</p>
          </div>
          <button onClick={restart} className="hidden items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400 transition hover:border-rose-400/40 hover:text-white sm:flex">
            Start over
          </button>
        </div>
        <Progress currentIndex={Math.max(0, currentIndex)} />
        <div className={`mt-5 grid items-start gap-5 ${assistantOpen ? "lg:grid-cols-[390px_1fr]" : ""}`}>
          {assistantOpen ? <aside className="sticky top-4 flex h-[calc(100vh-205px)] min-h-[520px] flex-col overflow-hidden rounded-[1.75rem] border border-slate-300/15 bg-[#242733] shadow-2xl shadow-slate-950/40">
            <div className="border-b border-white/10 bg-gradient-to-br from-slate-500/20 via-rose-400/10 to-transparent p-6">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-rose-300" /> Your booking concierge</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setTts((value) => !value)} className={`rounded-lg p-2 ${tts ? "bg-rose-500/20 text-rose-300" : "bg-white/5 text-slate-500"}`} title="Toggle spoken responses">
                    {tts ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>
                  <button onClick={() => setAssistantOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white" title="Minimize assistant" aria-label="Minimize assistant">
                    <Minimize2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <div className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-400 to-rose-400 text-slate-950 shadow-lg shadow-rose-500/20 ${speaking ? "animate-pulse" : ""}`}><Mic2 className="h-6 w-6" /></div>
                <div><p className="font-semibold">{thinking ? "Thinking…" : speaking ? "Speaking…" : "Ready when you are"}</p><p className="text-xs text-slate-400">Type or use the microphone</p></div>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] rounded-2xl px-3.5 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-rose-500 text-white" : "rounded-bl-md bg-white/[0.07] text-slate-200"}`}>{message.text}</div></div>)}
            </div>
            <VoiceInput onSendMessage={sendText} disabled={thinking} ttsEnabled={tts} onToggleTts={() => setTts((value) => !value)} />
          </aside> : <button onClick={() => setAssistantOpen(true)} className="fixed bottom-6 right-6 z-20 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-slate-400 to-rose-400 text-slate-950 shadow-xl shadow-rose-500/30 transition hover:scale-105" title="Open AI assistant" aria-label="Open AI assistant"><Sparkles className="h-6 w-6" /></button>}
          <main className="min-h-[620px] overflow-y-auto rounded-[1.75rem] border border-slate-300/15 bg-[#242733]/80 p-5 shadow-2xl shadow-slate-950/40 sm:p-8">
            {["date", "showtime", "tickets", "seats", "review"].includes(booking.step) && <button onClick={goBack} className="mb-6 inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-400 transition hover:border-rose-400/40 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back</button>}
            {booking.step === "greeting" && !locationId && <LocationPicker locations={locations} loading={catalogLoading} error={catalogError} onSelect={chooseLocation} />}
            {booking.step === "greeting" && locationId && <MoviePicker movies={catalogMovies} loading={catalogLoading} error={catalogError} onSelect={chooseMovie} onChangeLocation={() => { setLocationId(""); setCatalogMovies([]); }} />}
            {booking.step === "date" && booking.movie && <DatePicker movie={booking.movie} dates={dates} selected={booking.date} onSelect={chooseDate} />}
            {booking.step === "showtime" && booking.movie && booking.date && <ShowtimePicker movie={booking.movie} onSelect={chooseShowtime} />}
            {booking.step === "tickets" && <TicketPicker onSelect={chooseTickets} />}
            {booking.step === "seats" && <SeatPicker booking={booking} seatStatuses={seatStatuses} loading={seatLoading} onToggle={toggleSeat} onRecommend={recommendSeats} onConfirm={review} />}
            {booking.step === "review" && <Review booking={booking} onConfirm={confirm} saving={saving} />}
            {booking.step === "confirmed" && <Confirmation reference={bookingRef} onRestart={restart} />}
          </main>
        </div>
      </div>
    </div>
  );
}

function Progress({ currentIndex }: { currentIndex: number }) {
  return <div className="flex items-center gap-1 overflow-x-auto pb-1">{["Movie", "Date", "Time", "Tickets", "Seats", "Review", "Done"].map((label, index) => <div key={label} className="flex min-w-[78px] flex-1 items-center gap-1">{<div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${index < currentIndex ? "bg-emerald-500 text-white" : index === currentIndex ? "bg-rose-500 text-white ring-4 ring-rose-500/15" : "bg-white/10 text-slate-500"}`}>{index < currentIndex ? <Check className="h-4 w-4" /> : index + 1}</div>}<span className={`hidden text-xs sm:block ${index === currentIndex ? "font-semibold text-rose-300" : "text-slate-500"}`}>{label}</span>{index < 6 && <div className={`h-px flex-1 ${index < currentIndex ? "bg-emerald-500" : "bg-white/10"}`} />}</div>)}</div>;
}

function LocationPicker({ locations, loading, error, onSelect }: { locations: Array<{ id: string; name: string; city: string; country: string }>; loading: boolean; error: string | null; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const matches = locations.filter((location) => `${location.name} ${location.city} ${location.country}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="mx-auto max-w-3xl"><SectionTitle eyebrow="Start here" title="Choose your location" icon={<CalendarDays />} /><p className="mb-5 text-sm text-slate-400">Search a city to see its live movies, theatres, and showtimes.</p><label className="relative mb-5 block"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Ontario locations…" aria-label="Search locations" className="w-full rounded-2xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-rose-400/60" /></label>{loading && <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading locations…</div>}{error && <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}{!loading && !error && !locations.length && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-100">No live locations have been imported yet.</div>}{!loading && !error && locations.length > 0 && !matches.length && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-400">No matching locations.</div>}<div className="grid gap-3 sm:grid-cols-2">{matches.map((location) => <button key={location.id} onClick={() => onSelect(location.id)} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-left transition hover:border-rose-400/50 hover:bg-rose-400/10"><p className="font-semibold">{location.name}</p><p className="mt-1 text-sm text-slate-400">{location.city}, {location.country}</p></button>)}</div></section>;
}

function MoviePicker({ movies, loading, error, onSelect, onChangeLocation }: { movies: Movie[]; loading: boolean; error: string | null; onSelect: (movie: Movie) => void; onChangeLocation: () => void }) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [sort, setSort] = useState("relevance");
  const genres = ["All", ...new Set(movies.map((movie) => movie.genre))];
  const visibleMovies = movies
    .filter((movie) => movie.title.toLowerCase().includes(query.toLowerCase()))
    .filter((movie) => genre === "All" || movie.genre === genre)
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : b.showtimes.length - a.showtimes.length);
  return <section><div className="mb-6 flex items-end justify-between gap-4"><SectionTitle eyebrow="Now showing" title="Choose a movie" icon={<Film />} /><button onClick={onChangeLocation} className="mb-1 text-sm text-rose-300 hover:text-white">Change location</button></div>{!loading && !error && movies.length > 0 && <div className="mb-6 grid gap-3 md:grid-cols-[1fr_auto_auto]"><label className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies…" aria-label="Search movies" className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-rose-400/60" /></label><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3"><SlidersHorizontal className="h-4 w-4 text-rose-300" /><select value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filter by genre" className="bg-transparent py-3 text-sm text-white outline-none"><option className="bg-slate-900">All</option>{genres.slice(1).map((item) => <option key={item} className="bg-slate-900">{item}</option>)}</select></label><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort movies" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3 text-sm text-white outline-none"><option value="relevance" className="bg-slate-900">Most showtimes</option><option value="title" className="bg-slate-900">Title A–Z</option></select></div>}{loading && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading live listings…</div>}{error && <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}{!loading && !error && !movies.length && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-400">No currently bookable movies or future showtimes are available at this location.</div>}{!loading && !error && movies.length > 0 && !visibleMovies.length && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-400">No movies match your search or filters.</div>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleMovies.map((movie) => <button key={movie.id} onClick={() => onSelect(movie)} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] text-left transition hover:-translate-y-1 hover:border-rose-400/50 hover:bg-white/[0.08]"><img src={movie.poster} alt="" className="h-52 w-full object-cover transition duration-500 group-hover:scale-105" /><div className="p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">{movie.title}</h3><span className="text-xs text-rose-300">{movie.rating}</span></div><p className="mt-1 text-xs text-slate-400">{movie.genre} · {movie.duration ? `${movie.duration} min` : "Runtime unavailable"} · {movie.showtimes.length} showtimes</p><p className="mt-3 line-clamp-2 text-sm text-slate-300">{movie.description}</p></div></button>)}</div></section>;
}

function DatePicker({ movie, dates, selected, onSelect }: { movie: Movie; dates: ReturnType<typeof getDates>; selected: string | null; onSelect: (date: string) => void }) {
  return <section><SectionTitle eyebrow="Step 02" title={`When would you like to see ${movie.title}?`} icon={<CalendarDays />} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{dates.map((date, index) => <button type="button" key={date.value} onClick={() => onSelect(date.value)} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${selected === date.value ? "border-rose-400 bg-rose-500/20 text-white shadow-lg shadow-rose-500/10" : "border-white/10 bg-white/[0.045] text-slate-300 hover:border-rose-400/40"}`}><p className="text-xs text-slate-500">{index === 0 ? "Today" : index === 1 ? "Tomorrow" : date.weekday}</p><p className="mt-2 font-bold">{date.label}</p></button>)}</div></section>;
}

function ShowtimePicker({ movie, onSelect }: { movie: Movie; onSelect: (time: string) => void }) {
  return <section><SectionTitle eyebrow="Step 03" title="Pick a showtime" icon={<Clock3 />} /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{movie.showtimes.map((time) => <button key={time} onClick={() => onSelect(time)} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-left font-semibold transition hover:border-rose-400/50 hover:bg-rose-500/10"><span>{time}</span><ChevronRight className="h-4 w-4 text-rose-300" /></button>)}</div></section>;
}

function TicketPicker({ onSelect }: { onSelect: (count: number) => void }) {
  return <section><SectionTitle eyebrow="Step 04" title="How many tickets?" icon={<Ticket />} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{Array.from({ length: 10 }, (_, index) => index + 1).map((count) => <button key={count} onClick={() => onSelect(count)} className="rounded-2xl border border-white/10 bg-white/[0.045] p-6 text-2xl font-bold transition hover:border-rose-400/50 hover:bg-rose-500/10">{count}</button>)}</div></section>;
}

function SeatPicker({ booking, seatStatuses, loading, onToggle, onRecommend, onConfirm }: { booking: BookingState; seatStatuses: Record<string, SeatStatus>; loading: boolean; onToggle: (row: string, col: number) => void; onRecommend: () => void; onConfirm: () => void }) {
  return <section><SectionTitle eyebrow="Step 05" title="Choose your seats" icon={<Ticket />} /><div className="mb-5 rounded-2xl border border-rose-400/30 bg-slate-500/10 p-4 text-center"><div className="mx-auto max-w-xl rounded-[50%] border-2 border-rose-300/80 bg-rose-300/20 py-2 text-xs font-bold uppercase tracking-[0.45em] text-rose-100">Screen</div><p className="mt-2 text-xs text-rose-200/70">Rows A–C are closest · Rows D–F are the recommended viewing area</p></div><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">{loading ? "Loading live seat availability…" : "Select available seats, or let Cinevea choose the best centered seats."}</p><button type="button" onClick={onRecommend} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/40 bg-slate-400/15 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-50"><Sparkles className="h-4 w-4" /> Recommend seats</button></div><div className="mx-auto max-w-2xl space-y-2 overflow-x-auto" aria-label="Seat map">{SEAT_ROWS.map((row) => <div key={row} className="flex min-w-[500px] items-center justify-center gap-1.5"><span className="w-5 text-xs font-semibold text-slate-500">{row}</span>{Array.from({ length: SEAT_COLS }, (_, index) => { const col = index + 1; const key = `${row}-${col}`; const status = seatStatuses[key] ?? "available"; const selected = booking.seats.some((seat) => seat.row === row && seat.col === col); const unavailable = status === "booked" || status === "held"; return <button type="button" key={col} disabled={unavailable || loading} aria-label={`Row ${row}, seat ${col}, ${selected ? "selected" : status}`} onClick={() => onToggle(row, col)} className={`h-8 w-8 rounded-lg text-xs transition hover:scale-105 disabled:cursor-not-allowed ${selected ? "bg-rose-400 text-slate-950 shadow-lg shadow-rose-400/30" : status === "booked" ? "bg-slate-600 text-slate-400" : status === "held" ? "bg-slate-400 text-slate-900" : "bg-white/10 text-slate-400 hover:bg-white/20"}`}>{selected ? <Check className="mx-auto h-3.5 w-3.5" /> : col}</button>; })}</div>)}</div><div className="mt-5 flex flex-wrap justify-center gap-4 text-xs text-slate-400"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-white/10" /> Available</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-rose-400" /> Selected</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-600" /> Booked</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-400" /> Held</span></div><button onClick={onConfirm} disabled={loading || booking.seats.length !== booking.ticketCount} className="mx-auto mt-7 block rounded-2xl bg-rose-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500">{booking.seats.length === booking.ticketCount ? "Review booking" : `Choose ${booking.ticketCount - booking.seats.length} more`}</button></section>;
}

function Review({ booking, onConfirm, saving }: { booking: BookingState; onConfirm: () => void; saving: boolean }) {
  return <section className="mx-auto max-w-xl"><SectionTitle eyebrow="Step 06" title="Review your booking" icon={<Ticket />} /><div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.045] p-6 text-sm"><SummaryRow label="Movie" value={booking.movie?.title ?? ""} /><SummaryRow label="Date" value={booking.date ?? ""} /><SummaryRow label="Showtime" value={booking.showtime ?? ""} /><SummaryRow label="Tickets" value={String(booking.ticketCount)} /><SummaryRow label="Seats" value={booking.seats.map((seat) => `${seat.row}${seat.col}`).join(", ")} /><div className="my-4 border-t border-white/10" /><SummaryRow label="Total" value={`$${(booking.ticketCount * 14.99).toFixed(2)}`} strong /></div><button onClick={onConfirm} disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-400 to-blue-500 py-3.5 font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />} {saving ? "Saving booking…" : "Confirm booking"}</button></section>;
}

function Confirmation({ reference, onRestart }: { reference: string; onRestart: () => void }) {
  return <section className="mx-auto max-w-xl text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-400 text-slate-950 shadow-xl shadow-emerald-500/20"><Check className="h-10 w-10" /></div><p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Booking confirmed</p><h2 className="mt-2 text-3xl font-bold">Enjoy the show!</h2><p className="mt-3 text-slate-400">Your confirmation number is</p><p className="mt-2 font-mono text-2xl text-rose-300">{reference}</p><button onClick={onRestart} className="mt-8 rounded-2xl border border-white/10 px-6 py-3 font-semibold transition hover:border-rose-400/50">Book another movie</button></section>;
}

function SectionTitle({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: ReactNode }) {
  return <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-400">{eyebrow}</p><h2 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-white">{<span className="text-rose-300">{icon}</span>}{title}</h2></div>;
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-4 ${strong ? "text-lg font-bold text-white" : "text-slate-300"}`}><span className="text-slate-500">{label}</span><span>{value}</span></div>;
}

export default App;
