const STORE_CITY_TIME_ZONES = [
  { city: 'Екатеринбург', timeZone: 'Asia/Yekaterinburg' },
  { city: 'Челябинск', timeZone: 'Asia/Yekaterinburg' },
  { city: 'Пермь', timeZone: 'Asia/Yekaterinburg' },
  { city: 'Уфа', timeZone: 'Asia/Yekaterinburg' },
  { city: 'Тюмень', timeZone: 'Asia/Yekaterinburg' },
  { city: 'Москва', timeZone: 'Europe/Moscow' },
  { city: 'Санкт-Петербург', timeZone: 'Europe/Moscow' },
  { city: 'Казань', timeZone: 'Europe/Moscow' },
  { city: 'Нижний Новгород', timeZone: 'Europe/Moscow' },
  { city: 'Краснодар', timeZone: 'Europe/Moscow' },
  { city: 'Ростов-на-Дону', timeZone: 'Europe/Moscow' },
  { city: 'Самара', timeZone: 'Europe/Samara' },
  { city: 'Ижевск', timeZone: 'Europe/Samara' },
  { city: 'Саратов', timeZone: 'Europe/Saratov' },
  { city: 'Волгоград', timeZone: 'Europe/Volgograd' },
  { city: 'Калининград', timeZone: 'Europe/Kaliningrad' },
  { city: 'Омск', timeZone: 'Asia/Omsk' },
  { city: 'Новосибирск', timeZone: 'Asia/Novosibirsk' },
  { city: 'Красноярск', timeZone: 'Asia/Krasnoyarsk' },
  { city: 'Иркутск', timeZone: 'Asia/Irkutsk' },
  { city: 'Якутск', timeZone: 'Asia/Yakutsk' },
  { city: 'Владивосток', timeZone: 'Asia/Vladivostok' },
] as const;

const UTC_OFFSET_TIME_ZONES: Record<string, string> = {
  'UTC+2': 'Europe/Kaliningrad',
  'UTC+3': 'Europe/Moscow',
  'UTC+4': 'Europe/Samara',
  'UTC+5': 'Asia/Yekaterinburg',
  'UTC+6': 'Asia/Omsk',
  'UTC+7': 'Asia/Novosibirsk',
  'UTC+8': 'Asia/Irkutsk',
  'UTC+9': 'Asia/Yakutsk',
  'UTC+10': 'Asia/Vladivostok',
  'UTC+11': 'Asia/Sakhalin',
  'UTC+12': 'Asia/Kamchatka',
};

export function timeZoneForStoreCity(city: string | null | undefined) {
  const normalizedCity = normalizeStoreCity(city);

  if (!normalizedCity) {
    return null;
  }

  return (
    STORE_CITY_TIME_ZONES.find(
      (option) => option.city.toLowerCase() === normalizedCity.toLowerCase(),
    )?.timeZone ?? null
  );
}

export function normalizeStoreTimeZone(
  city: string | null | undefined,
  timeZone: string | null | undefined,
) {
  const normalizedTimeZone = timeZone?.trim();

  if (normalizedTimeZone) {
    const offsetKey = normalizedTimeZone
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/^UTC([+-])0(\d)(?::?00)?$/, 'UTC$1$2')
      .replace(/^UTC([+-])(\d{1,2})(?::?00)$/, 'UTC$1$2');
    const offsetTimeZone = UTC_OFFSET_TIME_ZONES[offsetKey];

    if (offsetTimeZone) {
      return offsetTimeZone;
    }

    if (isSupportedTimeZone(normalizedTimeZone)) {
      return normalizedTimeZone;
    }
  }

  return timeZoneForStoreCity(city);
}

export function normalizeStoreCity(city: string | null | undefined) {
  const normalized = city?.trim();
  return normalized || null;
}

export function isSupportedTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
