import { BadRequestException } from '@nestjs/common';

// Game logos are stored inline as data URLs on Tenant/Store.gameLogoUrl.
// Settings → branding and the clubs page both write them through this check.
export const MAX_GAME_LOGO_BYTES = 512 * 1024;
const GAME_LOGO_DATA_URL_PATTERN =
  /^data:(image\/png|image\/jpeg|image\/webp);base64,([a-z0-9+/]+={0,2})$/i;

export function normalizeGameLogoUrl(value: unknown, label: string) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(
      `${label}: загрузите изображение PNG, JPG или WebP`,
    );
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(GAME_LOGO_DATA_URL_PATTERN);

  if (!match) {
    throw new BadRequestException(
      `${label}: поддерживаются только PNG, JPG или WebP изображения`,
    );
  }

  const [, mimeType, base64] = match;
  const bytes = Buffer.from(base64, 'base64').byteLength;

  if (bytes > MAX_GAME_LOGO_BYTES) {
    throw new BadRequestException(
      `${label}: файл должен быть не больше 512 КБ`,
    );
  }

  return `data:${mimeType.toLowerCase()};base64,${base64}`;
}
