export function sanitizeGuestSessionResponse(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = { ...value };
  delete sanitized.token;
  return sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
