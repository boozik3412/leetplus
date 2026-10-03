import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  projectGuestSupportTicketList,
  projectGuestSupportTicketThread,
} from "./guest-support-tickets.ts";

const sourceRoot = path.resolve(import.meta.dirname, "..");

const listItem = {
  ticketNumber: "LP-BUG-A1B2C3D4",
  topic: "GAME_MODULE",
  topicLabel: "Игровой модуль",
  status: "RESOLVED",
  statusLabel: "Решено",
  createdAt: "2026-10-01T09:00:00.000Z",
  lastActivityAt: "2026-10-02T10:00:00.000Z",
  lastReplyAt: "2026-10-02T10:00:00.000Z",
  unread: true,
};

test("projects the guest ticket list to known fields and recounts unread", () => {
  const projected = projectGuestSupportTicketList({
    tickets: [{ ...listItem, internalNote: "leak", tenantId: "tenant-a" }],
    unreadCount: 99,
  });

  assert.deepEqual(projected, {
    tickets: [
      {
        ticketNumber: "LP-BUG-A1B2C3D4",
        topicLabel: "Игровой модуль",
        status: "RESOLVED",
        statusLabel: "Решено",
        createdAt: "2026-10-01T09:00:00.000Z",
        lastActivityAt: "2026-10-02T10:00:00.000Z",
        lastReplyAt: "2026-10-02T10:00:00.000Z",
        unread: true,
      },
    ],
    unreadCount: 1,
  });
  assert.equal(
    projectGuestSupportTicketList({
      tickets: [{ ...listItem, ticketNumber: "../admin" }],
    }),
    null,
  );
  assert.equal(projectGuestSupportTicketList({ tickets: "x" }), null);
});

test("projects a thread without staff identity or unknown authors", () => {
  const thread = projectGuestSupportTicketThread({
    ticket: {
      ...listItem,
      canReply: true,
      replyReopens: true,
      canGiveFeedback: true,
      feedback: { value: "HELPED", at: "2026-10-02T11:00:00.000Z" },
    },
    messages: [
      {
        id: "comment-1",
        author: "SUPPORT",
        authorLabel: "Поддержка LeetPlus",
        body: "Начислили кейс повторно",
        createdAt: "2026-10-02T10:00:00.000Z",
        authorUser: { email: "staff@example.invalid" },
      },
    ],
  });

  assert.ok(thread);
  assert.deepEqual(Object.keys(thread.messages[0] ?? {}).sort(), [
    "author",
    "authorLabel",
    "body",
    "createdAt",
    "id",
  ]);
  assert.deepEqual(thread.ticket.feedback, {
    value: "HELPED",
    at: "2026-10-02T11:00:00.000Z",
  });
  assert.equal(
    projectGuestSupportTicketThread({
      ticket: {
        ...listItem,
        canReply: true,
        replyReopens: false,
        canGiveFeedback: false,
        feedback: null,
      },
      messages: [
        {
          id: "x",
          author: "STAFF",
          authorLabel: "Иван",
          body: "b",
          createdAt: "c",
        },
      ],
    }),
    null,
  );
});

test("keeps guest ticket routes on the guest session with strict input", async () => {
  const read = (...segments: string[]) =>
    readFile(path.join(sourceRoot, ...segments), "utf8");
  const [bff, list, thread, markRead, messages, feedback] = await Promise.all([
    read("lib", "guest-support-tickets-bff.ts"),
    read("app", "api", "guest-support", "tickets", "route.ts"),
    read(
      "app",
      "api",
      "guest-support",
      "tickets",
      "[ticketNumber]",
      "route.ts",
    ),
    read(
      "app",
      "api",
      "guest-support",
      "tickets",
      "[ticketNumber]",
      "read",
      "route.ts",
    ),
    read(
      "app",
      "api",
      "guest-support",
      "tickets",
      "[ticketNumber]",
      "messages",
      "route.ts",
    ),
    read(
      "app",
      "api",
      "guest-support",
      "tickets",
      "[ticketNumber]",
      "feedback",
      "route.ts",
    ),
  ]);

  assert.match(bff, /GUEST_AUTH_COOKIE_NAME/);
  assert.match(bff, /\/guest-portal\/session\/support\/tickets/);
  assert.match(bff, /Cache-Control": "private, no-store/);
  // Only the guest cookie is forwarded; never the staff session or raw headers.
  assert.doesNotMatch(bff, /request\.headers\.entries/);
  assert.doesNotMatch(bff, /[^_]AUTH_COOKIE_NAME/);
  assert.match(list, /projectGuestSupportTicketList/);
  for (const route of [thread, markRead, messages, feedback]) {
    assert.match(route, /guestTicketNumberOrNull/);
  }
  for (const route of [messages, feedback]) {
    assert.match(route, /guestIdempotencyKeyOrNull/);
    assert.match(route, /readGuestSupportBody/);
    assert.match(route, /projectGuestSupportTicketThread/);
  }
  assert.match(messages, /readGuestSupportBody\(request, \["body"\]\)/);
  assert.match(
    feedback,
    /readGuestSupportBody\(request, \["value", "comment"\]\)/,
  );
});

test("staff answer the guest only through the private support BFF", async () => {
  for (const scope of [
    ["support", "bug-reports"],
    ["admin", "support-tickets"],
  ]) {
    const route = await readFile(
      path.join(
        sourceRoot,
        "app",
        "api",
        ...scope,
        "[id]",
        "resolve-with-reply",
        "route.ts",
      ),
      "utf8",
    );
    assert.match(route, /proxyJsonRequest/);
    assert.match(route, /privateNoStore:\s*true/);
    assert.match(route, /forwardQuery:\s*false/);
    assert.match(route, /resolve-with-reply/);
  }

  const workspace = await readFile(
    path.join(sourceRoot, "components", "staff-support-tickets-workspace.tsx"),
    "utf8",
  );
  // Internal notes are the default; a reply to the guest is an explicit mode.
  assert.match(workspace, /composerModes\[ticket\.id\] \?\? 'INTERNAL'/);
  assert.match(workspace, /Поддержка LeetPlus/);
  assert.match(workspace, /Ответить и решить/);
});

test("puts the guest's tickets next to the bug report button", async () => {
  const [game, bugReport, tickets] = await Promise.all([
    readFile(
      path.join(sourceRoot, "app", "play", "game", "game-summary-client.tsx"),
      "utf8",
    ),
    readFile(
      path.join(sourceRoot, "components", "guest-bug-report.tsx"),
      "utf8",
    ),
    readFile(
      path.join(sourceRoot, "components", "guest-support-tickets.tsx"),
      "utf8",
    ),
  ]);

  assert.match(game, /<GuestSupportTickets \/>\s*<GuestBugReportButton/);
  assert.match(bugReport, /GUEST_SUPPORT_TICKETS_CHANGED_EVENT/);
  assert.match(tickets, /\/api\/guest-support\/tickets/);
  assert.match(tickets, /Idempotency-Key/);
  assert.match(tickets, /createPortal\(/);
});
