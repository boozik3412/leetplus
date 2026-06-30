const allowedExternalActionProtocols = new Set([
  "http:",
  "https:",
  "ts3server:",
  "teamspeak:",
  "steam:",
  "discord:",
  "tg:",
  "telegram:",
  "vk:",
  "whatsapp:",
  "viber:",
  "mailto:",
  "tel:",
  "sms:",
]);

const httpProtocols = new Set(["http:", "https:"]);

export function normalizeExternalActionUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || hasUnsafeUrlCharacters(trimmed)) {
    return null;
  }

  const candidate = trimmed.startsWith("//")
    ? `https:${trimmed}`
    : hasUrlScheme(trimmed)
      ? trimmed
      : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    const protocol = url.protocol.toLowerCase();

    if (!allowedExternalActionProtocols.has(protocol)) {
      return null;
    }

    return httpProtocols.has(protocol) ? url.toString() : trimmed;
  } catch {
    return null;
  }
}

export function isHttpExternalActionUrl(value: string) {
  try {
    return httpProtocols.has(new URL(value).protocol.toLowerCase());
  } catch {
    return false;
  }
}

export function isInternalHref(value: string) {
  return value.startsWith("/") || value.startsWith("#");
}

function hasUrlScheme(value: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function hasUnsafeUrlCharacters(value: string) {
  return /[\u0000-\u001f\u007f\s]/.test(value);
}
