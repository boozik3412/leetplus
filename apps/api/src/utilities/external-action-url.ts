const allowedExternalActionProtocols = new Set([
  'http:',
  'https:',
  'ts3server:',
  'teamspeak:',
  'steam:',
  'discord:',
  'tg:',
  'telegram:',
  'vk:',
  'whatsapp:',
  'viber:',
  'mailto:',
  'tel:',
  'sms:',
]);

const httpProtocols = new Set(['http:', 'https:']);

export function normalizeExternalActionUrl(value: unknown) {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (!trimmed || hasUnsafeUrlCharacters(trimmed)) {
    return null;
  }

  const candidate = trimmed.startsWith('//')
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

function hasUrlScheme(value: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function hasUnsafeUrlCharacters(value: string) {
  for (const char of value) {
    const code = char.charCodeAt(0);

    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}
