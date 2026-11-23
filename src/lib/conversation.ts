// Conversation engine for Cinevea.
// Catalog conversation can use the chat Edge Function. Ticket, seat and
// confirmation stages use local, state-aware rules so free-form replies
// cannot silently overwrite quantities. Other stages retain the AI fallback.

import {
  type Movie,
  type BookingState,
  type BookingStep,
  getDates,
  computeTicketPrice,
  SEAT_ROWS,
  SEAT_COLS,
} from "@/types";
import { supabase } from "@/lib/supabase";
import { parsePaymentChoice, type DemoPaymentMethod } from "@/lib/payment";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export interface AssistantResponse {
  text: string;
  action?: AssistantAction;
}

export type AssistantAction =
  | { type: "select_movie"; movieId: string }
  | { type: "select_date"; date: string }
  | { type: "select_showtime"; showtime: string }
  | { type: "set_tickets"; count: number; breakdown?: Record<string, number> }
  | {
      type: "select_seats";
      seats: string[];
      preference?: "middle" | "front" | "back" | "center";
    }
  | { type: "view_alternative" }
  | { type: "review_booking" }
  | { type: "confirm_booking" }
  | { type: "select_payment"; paymentMethod: DemoPaymentMethod }
  | { type: "go_back" }
  | { type: "restart" }
  | { type: "advance"; to: BookingStep };

/**
 * True if the text contains any of the given words/phrases.
 * Short single words ("no", "yes", "hi") must match a whole word so that
 * e.g. "no" does not match "know" or "now".
 */
function contains(text: string, ...words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => {
    if (w.length <= 3 && !w.includes(" "))
      return new RegExp(`\\b${w}\\b`).test(lower);
    return lower.includes(w);
  });
}

const WORD_TO_NUM: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  won: 1,
  two: 2,
  to: 2,
  too: 2,
  three: 3,
  tree: 3,
  free: 3,
  four: 4,
  for: 4,
  fore: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ate: 8,
  nine: 9,
  ten: 10,
  tin: 10,
};

function wordOrDigitToNum(str: string): number | null {
  const s = str.trim().toLowerCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (WORD_TO_NUM[s]) return WORD_TO_NUM[s];
  return null;
}

const TYPE_SYNONYMS: Record<string, string[]> = {
  adult: ["adults", "adult", "regular", "standard", "grownup", "grown-up"],
  senior: ["seniors", "senior", "elderly", "elder", "elders", "65+"],
  child: ["children", "child", "kids", "kid", "under 12"],
  student: ["students", "student", "youths", "youth"],
};

export function isExplicitTicketChange(text: string): boolean {
  if (/^(?:why|what|how|did|do|does|is|are)\b/i.test(text.trim())) return false;
  return (
    /\b(?:change|update|make|set|instead|actually)\b/i.test(text) &&
    /\b(?:tickets?|adults?|students?|children|child|kids?|seniors?|people)\b/i.test(
      text,
    ) &&
    !/\b(?:don't|do not|dont)\b/i.test(text)
  );
}

export function parseTicketBreakdown(
  text: string,
): { breakdown: Record<string, number>; total: number } | null {
  let lower = text.toLowerCase().trim();
  // Remove a leading conversational filler. Ticket counts still require clear numbers.
  lower = lower.replace(
    /^(?:yeah|yes|yep|sure|please|ok|okay|um|uh|i want|give me|can i get|can i have|we need|i need|book|get me|make it|set it to|actually)\s+/i,
    "",
  );

  const breakdown: Record<string, number> = {
    adult: 0,
    senior: 0,
    child: 0,
    student: 0,
  };
  let foundSpecific = false;
  const numPattern =
    "(?:\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)";

  let remaining = lower;

  for (const [code, synonyms] of Object.entries(TYPE_SYNONYMS)) {
    for (const syn of synonyms) {
      // 1. An explicit count such as "2 adults" or "four adults".
      const re1 = new RegExp(
        `\\b(${numPattern})\\s*(?:x|-|:)?\\s*${syn}\\b`,
        "i",
      );
      const m1 = remaining.match(re1);
      if (m1) {
        const val = wordOrDigitToNum(m1[1]);
        if (val !== null) {
          breakdown[code] += val;
          foundSpecific = true;
          remaining = remaining.replace(m1[0], " ");
        }
      }
      // 2. "adults 2" or "adult: 2"
      const re2 = new RegExp(
        `\\b${syn}\\s*(?:x|-|:)?\\s*(${numPattern})\\b`,
        "i",
      );
      const m2 = remaining.match(re2);
      if (m2) {
        const val = wordOrDigitToNum(m2[1]);
        if (val !== null) {
          breakdown[code] += val;
          foundSpecific = true;
          remaining = remaining.replace(m2[0], " ");
        }
      }
    }
  }

  // Ask for a count rather than inventing one for an unnumbered category.
  const categoryWords = Object.values(TYPE_SYNONYMS)
    .flat()
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (new RegExp(`\\b(?:${categoryWords.join("|")})\\b`, "i").test(remaining))
    return null;

  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(breakdown)) {
    if (v > 0) result[k] = v;
  }

  if (foundSpecific && Object.keys(result).length > 0) {
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    return { breakdown: result, total };
  }

  const generalMatch = lower.match(
    /^(?:(?:okay|ok|please|actually|i want|i need|we need|give me|book|make it|set it to)\s+)*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+(?:tickets?|people|persons?))?[.!?]?$/i,
  );
  if (generalMatch) {
    const val = wordOrDigitToNum(generalMatch[1]);
    if (val !== null && val >= 1)
      return { breakdown: { adult: val }, total: val };
  }

  return null;
}

export function formatBreakdownSummary(
  breakdown: Record<string, number>,
): string {
  const labels: Record<string, string> = {
    adult: "Adult",
    senior: "Senior",
    child: "Child",
    student: "Student",
  };
  return Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(
      ([code, count]) =>
        `${count} ${labels[code] ?? code}${count > 1 ? (code === "child" ? "ren" : "s") : ""}`,
    )
    .join(", ");
}

function extractNumber(text: string): number | null {
  const lower = text.toLowerCase();
  // Digits win over words; words must be whole words ("someone" is not "one").
  const match = lower.match(/\d+/);
  if (match) return parseInt(match[0], 10);
  for (const [word, num] of Object.entries(WORD_TO_NUM)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return num;
  }
  return null;
}

function canonicalizeMovieTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(
      /^(?:i want to watch|i want to see|can we see|can we watch|showtimes for|let'?s see|let'?s watch|book|tickets for|how about|we want|i'?d like to see|movie|film)\s+/i,
      "",
    )
    .replace(/&/g, " and ")
    .replace(/\bpart\s+(?:two|ii)\b/g, "part 2")
    .replace(/\bpart\s+(?:one|i)\b/g, "part 1")
    .replace(/\bpart\s+(?:three|iii)\b/g, "part 3")
    .replace(/\bii\b/g, "2")
    .replace(/\biii\b/g, "3")
    .replace(/\biv\b/g, "4")
    .replace(/\bv\b/g, "5")
    .replace(/\bvi\b/g, "6")
    .replace(/\bvii\b/g, "7")
    .replace(/\bviii\b/g, "8")
    .replace(/\bix\b/g, "9")
    .replace(/\bx\b/g, "10")
    .replace(/\btwo\b/g, "2")
    .replace(/\bthree\b/g, "3")
    .replace(/\bfour\b/g, "4")
    .replace(/\bfive\b/g, "5")
    .replace(/spider[-\s]?man/g, "spiderman")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMovie(text: string, movies: Movie[]): Movie | null {
  const normInput = canonicalizeMovieTitle(text);
  if (!normInput) return null;

  // 1. Direct and bidirectional title match
  for (const m of movies) {
    const normM = canonicalizeMovieTitle(m.title);
    if (
      normInput === normM ||
      normInput.includes(normM) ||
      normM.includes(normInput)
    ) {
      return m;
    }
  }

  // 2. Significant words in common
  const stopWords = new Set(["the", "and", "part", "for", "movie", "film"]);
  const inputWords = normInput
    .split(" ")
    .filter((w) => w.length >= 3 && !stopWords.has(w));
  for (const m of movies) {
    const mWords = canonicalizeMovieTitle(m.title)
      .split(" ")
      .filter((w) => w.length >= 3 && !stopWords.has(w));
    if (inputWords.length > 0 && inputWords.every((w) => mWords.includes(w))) {
      return m;
    }
  }

  // 3. Prominent single-word match (e.g. "gladiator", "deadpool", "wolverine", "batman", "oppenheimer", "wicked", "dune")
  for (const w of inputWords) {
    if (w.length >= 4) {
      const candidate = movies.find((m) =>
        canonicalizeMovieTitle(m.title).includes(w),
      );
      if (candidate) return candidate;
    }
  }

  // 4. Genre-based match
  for (const m of movies) {
    if (contains(text, m.genre.toLowerCase())) return m;
  }

  // 5. Ordinal / number match: "first movie", "movie 2", "number 3", bare number "1"
  const ordinalWords = [
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
  ];
  for (let i = 0; i < ordinalWords.length; i++) {
    if (text.toLowerCase().includes(`${ordinalWords[i]} movie`))
      return movies[i] ?? null;
  }
  const numberMatch = text.toLowerCase().match(/(?:movie|number)\s+(\d+)/);
  if (numberMatch) {
    const index = parseInt(numberMatch[1], 10) - 1;
    return movies[index] ?? null;
  }
  const bareNumber = text.match(/^\s*(\d{1,2})\s*(?:movie|film)?\s*[.!?]?\s*$/);
  if (bareNumber) {
    const index = parseInt(bareNumber[1], 10) - 1;
    return movies[index] ?? null;
  }
  return null;
}

export function findDate(text: string, movie?: Movie | null): string | null {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;

  const dates = getDates();
  const movieDates = movie?.showtimesByDate
    ? Object.keys(movie.showtimesByDate)
    : [];
  const allDateKeys = Array.from(
    new Set([...movieDates, ...dates.map((d) => d.value)]),
  ).sort();
  if (!allDateKeys.length) return null;

  const dateObjects = allDateKeys.map((val) => {
    const [y, m, d] = val.split("-").map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0);
    const weekdayFull = date
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    const weekdayShort = date
      .toLocaleDateString("en-US", { weekday: "short" })
      .toLowerCase();
    const monthFull = date
      .toLocaleDateString("en-US", { month: "long" })
      .toLowerCase();
    const monthShort = date
      .toLocaleDateString("en-US", { month: "short" })
      .toLowerCase();
    return {
      value: val,
      year: y,
      month: m,
      day: d,
      weekdayFull,
      weekdayShort,
      monthFull,
      monthShort,
      label: `${monthShort} ${d}`,
    };
  });

  // 1. Relative keywords: today, tonight, tomorrow
  if (/\b(today|tonight)\b/.test(lower)) {
    return dateObjects[0]?.value ?? null;
  }
  if (/\b(tomorrow)\b/.test(lower)) {
    return dateObjects[1]?.value ?? null;
  }

  // 2. Exact ISO value or slash date match: "2026-11-22", "2026/11/22"
  for (const obj of dateObjects) {
    if (
      lower.includes(obj.value) ||
      lower.includes(obj.value.replace(/-/g, "/"))
    ) {
      return obj.value;
    }
  }

  // 3. Month + Day in any order: e.g. "nov 22", "november 22nd", "22 nov", "22nd of november"
  for (const obj of dateObjects) {
    const dayPattern = `\\b0?${obj.day}(?:st|nd|rd|th)?\\b`;
    const monthPattern = `\\b(${obj.monthShort}|${obj.monthFull})\\b`;
    const r1 = new RegExp(`${monthPattern}.*?${dayPattern}`);
    const r2 = new RegExp(`${dayPattern}.*?${monthPattern}`);
    if (r1.test(lower) || r2.test(lower)) {
      return obj.value;
    }
  }

  // 4. Numeric month/day formats: M/D, D/M, M-D, D-M, M.D, D.M
  for (const obj of dateObjects) {
    const p1 = new RegExp(`\\b0?${obj.month}[/.-]0?${obj.day}\\b`);
    const p2 = new RegExp(`\\b0?${obj.day}[/.-]0?${obj.month}\\b`);
    if (p1.test(lower) || p2.test(lower)) {
      return obj.value;
    }
  }

  // 5. Weekday match: e.g. "Friday", "fri", "this Friday"
  for (const obj of dateObjects) {
    if (
      new RegExp(`\\b${obj.weekdayFull}\\b`).test(lower) ||
      new RegExp(`\\b${obj.weekdayShort}\\b`).test(lower)
    ) {
      return obj.value;
    }
  }

  // 6. Bare day number or ordinal: e.g. "22", "22nd"
  const bareDayMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (bareDayMatch) {
    const dayNum = parseInt(bareDayMatch[1], 10);
    const match =
      dateObjects.find(
        (d) =>
          d.day === dayNum &&
          (movie?.showtimesByDate?.[d.value]?.length ?? 0) > 0,
      ) ?? dateObjects.find((d) => d.day === dayNum);
    if (match) return match.value;
  }

  // 7. Option number: "option 1", "date 2", "1", "2", "first date", "second"
  const optionMatch = lower.match(
    /\b(?:option|date|choice|day|number|#)\s*(\d)\b/,
  );
  if (optionMatch) {
    const idx = parseInt(optionMatch[1], 10) - 1;
    if (idx >= 0 && idx < dateObjects.length) {
      return dateObjects[idx].value;
    }
  }
  const bareNumMatch = lower.match(/^\s*(\d)\s*[.!?]?\s*$/);
  if (bareNumMatch) {
    const idx = parseInt(bareNumMatch[1], 10) - 1;
    if (idx >= 0 && idx < dateObjects.length) {
      return dateObjects[idx].value;
    }
  }

  const ordinalWords = [
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
  ];
  for (let i = 0; i < ordinalWords.length; i++) {
    if (
      new RegExp(`\\b${ordinalWords[i]}\\b`).test(lower) &&
      i < dateObjects.length
    ) {
      return dateObjects[i].value;
    }
  }

  return null;
}

function findShowtime(text: string, movie: Movie | null): string | null {
  if (!movie) return null;
  const lower = text.toLowerCase().replace(/\./g, "");

  // normalize: "2 15 pm" -> "2:15 pm"
  const normalized = lower.replace(/(\d+)\s+(\d+)\s*(am|pm)/g, "$1:$2 $3");
  for (const st of movie.showtimes) {
    if (normalized.includes(st.toLowerCase().replace(/\./g, ""))) return st;
  }
  // just hour match: "7" -> "7:00 PM" etc
  const num = extractNumber(text);
  if (num) {
    for (const st of movie.showtimes) {
      const hour = parseInt(st.match(/(\d+)/)?.[0] || "0", 10);
      if (hour === num) return st;
    }
  }
  if (contains(text, "morning", "matinee", "first show")) {
    return movie.showtimes[0];
  }
  if (contains(text, "afternoon")) {
    const af = movie.showtimes.find(
      (s) => s.includes("PM") && parseInt(s) >= 12 && parseInt(s) < 17,
    );
    if (af) return af;
  }
  if (contains(text, "evening", "night", "last show")) {
    const ev = movie.showtimes.find((s) => parseInt(s) >= 18);
    if (ev) return ev;
  }
  return null;
}

const ROW_WORDS: Record<string, string> = {
  a: "A",
  b: "B",
  be: "B",
  bee: "B",
  c: "C",
  see: "C",
  sea: "C",
  d: "D",
  dee: "D",
  e: "E",
  f: "F",
  g: "G",
  gee: "G",
  h: "H",
  aitch: "H",
};

const NUM_WORDS: Record<string, number> = {
  "1": 1,
  one: 1,
  won: 1,
  "2": 2,
  two: 2,
  to: 2,
  too: 2,
  "3": 3,
  three: 3,
  tree: 3,
  free: 3,
  "4": 4,
  four: 4,
  for: 4,
  fore: 4,
  "5": 5,
  five: 5,
  "6": 6,
  six: 6,
  "7": 7,
  seven: 7,
  "8": 8,
  eight: 8,
  ate: 8,
  "9": 9,
  nine: 9,
  "10": 10,
  ten: 10,
  "11": 11,
  eleven: 11,
  "12": 12,
  twelve: 12,
};

export function parseSeats(text: string): string[] | null {
  let normalized = text.toLowerCase().trim();
  // Strip seat/row noise words that appear in spoken input
  normalized = normalized.replace(/\b(?:seat|seats|row|rows)\s*/g, " ");

  const rowKeys = Object.keys(ROW_WORDS).join("|");
  const numKeys = Object.keys(NUM_WORDS).join("|");

  const pattern = new RegExp(
    `\\b(${rowKeys})\\s*[-:]?\\s*(${numKeys})\\b`,
    "g",
  );
  const seats: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    const row = ROW_WORDS[match[1]];
    const col = NUM_WORDS[match[2]];
    if (row && col >= 1 && col <= SEAT_COLS) {
      const code = `${row}${col}`;
      if (!seats.includes(code)) seats.push(code);
    }
  }

  // Handle row with multiple columns: e.g. "b 3 and 4"
  const multiPattern = new RegExp(
    `\\b(${rowKeys})\\s*[-:]?\\s*(${numKeys})\\s*(?:and|,|&)\\s*(${numKeys})\\b`,
    "g",
  );
  let multiMatch: RegExpExecArray | null;
  while ((multiMatch = multiPattern.exec(normalized)) !== null) {
    const row = ROW_WORDS[multiMatch[1]];
    const col1 = NUM_WORDS[multiMatch[2]];
    const col2 = NUM_WORDS[multiMatch[3]];
    if (row && col1 >= 1 && col1 <= SEAT_COLS) {
      const code1 = `${row}${col1}`;
      if (!seats.includes(code1)) seats.push(code1);
    }
    if (row && col2 >= 1 && col2 <= SEAT_COLS) {
      const code2 = `${row}${col2}`;
      if (!seats.includes(code2)) seats.push(code2);
    }
  }

  const upper = text.toUpperCase();
  const directMatches = upper.matchAll(/([A-H])(\d{1,2})/g);
  for (const m of directMatches) {
    const row = m[1];
    const col = parseInt(m[2], 10);
    if (SEAT_ROWS.includes(row) && col >= 1 && col <= SEAT_COLS) {
      const code = `${row}${col}`;
      if (!seats.includes(code)) seats.push(code);
    }
  }

  return seats.length > 0
    ? seats.sort(
        (a, b) =>
          a[0].localeCompare(b[0]) || Number(a.slice(1)) - Number(b.slice(1)),
      )
    : null;
}

function listMovies(movies: Movie[]): string {
  if (!movies.length) return "There are no movies currently available to book.";
  return movies
    .map((m, i) => `${i + 1}. ${m.title} — ${m.genre}, ${m.rating}`)
    .join("\n");
}

function listShowtimes(movie: Movie): string {
  if (!movie.showtimes.length) {
    return `There are no available showtimes for ${movie.title} on the selected date.`;
  }
  return `Available showtimes for ${movie.title} are: ${movie.showtimes.join(", ")}.`;
}

export function parseSeatPreference(
  text: string,
): "middle" | "front" | "back" | "center" | null {
  const lower = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (
    /\b(front|first rows?|near the screen|close to (the )?screen)\b/i.test(
      lower,
    )
  ) {
    return "front";
  }
  if (
    /\b(back|rear|last rows?|further back|far from (the )?screen)\b/i.test(
      lower,
    )
  ) {
    return "back";
  }
  if (/\b(center|centre|horizontal center|dead center)\b/i.test(lower)) {
    return "center";
  }
  if (/\b(middle|mid|center rows?|middle rows?)\b/i.test(lower)) {
    return "middle";
  }
  return null;
}

// ---------- Rule-based engine ----------

export function ruleBasedRespond(
  userText: string,
  state: BookingState,
  movies: Movie[],
): AssistantResponse {
  const text = userText.trim();
  if (!text) {
    return { text: "I didn't catch that. Could you say that again?" };
  }

  if (
    (["tickets", "seats", "review", "confirmed"].includes(state.step) &&
      /^(?:why|what|how|did|do|does|is|are|was|were|haven't|hasn't)\b/i.test(
        text,
      )) ||
    /\b(?:do not|don't|dont|never)\s+(?:change|update|confirm|book|cancel|reset)\b/i.test(
      text,
    )
  ) {
    if (/hear|listen|microphone|voice/i.test(text))
      return {
        text: "Yes—select Speak to dictate a message, Stop when finished, then check the text and select Send. You can also type or use the buttons.",
      };
    if (/price|cost|total|much/i.test(text) && state.ticketCount)
      return {
        text: `Your ${formatBreakdownSummary(state.ticketBreakdown)} total $${computeTicketPrice(state.ticketBreakdown).toFixed(2)}. I haven’t changed your booking.`,
      };
    return {
      text: `Your booking currently has ${state.ticketCount ? `${formatBreakdownSummary(state.ticketBreakdown)} (${state.ticketCount} tickets)` : "no tickets selected yet"}${state.seats.length ? ` and seats ${state.seats.map((s) => `${s.row}${s.col}`).join(", ")}` : ""}. I haven’t changed anything. Use Edit tickets to change quantities, or tell me the seats you want.`,
    };
  }

  // Global commands
  if (
    /^(?:please\s+)?(?:restart|start over|cancel(?: booking| my booking)?|reset|begin again)[.!?]?$/i.test(
      text,
    )
  ) {
    return {
      text: "No problem! Let's start fresh. First, please choose your theater location.",
      action: { type: "restart" },
    };
  }
  const wantsChange =
    /^(?:please\s+)?(?:change|edit|update|make|set)\b/i.test(text) &&
    contains(text, "movie", "date", "showtime", "time", "ticket", "seat");
  if (
    wantsChange ||
    contains(text, "go back", "previous", "back up", "change my")
  ) {
    if (contains(text, "movie"))
      return {
        text:
          "Sure, which movie would you like instead?\n" + listMovies(movies),
        action: { type: "go_back" },
      };
    if (contains(text, "date"))
      return {
        text: "No problem. Which date works better for you?",
        action: { type: "go_back" },
      };
    if (contains(text, "showtime", "time"))
      return {
        text: "Sure, which showtime would you prefer?",
        action: { type: "go_back" },
      };
    if (contains(text, "ticket")) {
      const parsed = parseTicketBreakdown(text);
      if (parsed && parsed.total >= 1 && parsed.total <= 10) {
        return {
          text: `Got it — updated to ${formatBreakdownSummary(parsed.breakdown)}. Let's pick your seats.`,
          action: {
            type: "set_tickets",
            count: parsed.total,
            breakdown: parsed.breakdown,
          },
        };
      }
      return {
        text: "How many tickets would you like? You can specify age groups like '2 adult 4 child' or 'adult 2'.",
        action: { type: "go_back" },
      };
    }
    if (contains(text, "seat"))
      return {
        text: "Which seats would you like instead? Just tell me the row and number, like A5 or B3.",
        action: { type: "go_back" },
      };
    return { text: "Sure, let's go back a step.", action: { type: "go_back" } };
  }
  if (
    state.step === "showtime" &&
    state.movie?.showtimes?.length === 0 &&
    contains(text, "another", "different", "other", "next", "change", "date")
  ) {
    return {
      text: "No problem. Let’s choose a date that has available showtimes.",
      action: { type: "go_back" },
    };
  }

  switch (state.step) {
    case "greeting": {
      // The user may name a movie straight away while still on the landing step.
      const direct = findMovie(text, movies);
      if (direct && movies.length) {
        return {
          text: `Great choice! ${direct.title} — ${direct.genre}, rated ${direct.rating}. What day would you like to see it?`,
          action: { type: "select_movie", movieId: direct.id },
        };
      }
      if (
        contains(
          text,
          "what else can you do",
          "what can you do",
          "help",
          "how does this work",
        )
      ) {
        return {
          text: "I can help you browse movies, choose a date and showtime, select the number of tickets, find recommended seats, review your booking, and confirm it. You can type or use the microphone. What would you like to do first?",
        };
      }
      if (
        contains(
          text,
          "what movies",
          "movies",
          "list",
          "options",
          "playing",
          "show me",
        )
      ) {
        return {
          text: `Here are the movies currently showing:\n${listMovies(movies)}\nYou can choose a movie by title, genre, or number.`,
        };
      }
      if (
        contains(
          text,
          "hello",
          "hey",
          "hi",
          "good morning",
          "good afternoon",
          "good evening",
        )
      ) {
        return {
          text: `Hi! I can help you book movie tickets. Here are the current options:\n${listMovies(movies)}\nWhich movie would you like to see?`,
        };
      }
      return {
        text: `Welcome to Cinevea! I'm your booking assistant. I can help you book movie tickets by voice or text. Which movie would you like to see? Here are the options:\n${listMovies(movies)}`,
        action: { type: "advance", to: "movie" },
      };
    }

    case "movie": {
      const movie = findMovie(text, movies);
      if (movie) {
        return {
          text: `Great choice! ${movie.title} — ${movie.genre}, rated ${movie.rating}, ${movie.duration} minutes. ${movie.description} What day would you like to see it? I have showtimes for the next 7 days, starting today.`,
          action: { type: "select_movie", movieId: movie.id },
        };
      }
      if (contains(text, "list", "options", "what movies", "show me")) {
        return {
          text: `Here are the movies currently showing:\n${listMovies(movies)}`,
        };
      }
      return {
        text: `I couldn't find that movie. Here are the available options:\n${listMovies(movies)}\nYou can say the title, the genre, or the number.`,
      };
    }

    case "date": {
      const date = findDate(text, state.movie);
      if (date) {
        const dates = getDates();
        const dInfo = dates.find((d) => d.value === date);
        const [y, m, d] = date.split("-").map(Number);
        const dtObj = new Date(y, m - 1, d, 12, 0, 0);
        const weekday =
          dInfo?.weekday ??
          dtObj.toLocaleDateString("en-US", { weekday: "short" });
        const monthShort = dtObj.toLocaleDateString("en-US", {
          month: "short",
        });
        const label = dInfo?.label ?? `${monthShort} ${d}`;
        const dateScopedMovie = state.movie
          ? {
              ...state.movie,
              showtimes: (state.movie.showtimesByDate?.[date] ?? []).map(
                (entry) => entry.time,
              ),
            }
          : null;
        return {
          text: `Perfect — ${weekday}, ${label}. ${dateScopedMovie ? listShowtimes(dateScopedMovie) : "There are no available showtimes on the selected date."}`,
          action: { type: "select_date", date },
        };
      }
      const dates = getDates();
      const sample = dates
        .slice(0, 3)
        .map((d) => `"${d.label}"`)
        .join(", ");
      return {
        text: `I didn't catch the date. You can say "today", "tomorrow", a weekday like "Friday", a date like ${sample}, or a day number. Which day works for you?`,
      };
    }

    case "showtime": {
      if (!state.movie?.showtimes.length) {
        if (
          contains(
            text,
            "another",
            "different",
            "other",
            "next",
            "change",
            "date",
          )
        ) {
          return {
            text: "No problem. Let’s choose a date that has available showtimes.",
            action: { type: "go_back" },
          };
        }
        return {
          text: "There are no available showtimes for the selected date. Say “change date” or “choose another date” to continue.",
        };
      }
      const st = findShowtime(text, state.movie);
      if (st) {
        return {
          text: `Got it — ${st} showtime. How many tickets would you like? You can book up to 10 tickets.`,
          action: { type: "select_showtime", showtime: st },
        };
      }
      return {
        text: `I didn't catch that showtime. ${listShowtimes(state.movie!)}`,
      };
    }

    case "tickets": {
      const parsed = parseTicketBreakdown(text);
      if (parsed) {
        if (parsed.total > 10) {
          return {
            text: "I can only book up to 10 tickets at a time. How many tickets would you like?",
          };
        }
        if (parsed.total >= 1) {
          const summary = formatBreakdownSummary(parsed.breakdown);
          return {
            text: `Got it — ${summary} (${parsed.total} ticket${parsed.total > 1 ? "s" : ""} total). Now let's pick your seats. Choose ${parsed.total} seats on the map, or tell me seat labels such as “H6, H7 and H8”. Your ticket types will stay the same.`,
            action: {
              type: "set_tickets",
              count: parsed.total,
              breakdown: parsed.breakdown,
            },
          };
        }
      }
      return {
        text: "How many tickets would you like? You can say a number from 1 to 10, or specify age groups like '2 adult 4 child' or 'adult 2'.",
      };
    }

    case "seats": {
      // Check if user asks for an alternative seat recommendation
      if (
        contains(
          text,
          "view alternate",
          "view alternative",
          "show alternate",
          "show alternative",
          "see alternate",
          "see alternative",
          "alternative",
          "alternate",
          "another option",
          "other option",
          "different option",
          "next option",
          "other seats",
          "different seats",
          "another seat",
          "next alternative",
          "try different seats",
        )
      ) {
        return {
          text: "Showing alternative seats for you.",
          action: { type: "view_alternative" },
        };
      }

      const pref = parseSeatPreference(text);
      const isFindBest =
        contains(
          text,
          "find best seat",
          "find best seats",
          "select best seat",
          "select best seats",
          "pick best",
          "choose best",
          "pick for me",
          "choose for me",
          "any seat",
          "best seat",
          "best seats",
          "don't care",
          "whatever",
          "find seats",
          "pick seats",
        ) ||
        (pref !== null &&
          contains(
            text,
            "seat",
            "seats",
            "prefer",
            "preference",
            "pick",
            "find",
            "choose",
            "get",
            "row",
            "rows",
          ));

      // 1. Check if user wants both find/select best seats AND review
      if (
        (isFindBest &&
          contains(
            text,
            "review",
            "move forward",
            "continue",
            "proceed",
            "next",
          )) ||
        contains(
          text,
          "select best seats and review",
          "find best seats and review",
        )
      ) {
        return {
          text: "I’ll suggest seats first. Check the selection, then select Review booking.",
          action: {
            type: "select_seats",
            seats: [],
            preference: pref ?? undefined,
          },
        };
      }

      // 2. Check if user wants to review booking / move forward
      if (
        contains(
          text,
          "review booking",
          "review my booking",
          "review",
          "move forward",
          "proceed",
          "continue",
          "next",
          "confirm seats",
          "go to review",
        )
      ) {
        return {
          text: "Let's review your booking.",
          action: { type: "review_booking" },
        };
      }

      const seats = parseSeats(text);
      if (seats) {
        if (seats.length !== state.ticketCount)
          return {
            text: `Your booking is still ${formatBreakdownSummary(state.ticketBreakdown)} (${state.ticketCount} tickets). I heard ${seats.join(", ")}. Please choose ${state.ticketCount} seats; I haven’t changed your tickets.`,
          };
        return {
          text: `I heard ${seats.join(", ")}. I’ll check availability for your ${state.ticketCount} tickets.`,
          action: { type: "select_seats", seats },
        };
      }
      // Outside the ticket step, only an explicit change request can alter quantities.
      const ticketsCheck = isExplicitTicketChange(text)
        ? parseTicketBreakdown(text)
        : null;
      if (ticketsCheck && ticketsCheck.total >= 1) {
        if (ticketsCheck.total > 10)
          return {
            text: "You can book up to 10 tickets. Your current tickets have not changed.",
          };
        return {
          text: `Updated to ${formatBreakdownSummary(ticketsCheck.breakdown)} (${ticketsCheck.total} tickets). Choose your seats next.`,
          action: {
            type: "set_tickets",
            count: ticketsCheck.total,
            breakdown: ticketsCheck.breakdown,
          },
        };
      }
      // 4. Check if user asks to find/select best seats or states seat preference
      if (isFindBest || pref !== null) {
        const prefLabel = pref
          ? ` with preference for ${pref === "front" ? "front rows" : pref === "back" ? "back rows" : pref === "center" ? "horizontal center" : "middle rows"}`
          : "";
        return {
          text: `Finding the best available seats${prefLabel} for you. Say 'review booking' when you're ready to proceed, or choose different seats on the map.`,
          action: {
            type: "select_seats",
            seats: [],
            preference: pref ?? undefined,
          },
        };
      }
      return {
        text: `I didn't catch those seat numbers. You can say seat numbers like "A5" or "B3 and B4", specify preferences like "middle", "front", or "back", or say "review booking" to continue.`,
      };
    }

    case "review": {
      const paymentChoice = parsePaymentChoice(text);
      if (paymentChoice) {
        return {
          text: `Payment method set to ${paymentChoice === "venue" ? "pay at venue" : "card payment"}. Say "confirm booking" to complete your reservation.`,
          action: { type: "select_payment", paymentMethod: paymentChoice },
        };
      }
      if (
        /\b(?:pay\s*at\s*venue\s*or\s*card|payment\s*options?|what\s*(?:are\s*the\s*)?payment\s*options?)\b/i.test(
          text,
        )
      ) {
        return {
          text: "We accept two demonstration payment options: pay at venue or card payment simulation. Which one would you like to use?",
        };
      }
      if (
        /^(?:yes(?: please)?|confirm(?: (?:my )?booking)?|looks good|correct|that's right|book it|done|perfect)[.!?]?$/i.test(
          text,
        )
      ) {
        return {
          text: `Wonderful! Your booking is confirmed. Here's your ticket — enjoy the show! Would you like to book another movie?`,
          action: { type: "confirm_booking" },
        };
      }
      if (
        contains(
          text,
          "change",
          "no",
          "wrong",
          "incorrect",
          "edit",
          "different",
        )
      ) {
        return {
          text: "No problem — what would you like to change? You can say 'change movie', 'change date', 'change showtime', 'change tickets', or 'change seats'.",
        };
      }
      return {
        text: "Would you like to confirm this booking, or would you like to change something? You can say 'confirm' or 'change'.",
      };
    }

    case "confirmed": {
      if (
        contains(text, "yes", "another", "sure", "book again", "new booking")
      ) {
        return {
          text: "Let's book another movie! First, please choose your theater location.",
          action: { type: "restart" },
        };
      }
      if (contains(text, "no", "that's all", "done", "goodbye", "bye")) {
        return {
          text: "Thank you for using Cinevea! Enjoy your movie. You can start a new booking anytime.",
        };
      }
      return {
        text: "Would you like to book another movie, or are you all set?",
      };
    }

    default:
      return { text: "I'm not sure what you mean. Could you rephrase that?" };
  }
}

const ACTION_TYPES = new Set([
  "select_movie",
  "select_date",
  "select_showtime",
  "set_tickets",
  "select_seats",
  "view_alternative",
  "review_booking",
  "confirm_booking",
  "go_back",
  "restart",
]);

/**
 * Splits an LLM reply into display text and (at most one) action.
 * Every `ACTION: {...}` line is stripped from the text; the first one that
 * parses and has a known type is returned.
 */
export function parseAssistantReply(content: string): AssistantResponse {
  let action: AssistantAction | undefined;
  const lines = content.split("\n").filter((line) => {
    const match = line.match(/^\s*ACTION:\s*(\{.*\})\s*$/i);
    if (!match) return true;
    if (!action) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed && ACTION_TYPES.has(parsed.type))
          action = parsed as AssistantAction;
      } catch {
        // malformed action: drop the line, keep the conversational text
      }
    }
    return false;
  });
  return { text: lines.join("\n").trim(), action };
}

/**
 * Asks the AI assistant for a reply. `dates` is the list of bookable dates
 * (YYYY-MM-DD) so the model never has to guess what "tomorrow" means.
 * Any failure falls back to the rule-based engine so the chat never dead-ends.
 */
export async function aiRespond(
  userText: string,
  state: BookingState,
  history: ChatMessage[],
  movies: Movie[],
): Promise<AssistantResponse> {
  if (["tickets", "seats", "review", "confirmed"].includes(state.step)) {
    return ruleBasedRespond(userText, state, movies);
  }
  if (!supabase) {
    return ruleBasedRespond(userText, state, movies);
  }

  try {
    const dates = getDates();
    const { data, error } = await supabase.functions.invoke("chat", {
      body: {
        userText,
        state: {
          step: state.step,
          movieId: state.movie?.id ?? null,
          movie: state.movie?.title ?? null,
          date: state.date,
          showtime: state.showtime,
          ticketCount: state.ticketCount,
          ticketBreakdown: state.ticketBreakdown,
          seats: state.seats.map((s) => `${s.row}${s.col}`),
        },
        history: history.slice(-10).map(({ role, text }) => ({ role, text })),
        // Ground the model in exactly what the UI can book right now.
        catalog: {
          today: dates[0].value,
          dates: dates.map((d) => d.value),
          dateLabels: dates.map((d) => ({
            value: d.value,
            label: d.label,
            weekday: d.weekday,
          })),
          movies: movies.slice(0, 20).map((m) => ({
            id: m.id,
            title: m.title,
            genre: m.genre,
            rating: m.rating,
            showtimesByDate: Object.fromEntries(
              Object.entries(m.showtimesByDate ?? {}).map(([date, list]) => [
                date,
                list.map((entry) => entry.time),
              ]),
            ),
          })),
        },
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    const content = data?.text;
    if (typeof content !== "string" || !content.trim())
      throw new Error("Chat function returned no response.");

    const reply = parseAssistantReply(content);
    if (!reply.text && !reply.action)
      throw new Error("Chat function returned an empty reply.");
    return reply;
  } catch (error) {
    console.warn("AI chat unavailable, using rule-based assistant:", error);
    return ruleBasedRespond(userText, state, movies);
  }
}
