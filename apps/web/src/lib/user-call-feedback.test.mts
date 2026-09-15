import assert from "node:assert/strict";
import test from "node:test";
import {
  formatUserCallRemaining,
  getUserCallFeedback,
  getUserCallRemainingSeconds,
} from "./user-call-feedback.ts";

const deadline = "2026-09-15T10:00:00.000Z";
const deadlineMs = Date.parse(deadline);

test("calculates a rounded-up remaining time and stops exactly at the deadline", () => {
  assert.equal(getUserCallRemainingSeconds(deadline, deadlineMs), 0);
  assert.equal(getUserCallRemainingSeconds(deadline, deadlineMs - 1), 1);
  assert.equal(getUserCallRemainingSeconds(deadline, deadlineMs - 1_001), 2);
  assert.equal(getUserCallRemainingSeconds(deadline, deadlineMs + 1), 0);
});

test("rejects invalid deadlines and invalid clocks", () => {
  assert.equal(getUserCallRemainingSeconds("not-a-date", deadlineMs), null);
  assert.equal(getUserCallRemainingSeconds(deadline, Number.NaN), null);
});

test("projects a local clock skip past the deadline as expired", () => {
  assert.deepEqual(
    getUserCallFeedback({
      status: "PENDING",
      expiresAt: deadline,
      now: deadlineMs + 10_000,
      pollError: "network timeout",
    }),
    {
      remainingSeconds: 0,
      canCall: false,
      title: "Время на звонок истекло",
      message: "Этот вход по звонку больше не действует. Создайте новый вход.",
      tone: "expired",
    },
  );
});

test("keeps confirmation authoritative even if the local clock says the deadline passed", () => {
  const feedback = getUserCallFeedback({
    status: "CONFIRMED",
    expiresAt: deadline,
    now: deadlineMs + 10_000,
    pollError: "backend token: should not be shown",
    statusMessage: "raw provider response",
  });

  assert.equal(feedback.remainingSeconds, 0);
  assert.equal(feedback.canCall, false);
  assert.equal(feedback.title, "Звонок подтверждён");
  assert.equal(feedback.tone, "confirmed");
  assert.doesNotMatch(feedback.message, /provider|token/i);
});

test("keeps a failed challenge distinct from expiry", () => {
  const feedback = getUserCallFeedback({
    status: "FAILED",
    expiresAt: deadline,
    now: deadlineMs - 30_000,
    statusMessage: "provider failure details",
  });

  assert.equal(feedback.remainingSeconds, 30);
  assert.equal(feedback.canCall, false);
  assert.equal(feedback.tone, "error");
  assert.equal(feedback.title, "Не удалось подтвердить звонок");
  assert.doesNotMatch(feedback.message, /provider/i);
});

test("makes an invalid deadline a safe non-callable error", () => {
  assert.deepEqual(
    getUserCallFeedback({
      status: "PENDING",
      expiresAt: "invalid",
      now: deadlineMs,
      pollError: "internal response body",
    }),
    {
      remainingSeconds: null,
      canCall: false,
      title: "Не удалось проверить срок звонка",
      message: "Не удалось определить срок действия входа по звонку. Создайте новый вход.",
      tone: "error",
    },
  );
});

test("recovers from a transient polling error while the challenge remains callable", () => {
  const errored = getUserCallFeedback({
    status: "PENDING",
    expiresAt: deadline,
    now: deadlineMs - 61_000,
    pollError: "upstream 502 with secret value",
    statusMessage: "raw backend text",
  });
  const recovered = getUserCallFeedback({
    status: "PENDING",
    expiresAt: deadline,
    now: deadlineMs - 61_000,
  });

  assert.equal(errored.remainingSeconds, 61);
  assert.equal(errored.canCall, true);
  assert.equal(errored.title, "Не удалось проверить звонок");
  assert.equal(errored.tone, "error");
  assert.doesNotMatch(errored.message, /secret|backend|502/i);
  assert.equal(recovered.canCall, true);
  assert.equal(recovered.title, "Ожидаем звонок");
  assert.equal(recovered.tone, "pending");
});

test("formats the countdown as minutes and seconds", () => {
  assert.equal(formatUserCallRemaining(0), "00:00");
  assert.equal(formatUserCallRemaining(61), "01:01");
  assert.equal(formatUserCallRemaining(3_661), "61:01");
});

test("shows a provider status-check failure carried by a successful HTTP response", () => {
  const feedback = getUserCallFeedback({status:"PENDING",expiresAt:deadline,now:deadlineMs-30_000,
    statusMessage:"Проверка звонка временно недоступна. Страница повторит запрос автоматически."});
  assert.equal(feedback.tone,"error");
  assert.equal(feedback.canCall,true);
  assert.doesNotMatch(feedback.message,/вход подтвердится|следующей проверки/);
});

test("server expiry immediately disables dialing even before the local deadline", () => {
  const feedback = getUserCallFeedback({status:"EXPIRED",expiresAt:deadline,now:deadlineMs-90_000});
  assert.equal(feedback.remainingSeconds,0);
  assert.equal(feedback.canCall,false);
});
