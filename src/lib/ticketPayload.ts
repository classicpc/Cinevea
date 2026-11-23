export function ticketPayload(reference: string): string {
  // Plain data, not a pretend cinema verification URL or a credential.
  return JSON.stringify({
    format: "cinevea.prototype-ticket.v1",
    reference,
    prototype: true,
  });
}
