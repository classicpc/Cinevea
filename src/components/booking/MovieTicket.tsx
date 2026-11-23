import { paymentLabel } from "@/lib/payment";
import { QRCodeSVG } from "qrcode.react";
import { Film } from "lucide-react";
import { ticketPayload } from "@/lib/ticketPayload";
import { readableDate } from "@/lib/bookingPresentation";
import { computeTicketPrice, TICKET_TYPES, type BookingState } from "@/types";
export function MovieTicket({
  booking,
  reference,
  location,
}: {
  booking: BookingState;
  reference: string;
  location: string;
}) {
  const categories = TICKET_TYPES.filter(
    (t) => (booking.ticketBreakdown[t.code] ?? 0) > 0,
  )
    .map((t) => `${booking.ticketBreakdown[t.code]} ${t.label}`)
    .join(" · ");
  return (
    <article
      className="admission-ticket"
      aria-label="Your printable movie ticket"
    >
      <div className="ticket-main">
        <header className="ticket-brand">
          <span>
            <Film size={21} aria-hidden="true" />
            CINEVEA
          </span>
          <span className="ticket-admit">ADMIT {booking.ticketCount}</span>
        </header>
        <div className="ticket-film-strip" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <p className="ticket-kicker">A CINEVEA SCREENING EXPERIENCE</p>
        <h2 className="ticket-film">{booking.movie?.title}</h2>
        <p className="ticket-meta">
          {booking.movie?.rating} · {booking.movie?.duration} min ·{" "}
          {booking.movie?.genre}
        </p>
        <dl className="ticket-data">
          <div>
            <dt>Date</dt>
            <dd>{readableDate(booking.date)}</dd>
          </div>
          <div>
            <dt>Showtime</dt>
            <dd>{booking.showtime}</dd>
          </div>
          <div className="ticket-location">
            <dt>Location</dt>
            <dd>{location}</dd>
          </div>
          <div className="ticket-seat-block">
            <dt>Seats</dt>
            <dd>{booking.seats.map((s) => `${s.row}${s.col}`).join(" · ")}</dd>
          </div>
        </dl>
        <p className="ticket-payment">
          {paymentLabel(booking.paymentMethod)} · No charge
        </p>
        <div className="ticket-bottom">
          <p>{categories}</p>
          <strong>
            ${computeTicketPrice(booking.ticketBreakdown).toFixed(2)}
          </strong>
        </div>
        <p className="ticket-disclaimer">
          UNIVERSITY PROJECT · DEMONSTRATION TICKET · NOT VALID FOR CINEMA ENTRY
        </p>
      </div>
      <div className="ticket-stub">
        <p className="ticket-stub-label">YOUR TICKET</p>
        <QRCodeSVG
          value={ticketPayload(reference)}
          size={156}
          level="M"
          marginSize={4}
          bgColor="#ffffff"
          fgColor="#10101a"
          role="img"
          title={`QR code for prototype booking ${reference}`}
          aria-label={`QR code for prototype booking ${reference}`}
        />
        <p className="ticket-ref-label">BOOKING REFERENCE</p>
        <p className="ticket-reference">{reference}</p>
        <p className="ticket-scan-note">
          Scan to read your prototype booking reference.
        </p>
      </div>
    </article>
  );
}
