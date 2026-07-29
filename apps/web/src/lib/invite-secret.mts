const CANONICAL_INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const INVITE_FRAGMENT_PREFIX = "#invite=";

export function isCanonicalInviteToken(value: unknown): value is string {
  return (
    typeof value === "string" && CANONICAL_INVITE_TOKEN_PATTERN.test(value)
  );
}

export function readInviteTokenFromFragment(fragment: string): string | null {
  if (!fragment.startsWith(INVITE_FRAGMENT_PREFIX)) {
    return null;
  }

  const token = fragment.slice(INVITE_FRAGMENT_PREFIX.length);
  return isCanonicalInviteToken(token) ? token : null;
}
