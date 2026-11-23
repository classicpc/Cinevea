import { describeBooking, parsePaymentChoice } from "@/lib/payment";
import { HandsFreeVoice } from "@/components/HandsFreeVoice";
import type { VoicePhase } from "@/lib/voiceConversation";
import { GuideAvatar } from "@/components/GuideAvatar";
import { VoiceSettings } from "@/components/VoiceSettings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Film, X, Volume2, VolumeX, RotateCcw, Settings } from "lucide-react";
import {
  Progress,
  LocationPicker,
  MoviePicker,
  DatePicker,
  ShowtimePicker,
  TicketPicker,
  SeatPicker,
  Review,
  Confirmation,
  BookingDetails,
  type SeatStatus,
  type SeatPreference,
  type SeatRecommendation,
  type EditStep,
} from "@/components/booking/BookingViews";
import { stepIndex, journey } from "@/lib/bookingPresentation";
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
  type BookingState,
  type Movie,
} from "@/types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { aiRespond, isExplicitTicketChange } from "@/lib/conversation";
import { speechController } from "@/lib/speech";

type Message = { id: number; role: "assistant" | "user"; text: string };
type LocationOption = {
  id: string;
  name: string;
  city: string;
  country: string;
};

function findLocation(
  text: string,
  locations: LocationOption[],
): LocationOption | null {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  return (
    locations.find((location) => {
      const terms = [location.city, location.name]
        .filter(Boolean)
        .map((term) =>
          term
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter((term) => term.length >= 3);
      return terms.some(
        (term) =>
          normalized === term ||
          normalized.includes(` ${term} `) ||
          normalized.startsWith(`${term} `) ||
          normalized.endsWith(` ${term}`),
      );
    }) ?? null
  );
}

function formatLocationName(loc?: LocationOption | null): string {
  if (!loc) return "your theater";
  const name = loc.name?.trim() || "";
  const city = loc.city?.trim() || "";
  if (!city) return name || "your theater";
  if (!name) return city;
  if (
    name.toLowerCase() === city.toLowerCase() ||
    name.toLowerCase().includes(city.toLowerCase())
  ) {
    return name;
  }
  return `${name}, ${city}`;
}

/** Intl may emit narrow no-break spaces ("7:00\u202fPM"); normalise so showtimes compare and match typed text. */
const formatShowtime = (date: Date) =>
  date
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/[\u202f\u00a0]/g, " ");

function calculateSeatRecommendations(
  statuses: Record<string, SeatStatus>,
  ticketCount: number,
  preference: SeatPreference,
): SeatRecommendation[] {
  if (ticketCount < 1) return [];
  const rows = [
    ...new Set(Object.keys(statuses).map((key) => key.split("-")[0])),
  ].sort();
  const rowLabels = rows.length ? rows : SEAT_ROWS;
  const columns = rows.length
    ? Math.max(...Object.keys(statuses).map((key) => Number(key.split("-")[1])))
    : SEAT_COLS;
  const idealRow =
    preference === "front"
      ? 0
      : preference === "back"
        ? rowLabels.length - 1
        : Math.round((rowLabels.length - 1) / 2);
  const idealColumn = (columns + 1) / 2;
  const candidates: SeatRecommendation[] = [];

  for (const [rowIndex, row] of rowLabels.entries()) {
    for (let start = 1; start <= columns - ticketCount + 1; start++) {
      const seats = Array.from({ length: ticketCount }, (_, offset) => ({
        row,
        col: start + offset,
      }));
      if (
        !seats.every(
          (seat) =>
            (statuses[`${seat.row}-${seat.col}`] ?? "unavailable") ===
            "available",
        )
      )
        continue;
      const groupCenter = (start + start + ticketCount - 1) / 2;
      const centerScore =
        1 -
        Math.min(
          Math.abs(groupCenter - idealColumn) / Math.max(idealColumn - 1, 1),
          1,
        );
      const distanceScore =
        1 -
        Math.min(
          Math.abs(rowIndex - idealRow) / Math.max(rowLabels.length - 1, 1),
          1,
        );
      const preferenceScore =
        preference === "center"
          ? centerScore
          : 1 -
            Math.min(
              Math.abs(rowIndex - idealRow) / Math.max(rowLabels.length - 1, 1),
              1,
            );
      const score = Math.round(
        ((centerScore * 30 +
          distanceScore * 25 +
          20 +
          preferenceScore * 15 +
          10) *
          100) /
          100,
      );
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
        explanation:
          "Consecutive seats were unavailable, so these are the closest available seats to your preferred viewing area.",
      });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .filter(
      (recommendation, index, all) =>
        index ===
        all.findIndex(
          (candidate) =>
            candidate.seats
              .map((seat) => `${seat.row}-${seat.col}`)
              .join(",") ===
            recommendation.seats
              .map((seat) => `${seat.row}-${seat.col}`)
              .join(","),
        ),
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
    return (
      <div
        className="min-h-screen bg-slate-950 grid place-items-center"
        role="status"
      >
        <p>Loading your session…</p>
      </div>
    );
  }
  return session ? <BookingApp /> : <AuthScreen />;
}

function SetupScreen() {
  return (
    <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
      <section className="max-w-lg rounded-3xl border border-white/10 bg-white/[0.05] p-8 shadow-2xl">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950">
          <Film />
        </div>
        <h1 className="text-2xl font-bold">Cinevea setup required</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Add your Supabase connection settings to <code>.env.local</code>, then
          reload the app.
        </p>
        <pre className="mt-5 rounded-2xl bg-slate-950 p-4 text-xs text-amber-400">{`VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...`}</pre>
      </section>
    </main>
  );
}

function BookingApp() {
  const [booking, setBooking] = useState<BookingState>(initialBooking);
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedLocationId =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("cinevea-location")
        : null;
    return [
      {
        id: 1,
        role: "assistant",
        text: savedLocationId
          ? "Welcome back to Cinevea! Please choose a movie to see available showtimes."
          : "Welcome to Cinevea! I'm your booking assistant. I can help you book movie tickets by voice or text. First, please choose your theater location.",
      },
    ];
  });
  const [thinking, setThinking] = useState(false);
  const [tts, setTts] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [bookingRef, setBookingRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [catalogMovies, setCatalogMovies] = useState<Movie[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantSettingsOpen, setAssistantSettingsOpen] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [reserving, setReserving] = useState(false);
  const [holdNotice, setHoldNotice] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [restartPrompt, setRestartPrompt] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const assistantRef = useRef<HTMLElement>(null);
  const assistantToggleRef = useRef<HTMLButtonElement>(null);
  const operationRef = useRef(false);
  const heldSelectionRef = useRef("");
  const assistantRequestRef = useRef(false);
  const [seatStatuses, setSeatStatuses] = useState<Record<string, SeatStatus>>(
    {},
  );
  const [seatLoading, setSeatLoading] = useState(false);
  const [seatPreference, setSeatPreference] =
    useState<SeatPreference>("middle");
  const [recommendations, setRecommendations] = useState<SeatRecommendation[]>(
    [],
  );
  const [recommendationIndex, setRecommendationIndex] = useState(0);
  const messageId = useRef(1);

  const dates = useMemo(() => getDates(), []);
  const currentIndex = stepIndex(booking.step, Boolean(locationId));
  const busy = saving || reserving || thinking || seatLoading || catalogLoading;
  useEffect(() => {
    // Keep the composer in focus when an assistant reply advances the booking.
    if (!assistantRef.current) mainRef.current?.focus();
    setBookingError(null);
  }, [booking.step, locationId]);
  useEffect(() => {
    if (assistantOpen)
      assistantRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [assistantOpen]);
  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
    setHandsFree(false);
    setVoicePhase("idle");
    speechController.stopListening(false);
    assistantToggleRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!assistantOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAssistant();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [assistantOpen, closeAssistant]);

  const addMessage = useCallback((role: Message["role"], text: string) => {
    const id = ++messageId.current;
    setMessages((items) => [...items, { id, role, text }]);
  }, []);

  const speak = useCallback(
    (text: string, force = false) => {
      if (!tts && !force) return;
      setSpeaking(true);
      speechController.speak(text, () => setSpeaking(false));
    },
    [tts],
  );

  const announce = useCallback(
    (text: string) => {
      addMessage("assistant", text);
      speak(text);
    },
    [addMessage, speak],
  );

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
      const { data, error } = await supabase
        .from("locations")
        .select("id,name,city,country")
        .order("city");
      if (!active) return;
      if (error) setCatalogError(error.message);
      else setLocations(data ?? []);
      setCatalogLoading(false);
    }
    void loadLocations();
    return () => {
      active = false;
    };
  }, []);

  const chooseLocation = useCallback(
    async (id: string, quiet = false) => {
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
        .in(
          "theatre_id",
          theatreIds.length
            ? theatreIds
            : ["00000000-0000-0000-0000-000000000000"],
        );
      if (auditoriumError) {
        setCatalogError(auditoriumError.message);
        setCatalogLoading(false);
        return;
      }
      const auditoriumIds = (auditoriums ?? []).map(
        (auditorium) => auditorium.id,
      );
      const { data: showtimes, error: showtimeError } = await supabase
        .from("showtimes")
        .select("id,movie_id,starts_at")
        .in(
          "auditorium_id",
          auditoriumIds.length
            ? auditoriumIds
            : ["00000000-0000-0000-0000-000000000000"],
        )
        .gt("starts_at", new Date().toISOString())
        .order("starts_at");
      if (showtimeError) {
        setCatalogError(showtimeError.message);
        setCatalogLoading(false);
        return;
      }
      const movieIds = [
        ...new Set((showtimes ?? []).map((showtime) => showtime.movie_id)),
      ];
      if (!movieIds.length) {
        setCatalogLoading(false);
        const loc = locations.find((l) => l.id === id);
        const locName = formatLocationName(loc);
        if (!quiet)
          announce(
            `Location set to ${locName}. There are no active showtimes right now.`,
          );
        return;
      }
      const { data: movies, error: movieError } = await supabase
        .from("movies")
        .select(
          "id,title,poster_url,genre,language,runtime_minutes,age_rating,synopsis,rating,provider_id",
        )
        .in("id", movieIds)
        .eq("is_coming_soon", false);
      if (movieError) setCatalogError(movieError.message);
      else {
        const movieShowtimes = showtimes ?? [];
        const mapped = (movies ?? []).map((movie) => {
          const forMovie = movieShowtimes.filter(
            (showtime) => showtime.movie_id === movie.id,
          );
          const showtimesByDate: Record<
            string,
            { time: string; id: string }[]
          > = {};
          for (const showtime of forMovie) {
            const startDate = new Date(showtime.starts_at);
            const dateKey = toLocalDateKey(startDate);
            const time = formatShowtime(startDate);
            const entries = (showtimesByDate[dateKey] ??= []);
            if (!entries.some((entry) => entry.time === time)) {
              entries.push({ time, id: showtime.id });
            }
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
            showtimes: forMovie.map((showtime) =>
              formatShowtime(new Date(showtime.starts_at)),
            ),
            showtimesByDate,
          };
        });
        setCatalogMovies(mapped);
        const loc = locations.find((l) => l.id === id);
        const locName = formatLocationName(loc);
        if (!quiet) {
          announce(
            `Location set to ${locName}. Please choose a movie to see available showtimes.`,
          );
        }
      }
      setCatalogLoading(false);
    },
    [announce, locations],
  );

  const changeLocation = useCallback(() => {
    window.sessionStorage.removeItem("cinevea-location");
    setLocationId("");
    setCatalogMovies([]);
    setCatalogError(null);
    setCatalogLoading(false);
    setSeatStatuses({});
    setRecommendations([]);
    setRecommendationIndex(0);
    setBooking(initialBooking);
    announce("Please choose your theater location.");
  }, [announce]);

  useEffect(() => {
    if (!locations.length || locationId) return;
    const savedLocationId = window.sessionStorage.getItem("cinevea-location");
    if (
      savedLocationId &&
      locations.some((location) => location.id === savedLocationId)
    ) {
      void chooseLocation(savedLocationId, true);
    }
  }, [chooseLocation, locationId, locations]);

  // The `quiet` flag is used when the assistant already replied, so we don't post a second message.
  const chooseMovie = useCallback(
    (movie: Movie, quiet = false) => {
      setBooking((state) => ({
        ...state,
        movie,
        date: null,
        showtime: null,
        showtimeId: null,
        holdToken: null,
        ticketCount: 0,
        ticketBreakdown: {},
        seats: [],
        step: "date",
      }));
      if (!quiet)
        announce(
          `${movie.title} selected. Choose a date to see available showtimes.`,
        );
    },
    [announce],
  );

  const chooseDate = useCallback(
    (date: string, quiet = false) => {
      setBooking((state) => ({
        ...state,
        date,
        showtime: null,
        showtimeId: null,
        holdToken: null,
        ticketCount: 0,
        ticketBreakdown: {},
        seats: [],
        step: "showtime",
      }));
      const formatted =
        dates.find((item) => item.value === date)?.label ?? date;
      const hasShowtimes =
        (booking.movie?.showtimesByDate?.[date] ?? []).length > 0;
      if (!quiet) {
        announce(
          hasShowtimes
            ? `Showtimes for ${formatted} are now available. Choose a time.`
            : `There are no available showtimes for ${formatted}. Choose another date or say “change date” to continue.`,
        );
      }
    },
    [announce, booking.movie, dates],
  );

  const chooseShowtime = useCallback(
    async (showtime: string, quiet = false) => {
      const showtimeId = booking.date
        ? (booking.movie?.showtimesByDate?.[booking.date]?.find(
            (entry) => entry.time === showtime,
          )?.id ?? null)
        : null;
      setBooking((state) => ({
        ...state,
        showtime,
        showtimeId,
        holdToken: null,
        ticketCount: 0,
        ticketBreakdown: {},
        seats: [],
        step: "tickets",
      }));
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
          setSeatStatuses(
            Object.fromEntries(
              (data ?? []).map((seat) => [
                `${seat.row_label}-${seat.seat_number}`,
                seat.status as SeatStatus,
              ]),
            ),
          );
        }
      }
      if (!quiet)
        announce(`${showtime} selected. How many tickets do you need?`);
    },
    [announce, booking.date, booking.movie],
  );

  const chooseTickets = useCallback(
    (breakdown: Record<string, number>, quiet = false) => {
      const count = computeTicketCount(breakdown);
      if (
        count < 1 ||
        count > 10 ||
        Object.values(breakdown).some((n) => !Number.isInteger(n) || n < 0)
      )
        return;
      setBooking((state) => ({
        ...state,
        ticketCount: count,
        ticketBreakdown: breakdown,
        seats: [],
        holdToken: null,
        step: "seats",
      }));
      setRecommendations([]);
      setRecommendationIndex(0);
      if (!quiet)
        announce(
          `${count} ticket${count === 1 ? "" : "s"} selected. Choose your seats.`,
        );
    },
    [announce],
  );

  const toggleSeat = useCallback(
    (row: string, col: number) => {
      setBooking((state) => {
        if (state.step !== "seats") return state;
        const status = seatStatuses[`${row}-${col}`] ?? "booked";
        if (
          status !== "available" &&
          !state.seats.some((seat) => seat.row === row && seat.col === col)
        )
          return state;
        const exists = state.seats.some(
          (seat) => seat.row === row && seat.col === col,
        );
        const seats = exists
          ? state.seats.filter(
              (seat) => !(seat.row === row && seat.col === col),
            )
          : state.seats.length < state.ticketCount
            ? [...state.seats, { row, col, status: "selected" as const }]
            : state.seats;
        return { ...state, seats };
      });
    },
    [seatStatuses],
  );

  const findBestSeats = useCallback(() => {
    const next = calculateSeatRecommendations(
      seatStatuses,
      booking.ticketCount,
      seatPreference,
    );
    setRecommendations(next);
    setRecommendationIndex(0);
    if (!next.length) {
      announce("There are not enough available seats for this ticket count.");
    }
  }, [announce, booking.ticketCount, seatPreference, seatStatuses]);

  const selectRecommendation = useCallback(
    (recommendation: SeatRecommendation) => {
      setBooking((state) => ({
        ...state,
        seats: recommendation.seats.map((seat) => ({
          ...seat,
          status: "selected" as const,
        })),
      }));
      announce(
        `Selected Row ${recommendation.seats[0]?.row}, seats ${recommendation.seats.map((seat) => seat.col).join(", ")}.`,
      );
    },
    [announce],
  );

  const showAlternative = useCallback(() => {
    let recs = recommendations;
    if (!recs.length) {
      recs = calculateSeatRecommendations(
        seatStatuses,
        booking.ticketCount,
        seatPreference,
      );
      setRecommendations(recs);
    }
    if (!recs.length) {
      announce("There are not enough available seats for this ticket count.");
      return;
    }
    if (recs.length === 1) {
      const only = recs[0];
      const seatList = only.seats.map((s) => `${s.row}${s.col}`).join(", ");
      setBooking((state) => ({
        ...state,
        seats: only.seats.map((seat) => ({
          ...seat,
          status: "selected" as const,
        })),
      }));
      announce(
        `Row ${only.seats[0].row}, seats ${seatList} is the best adjacent option available. Say "review booking" to continue.`,
      );
      return;
    }
    const nextIndex = (recommendationIndex + 1) % recs.length;
    setRecommendationIndex(nextIndex);
    const nextRec = recs[nextIndex];
    if (nextRec) {
      const seatList = nextRec.seats.map((s) => `${s.row}${s.col}`).join(", ");
      setBooking((state) => ({
        ...state,
        seats: nextRec.seats.map((seat) => ({
          ...seat,
          status: "selected" as const,
        })),
      }));
      announce(
        `Here is an alternative: Row ${nextRec.seats[0].row}, seats ${seatList}. Say "review booking" to move forward, or say "view alternative" to see another option.`,
      );
    }
  }, [
    announce,
    booking.ticketCount,
    recommendationIndex,
    recommendations,
    seatPreference,
    seatStatuses,
  ]);

  // Reserve first; a failed hold must never be presented as a successful reservation.
  const review = useCallback(
    async (seatsOverride?: BookingState["seats"]) => {
      if (operationRef.current) return;
      const seats = seatsOverride ?? booking.seats;
      const labels = seats.map((s) => `${s.row}-${s.col}`);
      if (
        booking.ticketCount < 1 ||
        seats.length !== booking.ticketCount ||
        new Set(labels).size !== labels.length
      )
        return;
      if (!supabase || !booking.showtimeId) {
        setBookingError(
          "This screening is unavailable. Go back and choose a showtime again.",
        );
        return;
      }
      operationRef.current = true;
      setReserving(true);
      setBookingError(null);
      const signature = `${booking.showtimeId}:${[...labels].sort().join(",")}`;
      try {
        const { data, error } = await supabase.rpc("reserve_showtime_seats", {
          p_showtime_id: booking.showtimeId,
          p_seats: seats.map((seat) => ({ row: seat.row, number: seat.col })),
          p_idempotency_key:
            booking.holdToken && heldSelectionRef.current === signature
              ? booking.holdToken
              : crypto.randomUUID(),
        });
        if (error || !data?.hold_token)
          throw new Error(error?.message || "No seat hold was returned.");
        heldSelectionRef.current = signature;
        setHoldNotice(null);
        setBooking((state) => ({
          ...state,
          seats,
          holdToken: data.hold_token,
          step: "review",
        }));
        announce(
          `Your seats are held for five minutes. Let’s review: ${describeBooking({ ...booking, seats })} ${booking.paymentMethod ? "Say confirm booking when these details are correct." : "Say pay at venue or simulated card to choose."}`,
        );
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Seat reservation failed.";
        const message = `We could not hold these seats. ${text} Please select available seats and try again.`;
        setBookingError(message);
        announce(message);
        const { data } = await supabase
          .from("showtime_seats")
          .select("row_label,seat_number,status")
          .eq("showtime_id", booking.showtimeId);
        if (data) {
          const fresh = Object.fromEntries(
            data.map((s) => [
              `${s.row_label}-${s.seat_number}`,
              s.status as SeatStatus,
            ]),
          );
          setSeatStatuses(fresh);
          setBooking((state) => ({ ...state, seats: [], holdToken: null }));
        }
      } finally {
        operationRef.current = false;
        setReserving(false);
      }
    },
    [announce, booking],
  );

  const confirm = useCallback(async () => {
    if (operationRef.current) return;
    if (
      !supabase ||
      !booking.holdToken ||
      booking.step !== "review" ||
      booking.seats.length !== booking.ticketCount
    ) {
      setBookingError("Please select and hold your seats before confirming.");
      return;
    }
    if (!booking.paymentMethod) {
      const message =
        "Choose a demonstration payment method first. Say pay at venue or simulated card. No payment details are collected.";
      setBookingError(message);
      announce(message);
      return;
    }
    operationRef.current = true;
    setSaving(true);
    setBookingError(null);
    const reference = `CV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      const { error } = await supabase.rpc("confirm_held_booking", {
        p_hold_token: booking.holdToken,
        p_booking_ref: reference,
        p_movie_title: booking.movie!.title,
        p_movie_genre: booking.movie!.genre,
        p_movie_rating: booking.movie!.rating,
        p_ticket_breakdown: booking.ticketBreakdown,
        p_total_price: computeTicketPrice(booking.ticketBreakdown),
      });
      if (error) throw new Error(error.message);
      setBookingRef(reference);
      setBooking((state) => ({ ...state, step: "confirmed" }));
      announce(
        `Booking confirmed. Your reference is ${reference}. Enjoy the show!`,
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : "Please try again.";
      const message = `Your booking was not confirmed. ${text} If the hold expired, use Edit seats to choose seats again.`;
      setBookingError(message);
      announce(message);
    } finally {
      operationRef.current = false;
      setSaving(false);
    }
  }, [announce, booking]);

  const restart = useCallback(() => {
    if (operationRef.current) return;
    setRestartPrompt(false);
    setBookingError(null);
    heldSelectionRef.current = "";
    setHoldNotice(null);
    speechController.stopSpeaking();
    setSpeaking(false);
    window.sessionStorage.removeItem("cinevea-location");
    setLocationId("");
    setCatalogMovies([]);
    setCatalogError(null);
    setCatalogLoading(false);
    setSeatStatuses({});
    setRecommendations([]);
    setRecommendationIndex(0);
    setBooking(initialBooking);
    const greeting =
      "Welcome to Cinevea! I'm your booking assistant. I can help you book movie tickets by voice or text. First, please choose your theater location.";
    messageId.current += 1;
    setMessages([{ id: messageId.current, role: "assistant", text: greeting }]);
    setBookingRef("");
  }, []);

  const editStep = useCallback(
    (step: EditStep) => {
      if (operationRef.current) return;
      const hadHold = Boolean(booking.holdToken);
      setBookingError(null);
      setBooking((state) => {
        if (step === "movie") return { ...initialBooking, step: "greeting" };
        if (step === "date")
          return {
            ...state,
            date: null,
            showtime: null,
            showtimeId: null,
            holdToken: null,
            ticketCount: 0,
            ticketBreakdown: {},
            seats: [],
            step,
          };
        if (step === "showtime")
          return {
            ...state,
            showtime: null,
            showtimeId: null,
            holdToken: null,
            ticketCount: 0,
            ticketBreakdown: {},
            seats: [],
            step,
          };
        return { ...state, holdToken: null, seats: [], step };
      });
      setRecommendations([]);
      if (hadHold) {
        setHoldNotice(
          "Your previous seats can remain held for up to five minutes. You can choose other available seats now, or return after that hold expires.",
        );
        announce(
          "Your earlier seats may remain held for up to five minutes. Choose available seats for your updated booking.",
        );
        if (booking.showtimeId && supabase) {
          void supabase
            .from("showtime_seats")
            .select("row_label,seat_number,status")
            .eq("showtime_id", booking.showtimeId)
            .then(({ data }) => {
              if (data)
                setSeatStatuses(
                  Object.fromEntries(
                    data.map((s) => [
                      `${s.row_label}-${s.seat_number}`,
                      s.status as SeatStatus,
                    ]),
                  ),
                );
            });
        }
      }
    },
    [announce, booking.holdToken, booking.showtimeId],
  );

  const goBack = useCallback(() => {
    const previous: Partial<Record<BookingState["step"], EditStep>> = {
      date: "movie",
      showtime: "date",
      tickets: "showtime",
      seats: "tickets",
      review: "seats",
    };
    const step = previous[booking.step];
    if (step) editStep(step);
  }, [booking.step, editStep]);

  /** Carries out an assistant action, validating it against the live UI state so a bad model reply can't corrupt the booking. */
  const runAssistantAction = useCallback(
    (action: NonNullable<Awaited<ReturnType<typeof aiRespond>>["action"]>) => {
      switch (action.type) {
        case "select_movie": {
          const movie = catalogMovies.find(
            (item) => item.id === action.movieId,
          );
          if (movie && ["greeting", "date"].includes(booking.step))
            chooseMovie(movie, true);
          break;
        }
        case "select_date": {
          const isValid = Boolean(
            booking.movie?.showtimesByDate?.[action.date]?.length,
          );
          if (booking.step === "date" && isValid) {
            chooseDate(action.date, true);
          }
          break;
        }
        case "select_showtime": {
          const available = booking.date
            ? (booking.movie?.showtimesByDate?.[booking.date] ?? [])
            : [];
          if (
            booking.step === "showtime" &&
            available.some((entry) => entry.time === action.showtime)
          ) {
            void chooseShowtime(action.showtime, true);
          } else if (booking.step === "showtime") {
            const availableTimes = available.map((entry) => entry.time);
            announce(
              availableTimes.length
                ? `That showtime is not available for the selected date. Available times are: ${availableTimes.join(", ")}.`
                : "There are no available showtimes for the selected date.",
            );
          }
          break;
        }
        case "set_tickets": {
          const breakdown = action.breakdown ?? { adult: action.count };
          const count = computeTicketCount(breakdown);
          if (
            ["tickets", "seats"].includes(booking.step) &&
            count >= 1 &&
            count <= 10
          ) {
            chooseTickets(breakdown, true);
          }
          break;
        }
        case "review_booking": {
          if (booking.step !== "seats") break;
          const seats = booking.seats;
          if (seats.length === booking.ticketCount) {
            void review(seats);
          } else {
            announce(
              `Please choose ${booking.ticketCount} seat${booking.ticketCount > 1 ? "s" : ""} on the map before reviewing.`,
            );
          }
          break;
        }
        case "view_alternative": {
          if (booking.step === "seats") {
            showAlternative();
          }
          break;
        }
        case "select_seats": {
          if (booking.step !== "seats") break;
          const preference = action.preference ?? seatPreference;
          if (action.preference) {
            setSeatPreference(action.preference);
          }
          let seats: BookingState["seats"] = [];
          if (action.seats.length === 0) {
            const recs = calculateSeatRecommendations(
              seatStatuses,
              booking.ticketCount,
              preference,
            );
            setRecommendations(recs);
            setRecommendationIndex(0);
            const best = recs[0];
            seats = (best?.seats ?? []).map((seat) => ({
              ...seat,
              status: "selected" as const,
            }));
            if (seats.length === booking.ticketCount) {
              setBooking((state) => ({ ...state, seats }));
              const seatList = seats.map((s) => `${s.row}${s.col}`).join(", ");
              const prefLabel =
                preference === "front"
                  ? " (front rows)"
                  : preference === "back"
                    ? " (back rows)"
                    : preference === "center"
                      ? " (center)"
                      : " (middle rows)";
              announce(
                `I've selected seats ${seatList}${prefLabel} for you. Say "review booking" to move forward, or choose different seats on the map.`,
              );
            } else {
              announce(
                "I couldn't find enough available seats together. Please choose seats on the map.",
              );
            }
          } else {
            seats = action.seats
              .map((label) => label.match(/^([A-Za-z])(\d{1,2})$/))
              .filter((match): match is RegExpMatchArray => Boolean(match))
              .map((match) => ({
                row: match[1].toUpperCase(),
                col: Number(match[2]),
                status: "selected" as const,
              }));
            const allFree = seats.every(
              (seat) =>
                (seatStatuses[`${seat.row}-${seat.col}`] ?? "unavailable") ===
                "available",
            );
            if (
              !allFree ||
              new Set(seats.map((s) => `${s.row}-${s.col}`)).size !==
                seats.length
            ) {
              announce(
                "Sorry, one of those seats is already taken. Please choose different seats.",
              );
              seats = [];
            }
            if (seats.length === booking.ticketCount && allFree) {
              setBooking((state) => ({ ...state, seats }));
              announce(
                `Selected ${seats.map((s) => `${s.row}${s.col}`).join(", ")} for your ${booking.ticketCount} tickets. Select Review booking when you’re ready.`,
              );
            }
          }
          break;
        }
        case "confirm_booking":
          if (booking.step === "review") void confirm();
          break;
        case "select_payment":
          choosePayment(action.paymentMethod);
          break;
        case "go_back":
          goBack();
          break;
        case "restart":
          setRestartPrompt(true);
          break;
      }
    },
    [
      announce,
      booking,
      catalogMovies,
      chooseDate,
      chooseMovie,
      chooseShowtime,
      chooseTickets,
      confirm,
      goBack,
      review,
      seatPreference,
      seatStatuses,
      showAlternative,
    ],
  );

  const choosePayment = useCallback(
    (method: "venue" | "card_demo") => {
      setBooking((state) => ({ ...state, paymentMethod: method }));
      setBookingError(null);
      announce(
        `${describeBooking({ ...booking, paymentMethod: method })} This is a simulation; nothing is charged. Say confirm booking or use the confirmation button if these details are correct.`,
      );
    },
    [announce, booking],
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || assistantRequestRef.current) return;
      assistantRequestRef.current = true;
      setThinking(true);
      try {
        addMessage("user", trimmed);
        if (restartPrompt) {
          if (/^(?:yes[, ]+)?(?:please )?start over[.!?]?$/i.test(trimmed)) {
            restart();
            return;
          }
          if (
            /^(?:keep (?:my )?booking|no|cancel|never mind)[.!?]?$/i.test(
              trimmed,
            )
          ) {
            setRestartPrompt(false);
            announce(
              "Your current booking is kept. What would you like to do next?",
            );
            return;
          }
          announce(
            "Say yes, start over to clear your choices, or keep my booking to continue.",
          );
          return;
        }
        if (
          /^(?:please )?(?:repeat|repeat that|say that again|read that again)[.!?]?$/i.test(
            trimmed,
          )
        ) {
          const last = [...messages]
            .reverse()
            .find((m) => m.role === "assistant");
          if (last) speak(last.text, true);
          return;
        }
        speechController.stopSpeaking();
        setSpeaking(false);
        if (
          /\b(?:pay\s*at\s*venue\s*or\s*card(?:\s*payment)?(?:\s*options?)?|payment\s*options?|what\s*(?:are\s*the\s*)?payment\s*options?)\b/i.test(
            trimmed,
          )
        ) {
          announce(
            "We accept two demonstration payment options: pay at venue or card payment simulation. You can say pay at venue or card payment to select one.",
          );
          return;
        }
        if (booking.step === "review") {
          const payment = parsePaymentChoice(trimmed);
          if (payment) {
            choosePayment(payment);
            return;
          }
          if (
            !booking.paymentMethod &&
            !/^(?:why|what|how|change|edit|go back|back|restart|start over)/i.test(
              trimmed,
            )
          ) {
            announce(
              "Choose a demonstration payment method: say pay at venue or card payment. No real payment is collected.",
            );
            return;
          }
        }

        let currentLocations = locations;
        if (!currentLocations.length && supabase) {
          const { data } = await supabase
            .from("locations")
            .select("id,name,city,country")
            .order("city");
          if (data?.length) {
            currentLocations = data;
            setLocations(data);
          }
        }

        const mentionedLocation = findLocation(trimmed, currentLocations);
        if (mentionedLocation) {
          await chooseLocation(mentionedLocation.id);
          setBooking(initialBooking);
          return;
        }

        const editMatch = trimmed
          .toLowerCase()
          .match(
            /^(?:please )?(?:change|edit)(?: my| the)? (movie|date|time|showtime|tickets?|seats?)[.!?]?$/,
          );
        if (editMatch && booking.movie && booking.step !== "confirmed") {
          const word = editMatch[1];
          const step = (
            word === "time"
              ? "showtime"
              : word.startsWith("ticket")
                ? "tickets"
                : word.startsWith("seat")
                  ? "seats"
                  : word
          ) as EditStep;
          const needsTime = step === "tickets" || step === "seats";
          if (needsTime && !booking.showtime)
            announce(
              "Choose a showtime first, then you can select tickets and seats.",
            );
          else if (step === "seats" && !booking.ticketCount)
            announce("Choose your ticket count before selecting seats.");
          else if (step === "showtime" && !booking.date)
            announce("Choose a date before selecting a showtime.");
          else {
            editStep(step);
            announce(
              `Let’s update your ${step}. Use the choices on screen, or tell me your new selection.`,
            );
          }
          return;
        }
        if (!locationId) {
          announce(
            "Welcome to Cinevea! Please choose your theater location first so I can show you available movies.",
          );
          return;
        }
        if (catalogLoading) {
          announce(
            "I'm loading the live movie listings for this location. Please try again in a moment.",
          );
          return;
        }

        setThinking(true);

        // Show the assistant only the showtimes for the chosen date, not every date.
        const todaysTimes =
          booking.movie && booking.date
            ? (booking.movie.showtimesByDate?.[booking.date] ?? []).map(
                (entry) => entry.time,
              )
            : null;
        const assistantState =
          booking.movie && todaysTimes
            ? {
                ...booking,
                movie: { ...booking.movie, showtimes: todaysTimes },
              }
            : booking;
        const history = messages.map((message) => ({
          id: String(message.id),
          role: message.role,
          text: message.text,
          timestamp: Date.now(),
        }));

        await aiRespond(trimmed, assistantState, history, catalogMovies)
          .then((response) => {
            const { action } = response;
            if (
              action?.type === "confirm_booking" &&
              handsFree &&
              !/^(?:please )?confirm (?:my )?booking[.!?]?$/i.test(trimmed)
            ) {
              announce(
                "Please say confirm booking to save, or say change seats to make a correction.",
              );
              return;
            }
            if (
              action?.type === "set_tickets" &&
              booking.step !== "tickets" &&
              !isExplicitTicketChange(trimmed)
            ) {
              announce(
                `Your ${booking.ticketCount} tickets have not changed. Please choose your seats or use Edit tickets.`,
              );
              return;
            }
            // restart() clears the transcript, so run it first and post the reply afterwards.
            if (action) runAssistantAction(action);
            const reply =
              response.text || (action ? "Okay." : "Sorry, I didn't get that.");
            if (action?.type === "restart") {
              announce(
                "Say yes, start over to clear your choices, or keep my booking to continue.",
              );
            } else if (action?.type === "confirm_booking") {
              // Confirmation feedback comes from the save result, never from an AI prediction.
            } else if (action?.type === "select_seats") {
              // runAssistantAction already announces the specific selected seat numbers and preference
            } else if (action?.type === "view_alternative") {
              // showAlternative() already announces the specific alternative seats
            } else if (action?.type === "review_booking") {
              // review() already announces the review step message
            } else {
              announce(reply);
            }
          })
          .catch(() =>
            announce("Sorry, something went wrong. Please try again."),
          )
          .finally(() => setThinking(false));
      } finally {
        assistantRequestRef.current = false;
        setThinking(false);
      }
    },
    [
      announce,
      addMessage,
      booking,
      busy,
      handsFree,
      catalogLoading,
      catalogMovies,
      chooseLocation,
      choosePayment,
      editStep,
      locationId,
      locations,
      messages,
      runAssistantAction,
      restartPrompt,
      restart,
      speak,
    ],
  );

  const locationName = formatLocationName(
    locations.find((l) => l.id === locationId),
  );
  const latestReply =
    [...messages].reverse().find((m) => m.role === "assistant")?.text ?? "";
  return (
    <div className="cinevea-app">
      <a className="skip-link" href="#booking-main">
        Skip to booking
      </a>
      <Header />
      <div className="booking-shell">
        <Progress index={currentIndex} />
        <div className="booking-layout">
          <main
            id="booking-main"
            ref={mainRef}
            tabIndex={-1}
            className="booking-panel"
            aria-label={`${journey[currentIndex]} booking step`}
            aria-busy={busy}
          >
            <div className="booking-toolbar">
              <div>
                {currentIndex > 1 && currentIndex < 7 && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={goBack}
                  >
                    <ArrowLeft size={16} aria-hidden="true" /> Back
                  </button>
                )}
              </div>
              <span className="prototype-label">MOVIE BOOKING PROTOTYPE</span>
            </div>
            {holdNotice && (
              <p className="notice" role="status">
                {holdNotice}
              </p>
            )}
            {bookingError && (
              <p className="notice notice-error" role="alert">
                {bookingError}
              </p>
            )}
            <fieldset className="step-fieldset" disabled={busy}>
              <legend className="sr-only">
                {journey[currentIndex]} selection
              </legend>
              {booking.step === "greeting" && !locationId && (
                <LocationPicker
                  locations={locations}
                  loading={catalogLoading}
                  error={catalogError}
                  onSelect={chooseLocation}
                />
              )}
              {booking.step === "greeting" && locationId && (
                <MoviePicker
                  movies={catalogMovies}
                  loading={catalogLoading}
                  error={catalogError}
                  onSelect={chooseMovie}
                  onChangeLocation={changeLocation}
                  onRefresh={() => void chooseLocation(locationId, true)}
                />
              )}
              {booking.step === "date" && booking.movie && (
                <DatePicker
                  movie={booking.movie}
                  dates={dates}
                  selected={booking.date}
                  onSelect={chooseDate}
                />
              )}
              {booking.step === "showtime" && booking.movie && booking.date && (
                <ShowtimePicker
                  movie={booking.movie}
                  date={booking.date}
                  onSelect={chooseShowtime}
                  onChangeDate={goBack}
                />
              )}
              {booking.step === "tickets" && (
                <TicketPicker
                  initial={booking.ticketBreakdown}
                  onSelect={chooseTickets}
                />
              )}
              {booking.step === "seats" && (
                <SeatPicker
                  booking={booking}
                  seatStatuses={seatStatuses}
                  loading={seatLoading}
                  preference={seatPreference}
                  recommendations={recommendations}
                  recommendationIndex={recommendationIndex}
                  onPreferenceChange={setSeatPreference}
                  onFindBest={findBestSeats}
                  onSelectRecommendation={selectRecommendation}
                  onAlternative={showAlternative}
                  onToggle={toggleSeat}
                  onConfirm={() => void review()}
                  busy={reserving}
                />
              )}
              {booking.step === "review" && (
                <Review
                  booking={booking}
                  onConfirm={confirm}
                  saving={saving}
                  onEdit={editStep}
                  onPayment={choosePayment}
                />
              )}
              {booking.step === "confirmed" && (
                <Confirmation
                  reference={bookingRef}
                  onRestart={restart}
                  booking={booking}
                  location={locationName}
                />
              )}
            </fieldset>
          </main>
          <div className="booking-sidebar">
            <details
              className="summary-card"
              open={
                booking.step === "review" || booking.step === "confirmed"
                  ? true
                  : undefined
              }
            >
              <summary>
                Your booking{" "}
                <span>
                  {booking.ticketCount
                    ? `$${computeTicketPrice(booking.ticketBreakdown).toFixed(2)}`
                    : "At a glance"}
                </span>
              </summary>
              <p className="summary-location">
                {locationId
                  ? locationName
                  : "Choose a location to get started."}
              </p>
              {booking.movie ? (
                <BookingDetails booking={booking} />
              ) : (
                <p className="muted">
                  Your choices will appear here as you go.
                </p>
              )}
            </details>
            {currentIndex < 7 && (
              <details className="restart-card">
                <summary>Start a new booking</summary>
                <p className="muted">
                  This clears your current choices. Any earlier seat hold
                  expires automatically.
                </p>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setRestartPrompt(true)}
                >
                  <RotateCcw size={16} aria-hidden="true" /> Start over
                </button>
              </details>
            )}
          </div>
        </div>
        <footer className="app-footer">
          <span>Cinevea</span>
          <span>One step closer to the big screen.</span>
        </footer>
      </div>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {latestReply}
      </div>
      <button
        ref={assistantToggleRef}
        className="assistant-launcher"
        aria-label={assistantOpen ? "Close assistant" : "Open assistant"}
        aria-expanded={assistantOpen}
        aria-controls="booking-assistant"
        title={assistantOpen ? "Close assistant" : "Open assistant"}
        onClick={() =>
          assistantOpen ? closeAssistant() : setAssistantOpen(true)
        }
      >
        <GuideAvatar small genre={booking.movie?.genre} />
        <span className="sr-only">
          {assistantOpen ? "Close assistant" : "Open assistant"}
        </span>
        <span className="launcher-label" aria-hidden="true">
          Movie guide
        </span>
      </button>
      {assistantOpen && (
        <aside
          id="booking-assistant"
          ref={assistantRef}
          className="assistant-panel"
          aria-label="Booking assistant"
          onKeyDown={(e) => {
            if (e.key === "Escape") closeAssistant();
          }}
        >
          <div className="assistant-heading">
            <div className="assistant-heading-info">
              <h2>Your movie guide</h2>
              <p className="assistant-step">
                {currentIndex === 7
                  ? "Booking complete"
                  : `Step ${currentIndex + 1} of 7 · ${journey[currentIndex]}`}
              </p>
            </div>
            <div className="assistant-heading-controls">
              <button
                className="icon-button assistant-control-btn"
                onClick={() => setAssistantSettingsOpen((v) => !v)}
                aria-label="Settings"
                title="Voice and guide settings"
              >
                <Settings size={20} aria-hidden="true" />
              </button>
              <button
                className="icon-button assistant-control-btn"
                onClick={closeAssistant}
                aria-label="Close assistant"
                title="Close assistant"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="assistant-status">
            <div className="assistant-status-left">
              <GuideAvatar
                genre={booking.movie?.genre}
                small
                speaking={speaking}
                mood={
                  voicePhase === "listening"
                    ? "listening"
                    : thinking
                      ? "thinking"
                      : booking.step === "confirmed"
                        ? "happy"
                        : "idle"
                }
              />
              <p>
                {thinking
                  ? "Thinking…"
                  : speaking
                    ? "Speaking…"
                    : "Ready when you are"}
              </p>
            </div>
            <div className="assistant-status-right">
              <button
                className="icon-button assistant-control-btn"
                aria-label={
                  tts ? "Turn spoken replies off" : "Turn spoken replies on"
                }
                aria-pressed={tts}
                onClick={() => setTts((v) => !v)}
                title={tts ? "Mute spoken replies" : "Turn spoken replies on"}
              >
                {tts ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </button>
              {speaking && (
                <button
                  className="text-button"
                  onClick={() => {
                    speechController.stopSpeaking();
                    setSpeaking(false);
                  }}
                >
                  Stop speaking
                </button>
              )}
            </div>
          </div>
          <div
            className={`assistant-drawer ${assistantSettingsOpen ? "drawer-open" : "drawer-closed"}`}
          >
            <VoiceSettings
              onPreview={() =>
                speak(
                  "Hi, I’m your Cinevea guide. Let’s find your next movie, one step at a time.",
                  true,
                )
              }
            />
            <details className="conversation-privacy">
              <summary>How this conversation is used</summary>
              <p>
                Your booking choices and messages help complete this task. Browser
                speech services may process audio remotely. When server AI is
                available, catalogue messages and booking context are sent through
                the project’s server. Payment is simulated: only a method choice
                is collected, with no card details. Closing the assistant turns
                off its microphone.
              </p>
            </details>
          </div>
          <ChatTranscript
            messages={messages.map((m) => ({
              ...m,
              id: String(m.id),
              timestamp: 0,
            }))}
            onSpeak={(text) => speak(text, true)}
          />
          {handsFree ? (
            <HandsFreeVoice
              send={sendText}
              busy={busy}
              speaking={speaking}
              onPhase={setVoicePhase}
              onExit={() => {
                setHandsFree(false);
                setVoicePhase("idle");
              }}
            />
          ) : (
            <>
              <button
                className="primary-button start-hands-free sr-only"
                disabled={!speechController.recognitionSupported || busy}
                onClick={() => {
                  setTts(true);
                  setHandsFree(true);
                }}
              >
                Start hands-free voice
              </button>
              <VoiceInput
                onSendMessage={sendText}
                disabled={busy}
                ttsEnabled={tts}
                onToggleTts={() => setTts((v) => !v)}
                onStartHandsFree={() => {
                  setTts(true);
                  setHandsFree(true);
                }}
              />
            </>
          )}
        </aside>
      )}
      {restartPrompt && (
        <div
          className="confirm-reset"
          role="region"
          aria-label="Start over confirmation"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setRestartPrompt(false);
              mainRef.current?.focus();
            }
          }}
        >
          <h2>Start a new booking?</h2>
          <p>
            This clears your current selections. Existing seat holds expire
            automatically.
          </p>
          <div className="button-row">
            <button
              autoFocus
              className="secondary-button"
              onClick={() => {
                setRestartPrompt(false);
                mainRef.current?.focus();
              }}
            >
              Keep my booking
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={restart}
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
