import {
  forwardGuestSupportTickets,
  guestTicketNumberOrNull,
  privateJson,
} from "@/lib/guest-support-tickets-bff";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ ticketNumber: string }> },
) {
  const ticketNumber = guestTicketNumberOrNull((await params).ticketNumber);
  if (!ticketNumber) {
    return privateJson({ message: "Обращение не найдено." }, 404);
  }
  return forwardGuestSupportTickets({
    method: "POST",
    ticketNumber,
    action: "read",
    project: (value) =>
      value && typeof value === "object" && "ok" in value && value.ok === true
        ? { ok: true as const }
        : null,
  });
}
