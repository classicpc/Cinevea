export type Genre =
  | "Action"
  | "Romance"
  | "Horror"
  | "Sci-Fi"
  | "Animation"
  | "Comedy"
  | "Adventure";

export interface Movie {
  id: string;
  title: string;
  genre: Genre;
  rating: string;
  duration: number;
  poster: string;
  description: string;
  showtimes: string[];
  showtimesByDate?: Record<string, { time: string; id: string }[]>;
  providerId?: string;
}

export interface Showtime {
  movieId: string;
  date: string;
  time: string;
}

export const MOVIES: Movie[] = [
  {
    id: "m1",
    title: "Ember Skyline",
    genre: "Action",
    rating: "PG-13",
    duration: 132,
    poster:
      "https://images.pexels.com/photos/35021724/pexels-photo-35021724.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    description:
      "A retired demolition expert is pulled back for one last job through the burning heart of the city.",
    showtimes: ["11:30 AM", "2:15 PM", "6:00 PM", "9:45 PM"],
  },
  {
    id: "m2",
    title: "Golden Hour",
    genre: "Romance",
    rating: "PG",
    duration: 108,
    poster:
      "https://images.pexels.com/photos/33807743/pexels-photo-33807743.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    description:
      "Two strangers meet at sunset and spend a single evening that changes everything.",
    showtimes: ["1:00 PM", "4:30 PM", "7:15 PM", "10:00 PM"],
  },
  {
    id: "m3",
    title: "Whispers in the Pines",
    genre: "Horror",
    rating: "R",
    duration: 96,
    poster:
      "https://images.pexels.com/photos/29547573/pexels-photo-29547573.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    description:
      "A family inherits a remote cabin and discovers the forest keeps its own secrets after dark.",
    showtimes: ["8:00 PM", "10:30 PM", "12:15 AM"],
  },
  {
    id: "m4",
    title: "Beyond the Helix",
    genre: "Sci-Fi",
    rating: "PG-13",
    duration: 145,
    poster:
      "https://images.pexels.com/photos/33441875/pexels-photo-33441875.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    description:
      "A deep-space biologist races to decode a signal that could rewrite the future of humanity.",
    showtimes: ["12:00 PM", "3:45 PM", "7:00 PM", "10:30 PM"],
  },
  {
    id: "m5",
    title: "Color Quest",
    genre: "Animation",
    rating: "G",
    duration: 94,
    poster:
      "https://images.pexels.com/photos/16432479/pexels-photo-16432479.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    description:
      "A brave little brush sets out across a painted world to bring color back to a faded kingdom.",
    showtimes: ["10:00 AM", "12:45 PM", "3:00 PM", "5:30 PM"],
  },
  {
    id: "m6",
    title: "Stand-Up Shuffle",
    genre: "Comedy",
    rating: "PG-13",
    duration: 101,
    poster:
      "https://images.pexels.com/photos/28620061/pexels-photo-28620061.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    description:
      "Three struggling comedians road-trip to the biggest open mic of their lives, and nothing goes as planned.",
    showtimes: ["1:30 PM", "5:00 PM", "8:15 PM", "11:00 PM"],
  },
  {
    id: "m7",
    title: "Summit's Edge",
    genre: "Adventure",
    rating: "PG",
    duration: 119,
    poster:
      "https://images.pexels.com/photos/30362645/pexels-photo-30362645.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    description:
      "A young climber takes on an impossible peak, facing nature, fear, and the truth about her father.",
    showtimes: ["11:00 AM", "2:30 PM", "6:45 PM", "9:30 PM"],
  },
];

export const GENRE_COLORS: Record<Genre, string> = {
  Action: "from-orange-500 to-red-600",
  Romance: "from-pink-400 to-rose-500",
  Horror: "from-slate-600 to-gray-900",
  "Sci-Fi": "from-cyan-500 to-blue-700",
  Animation: "from-amber-400 to-orange-500",
  Comedy: "from-yellow-400 to-orange-400",
  Adventure: "from-emerald-500 to-teal-700",
};

export const SEAT_ROWS = ["A", "B", "C", "D", "E", "F", "G", "H"];
export const SEAT_COLS = 12;

export interface Seat {
  row: string;
  col: number;
  status: "available" | "occupied" | "selected";
}

export interface BookingState {
  /** Demonstration choice only; no card details or payment processing. */
  paymentMethod?: "venue" | "card_demo" | null;
  movie: Movie | null;
  date: string | null;
  showtime: string | null;
  showtimeId?: string | null;
  holdToken?: string | null;
  ticketCount: number;
  ticketBreakdown: Record<string, number>;
  seats: Seat[];
  step: BookingStep;
}

export type TicketTypeCode = "adult" | "senior" | "child" | "student";

export interface TicketType {
  code: TicketTypeCode;
  label: string;
  price: number;
}

export const TICKET_TYPES: TicketType[] = [
  { code: "adult", label: "Adult", price: 14.99 },
  { code: "senior", label: "Senior (65+)", price: 11.99 },
  { code: "child", label: "Child (under 12)", price: 9.99 },
  { code: "student", label: "Student", price: 12.99 },
];

export function computeTicketCount(breakdown: Record<string, number>): number {
  return Object.values(breakdown).reduce((sum, count) => sum + count, 0);
}

export function computeTicketPrice(breakdown: Record<string, number>): number {
  return TICKET_TYPES.reduce((sum, type) => sum + (breakdown[type.code] ?? 0) * type.price, 0);
}

export type BookingStep =
  | "greeting"
  | "movie"
  | "date"
  | "showtime"
  | "tickets"
  | "seats"
  | "review"
  | "confirmed";

export const STEP_ORDER: BookingStep[] = [
  "greeting",
  "movie",
  "date",
  "showtime",
  "tickets",
  "seats",
  "review",
  "confirmed",
];

export const STEP_LABELS: Record<BookingStep, string> = {
  greeting: "Welcome",
  movie: "Movie",
  date: "Date",
  showtime: "Showtime",
  tickets: "Tickets",
  seats: "Seats",
  review: "Review",
  confirmed: "Confirmed",
};

/** Formats a Date as YYYY-MM-DD in the user's local timezone (toISOString would use UTC and shift evening dates). */
export function toLocalDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The next 7 days starting today, with local-date keys. */
export function getDates(): { label: string; value: string; weekday: string }[] {
  const days: { label: string; value: string; weekday: string }[] = [];
  const today = new Date();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const value = toLocalDateKey(d);
    const weekday = weekdays[d.getDay()];
    const label = `${months[d.getMonth()]} ${d.getDate()}`;
    days.push({ label, value, weekday });
  }
  return days;
}

export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
