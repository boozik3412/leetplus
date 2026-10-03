import {
  forwardGuestSupportTickets,
  guestTicketNumberOrNull,
  privateJson,
} from "@/lib/guest-support-tickets-bff";
import { projectGuestSupportTicketThread } from "@/lib/guest-support-tickets";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketNumber: string }> },
) {
  const ticketNumber = guestTicketNumberOrNull((await params).ticketNumber);
  if (!ticketNumber) {
    return privateJson({ message: "Обращение не найдено." }, 404);
  }
  return forwardGuestSupportTickets({
    method: "GET",
    ticketNumber,
    project: projectGuestSupportTicketThread,
  });
}
