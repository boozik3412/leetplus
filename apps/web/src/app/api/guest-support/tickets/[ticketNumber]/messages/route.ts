import {
  forwardGuestSupportTickets,
  guestIdempotencyKeyOrNull,
  guestTicketNumberOrNull,
  privateJson,
  readGuestSupportBody,
} from "@/lib/guest-support-tickets-bff";
import { projectGuestSupportTicketThread } from "@/lib/guest-support-tickets";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketNumber: string }> },
) {
  const ticketNumber = guestTicketNumberOrNull((await params).ticketNumber);
  if (!ticketNumber) {
    return privateJson({ message: "Обращение не найдено." }, 404);
  }
  const idempotencyKey = guestIdempotencyKeyOrNull(request);
  if (!idempotencyKey) {
    return privateJson(
      { message: "Некорректный ключ отправки сообщения." },
      400,
    );
  }
  const body = await readGuestSupportBody(request, ["body"]);
  if (!body || typeof body.body !== "string") {
    return privateJson(
      { message: "Сообщение содержит недопустимые поля." },
      400,
    );
  }
  return forwardGuestSupportTickets({
    method: "POST",
    ticketNumber,
    action: "messages",
    idempotencyKey,
    body: { body: body.body },
    project: projectGuestSupportTicketThread,
  });
}
