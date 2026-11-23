import type { BookingState } from "@/types";
export const journey = [
  "Location",
  "Movie",
  "Date",
  "Time",
  "Tickets",
  "Seats",
  "Review",
  "Done",
];
export function stepIndex(step: BookingState["step"], hasLocation: boolean) {
  return step === "greeting"
    ? hasLocation
      ? 1
      : 0
    : ({
        movie: 1,
        date: 2,
        showtime: 3,
        tickets: 4,
        seats: 5,
        review: 6,
        confirmed: 7,
      }[step] ?? 0);
}
export function readableDate(value: string | null) {
  return value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "Not selected";
}
