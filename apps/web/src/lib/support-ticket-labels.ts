import type { SupportTicketTopic } from "./staff-support-tickets";

// Client-safe: staff-support-tickets.ts itself imports the server-only API
// helpers, so browser components take labels from here.
export const supportTicketTopicLabels: Record<SupportTicketTopic, string> = {
  GAME_MODULE: "Игровой модуль",
  MISSIONS_AND_BATTLE_PASS: "Задания и боевой пропуск",
  LOOT_BOXES_AND_REWARDS: "Лутбоксы и награды",
  BALANCE_AND_PAYMENTS: "Баланс и платежи",
  AUTH_AND_PROFILE: "Авторизация и профиль",
  INTERFACE_AND_DISPLAY: "Интерфейс и отображение",
  OTHER: "Другое",
};
