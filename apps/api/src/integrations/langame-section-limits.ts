import { TenantModule } from '@prisma/client';

/**
 * A Langame section can be unavailable to a network for a stable provider
 * reason rather than a failed read: the network's API key has no permission
 * for it, or Langame stopped serving it as a network-wide list (since
 * 29.09.2026 `/guests/logs` rejects requests without `guest_id`). Such a
 * section is reported to the network, but it never blocks the other
 * sections, the sync cursor or daily coverage. Unknown and transport errors
 * are not limits and stay incomplete.
 */
export const LANGAME_SECTION_NO_ACCESS_MESSAGE =
  'Langame не предоставил доступ к этому разделу.';
export const LANGAME_SECTION_NOT_LISTED_MESSAGE =
  'Langame больше не отдаёт этот раздел списком по всей сети.';

export const LANGAME_SYNC_LIMITED_PREFIX = 'LANGAME_SYNC_LIMITED' as const;

const LIMIT_MESSAGES: ReadonlySet<string> = new Set([
  LANGAME_SECTION_NO_ACCESS_MESSAGE,
  LANGAME_SECTION_NOT_LISTED_MESSAGE,
]);

export function langameSectionLimitMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : '';
  if (/no permissions|forbidden|unauthorized|\b40[13]\b/i.test(message)) {
    return LANGAME_SECTION_NO_ACCESS_MESSAGE;
  }
  if (/\b400\b[\s\S]*"field"\s*:\s*"guest_id"/.test(message)) {
    return LANGAME_SECTION_NOT_LISTED_MESSAGE;
  }
  return null;
}

export function isLangameSectionLimitMessage(message: string) {
  return LIMIT_MESSAGES.has(message);
}

/**
 * Scheduled Langame import writes only the network's own data, exactly like
 * the manual import from /sync. It has no provider or guest-facing effect, so
 * it needs module WRITE. OUTBOUND stays reserved for provider writes (bonus
 * accruals) and guest messaging.
 */
export function langameImportRequirements(modules: readonly TenantModule[]) {
  return modules.map((module) => ({ module, action: 'WRITE' as const }));
}
