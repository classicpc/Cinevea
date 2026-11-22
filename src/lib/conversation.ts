// Conversation engine for Cinevea.
// `aiRespond` asks the `chat` Supabase Edge Function (OpenAI) for a reply and
// falls back to the local rule-based engine (`ruleBasedRespond`) whenever the
// function is unreachable, misconfigured, or out of credits.

import {
  type Movie,
  type BookingState,
  type BookingStep,
  getDates,
  SEAT_ROWS,
  SEAT_COLS,
} from "@/types";
import { supabase } from "@/lib/supabase";

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
  | { type: "set_tickets"; count: number }
  | { type: "select_seats"; seats: string[] }
  | { type: "confirm_booking" }
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
    if (w.length <= 3 && !w.includes(" ")) return new RegExp(`\\b${w}\\b`).test(lower);
    return lower.includes(w);
  });
}

function extractNumber(text: string): number | null {
  const lower = text.toLowerCase();
  const wordMap: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  // Digits win over words; words must be whole words ("someone" is not "one").
  const match = lower.match(/\d+/);
  if (match) return parseInt(match[0], 10);
  for (const [word, num] of Object.entries(wordMap)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return num;
  }
  return null;
}

function findMovie(text: string, movies: Movie[]): Movie | null {
  const lower = text.toLowerCase();
  // exact title match first
  for (const m of movies) {
    if (lower.includes(m.title.toLowerCase())) return m;
  }
  // genre-based match
  for (const m of movies) {
    if (contains(text, m.genre.toLowerCase())) return m;
  }
  // ordinal/number match: "first movie", "movie 2", "number 3"
  const ordinalWords = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
  for (let i = 0; i < ordinalWords.length; i++) {
    if (lower.includes(`${ordinalWords[i]} movie`)) return movies[i] ?? null;
  }
  const numberMatch = lower.match(/(?:movie|number)\s+(\d+)/);
  if (numberMatch) {
    const index = parseInt(numberMatch[1], 10) - 1;
    return movies[index] ?? null;
  }
  const bareNumber = lower.match(/^\s*(\d{1,2})\s*(?:movie|film)?\s*[.!?]?\s*$/);
  if (bareNumber) {
    const index = parseInt(bareNumber[1], 10) - 1;
    return movies[index] ?? null;
  }
  return null;
}

function findDate(text: string): string | null {
  const dates = getDates();
  const lower = text.toLowerCase();
  if (contains(text, "today")) {
    return dates[0].value;
  }
  if (contains(text, "tomorrow")) {
    return dates[1].value;
  }

  // Match exact ISO dates and the labels displayed in the date picker.
  for (const dt of dates) {
    const [year, month, day] = dt.value.split("-").map((part) => parseInt(part, 10));
    const date = new Date(year, month - 1, day);
    const monthLabels = [
      ["jan", "january"], ["feb", "february"], ["mar", "march"], ["apr", "april"],
      ["may"], ["jun", "june"], ["jul", "july"], ["aug", "august"],
      ["sep", "sept", "september"], ["oct", "october"], ["nov", "november"], ["dec", "december"],
    ];
    const names = monthLabels[date.getMonth()];
    if (
      lower.includes(dt.value)
      || lower.includes(dt.label.toLowerCase())
      || names.some((name) => lower.includes(`${name} ${day}`) || lower.includes(`${name}-${day}`))
      || lower.includes(`${month}/${day}`)
    ) {
      return dt.value;
    }
  }

  // Match both short and full weekday names against the displayed dates.
  for (const dt of dates) {
    const date = new Date(`${dt.value}T12:00:00`);
    const fullWeekday = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    if (lower.includes(dt.weekday.toLowerCase()) || lower.includes(fullWeekday)) {
      return dt.value;
    }
  }

  // Match a bare day number or ordinal only when it is one of the displayed dates.
  const dayMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dayMatch) {
    const day = parseInt(dayMatch[1], 10);
    const match = dates.find((dt) => parseInt(dt.value.split("-")[2], 10) === day);
    if (match) return match.value;
  }

  // Numbered date options are also accepted (1 through 7).
  const num = extractNumber(text);
  if (num && num >= 1 && num <= 7) {
    const explicitOption = lower.match(/\b(?:date|day|option)\s*(\d)\b/);
    if (explicitOption) return dates[parseInt(explicitOption[1], 10) - 1]?.value ?? null;
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
    const af = movie.showtimes.find((s) => s.includes("PM") && parseInt(s) >= 12 && parseInt(s) < 17);
    if (af) return af;
  }
  if (contains(text, "evening", "night", "last show")) {
    const ev = movie.showtimes.find((s) => parseInt(s) >= 18);
    if (ev) return ev;
  }
  return null;
}

function parseSeats(text: string): string[] | null {
  const lower = text.toUpperCase().replace(/\s+/g, " ").trim();
  // match patterns like A1, B5, etc
  const matches = lower.matchAll(/([A-H])(\d{1,2})/g);
  const seats: string[] = [];
  for (const m of matches) {
    const row = m[1];
    const col = parseInt(m[2], 10);
    if (SEAT_ROWS.includes(row) && col >= 1 && col <= SEAT_COLS) {
      seats.push(`${row}${col}`);
    }
  }
  return seats.length > 0 ? seats : null;
}

function listMovies(movies: Movie[]): string {
  if (!movies.length) return "There are no movies currently available to book.";
  return movies.map((m, i) => `${i + 1}. ${m.title} — ${m.genre}, ${m.rating}`).join("\n");
}

function listShowtimes(movie: Movie): string {
  if (!movie.showtimes.length) {
    return `There are no available showtimes for ${movie.title} on the selected date.`;
  }
  return `Available showtimes for ${movie.title} are: ${movie.showtimes.join(", ")}.`;
}

// ---------- Rule-based engine ----------

export function ruleBasedRespond(
  userText: string,
  state: BookingState,
  movies: Movie[]
): AssistantResponse {
  const text = userText.trim();
  if (!text) {
    return { text: "I didn't catch that. Could you say that again?" };
  }

  // Global commands
  if (contains(text, "restart", "start over", "cancel", "reset", "begin again")) {
    return {
      text: "No problem! Let's start fresh. Which movie would you like to see? Here are the options:\n" + listMovies(movies),
      action: { type: "restart" },
    };
  }
  const wantsChange = contains(text, "change") && contains(text, "movie", "date", "showtime", "time", "ticket", "seat");
  if (wantsChange || contains(text, "go back", "previous", "back up", "change my")) {
    if (contains(text, "movie")) return { text: "Sure, which movie would you like instead?\n" + listMovies(movies), action: { type: "go_back" } };
    if (contains(text, "date")) return { text: "No problem. Which date works better for you?", action: { type: "go_back" } };
    if (contains(text, "showtime", "time")) return { text: "Sure, which showtime would you prefer?", action: { type: "go_back" } };
    if (contains(text, "ticket")) return { text: "How many tickets would you like?", action: { type: "go_back" } };
    if (contains(text, "seat")) return { text: "Which seats would you like instead? Just tell me the row and number, like A5 or B3.", action: { type: "go_back" } };
    return { text: "Sure, let's go back a step.", action: { type: "go_back" } };
  }
  if (
    state.step === "showtime"
    && state.movie?.showtimes?.length === 0
    && contains(text, "another", "different", "other", "next", "change", "date")
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
      if (contains(text, "what else can you do", "what can you do", "help", "how does this work")) {
        return {
          text: "I can help you browse movies, choose a date and showtime, select the number of tickets, find recommended seats, review your booking, and confirm it. You can type or use the microphone. What would you like to do first?",
        };
      }
      if (contains(text, "what movies", "movies", "list", "options", "playing", "show me")) {
        return {
          text: `Here are the movies currently showing:\n${listMovies(movies)}\nYou can choose a movie by title, genre, or number.`,
        };
      }
      if (contains(text, "hello", "hey", "hi", "good morning", "good afternoon", "good evening")) {
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
        return { text: `Here are the movies currently showing:\n${listMovies(movies)}` };
      }
      return {
        text: `I couldn't find that movie. Here are the available options:\n${listMovies(movies)}\nYou can say the title, the genre, or the number.`,
      };
    }

    case "date": {
      const date = findDate(text);
      if (date) {
        const dates = getDates();
        const dInfo = dates.find((d) => d.value === date);
        const dateScopedMovie = state.movie
          ? {
              ...state.movie,
              showtimes: (state.movie.showtimesByDate?.[date] ?? []).map((entry) => entry.time),
            }
          : null;
        return {
          text: `Perfect — ${dInfo?.weekday}, ${dInfo?.label}. ${dateScopedMovie ? listShowtimes(dateScopedMovie) : "There are no available showtimes on the selected date."}`,
          action: { type: "select_date", date },
        };
      }
      return {
        text: `I didn't catch the date. You can say "today", "tomorrow", a weekday like "Friday", or a date like "November 20". Which day works for you?`,
      };
    }

    case "showtime": {
      if (!state.movie?.showtimes.length) {
        if (contains(text, "another", "different", "other", "next", "change", "date")) {
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
      const num = extractNumber(text);
      if (num && num >= 1 && num <= 10) {
        return {
          text: `Got it — ${num} ticket${num > 1 ? "s" : ""}. Now let's pick your seats. The theater has rows A through H, 12 seats per row. You can say seat numbers like "A5" or "B3 and B4", or say "pick for me" and I'll select the best available seats.`,
          action: { type: "set_tickets", count: num },
        };
      }
      if (num && num > 10) {
        return { text: "I can only book up to 10 tickets at a time. How many tickets would you like?" };
      }
      return { text: "How many tickets would you like? You can say a number from 1 to 10." };
    }

    case "seats": {
      if (contains(text, "pick for me", "choose for me", "any seat", "best seat", "don't care", "whatever")) {
        return {
          text: `Let me pick some great seats for you. I've selected the best available seats in the middle of the theater. Does that work for you, or would you like to change them?`,
          action: { type: "select_seats", seats: [] }, // empty = auto-pick signal
        };
      }
      const seats = parseSeats(text);
      if (seats) {
        if (seats.length !== state.ticketCount) {
          return {
            text: `You asked for ${state.ticketCount} ticket${state.ticketCount > 1 ? "s" : ""}, but selected ${seats.length} seat${seats.length > 1 ? "s" : ""}. Please choose ${state.ticketCount} seat${state.ticketCount > 1 ? "s" : ""}. You said: ${seats.join(", ")}.`,
          };
        }
        return {
          text: `Seats ${seats.join(", ")} — got it! Here's your booking summary. Would you like to confirm, or would you like to change anything?`,
          action: { type: "select_seats", seats },
        };
      }
      return {
        text: `I didn't catch those seat numbers. You can say a seat like "A5" or multiple like "B3, B4, and B5". Or say "pick for me" and I'll choose the best available seats.`,
      };
    }

    case "review": {
      if (contains(text, "confirm", "yes", "looks good", "correct", "that's right", "book it", "done", "perfect")) {
        return {
          text: `Wonderful! Your booking is confirmed. Here's your ticket — enjoy the show! Would you like to book another movie?`,
          action: { type: "confirm_booking" },
        };
      }
      if (contains(text, "change", "no", "wrong", "incorrect", "edit", "different")) {
        return {
          text: "No problem — what would you like to change? You can say 'change movie', 'change date', 'change showtime', 'change tickets', or 'change seats'.",
        };
      }
      return {
        text: "Would you like to confirm this booking, or would you like to change something? You can say 'confirm' or 'change'.",
      };
    }

    case "confirmed": {
      if (contains(text, "yes", "another", "sure", "book again", "new booking")) {
        return {
          text: `Let's book another movie! Which one would you like to see?\n${listMovies(movies)}`,
          action: { type: "restart" },
        };
      }
      if (contains(text, "no", "that's all", "done", "goodbye", "bye")) {
        return { text: "Thank you for using Cinevea! Enjoy your movie. You can start a new booking anytime." };
      }
      return { text: "Would you like to book another movie, or are you all set?" };
    }

    default:
      return { text: "I'm not sure what you mean. Could you rephrase that?" };
  }
}

const ACTION_TYPES = new Set([
  "select_movie", "select_date", "select_showtime", "set_tickets",
  "select_seats", "confirm_booking", "go_back", "restart",
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
        if (parsed && ACTION_TYPES.has(parsed.type)) action = parsed as AssistantAction;
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
  movies: Movie[]
): Promise<AssistantResponse> {
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
              Object.entries(m.showtimesByDate ?? {}).map(([date, list]) => [date, list.map((entry) => entry.time)])
            ),
          })),
        },
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    const content = data?.text;
    if (typeof content !== "string" || !content.trim()) throw new Error("Chat function returned no response.");

    const reply = parseAssistantReply(content);
    if (!reply.text && !reply.action) throw new Error("Chat function returned an empty reply.");
    return reply;
  } catch (error) {
    console.warn("AI chat unavailable, using rule-based assistant:", error);
    return ruleBasedRespond(userText, state, movies);
  }
}
