const STORE_CITY_TIME_ZONES = [
  { city: "Екатеринбург", timeZone: "Asia/Yekaterinburg" },
  { city: "Челябинск", timeZone: "Asia/Yekaterinburg" },
  { city: "Пермь", timeZone: "Asia/Yekaterinburg" },
  { city: "Уфа", timeZone: "Asia/Yekaterinburg" },
  { city: "Тюмень", timeZone: "Asia/Yekaterinburg" },
  { city: "Москва", timeZone: "Europe/Moscow" },
  { city: "Санкт-Петербург", timeZone: "Europe/Moscow" },
  { city: "Казань", timeZone: "Europe/Moscow" },
  { city: "Нижний Новгород", timeZone: "Europe/Moscow" },
  { city: "Краснодар", timeZone: "Europe/Moscow" },
  { city: "Ростов-на-Дону", timeZone: "Europe/Moscow" },
  { city: "Самара", timeZone: "Europe/Samara" },
  { city: "Ижевск", timeZone: "Europe/Samara" },
  { city: "Саратов", timeZone: "Europe/Saratov" },
  { city: "Волгоград", timeZone: "Europe/Volgograd" },
  { city: "Калининград", timeZone: "Europe/Kaliningrad" },
  { city: "Омск", timeZone: "Asia/Omsk" },
  { city: "Новосибирск", timeZone: "Asia/Novosibirsk" },
  { city: "Красноярск", timeZone: "Asia/Krasnoyarsk" },
  { city: "Иркутск", timeZone: "Asia/Irkutsk" },
  { city: "Якутск", timeZone: "Asia/Yakutsk" },
  { city: "Владивосток", timeZone: "Asia/Vladivostok" },
] as const;

export function inferStoreCityFromAddress(address: string | null | undefined) {
  const normalized = address?.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  const prefixedCity = normalized.match(
    /(?:^|[,\s])(?:г\.?|город)\s*([А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z -]{1,60})/u,
  );

  if (prefixedCity?.[1]) {
    return cleanupStoreCityName(prefixedCity[1]);
  }

  const firstPart = normalized.split(",")[0]?.trim() ?? "";

  if (/^[А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z -]{1,60}$/u.test(firstPart)) {
    return cleanupStoreCityName(firstPart);
  }

  return null;
}

export function timeZoneForStoreCity(city: string | null | undefined) {
  const normalizedCity = city?.trim();

  if (!normalizedCity) {
    return null;
  }

  return (
    STORE_CITY_TIME_ZONES.find(
      (option) => option.city.toLowerCase() === normalizedCity.toLowerCase(),
    )?.timeZone ?? null
  );
}

function cleanupStoreCityName(value: string) {
  const cleaned = value
    .replace(/\b(?:ул|улица|пр|проспект|пер|переулок|ш|шоссе)\.?$/iu, "")
    .trim()
    .replace(/\s+$/, "");

  return cleaned || null;
}
