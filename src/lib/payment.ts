import { computeTicketPrice, type BookingState } from "@/types";
import { readableDate } from "@/lib/bookingPresentation";
export type DemoPaymentMethod = "venue" | "card_demo";
export function paymentLabel(method?: DemoPaymentMethod | null) {
  return method === "venue"
    ? "Pay at venue (demo)"
    : method === "card_demo"
      ? "Card payment (simulation)"
      : "Not selected";
}
export function parsePaymentChoice(text: string): DemoPaymentMethod | null {
  const t = text.toLowerCase().trim().replace(/[.,!?;:]/g, "");
  // Ignore negation or informational questions
  if (
    /^(?:why|what|how|do|did|is|are)\b/.test(t) ||
    /\b(?:don't|do not|not|never)\b/.test(t)
  )
    return null;

  // If user says "pay at venue or card payment options", both are mentioned, so do not choose one
  if (/\b(?:venue|cash)\b/i.test(t) && /\b(?:card|credit|debit)\b/i.test(t)) {
    return null;
  }

  // Card payment options (e.g., "card", "card payment", "card payment option", "card payment options", "use credit card", "pay with card", "card option", "debit card")
  if (
    /\b(?:card|credit\s*card|debit\s*card|simulated\s*card|card\s*payment|card\s*option|card\s*options|card\s*demo)\b/i.test(
      t,
    )
  ) {
    return "card_demo";
  }

  // Venue payment options (e.g., "pay at venue", "pay at venue option", "pay at venue options", "venue option", "venue", "pay at cinema", "cash", "pay in person", "pay at theater", "pay later")
  if (
    /\b(?:venue|pay\s*at\s*(?:the\s*)?venue|pay\s*at\s*(?:the\s*)?cinema|pay\s*at\s*(?:the\s*)?theat(?:er|re)|pay\s*in\s*person|cash|pay\s*later|venue\s*option|venue\s*options)\b/i.test(
      t,
    )
  ) {
    return "venue";
  }

  return null;
}
export function describeBooking(booking: BookingState): string {
  const tickets = Object.entries(booking.ticketBreakdown)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${n} ${name}${n === 1 ? "" : " tickets"}`)
    .join(", ");
  return `${booking.movie?.title || "No movie selected"}, ${readableDate(booking.date)}, ${booking.showtime || "no showtime"}. ${tickets || `${booking.ticketCount} tickets`}. Seats ${booking.seats.map((s) => `${s.row}${s.col}`).join(", ") || "not selected"}. Total $${computeTicketPrice(booking.ticketBreakdown).toFixed(2)}. ${booking.paymentMethod ? `Payment method: ${paymentLabel(booking.paymentMethod)}.` : "Choose a demonstration payment method: pay at venue or simulated card."}`;
}
