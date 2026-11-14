// Conversation engine for Cinevea
// Uses OpenAI if an API key is configured, otherwise falls back to
// a rule-based NLU engine that fully handles the booking flow.

import { OPENAI_API_KEY, OPENAI_MODEL, isAIEnabled } from "@/config";
import {
  MOVIES,
  type Movie,
  type BookingState,
  type BookingStep,
  getDates,
  SEAT_ROWS,
  SEAT_COLS,
} from "@/types";

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

function contains(text: string, ...words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
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
  for (const [word, num] of Object.entries(wordMap)) {
    if (lower.includes(word)) return num;
  }
  const match = lower.match(/\d+/);
  if (match) return parseInt(match[0], 10);
  return null;
}

function findMovie(text: string): Movie | null {
  const lower = text.toLowerCase();
  // exact title match first
  for (const m of MOVIES) {
    if (lower.includes(m.title.toLowerCase())) return m;
  }
  // genre-based match
  for (const m of MOVIES) {
    if (contains(text, m.genre.toLowerCase())) return m;
  }
  // keywords
  const keywordMap: Record<string, string> = {
    "first movie": "m1",
    "second movie": "m2",
    "third movie": "m3",
    "fourth movie": "m4",
    "fifth movie": "m5",
    "sixth movie": "m6",
    "seventh movie": "m7",
    "movie 1": "m1",
    "movie 2": "m2",
    "movie 3": "m3",
    "movie 4": "m4",
    "movie 5": "m5",
    "movie 6": "m6",
    "movie 7": "m7",
    "number 1": "m1",
    "number 2": "m2",
    "number 3": "m3",
    "number 4": "m4",
    "number 5": "m5",
    "number 6": "m6",
    "number 7": "m7",
  };
  for (const [kw, id] of Object.entries(keywordMap)) {
    if (lower.includes(kw)) return MOVIES.find((m) => m.id === id) || null;
  }
  return null;
}

function findDate(text: string): string | null {
  const dates = getDates();
  const lower = text.toLowerCase();
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const today = new Date();
  if (contains(text, "today")) {
    return dates[0].value;
  }
  if (contains(text, "tomorrow")) {
    return dates[1].value;
  }
  // weekday match
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const wd = weekdays[d.getDay()];
    if (lower.includes(wd)) return dates[i].value;
  }
  // "nov 20", "november 20"
  for (const dt of dates) {
    const parts = dt.value.split("-"); // YYYY-MM-DD
    const monthDay = `${parseInt(parts[1])} ${parseInt(parts[2])}`;
    if (lower.includes(monthDay)) return dt.value;
  }
  const num = extractNumber(text);
  if (num && num >= 1 && num <= 7) {
    return dates[num - 1].value;
  }
  return null;
}

function findShowtime(text: string, movie: Movie | null): string | null {
  if (!movie) return null;
  const lower = text.toLowerCase().replace(/\./g, "");

  // normalize: "2 15 pm" -> "2:15 pm"
  const normalized = lower.replace(/(\d+)\s+(\d+)\s*(am|pm)/g, "$1:$2 $3");
  for (const st of movie.showtimes) {
    if (normalized.includes(st.toLowerCase().replace(".", ""))) return st;
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

function listMovies(): string {
  return MOVIES.map((m, i) => `${i + 1}. ${m.title} — ${m.genre}, ${m.rating}`).join("\n");
}

function listShowtimes(movie: Movie): string {
  return `Available showtimes for ${movie.title} are: ${movie.showtimes.join(", ")}.`;
}

// ---------- Rule-based engine ----------

export function ruleBasedRespond(
  userText: string,
  state: BookingState
): AssistantResponse {
  const text = userText.trim();
  if (!text) {
    return { text: "I didn't catch that. Could you say that again?" };
  }

  // Global commands
  if (contains(text, "restart", "start over", "cancel", "reset", "begin again")) {
    return {
      text: "No problem! Let's start fresh. Which movie would you like to see? Here are the options:\n" + listMovies(),
      action: { type: "restart" },
    };
  }
  if (contains(text, "go back", "previous", "back up", "change my")) {
    if (contains(text, "movie")) return { text: "Sure, which movie would you like instead?\n" + listMovies(), action: { type: "go_back" } };
    if (contains(text, "date")) return { text: "No problem. Which date works better for you?", action: { type: "go_back" } };
    if (contains(text, "showtime", "time")) return { text: "Sure, which showtime would you prefer?", action: { type: "go_back" } };
    if (contains(text, "ticket")) return { text: "How many tickets would you like?", action: { type: "go_back" } };
    if (contains(text, "seat")) return { text: "Which seats would you like instead? Just tell me the row and number, like A5 or B3.", action: { type: "go_back" } };
    return { text: "Sure, let's go back a step.", action: { type: "go_back" } };
  }

  switch (state.step) {
    case "greeting": {
      return {
        text: `Welcome to Cinevea! I'm your booking assistant. I can help you book movie tickets by voice or text. Which movie would you like to see? Here are the options:\n${listMovies()}`,
        action: { type: "advance", to: "movie" },
      };
    }

    case "movie": {
      const movie = findMovie(text);
      if (movie) {
        return {
          text: `Great choice! ${movie.title} — ${movie.genre}, rated ${movie.rating}, ${movie.duration} minutes. ${movie.description} What day would you like to see it? I have showtimes for the next 7 days, starting today.`,
          action: { type: "select_movie", movieId: movie.id },
        };
      }
      if (contains(text, "list", "options", "what movies", "show me")) {
        return { text: `Here are the movies currently showing:\n${listMovies()}` };
      }
      return {
        text: `I couldn't find that movie. Here are the available options:\n${listMovies()}\nYou can say the title, the genre, or the number.`,
      };
    }

    case "date": {
      const date = findDate(text);
      if (date) {
        const dates = getDates();
        const dInfo = dates.find((d) => d.value === date);
        return {
          text: `Perfect — ${dInfo?.weekday}, ${dInfo?.label}. ${listShowtimes(state.movie!)}`,
          action: { type: "select_date", date },
        };
      }
      return {
        text: `I didn't catch the date. You can say "today", "tomorrow", a weekday like "Friday", or a date like "November 20". Which day works for you?`,
      };
    }

    case "showtime": {
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
          text: `Let's book another movie! Which one would you like to see?\n${listMovies()}`,
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

// ---------- OpenAI-powered engine ----------

const SYSTEM_PROMPT = `You are Cinevea, a friendly and helpful movie booking assistant avatar. You guide users through booking movie tickets step by step: choosing a movie, date, showtime, number of tickets, seats, and then reviewing and confirming.

You are warm, clear, and encouraging. Keep responses concise (2-4 sentences). Always confirm what the user selected before moving on.

Available movies:
${JSON.stringify(MOVIES.map((m) => ({ id: m.id, title: m.title, genre: m.genre, rating: m.rating, duration: m.duration, showtimes: m.showtimes })), null, 2)}

When the user makes a selection, respond conversationally AND append a JSON action block on a new line in this exact format:
ACTION: {"type": "...", ...}

Action types:
- select_movie: {"type":"select_movie","movieId":"m1"}
- select_date: {"type":"select_date","date":"2026-11-14"}
- select_showtime: {"type":"select_showtime","showtime":"6:00 PM"}
- set_tickets: {"type":"set_tickets","count":2}
- select_seats: {"type":"select_seats","seats":["A5","A6"]}
- confirm_booking: {"type":"confirm_booking"}
- go_back: {"type":"go_back"}
- restart: {"type":"restart"}

Only emit an action when the user's intent is clear. If the user is unclear, ask for clarification without an action.
Never make up movie IDs or showtimes not in the list above.`;

export async function aiRespond(
  userText: string,
  state: BookingState,
  history: ChatMessage[]
): Promise<AssistantResponse> {
  if (!isAIEnabled()) {
    return ruleBasedRespond(userText, state);
  }

  try {
    const recentHistory = history.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.text,
    }));

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Current booking state: ${JSON.stringify({
          step: state.step,
          movie: state.movie?.title || null,
          date: state.date,
          showtime: state.showtime,
          ticketCount: state.ticketCount,
          seats: state.seats.map((s) => `${s.row}${s.col}`),
        })}`,
      },
      ...recentHistory,
      { role: "user", content: userText },
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "I'm sorry, could you repeat that?";

    // Parse action from response
    const actionMatch = content.match(/ACTION:\s*({.*})/i);
    let action: AssistantAction | undefined;
    let text = content;

    if (actionMatch) {
      try {
        action = JSON.parse(actionMatch[1]);
        text = content.replace(/ACTION:\s*{.*}/i, "").trim();
      } catch {
        // keep full text
      }
    }

    return { text, action };
  } catch {
    // fall back to rule-based
    return ruleBasedRespond(userText, state);
  }
}
