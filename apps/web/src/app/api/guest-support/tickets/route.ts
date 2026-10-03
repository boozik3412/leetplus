import { forwardGuestSupportTickets } from "@/lib/guest-support-tickets-bff";
import { projectGuestSupportTicketList } from "@/lib/guest-support-tickets";

export const runtime = "nodejs";

export async function GET() {
  return forwardGuestSupportTickets({
    method: "GET",
    project: projectGuestSupportTicketList,
  });
}
