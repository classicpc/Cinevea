import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
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
import { ChatTranscript } from "@/components/ChatTranscript";
import { useAuth } from "@/hooks/useAuth";
import {
  computeTicketCount,
  computeTicketPrice,
  getDates,
  toLocalDateKey,
  SEAT_COLS,
  SEAT_ROWS,
  TICKET_TYPES,
  type BookingState,
  type Movie,
} from "@/types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { aiRespond } from "@/lib/conversation";
import { speechController } from "@/lib/speech";

type Message = { id: number; role: "assistant" | "user"; text: string };
type SeatStatus = "available" | "held" | "booked";
type SeatPreference = "middle" | "front" | "back" | "center";
type SeatRecommendation = {
  seats: Array<{ row: string; col: number }>;
  score: number;
  explanation: string;
};
/** Intl may emit narrow no-break spaces ("7:00\u202fPM"); normalise so showtimes compare and match typed text. */
const formatShowtime = (date: Date) =>
  date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/[\u202f\u00a0]/g, " ");

const steps = ["movie", "date", "showtime", "tickets", "seats", "review", "confirmed"] as const;

function calculateSeatRecommendations(
  statuses: Record<string, SeatStatus>,
  ticketCount: number,
  preference: SeatPreference,
): SeatRecommendation[] {
  if (ticketCount < 1) return [];
  const rows = [...new Set(Object.keys(statuses).map((key) => key.split("-")[0]))].sort();
  const rowLabels = rows.length ? rows : SEAT_ROWS;
  const columns = rows.length
    ? Math.max(...Object.keys(statuses).map((key) => Number(key.split("-")[1])))
    : SEAT_COLS;
  const idealRow = preference === "front"
    ? 0
    : preference === "back"
      ? rowLabels.length - 1
      : Math.round((rowLabels.length - 1) / 2);
  const idealColumn = (columns + 1) / 2;
  const candidates: SeatRecommendation[] = [];

  for (const [rowIndex, row] of rowLabels.entries()) {
    for (let start = 1; start <= columns - ticketCount + 1; start++) {
      const seats = Array.from({ length: ticketCount }, (_, offset) => ({ row, col: start + offset }));
      if (!seats.every((seat) => (statuses[`${seat.row}-${seat.col}`] ?? "available") === "available")) continue;
      const groupCenter = (start + start + ticketCount - 1) / 2;
      const centerScore = 1 - Math.min(Math.abs(groupCenter - idealColumn) / Math.max(idealColumn - 1, 1), 1);
      const distanceScore = 1 - Math.min(Math.abs(rowIndex - idealRow) / Math.max(rowLabels.length - 1, 1), 1);
      const preferenceScore = preference === "center"
        ? centerScore
        : 1 - Math.min(Math.abs(rowIndex - idealRow) / Math.max(rowLabels.length - 1, 1), 1);
      const score = Math.round((centerScore * 30 + distanceScore * 25 + 20 + preferenceScore * 15 + 10) * 100 / 100);
      candidates.push({
        seats,
        score,
        explanation: `Row ${row} keeps your group together with a balanced viewing position near the ${preference === "front" ? "front" : preference === "back" ? "back" : "middle"} of the auditorium.`,
      });
    }
  }

  if (!candidates.length) {
    const available = Object.entries(statuses)
      .filter(([, status]) => status === "available")
      .map(([key]) => {
        const [row, column] = key.split("-");
        const rowIndex = rowLabels.indexOf(row);
        const col = Number(column);
        const centerDistance = Math.abs(col - idealColumn);
        const rowDistance = Math.abs(rowIndex - idealRow);
        return { row, col, rank: centerDistance + rowDistance };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, ticketCount);
    if (available.length === ticketCount) {
      candidates.push({
        seats: available.map(({ row, col }) => ({ row, col })),
        score: 55,
        explanation: "Consecutive seats were unavailable, so these are the closest available seats to your preferred viewing area.",
      });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((recommendation, index, all) =>
      index === all.findIndex((candidate) => candidate.seats.map((seat) => `${seat.row}-${seat.col}`).join(",") === recommendation.seats.map((seat) => `${seat.row}-${seat.col}`).join(",")),
    )
    .slice(0, 5);
}

const initialBooking: BookingState = {
  movie: null,
  date: null,
  showtime: null,
  ticketCount: 0,
  ticketBreakdown: {},
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
  const [seatPreference, setSeatPreference] = useState<SeatPreference>("middle");
  const [recommendations, setRecommendations] = useState<SeatRecommendation[]>([]);
  const [recommendationIndex, setRecommendationIndex] = useState(0);
  const messageId = useRef(0);

  const dates = useMemo(() => getDates(), []);
  const currentIndex = steps.indexOf(booking.step as (typeof steps)[number]);

  const addMessage = useCallback((role: Message["role"], text: string) => {
    messageId.current += 1;
    setMessages((items) => [...items, { id: messageId.current, role, text }]);
  }, []);

  const speak = useCallback((text: string, force = false) => {
    if (!tts && !force) return;
    setSpeaking(true);
    speechController.speak(text, () => setSpeaking(false));
  }, [tts]);

  useEffect(() => {
    if (!assistantOpen || !tts) {
      speechController.stopSpeaking();
      setSpeaking(false);
    }
  }, [assistantOpen, tts]);

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
      .select("id,title,poster_url,genre,language,runtime_minutes,age_rating,synopsis,rating,provider_id")
      .in("id", movieIds)
      .eq("is_coming_soon", false);
    if (movieError) setCatalogError(movieError.message);
    else {
      const movieShowtimes = (showtimes ?? []);
      const mapped = (movies ?? []).map((movie) => {
        const forMovie = movieShowtimes.filter((showtime) => showtime.movie_id === movie.id);
        const showtimesByDate: Record<string, { time: string; id: string }[]> = {};
        for (const showtime of forMovie) {
          const startDate = new Date(showtime.starts_at);
          const dateKey = toLocalDateKey(startDate);
          const time = formatShowtime(startDate);
          (showtimesByDate[dateKey] ??= []).push({ time, id: showtime.id });
        }
        return {
          id: movie.id,
          providerId: movie.provider_id || undefined,
          title: movie.title,
          genre: (movie.genre || "Action") as Movie["genre"],
          rating: movie.age_rating || "Not rated",
          duration: movie.runtime_minutes || 0,
          poster: movie.poster_url || "",
          description: movie.synopsis || "Details unavailable.",
          showtimes: forMovie.map((showtime) => formatShowtime(new Date(showtime.starts_at))),
          showtimesByDate,
        };
      });
      setCatalogMovies(mapped);
    }
    setCatalogLoading(false);
  }, []);

  const announce = useCallback((text: string) => {
    addMessage("assistant", text);
    speak(text);
  }, [addMessage, speak]);

  // The `quiet` flag is used when the assistant already replied, so we don't post a second message.
  const chooseMovie = useCallback((movie: Movie, quiet = false) => {
    setBooking((state) => ({ ...state, movie, date: null, showtime: null, ticketCount: 0, ticketBreakdown: {}, seats: [], step: "date" }));
    if (!quiet) announce(`${movie.title} selected. Choose a date to see available showtimes.`);
  }, [announce]);

  const chooseDate = useCallback((date: string, quiet = false) => {
    setBooking((state) => ({ ...state, date, showtime: null, ticketCount: 0, ticketBreakdown: {}, seats: [], step: "showtime" }));
    const formatted = dates.find((item) => item.value === date)?.label ?? date;
    if (!quiet) announce(`Showtimes for ${formatted} are now available. Choose a time.`);
  }, [announce, dates]);

  const chooseShowtime = useCallback(async (showtime: string, quiet = false) => {
    const showtimeId = booking.date
      ? booking.movie?.showtimesByDate?.[booking.date]?.find((entry) => entry.time === showtime)?.id ?? null
      : null;
    setBooking((state) => ({ ...state, showtime, showtimeId, holdToken: null, ticketCount: 0, ticketBreakdown: {}, seats: [], step: "tickets" }));
    setSeatStatuses({});
    setRecommendations([]);
    setRecommendationIndex(0);
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
    if (!quiet) announce(`${showtime} selected. How many tickets do you need?`);
  }, [announce, booking.date, booking.movie]);

  const chooseTickets = useCallback((breakdown: Record<string, number>, quiet = false) => {
    const count = computeTicketCount(breakdown);
    setBooking((state) => ({ ...state, ticketCount: count, ticketBreakdown: breakdown, seats: [], step: "seats" }));
    setRecommendations([]);
    setRecommendationIndex(0);
    if (!quiet) announce(`${count} ticket${count === 1 ? "" : "s"} selected. Choose your seats.`);
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

  const findBestSeats = useCallback(() => {
    const next = calculateSeatRecommendations(seatStatuses, booking.ticketCount, seatPreference);
    setRecommendations(next);
    setRecommendationIndex(0);
    if (!next.length) {
      announce("There are not enough available seats for this ticket count.");
    }
  }, [announce, booking.ticketCount, seatPreference, seatStatuses]);

  const selectRecommendation = useCallback((recommendation: SeatRecommendation) => {
    setBooking((state) => ({
      ...state,
      seats: recommendation.seats.map((seat) => ({ ...seat, status: "selected" as const })),
    }));
    announce(`Selected Row ${recommendation.seats[0]?.row}, seats ${recommendation.seats.map((seat) => seat.col).join(", ")}.`);
  }, [announce]);

  const showAlternative = useCallback(() => {
    setRecommendationIndex((index) => recommendations.length ? (index + 1) % recommendations.length : 0);
  }, [recommendations.length]);

  // `seatsOverride` lets the assistant review seats it just selected, before React state has updated.
  const review = useCallback(async (seatsOverride?: BookingState["seats"]) => {
    const seats = seatsOverride ?? booking.seats;
    if (seats.length !== booking.ticketCount) return;
    if (booking.showtimeId && supabase) {
      const { data, error } = await supabase.rpc("reserve_showtime_seats", {
        p_showtime_id: booking.showtimeId,
        p_seats: seats.map((seat) => ({ row: seat.row, number: seat.col })),
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) {
        announce(`Those seats are no longer available: ${error.message}`);
        return;
      }
      setBooking((state) => ({ ...state, seats, holdToken: data?.hold_token ?? null, step: "review" }));
      announce("Your seats are temporarily held for five minutes. Review your booking before confirming.");
      return;
    }
    setBooking((state) => ({ ...state, seats, step: "review" }));
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
        p_ticket_breakdown: booking.ticketBreakdown,
        p_total_price: computeTicketPrice(booking.ticketBreakdown),
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
      ticket_breakdown: booking.ticketBreakdown,
      seats: booking.seats.map((seat) => `${seat.row}${seat.col}`),
      total_price: computeTicketPrice(booking.ticketBreakdown),
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
    setBookingRef("");
  }, []);

  const goBack = useCallback(() => {
    setBooking((state) => {
      if (state.step === "review") return { ...state, step: "seats" };
      if (state.step === "seats") return { ...state, step: "tickets", seats: [] };
      if (state.step === "tickets") return { ...state, step: "showtime", ticketCount: 0, ticketBreakdown: {} };
      if (state.step === "showtime") return { ...state, step: "date", showtime: null };
      if (state.step === "date") return { ...state, step: "greeting", movie: null, date: null };
      return state;
    });
  }, []);

  /** Carries out an assistant action, validating it against the live UI state so a bad model reply can't corrupt the booking. */
  const runAssistantAction = useCallback((action: NonNullable<Awaited<ReturnType<typeof aiRespond>>["action"]>) => {
    switch (action.type) {
      case "select_movie": {
        const movie = catalogMovies.find((item) => item.id === action.movieId);
        if (movie && ["greeting", "date"].includes(booking.step)) chooseMovie(movie, true);
        break;
      }
      case "select_date":
        if (booking.step === "date" && dates.some((item) => item.value === action.date)) chooseDate(action.date, true);
        break;
      case "select_showtime": {
        const available = booking.date ? booking.movie?.showtimesByDate?.[booking.date] ?? [] : [];
        if (booking.step === "showtime" && available.some((entry) => entry.time === action.showtime)) {
          void chooseShowtime(action.showtime, true);
        }
        break;
      }
      case "set_tickets":
        if (booking.step === "tickets" && Number.isInteger(action.count) && action.count >= 1 && action.count <= 10) {
          chooseTickets({ adult: action.count }, true);
        }
        break;
      case "select_seats": {
        if (booking.step !== "seats") break;
        let seats: BookingState["seats"] = [];
        if (action.seats.length === 0) {
          const best = calculateSeatRecommendations(seatStatuses, booking.ticketCount, seatPreference)[0];
          seats = (best?.seats ?? []).map((seat) => ({ ...seat, status: "selected" as const }));
        } else {
          seats = action.seats
            .map((label) => label.match(/^([A-Za-z])(\d{1,2})$/))
            .filter((match): match is RegExpMatchArray => Boolean(match))
            .map((match) => ({ row: match[1].toUpperCase(), col: Number(match[2]), status: "selected" as const }));
          const allFree = seats.every((seat) => (seatStatuses[`${seat.row}-${seat.col}`] ?? "available") === "available");
          if (!allFree) {
            announce("Sorry, one of those seats is already taken. Please choose different seats.");
            seats = [];
          }
        }
        if (seats.length === booking.ticketCount) void review(seats);
        else if (action.seats.length === 0) announce("I couldn't find enough available seats together. Please choose seats on the map.");
        break;
      }
      case "confirm_booking":
        if (booking.step === "review") void confirm();
        break;
      case "go_back":
        goBack();
        break;
      case "restart":
        restart();
        break;
    }
  }, [announce, booking, catalogMovies, chooseDate, chooseMovie, chooseShowtime, chooseTickets, confirm, dates, goBack, restart, review, seatPreference, seatStatuses]);

  const sendText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    addMessage("user", trimmed);
    speechController.stopSpeaking();
    setSpeaking(false);

    if (!locationId) {
      announce("Please choose a location first so I can show you the movies available at that theatre.");
      return;
    }
    if (catalogLoading) {
      announce("I'm loading the live movie listings for this location. Please try again in a moment.");
      return;
    }

    setThinking(true);

    // Show the assistant only the showtimes for the chosen date, not every date.
    const todaysTimes = booking.movie && booking.date
      ? (booking.movie.showtimesByDate?.[booking.date] ?? []).map((entry) => entry.time)
      : null;
    const assistantState = booking.movie && todaysTimes
      ? { ...booking, movie: { ...booking.movie, showtimes: todaysTimes } }
      : booking;
    const history = messages.map((message) => ({
      id: String(message.id),
      role: message.role,
      text: message.text,
      timestamp: Date.now(),
    }));

    void aiRespond(trimmed, assistantState, history, catalogMovies)
      .then((response) => {
        const { action } = response;
        // restart() clears the transcript, so run it first and post the reply afterwards.
        if (action) runAssistantAction(action);
        const reply = response.text || (action ? "Okay." : "Sorry, I didn't get that.");
        if (action?.type === "restart") window.setTimeout(() => announce(reply), 0);
        else announce(reply);
      })
      .catch(() => announce("Sorry, something went wrong. Please try again."))
      .finally(() => setThinking(false));
  }, [announce, addMessage, booking, catalogLoading, catalogMovies, locationId, messages, runAssistantAction, thinking]);

  return (
    <div className="min-h-screen bg-[#171923] text-slate-100">
      <Header />
      <div className="mx-auto w-full max-w-[1440px] px-[4vw] py-[2vh]">
        <div className="sticky top-[3.6rem] z-20 mb-[2vh] border-b border-white/10 bg-[#171923]/95 pb-[1vh] pt-[1vh] backdrop-blur-xl">
          <div className="flex items-end justify-between gap-4 pb-[1vh]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-300">Cinevea Cinemas · Online booking</p>
            <h1 className="mt-2 text-[clamp(1.7rem,3vw,2.5rem)] font-semibold tracking-tight text-white">Your next great night out.</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">Reserve seats in seconds, with a personal assistant to guide every step.</p>
          </div>
          <button onClick={restart} className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400 transition hover:border-rose-400/40 hover:text-white">
            Start over
          </button>
          </div>
          <Progress currentIndex={Math.max(0, currentIndex)} />
        </div>
        <div className={`mt-[2vh] grid items-start gap-[2vw] ${assistantOpen ? "lg:grid-cols-[minmax(260px,30%)_minmax(0,1fr)]" : ""}`}>
          {assistantOpen ? <aside className="sticky top-[5rem] flex h-[calc(100dvh-18rem)] min-h-[22rem] max-h-[calc(100dvh-18rem)] flex-col overflow-hidden rounded-[clamp(1rem,2vw,1.75rem)] border border-slate-300/15 bg-[#242733] shadow-2xl shadow-slate-950/40">
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
            <ChatTranscript
              messages={messages.map((message) => ({
                id: String(message.id),
                role: message.role,
                text: message.text,
                timestamp: Date.now(),
              }))}
              onSpeak={(text) => speak(text, true)}
            />
            <VoiceInput
              onSendMessage={sendText}
              disabled={thinking}
              ttsEnabled={tts}
              onToggleTts={() => setTts((value) => !value)}
            />
          </aside> : <button onClick={() => setAssistantOpen(true)} className="fixed bottom-6 right-6 z-20 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-slate-400 to-rose-400 text-slate-950 shadow-xl shadow-rose-500/30 transition hover:scale-105" title="Open AI assistant" aria-label="Open AI assistant"><Sparkles className="h-6 w-6" /></button>}
          <main className="min-h-[65dvh] overflow-y-auto rounded-[clamp(1rem,2vw,1.75rem)] border border-slate-300/15 bg-[#242733]/80 p-[clamp(1rem,2vw,2rem)] shadow-2xl shadow-slate-950/40">
            {["date", "showtime", "tickets", "seats", "review"].includes(booking.step) && <button onClick={goBack} className="mb-6 inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-400 transition hover:border-rose-400/40 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back</button>}
            {booking.step === "greeting" && !locationId && <LocationPicker locations={locations} loading={catalogLoading} error={catalogError} onSelect={chooseLocation} />}
            {booking.step === "greeting" && locationId && <MoviePicker movies={catalogMovies} loading={catalogLoading} error={catalogError} onSelect={chooseMovie} onChangeLocation={() => { setLocationId(""); setCatalogMovies([]); }} />}
            {booking.step === "date" && booking.movie && <DatePicker movie={booking.movie} dates={dates} selected={booking.date} onSelect={chooseDate} />}
            {booking.step === "showtime" && booking.movie && booking.date && <ShowtimePicker movie={booking.movie} date={booking.date} onSelect={chooseShowtime} />}
            {booking.step === "tickets" && <TicketPicker onSelect={chooseTickets} />}
            {booking.step === "seats" && <SeatPicker booking={booking} seatStatuses={seatStatuses} loading={seatLoading} preference={seatPreference} recommendations={recommendations} recommendationIndex={recommendationIndex} onPreferenceChange={setSeatPreference} onFindBest={findBestSeats} onSelectRecommendation={selectRecommendation} onAlternative={showAlternative} onToggle={toggleSeat} onConfirm={() => void review()} />}
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
  const carouselRef = useRef<HTMLDivElement>(null);
  const genres = ["All", ...new Set(movies.map((movie) => movie.genre))];
  const visibleMovies = movies
    .filter((movie) => movie.title.toLowerCase().includes(query.toLowerCase()))
    .filter((movie) => genre === "All" || movie.genre === genre)
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : b.showtimes.length - a.showtimes.length);
  const scrollCarousel = (amount: number) => carouselRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  return <section><div className="mb-6 flex items-end justify-between gap-4"><SectionTitle eyebrow="Now showing" title="Choose a movie" icon={<Film />} /><button onClick={onChangeLocation} className="mb-1 text-sm text-rose-300 hover:text-white">Change location</button></div>{!loading && !error && movies.length > 0 && <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]"><label className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies…" aria-label="Search movies" className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-rose-400/60" /></label><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3"><SlidersHorizontal className="h-4 w-4 text-rose-300" /><select value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filter by genre" className="bg-transparent py-3 text-sm text-white outline-none"><option className="bg-slate-900">All</option>{genres.slice(1).map((item) => <option key={item} className="bg-slate-900">{item}</option>)}</select></label><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort movies" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3 text-sm text-white outline-none"><option value="relevance" className="bg-slate-900">Most showtimes</option><option value="title" className="bg-slate-900">Title A–Z</option></select></div>}{loading && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading live listings…</div>}{error && <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}{!loading && !error && !movies.length && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-400">No currently bookable movies or future showtimes are available at this location.</div>}{!loading && !error && movies.length > 0 && !visibleMovies.length && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-400">No movies match your search or filters.</div>}<div className="relative">{visibleMovies.length > 0 && <><button type="button" onClick={() => scrollCarousel(-340)} aria-label="Previous movies" className="absolute left-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-slate-900/90 text-rose-300 shadow-lg hover:bg-slate-800"><ChevronLeft className="h-5 w-5" /></button><button type="button" onClick={() => scrollCarousel(340)} aria-label="Next movies" className="absolute right-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-slate-900/90 text-rose-300 shadow-lg hover:bg-slate-800" ><ChevronRight className="h-5 w-5" /></button></>}<div ref={carouselRef} className="flex snap-x snap-mandatory gap-[1.2vw] overflow-x-auto px-1 pb-4 scrollbar-thin">{visibleMovies.map((movie) => {
    const movieNumber = movies.findIndex((item) => item.id === movie.id) + 1;
    return <button key={movie.id} onClick={() => onSelect(movie)} className="group relative min-w-[78%] snap-start overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] text-left transition hover:-translate-y-1 hover:border-rose-400/50 hover:bg-white/[0.08] sm:min-w-[44%] lg:min-w-[31%]"><span className="absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-slate-950/90 text-sm font-bold text-white shadow-lg" aria-label={`Movie ${movieNumber}`}>{movieNumber}</span><MoviePoster src={movie.poster} title={movie.title} /><div className="p-[clamp(0.8rem,1.3vw,1rem)]"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{movie.title}</h3><span className="text-xs text-rose-300">{movie.rating}</span></div><p className="mt-1 text-xs text-slate-400">{movie.genre} · {movie.duration ? `${movie.duration} min` : "Runtime unavailable"} · {movie.showtimes.length} showtimes</p><p className="mt-3 line-clamp-2 text-sm text-slate-300">{movie.description}</p></div></button>;
  })}</div></div></section>;
}

function MoviePoster({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(!src);
  if (failed) {
    return <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-700 via-slate-800 to-rose-950 px-4 text-center"><Film className="h-9 w-9 text-rose-300/80" /><span className="text-sm font-semibold text-slate-200">{title}</span><span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Poster unavailable</span></div>;
  }
  return <img src={src} alt={`${title} poster`} onError={() => setFailed(true)} className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-105" />;
}

function DatePicker({ movie, dates, selected, onSelect }: { movie: Movie; dates: ReturnType<typeof getDates>; selected: string | null; onSelect: (date: string) => void }) {
  return <section><SectionTitle eyebrow="Step 02" title={`When would you like to see ${movie.title}?`} icon={<CalendarDays />} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{dates.map((date, index) => <button type="button" key={date.value} onClick={() => onSelect(date.value)} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${selected === date.value ? "border-rose-400 bg-rose-500/20 text-white shadow-lg shadow-rose-500/10" : "border-white/10 bg-white/[0.045] text-slate-300 hover:border-rose-400/40"}`}><p className="text-xs text-slate-500">{index === 0 ? "Today" : index === 1 ? "Tomorrow" : date.weekday}</p><p className="mt-2 font-bold">{date.label}</p></button>)}</div></section>;
}

function ShowtimePicker({ movie, date, onSelect }: { movie: Movie; date: string; onSelect: (time: string) => void }) {
  const times = movie.showtimesByDate?.[date] ?? [];
  return <section><SectionTitle eyebrow="Step 03" title="Pick a showtime" icon={<Clock3 />} /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{times.length ? times.map(({ time }) => <button key={time} onClick={() => onSelect(time)} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-left font-semibold transition hover:border-rose-400/50 hover:bg-rose-500/10"><span>{time}</span><ChevronRight className="h-4 w-4 text-rose-300" /></button>) : <p className="text-sm text-slate-400">No showtimes available on this date.</p>}</div></section>;
}

function TicketPicker({ onSelect }: { onSelect: (breakdown: Record<string, number>) => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const total = computeTicketCount(counts);
  const totalPrice = computeTicketPrice(counts);

  const adjust = (code: string, delta: number) => {
    setCounts((prev) => {
      const next = Math.max(0, Math.min(10, (prev[code] ?? 0) + delta));
      return { ...prev, [code]: next };
    });
  };

  return (
    <section>
      <SectionTitle eyebrow="Step 04" title="How many tickets?" icon={<Ticket />} />
      <div className="space-y-3">
        {TICKET_TYPES.map((type) => (
          <div key={type.code} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <div>
              <p className="font-semibold text-white">{type.label}</p>
              <p className="text-xs text-slate-400">${type.price.toFixed(2)} each</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => adjust(type.code, -1)} disabled={!counts[type.code]} className="h-9 w-9 rounded-xl border border-white/10 text-lg font-bold transition hover:border-rose-400/50 disabled:cursor-not-allowed disabled:opacity-30">−</button>
              <span className="w-6 text-center text-lg font-bold">{counts[type.code] ?? 0}</span>
              <button type="button" onClick={() => adjust(type.code, 1)} disabled={total >= 10} className="h-9 w-9 rounded-xl border border-white/10 text-lg font-bold transition hover:border-rose-400/50 disabled:cursor-not-allowed disabled:opacity-30">+</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <span className="text-slate-400">{total} ticket{total === 1 ? "" : "s"} selected</span>
        <span className="font-bold text-white">${totalPrice.toFixed(2)}</span>
      </div>
      <button onClick={() => onSelect(counts)} disabled={total < 1} className="mx-auto mt-5 block rounded-2xl bg-rose-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500">Continue</button>
    </section>
  );
}

function SeatPicker({
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
}: {
  booking: BookingState;
  seatStatuses: Record<string, SeatStatus>;
  loading: boolean;
  preference: SeatPreference;
  recommendations: SeatRecommendation[];
  recommendationIndex: number;
  onPreferenceChange: (preference: SeatPreference) => void;
  onFindBest: () => void;
  onSelectRecommendation: (recommendation: SeatRecommendation) => void;
  onAlternative: () => void;
  onToggle: (row: string, col: number) => void;
  onConfirm: () => void;
}) {
  const recommendation = recommendations[recommendationIndex];
  const rows = [...new Set(Object.keys(seatStatuses).map((key) => key.split("-")[0]))].sort();
  const seatRows = rows.length ? rows : SEAT_ROWS;
  const columns = rows.length ? Math.max(...Object.keys(seatStatuses).map((key) => Number(key.split("-")[1]))) : SEAT_COLS;

  return (
    <section>
      <SectionTitle eyebrow="Step 05" title="Choose your seats" icon={<Ticket />} />
      <div className="mb-5 rounded-2xl border border-rose-400/30 bg-slate-500/10 p-4 text-center">
        <div className="mx-auto max-w-xl rounded-[50%] border-2 border-rose-300/80 bg-rose-300/20 py-2 text-xs font-bold uppercase tracking-[0.45em] text-rose-100">Screen</div>
        <p className="mt-2 text-xs text-rose-200/70">Rows closest to the screen are first · Middle rows usually provide the best view</p>
      </div>

      <div className="mb-5 rounded-2xl border border-rose-300/25 bg-rose-400/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Recommended Seats</p>
            <p className="mt-1 text-xs text-slate-400">Find the highest-scoring available seats for {booking.ticketCount} ticket{booking.ticketCount === 1 ? "" : "s"}.</p>
          </div>
          <button type="button" onClick={onFindBest} disabled={loading} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-rose-300 disabled:opacity-50">Find Best Seats</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-400" htmlFor="seat-preference">Preference</label>
          <select id="seat-preference" value={preference} onChange={(event) => onPreferenceChange(event.target.value as SeatPreference)} className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs text-white outline-none focus:border-rose-400/60">
            <option value="middle">Middle rows</option>
            <option value="center">Horizontal center</option>
            <option value="front">Front rows</option>
            <option value="back">Back rows</option>
          </select>
        </div>
        {recommendation && (
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-300">Recommended for you</p>
                <p className="mt-1 font-semibold text-white">Row {recommendation.seats[0].row} · Seats {recommendation.seats.map((seat) => seat.col).join(", ")}</p>
                <p className="mt-2 text-xs leading-5 text-slate-300">{recommendation.explanation}</p>
              </div>
              <span className="rounded-full bg-rose-400/15 px-3 py-1 text-xs font-semibold text-rose-200">Score {recommendation.score}/100</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => onSelectRecommendation(recommendation)} className="rounded-lg bg-rose-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-rose-300">Select These Seats</button>
              {recommendations.length > 1 && <button type="button" onClick={onAlternative} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 hover:border-rose-300/50 hover:text-white">View Alternative</button>}
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-2xl space-y-2 overflow-x-auto" aria-label="Seat map">
        {seatRows.map((row) => <div key={row} className="flex min-w-[500px] items-center justify-center gap-1.5">
          <span className="w-5 text-xs font-semibold text-slate-500">{row}</span>
          {Array.from({ length: columns }, (_, index) => {
            const col = index + 1;
            const key = `${row}-${col}`;
            const status = seatStatuses[key] ?? "available";
            const selected = booking.seats.some((seat) => seat.row === row && seat.col === col);
            const unavailable = status === "booked" || status === "held";
            return <button type="button" key={col} disabled={unavailable || loading} aria-label={`Row ${row}, seat ${col}, ${selected ? "selected" : status}`} onClick={() => onToggle(row, col)} className={`h-8 w-8 rounded-lg text-xs transition hover:scale-105 disabled:cursor-not-allowed ${selected ? "bg-rose-400 text-slate-950 shadow-lg shadow-rose-400/30" : status === "booked" ? "bg-slate-600 text-slate-400" : status === "held" ? "bg-slate-400 text-slate-900" : "bg-white/10 text-slate-400 hover:bg-white/20"}`}>{selected ? <Check className="mx-auto h-3.5 w-3.5" /> : col}</button>;
          })}
        </div>)}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-white/10" /> Available</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-rose-400" /> Selected</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-600" /> Booked</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-400" /> Held</span>
      </div>
      <button onClick={onConfirm} disabled={loading || booking.seats.length !== booking.ticketCount} className="mx-auto mt-7 block rounded-2xl bg-rose-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500">{booking.seats.length === booking.ticketCount ? "Review booking" : `Choose ${booking.ticketCount - booking.seats.length} more`}</button>
    </section>
  );
}

function Review({ booking, onConfirm, saving }: { booking: BookingState; onConfirm: () => void; saving: boolean }) {
  const breakdownLabel = TICKET_TYPES
    .filter((type) => (booking.ticketBreakdown[type.code] ?? 0) > 0)
    .map((type) => `${booking.ticketBreakdown[type.code]} ${type.label}`)
    .join(", ") || String(booking.ticketCount);
  return <section className="mx-auto max-w-xl"><SectionTitle eyebrow="Step 06" title="Review your booking" icon={<Ticket />} /><div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.045] p-6 text-sm"><SummaryRow label="Movie" value={booking.movie?.title ?? ""} /><SummaryRow label="Date" value={booking.date ?? ""} /><SummaryRow label="Showtime" value={booking.showtime ?? ""} /><SummaryRow label="Tickets" value={breakdownLabel} /><SummaryRow label="Seats" value={booking.seats.map((seat) => `${seat.row}${seat.col}`).join(", ")} /><div className="my-4 border-t border-white/10" /><SummaryRow label="Total" value={`$${computeTicketPrice(booking.ticketBreakdown).toFixed(2)}`} strong /></div><button onClick={onConfirm} disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-400 to-blue-500 py-3.5 font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />} {saving ? "Saving booking…" : "Confirm booking"}</button></section>;
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
