import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CreateStoreDto, UpdateStoreDto } from './stores.dto';
import {
  cityFromStoreAddress,
  isSupportedTimeZone,
  normalizeStoreCity,
  normalizeStoreTimeZone,
  timeZoneForStoreCity,
} from './store-timezones';

const DADATA_SUGGEST_URL =
  'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
const YANDEX_MAPS_LINK_RESOLVE_TIMEOUT_MS = 5_000;
const YANDEX_MAPS_COORDINATES_NOT_FOUND_MESSAGE =
  'В ссылке Яндекс Карт не найдены координаты. Откройте полную ссылку с параметрами ll, pt или "Что здесь".';

type DadataAddressSuggestion = {
  value?: string;
  unrestricted_value?: string;
  data?: {
    city?: string | null;
    settlement?: string | null;
    region_with_type?: string | null;
    city_fias_id?: string | null;
    settlement_fias_id?: string | null;
    city_kladr_id?: string | null;
    settlement_kladr_id?: string | null;
    timezone?: string | null;
    geo_lat?: string | null;
    geo_lon?: string | null;
  };
};

export type StoreAddressSuggestion = {
  value: string;
  city: string;
  region: string | null;
  cityFiasId: string | null;
  cityKladrId: string | null;
  timeZone: string | null;
};

export type StoreAddressGeocode = StoreAddressSuggestion & {
  latitude: number;
  longitude: number;
};

export type StoreYandexMapsGeocode = {
  value: string;
  resolvedUrl?: string;
  latitude: number;
  longitude: number;
  source: 'll' | 'pt' | 'sll' | 'whatshere' | 'rtext' | 'text';
};

type StoreAddressGeocodeResult = {
  storeId: string;
  name: string;
  address: string | null;
  yandexMapsUrl?: string | null;
  status: 'UPDATED' | 'SKIPPED' | 'FAILED';
  reason?: string;
  latitude?: number;
  longitude?: number;
};

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(user?: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    return this.prisma.store.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateStoreDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const name = this.normalizeName(dto.name);
    const address = this.normalizeOptionalString(dto.address);
    const location = this.normalizeLocation(
      this.normalizeOptionalString(dto.city) ?? cityFromStoreAddress(address),
      dto.timeZone,
      dto.cityFiasId,
      dto.cityKladrId,
    );
    const publicSlug =
      dto.publicSlug == null
        ? await this.generateUniquePublicSlug(tenantId, name)
        : await this.normalizePublicSlug(dto.publicSlug, tenantId);
    const yandexMapsUrl = this.normalizeOptionalString(dto.yandexMapsUrl);
    const yandexGeocode = yandexMapsUrl
      ? await this.geocodeYandexMapsLink(yandexMapsUrl)
      : null;

    return this.prisma.store.create({
      data: {
        tenantId,
        name,
        publicSlug,
        address,
        city: location.city,
        cityFiasId: location.cityFiasId,
        cityKladrId: location.cityKladrId,
        latitude:
          yandexGeocode?.latitude ??
          this.normalizeCoordinate(dto.latitude, -90, 90, 'Широта'),
        longitude:
          yandexGeocode?.longitude ??
          this.normalizeCoordinate(dto.longitude, -180, 180, 'Долгота'),
        yandexMapsUrl,
        timeZone: location.timeZone,
        gamificationEnabled: this.normalizeBoolean(
          dto.gamificationEnabled,
          false,
        ),
      },
    });
  }

  async suggestAddresses(query: string | undefined) {
    const cleanQuery = this.normalizeOptionalString(query);

    if (!cleanQuery || cleanQuery.length < 2) {
      return [];
    }

    const token = this.configService.get<string>('DADATA_API_KEY')?.trim();

    if (!token) {
      return [];
    }

    const response = await fetch(DADATA_SUGGEST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: cleanQuery,
        count: 8,
        from_bound: { value: 'city' },
        to_bound: { value: 'settlement' },
        locations: [{ country: 'Россия' }],
      }),
    });

    if (!response.ok) {
      throw new BadRequestException('Адресный справочник временно недоступен');
    }

    const data = (await response.json()) as {
      suggestions?: DadataAddressSuggestion[];
    };

    return (data.suggestions ?? [])
      .map((suggestion) => this.toStoreAddressSuggestion(suggestion))
      .filter((suggestion): suggestion is StoreAddressSuggestion =>
        Boolean(suggestion),
      );
  }

  async geocodeAddress(query: string | undefined) {
    const cleanQuery = this.normalizeOptionalString(query);

    if (!cleanQuery || cleanQuery.length < 5) {
      throw new BadRequestException('Укажите адрес клуба');
    }

    const token = this.configService.get<string>('DADATA_API_KEY')?.trim();

    if (!token) {
      throw new BadRequestException('Адресный справочник не настроен');
    }

    return this.geocodeAddressWithToken(cleanQuery, token);
  }

  async geocodeYandexMapsLink(link: string | undefined) {
    const cleanLink = this.normalizeOptionalString(link);

    if (!cleanLink || cleanLink.length < 10) {
      throw new BadRequestException('Укажите ссылку Яндекс Карт');
    }

    const geocode = this.tryParseYandexMapsGeocode(cleanLink);

    if (geocode) {
      return geocode;
    }

    const resolvedUrl = await this.resolveYandexMapsLink(cleanLink);

    if (resolvedUrl) {
      const resolvedGeocode = this.tryParseYandexMapsGeocode(resolvedUrl);

      if (resolvedGeocode) {
        return {
          ...resolvedGeocode,
          value: cleanLink,
          resolvedUrl,
        };
      }
    }

    throw new BadRequestException(YANDEX_MAPS_COORDINATES_NOT_FOUND_MESSAGE);
  }

  async geocodeMissingStoreCoordinates(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const stores = await this.prisma.store.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [{ latitude: null }, { longitude: null }],
        AND: [
          {
            OR: [{ address: { not: null } }, { yandexMapsUrl: { not: null } }],
          },
        ],
      },
      orderBy: { name: 'asc' },
      take: 25,
    });
    const token = this.configService.get<string>('DADATA_API_KEY')?.trim();

    const results: StoreAddressGeocodeResult[] = [];

    for (const store of stores) {
      const address = this.normalizeOptionalString(store.address);
      const yandexMapsUrl = this.normalizeOptionalString(store.yandexMapsUrl);

      if (yandexMapsUrl) {
        try {
          const geocode = await this.geocodeYandexMapsLink(yandexMapsUrl);
          await this.prisma.store.update({
            where: { id: store.id },
            data: {
              latitude: geocode.latitude,
              longitude: geocode.longitude,
              ...this.inferLocationPatch(store, address),
            },
          });
          results.push({
            storeId: store.id,
            name: store.name,
            address,
            yandexMapsUrl,
            status: 'UPDATED',
            latitude: geocode.latitude,
            longitude: geocode.longitude,
          });
          continue;
        } catch (error) {
          if (!address) {
            results.push({
              storeId: store.id,
              name: store.name,
              address,
              yandexMapsUrl,
              status: 'FAILED',
              reason:
                error instanceof BadRequestException
                  ? String(error.message)
                  : YANDEX_MAPS_COORDINATES_NOT_FOUND_MESSAGE,
            });
            continue;
          }
        }
      }

      if (!address || address.length < 5) {
        results.push({
          storeId: store.id,
          name: store.name,
          address,
          yandexMapsUrl,
          status: 'SKIPPED',
          reason: 'Адрес не указан',
        });
        continue;
      }

      if (!token) {
        results.push({
          storeId: store.id,
          name: store.name,
          address,
          yandexMapsUrl,
          status: 'FAILED',
          reason: 'Адресный справочник не настроен',
        });
        continue;
      }

      try {
        const geocode = await this.geocodeAddressWithToken(address, token);
        await this.prisma.store.update({
          where: { id: store.id },
          data: {
            latitude: geocode.latitude,
            longitude: geocode.longitude,
            ...(store.city
              ? {}
              : {
                  city: geocode.city,
                  cityFiasId: geocode.cityFiasId,
                  cityKladrId: geocode.cityKladrId,
                  timeZone:
                    geocode.timeZone ?? timeZoneForStoreCity(geocode.city),
                }),
          },
        });
        results.push({
          storeId: store.id,
          name: store.name,
          address,
          yandexMapsUrl,
          status: 'UPDATED',
          latitude: geocode.latitude,
          longitude: geocode.longitude,
        });
      } catch (error) {
        results.push({
          storeId: store.id,
          name: store.name,
          address,
          yandexMapsUrl,
          status: 'FAILED',
          reason:
            error instanceof BadRequestException
              ? String(error.message)
              : 'Не удалось получить координаты',
        });
      }
    }

    return {
      checked: results.length,
      updated: results.filter((result) => result.status === 'UPDATED').length,
      skipped: results.filter((result) => result.status === 'SKIPPED').length,
      failed: results.filter((result) => result.status === 'FAILED').length,
      limit: 25,
      results,
    };
  }

  private async geocodeAddressWithToken(
    cleanQuery: string,
    token: string,
  ): Promise<StoreAddressGeocode> {
    const response = await fetch(DADATA_SUGGEST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: cleanQuery,
        count: 1,
        locations: [{ country: 'Россия' }],
      }),
    });

    if (!response.ok) {
      throw new BadRequestException('Адресный справочник временно недоступен');
    }

    const data = (await response.json()) as {
      suggestions?: DadataAddressSuggestion[];
    };
    const geocode = (data.suggestions ?? [])
      .map((suggestion) => this.toStoreAddressGeocode(suggestion))
      .find((suggestion): suggestion is StoreAddressGeocode =>
        Boolean(suggestion),
      );

    if (!geocode) {
      throw new BadRequestException('Координаты для адреса не найдены');
    }

    return geocode;
  }

  private tryParseYandexMapsGeocode(
    cleanLink: string,
  ): StoreYandexMapsGeocode | null {
    const url = parseHttpUrl(cleanLink);

    if (!url || !isSupportedYandexMapsUrl(url)) {
      throw new BadRequestException('Укажите ссылку Яндекс Карт');
    }

    const params = this.collectUrlParams(url);
    const lonLatParams: Array<
      [StoreYandexMapsGeocode['source'], string | null]
    > = [
      ['ll', params.get('ll')],
      ['sll', params.get('sll')],
      ['whatshere', params.get('whatshere[point]')],
    ];

    for (const [source, value] of lonLatParams) {
      const pair = this.parseCoordinatePair(value, 'lonlat');

      if (pair) {
        return {
          value: cleanLink,
          latitude: pair.latitude,
          longitude: pair.longitude,
          source,
        };
      }
    }

    const pointPair = this.parseCoordinatePair(
      firstYandexPoint(params.get('pt')),
      'lonlat',
    );

    if (pointPair) {
      return {
        value: cleanLink,
        latitude: pointPair.latitude,
        longitude: pointPair.longitude,
        source: 'pt',
      };
    }

    const routePair = this.parseCoordinatePair(
      firstYandexPoint(params.get('rtext')),
      'latlon',
    );

    if (routePair) {
      return {
        value: cleanLink,
        latitude: routePair.latitude,
        longitude: routePair.longitude,
        source: 'rtext',
      };
    }

    const textPair = this.parseCoordinatePair(params.get('text'), 'latlon');

    if (textPair) {
      return {
        value: cleanLink,
        latitude: textPair.latitude,
        longitude: textPair.longitude,
        source: 'text',
      };
    }

    return null;
  }

  private async resolveYandexMapsLink(cleanLink: string) {
    const initialUrl = parseHttpUrl(cleanLink);

    if (!initialUrl || !isSupportedYandexMapsUrl(initialUrl)) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      YANDEX_MAPS_LINK_RESOLVE_TIMEOUT_MS,
    );

    try {
      const response = await fetch(initialUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'LeetPlus store geocoder (+https://leetplus.ru)',
        },
      });
      const resolvedUrl = response.url;

      if (!resolvedUrl || resolvedUrl === initialUrl.toString()) {
        return null;
      }

      const url = parseHttpUrl(resolvedUrl);

      return url && isSupportedYandexMapsUrl(url) ? url.toString() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private collectUrlParams(url: URL) {
    const params = new URLSearchParams(url.search);
    const hash = url.hash.replace(/^#/, '');

    if (hash.includes('=')) {
      const hashParams = new URLSearchParams(
        hash.startsWith('?') ? hash.slice(1) : hash,
      );

      for (const [key, value] of hashParams.entries()) {
        params.append(key, value);
      }
    }

    return params;
  }

  private parseCoordinatePair(
    value: string | null | undefined,
    order: 'lonlat' | 'latlon',
  ) {
    const numbers = coordinateNumbers(value);

    if (numbers.length < 2) {
      return null;
    }

    const latitudeValue = order === 'lonlat' ? numbers[1] : numbers[0];
    const longitudeValue = order === 'lonlat' ? numbers[0] : numbers[1];

    try {
      const latitude = this.normalizeCoordinate(
        latitudeValue,
        -90,
        90,
        'Широта',
      );
      const longitude = this.normalizeCoordinate(
        longitudeValue,
        -180,
        180,
        'Долгота',
      );

      return latitude === null || longitude === null
        ? null
        : { latitude, longitude };
    } catch {
      return null;
    }
  }

  async update(id: string, dto: UpdateStoreDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.findOneForTenant(id, tenantId);
    const nextAddress =
      dto.address === undefined
        ? current.address
        : this.normalizeOptionalString(dto.address);
    const yandexMapsUrl =
      dto.yandexMapsUrl === undefined
        ? undefined
        : this.normalizeOptionalString(dto.yandexMapsUrl);
    const yandexGeocode =
      yandexMapsUrl && yandexMapsUrl !== current.yandexMapsUrl
        ? await this.geocodeYandexMapsLink(yandexMapsUrl)
        : null;
    const shouldNormalizeLocation =
      dto.city !== undefined ||
      dto.timeZone !== undefined ||
      dto.cityFiasId !== undefined ||
      dto.cityKladrId !== undefined ||
      dto.address !== undefined ||
      Boolean(yandexGeocode) ||
      dto.latitude !== undefined ||
      dto.longitude !== undefined;
    const location = shouldNormalizeLocation
      ? this.normalizeLocation(
          this.normalizeOptionalString(dto.city) ??
            current.city ??
            cityFromStoreAddress(nextAddress),
          dto.timeZone ?? current.timeZone,
          dto.cityFiasId ?? current.cityFiasId,
          dto.cityKladrId ?? current.cityKladrId,
        )
      : null;
    const hasExplicitLocationInput =
      dto.city !== undefined ||
      dto.timeZone !== undefined ||
      dto.cityFiasId !== undefined ||
      dto.cityKladrId !== undefined;
    const locationPatch =
      location && (location.city || hasExplicitLocationInput) ? location : null;

    return this.prisma.store.update({
      where: { id: current.id },
      data: {
        ...(dto.name !== undefined
          ? { name: this.normalizeName(dto.name) }
          : {}),
        ...(dto.publicSlug !== undefined
          ? {
              publicSlug: await this.normalizePublicSlug(
                dto.publicSlug,
                tenantId,
                current.id,
              ),
            }
          : {}),
        ...(dto.address !== undefined ? { address: nextAddress } : {}),
        ...(locationPatch ? locationPatch : {}),
        ...(yandexGeocode
          ? {
              latitude: yandexGeocode.latitude,
            }
          : dto.latitude !== undefined
            ? {
                latitude: this.normalizeCoordinate(
                  dto.latitude,
                  -90,
                  90,
                  'Широта',
                ),
              }
            : {}),
        ...(yandexGeocode
          ? {
              longitude: yandexGeocode.longitude,
            }
          : dto.longitude !== undefined
            ? {
                longitude: this.normalizeCoordinate(
                  dto.longitude,
                  -180,
                  180,
                  'Долгота',
                ),
              }
            : {}),
        ...(dto.yandexMapsUrl !== undefined ? { yandexMapsUrl } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.gamificationEnabled !== undefined
          ? {
              gamificationEnabled: this.normalizeBoolean(
                dto.gamificationEnabled,
                false,
              ),
            }
          : {}),
      },
    });
  }

  async archive(id: string, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.findOneForTenant(id, tenantId);

    return this.prisma.store.update({
      where: { id: current.id },
      data: { isActive: false },
    });
  }

  private async findOneForTenant(id: string, tenantId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId },
    });

    if (!store) {
      throw new NotFoundException('Клуб не найден');
    }

    return store;
  }

  private normalizeName(name: string): string {
    const normalized = name?.trim();

    if (!normalized) {
      throw new BadRequestException('Название клуба обязательно');
    }

    return normalized;
  }

  private normalizeLocation(
    city: string | null | undefined,
    timeZone: string | null | undefined,
    cityFiasId?: string | null,
    cityKladrId?: string | null,
  ) {
    const normalizedCity = normalizeStoreCity(city);

    if (!normalizedCity) {
      return {
        city: null,
        cityFiasId: null,
        cityKladrId: null,
        timeZone: null,
      };
    }

    const finalTimeZone =
      normalizeStoreTimeZone(normalizedCity, timeZone) ??
      timeZoneForStoreCity(normalizedCity);

    if (!finalTimeZone || !isSupportedTimeZone(finalTimeZone)) {
      throw new BadRequestException(
        'Для выбранного города не найден часовой пояс',
      );
    }

    return {
      city: normalizedCity,
      cityFiasId: this.normalizeOptionalString(cityFiasId),
      cityKladrId: this.normalizeOptionalString(cityKladrId),
      timeZone: finalTimeZone,
    };
  }

  private inferLocationPatch(
    store: {
      city?: string | null;
      cityFiasId?: string | null;
      cityKladrId?: string | null;
      timeZone?: string | null;
    },
    address: string | null | undefined,
  ) {
    const city =
      normalizeStoreCity(store.city) ?? cityFromStoreAddress(address);

    if (!city) {
      return {};
    }

    const timeZone =
      normalizeStoreTimeZone(city, store.timeZone) ??
      timeZoneForStoreCity(city);

    if (!timeZone || !isSupportedTimeZone(timeZone)) {
      return {};
    }

    return {
      ...(store.city
        ? {}
        : {
            city,
            cityFiasId: this.normalizeOptionalString(store.cityFiasId),
            cityKladrId: this.normalizeOptionalString(store.cityKladrId),
          }),
      ...(store.timeZone ? {} : { timeZone }),
    };
  }

  private toStoreAddressSuggestion(
    suggestion: DadataAddressSuggestion,
  ): StoreAddressSuggestion | null {
    const city = normalizeStoreCity(
      suggestion.data?.city ?? suggestion.data?.settlement,
    );

    if (!city) {
      return null;
    }

    const timeZone = normalizeStoreTimeZone(city, suggestion.data?.timezone);

    return {
      value: suggestion.unrestricted_value ?? suggestion.value ?? city,
      city,
      region: this.normalizeOptionalString(suggestion.data?.region_with_type),
      cityFiasId: this.normalizeOptionalString(
        suggestion.data?.city_fias_id ?? suggestion.data?.settlement_fias_id,
      ),
      cityKladrId: this.normalizeOptionalString(
        suggestion.data?.city_kladr_id ?? suggestion.data?.settlement_kladr_id,
      ),
      timeZone,
    };
  }

  private toStoreAddressGeocode(
    suggestion: DadataAddressSuggestion,
  ): StoreAddressGeocode | null {
    const base = this.toStoreAddressSuggestion(suggestion);

    if (!base) {
      return null;
    }

    const latitude = this.normalizeCoordinate(
      suggestion.data?.geo_lat,
      -90,
      90,
      'Широта',
    );
    const longitude = this.normalizeCoordinate(
      suggestion.data?.geo_lon,
      -180,
      180,
      'Долгота',
    );

    if (latitude === null || longitude === null) {
      return null;
    }

    return {
      ...base,
      latitude,
      longitude,
    };
  }

  private normalizeOptionalString(value: string | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }

    return value.trim() || null;
  }

  private normalizeCoordinate(
    value: number | string | null | undefined,
    min: number,
    max: number,
    label: string,
  ) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized =
      typeof value === 'string' ? value.trim().replace(',', '.') : value;

    if (normalized === '') {
      return null;
    }

    const coordinate = Number(normalized);

    if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
      throw new BadRequestException(
        `${label} должна быть числом от ${min} до ${max}`,
      );
    }

    return Math.round(coordinate * 1_000_000) / 1_000_000;
  }

  private normalizeBoolean(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private async normalizePublicSlug(
    value: string | null | undefined,
    tenantId: string,
    currentStoreId?: string,
  ) {
    const slug = slugify(value ?? '');

    if (!slug) {
      return null;
    }

    const existing = await this.prisma.store.findFirst({
      where: {
        tenantId,
        publicSlug: slug,
        ...(currentStoreId ? { id: { not: currentStoreId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Публичный slug клуба уже используется.');
    }

    return slug;
  }

  private async generateUniquePublicSlug(tenantId: string, name: string) {
    const base = slugify(name) || 'club';

    for (let index = 0; index < 50; index += 1) {
      const candidate = index === 0 ? base : `${base}-${index + 1}`;
      const existing = await this.prisma.store.findFirst({
        where: { tenantId, publicSlug: candidate },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }
    }

    return `club-${Date.now().toString(36)}`;
  }
}

function slugify(value: string) {
  const transliterated = value
    .toLowerCase()
    .split('')
    .map((char) => cyrillicSlugMap[char] ?? char)
    .join('');

  return transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64);
}

function parseHttpUrl(value: string) {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;

  try {
    const url = new URL(candidate);

    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function isSupportedYandexMapsUrl(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.toLowerCase();

  if (!isYandexHost(host)) {
    return false;
  }

  return (
    host.startsWith('maps.') || path.includes('/maps') || path.includes('/navi')
  );
}

function isYandexHost(host: string) {
  const roots = [
    'yandex.ru',
    'yandex.com',
    'yandex.kz',
    'yandex.by',
    'yandex.uz',
    'yandex.com.tr',
    'ya.ru',
  ];

  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

function firstYandexPoint(value: string | null) {
  return value?.split('~').find((point) => point.trim()) ?? null;
}

function coordinateNumbers(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return Array.from(value.matchAll(/[+-]?\d{1,3}(?:[.,]\d+)?/g))
    .slice(0, 2)
    .map((match) => Number(match[0].replace(',', '.')))
    .filter((number) => Number.isFinite(number));
}

const cyrillicSlugMap: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};
