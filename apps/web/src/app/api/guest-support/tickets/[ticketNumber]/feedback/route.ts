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
    return privateJson({ message: "Некорректный ключ отправки оценки." }, 400);
  }
  const body = await readGuestSupportBody(request, ["value", "comment"]);
  if (!body || (body.value !== "HELPED" && body.value !== "NOT_HELPED")) {
    return privateJson({ message: "Выберите, помог ли ответ." }, 400);
  }
  return forwardGuestSupportTickets({
    method: "POST",
    ticketNumber,
    action: "feedback",
    idempotencyKey,
    body: {
      value: body.value,
      ...(body.comment ? { comment: body.comment } : {}),
    },
    project: projectGuestSupportTicketThread,
  });
}
