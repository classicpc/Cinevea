import { useCallback, useEffect, useState } from "react";
import {
  type BookingState,
  type BookingStep,
  type Movie,
  type Seat,
  MOVIES,
  SEAT_ROWS,
  SEAT_COLS,
  STEP_ORDER,
  getDates,
} from "@/types";
import type { AssistantAction } from "@/lib/conversation";

const INITIAL_STATE: BookingState = {
  movie: null,
  date: null,
  showtime: null,
  ticketCount: 0,
  seats: [],
  step: "greeting",
};

// Deterministic occupied seats per movie+date so the map looks consistent
function getOccupiedSeats(movieId: string, date: string | null): Set<string> {
  const occupied = new Set<string>();
  if (!date) return occupied;
  const seed = movieId + date;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffff;
  }
  // occupy ~30% of seats
  const total = SEAT_ROWS.length * SEAT_COLS;
  const target = Math.floor(total * 0.3);
  let rng = hash;
  while (occupied.size < target) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    const row = SEAT_ROWS[rng % SEAT_ROWS.length];
    const col = (rng >> 4) % SEAT_COLS + 1;
    occupied.add(`${row}${col}`);
  }
  return occupied;
}

export function useBooking() {
  const [state, setState] = useState<BookingState>(INITIAL_STATE);
  const [occupiedSeats, setOccupiedSeats] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOccupiedSeats(
      state.movie && state.date
        ? getOccupiedSeats(state.movie.id, state.date)
        : new Set()
    );
  }, [state.movie, state.date]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    setOccupiedSeats(new Set());
  }, []);

  const goBack = useCallback(() => {
    setState((prev) => {
      const idx = STEP_ORDER.indexOf(prev.step);
      if (idx <= 0) return prev;
      const prevStep = STEP_ORDER[idx - 1];
      // clear data for the step we're going back to re-enter
      const next = { ...prev, step: prevStep as BookingStep };
      if (prevStep === "movie") {
        next.movie = null;
        next.date = null;
        next.showtime = null;
        next.ticketCount = 0;
        next.seats = [];
      } else if (prevStep === "date") {
        next.date = null;
        next.showtime = null;
        next.ticketCount = 0;
        next.seats = [];
      } else if (prevStep === "showtime") {
        next.showtime = null;
        next.ticketCount = 0;
        next.seats = [];
      } else if (prevStep === "tickets") {
        next.ticketCount = 0;
        next.seats = [];
      } else if (prevStep === "seats") {
        next.seats = [];
      }
      return next;
    });
  }, []);

  const selectMovie = useCallback((movie: Movie) => {
    setState((prev) => ({
      ...prev,
      movie,
      date: null,
      showtime: null,
      ticketCount: 0,
      seats: [],
      step: "date",
    }));
  }, []);

  const selectDate = useCallback((date: string) => {
    setState((prev) => ({
      ...prev,
      date,
      showtime: null,
      ticketCount: 0,
      seats: [],
      step: "showtime",
    }));
  }, []);

  const selectShowtime = useCallback((showtime: string) => {
    setState((prev) => ({
      ...prev,
      showtime,
      ticketCount: 0,
      seats: [],
      step: "tickets",
    }));
  }, []);

  const setTickets = useCallback((count: number) => {
    setState((prev) => ({
      ...prev,
      ticketCount: count,
      seats: [],
      step: "seats",
    }));
  }, []);

  const selectSeats = useCallback(
    (seatLabels: string[]) => {
      setState((prev) => {
        let seats: Seat[];
        if (seatLabels.length === 0) {
          // auto-pick best seats
          seats = autoPickSeats(prev.ticketCount, occupiedSeats);
        } else {
          seats = seatLabels.map((label) => {
            const row = label.match(/[A-H]/)?.[0] || "A";
            const col = parseInt(label.match(/\d+/)?.[0] || "1", 10);
            return { row, col, status: "selected" as const };
          });
        }
        return { ...prev, seats, step: "review" };
      });
    },
    [occupiedSeats]
  );

  const confirmBooking = useCallback(() => {
    setState((prev) => ({ ...prev, step: "confirmed" }));
  }, []);

  const applyAction = useCallback(
    (action: AssistantAction) => {
      switch (action.type) {
        case "select_movie": {
          const movie = MOVIES.find((m) => m.id === action.movieId);
          if (movie) selectMovie(movie);
          break;
        }
        case "select_date":
          selectDate(action.date);
          break;
        case "select_showtime":
          selectShowtime(action.showtime);
          break;
        case "set_tickets":
          setTickets(action.count);
          break;
        case "select_seats":
          selectSeats(action.seats);
          break;
        case "confirm_booking":
          confirmBooking();
          break;
        case "go_back":
          goBack();
          break;
        case "restart":
          reset();
          break;
        case "advance":
          setState((prev) => ({ ...prev, step: action.to }));
          break;
      }
    },
    [selectMovie, selectDate, selectShowtime, setTickets, selectSeats, confirmBooking, goBack, reset]
  );

  const manualSelectMovie = selectMovie;
  const manualSelectDate = selectDate;
  const manualSelectShowtime = selectShowtime;
  const manualSetTickets = setTickets;
  const manualSelectSeats = selectSeats;

  // Allow clicking a seat in the seat map UI
  const toggleSeat = useCallback(
    (row: string, col: number) => {
      setState((prev) => {
        if (prev.step !== "seats") return prev;
        const label = `${row}${col}`;
        if (occupiedSeats.has(label)) return prev;
        const existing = prev.seats.find((s) => s.row === row && s.col === col);
        if (existing) {
          // deselect
          const seats = prev.seats.filter((s) => !(s.row === row && s.col === col));
          return { ...prev, seats };
        }
        if (prev.seats.length >= prev.ticketCount) {
          // replace the oldest
          const seats = [...prev.seats.slice(1), { row, col, status: "selected" as const }];
          return { ...prev, seats };
        }
        return { ...prev, seats: [...prev.seats, { row, col, status: "selected" as const }] };
      });
    },
    [occupiedSeats]
  );

  const confirmSeatsFromMap = useCallback(() => {
    setState((prev) => {
      if (prev.seats.length === 0) return prev;
      return { ...prev, step: "review" };
    });
  }, []);

  return {
    state,
    occupiedSeats,
    reset,
    goBack,
    applyAction,
    manualSelectMovie,
    manualSelectDate,
    manualSelectShowtime,
    manualSetTickets,
    manualSelectSeats,
    toggleSeat,
    confirmSeatsFromMap,
  };
}

function autoPickSeats(count: number, occupied: Set<string>): Seat[] {
  // pick from middle rows (D, E), center columns
  const preferredRows = ["D", "E", "C", "F", "B", "G", "A", "H"];
  const center = Math.ceil(SEAT_COLS / 2);
  const picked: Seat[] = [];
  for (const row of preferredRows) {
    if (picked.length >= count) break;
    for (let offset = 0; offset < Math.ceil(SEAT_COLS / 2); offset++) {
      for (const col of [center + offset, center - offset - 1]) {
        if (col < 1 || col > SEAT_COLS) continue;
        if (picked.length >= count) break;
        const label = `${row}${col}`;
        if (!occupied.has(label) && !picked.find((s) => s.row === row && s.col === col)) {
          picked.push({ row, col, status: "selected" });
        }
      }
    }
  }
  return picked;
}

export { getOccupiedSeats };
export { getDates };
