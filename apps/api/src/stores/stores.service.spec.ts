import { UserRole } from '@prisma/client';
import { StoresService } from './stores.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ConfigService } from '@nestjs/config';

type StoresPrismaMock = {
  store: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

type TenantContextMock = {
  resolve: jest.Mock;
};

function createPrismaMock(): StoresPrismaMock {
  return {
    store: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('StoresService', () => {
  let prisma: StoresPrismaMock;
  let tenantContext: TenantContextMock;
  let config: { get: jest.Mock };
  let service: StoresService;
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'owner@example.com',
    fullName: null,
    role: UserRole.OWNER,
    tenantId: 'tenant-demo',
    tenantSlug: 'demo',
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-demo',
        tenantSlug: 'demo',
      }),
    };
    config = { get: jest.fn() };
    service = new StoresService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('filters stores by resolved tenant', async () => {
    prisma.store.findMany.mockResolvedValue([]);

    await service.findAll(user);

    expect(tenantContext.resolve).toHaveBeenCalledWith(user);
    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-demo' },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  });

  it('creates store in resolved tenant', async () => {
    prisma.store.create.mockResolvedValue({ id: 'store-1' });

    await service.create(
      {
        name: '  Club A  ',
        address: '  Main street  ',
        city: 'Екатеринбург',
      },
      user,
    );

    expect(prisma.store.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-demo',
        name: 'Club A',
        publicSlug: 'club-a',
        address: 'Main street',
        city: 'Екатеринбург',
        cityFiasId: null,
        cityKladrId: null,
        latitude: null,
        longitude: null,
        yandexMapsUrl: null,
        timeZone: 'Asia/Yekaterinburg',
        gamificationEnabled: false,
      },
    });
  });

  it('updates explicit gamification flag inside tenant', async () => {
    prisma.store.findFirst.mockResolvedValue({
      id: 'store-1',
      name: 'Club A',
    });
    prisma.store.update.mockResolvedValue({
      id: 'store-1',
      gamificationEnabled: true,
    });

    await service.update('store-1', { gamificationEnabled: true }, user);

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { gamificationEnabled: true },
    });
  });

  it('updates coordinates with comma decimals for game club geosearch', async () => {
    prisma.store.findFirst.mockResolvedValue({
      id: 'store-1',
      name: 'Club A',
    });
    prisma.store.update.mockResolvedValue({
      id: 'store-1',
      latitude: '56.838011',
      longitude: '60.597465',
    });

    await service.update(
      'store-1',
      { latitude: '56,838011', longitude: '60.597465' },
      user,
    );

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: {
        latitude: 56.838011,
        longitude: 60.597465,
      },
    });
  });

  it('extracts coordinates from a Yandex Maps ll link without external requests', async () => {
    await expect(
      service.geocodeYandexMapsLink(
        'https://yandex.ru/maps/54/yekaterinburg/?ll=60.597465%2C56.838011&z=17',
      ),
    ).resolves.toEqual({
      value:
        'https://yandex.ru/maps/54/yekaterinburg/?ll=60.597465%2C56.838011&z=17',
      latitude: 56.838011,
      longitude: 60.597465,
      source: 'll',
    });
  });

  it('extracts coordinates from a Yandex Maps whatshere link', async () => {
    await expect(
      service.geocodeYandexMapsLink(
        'https://yandex.ru/maps/?whatshere%5Bpoint%5D=60.596988%2C56.829123&whatshere%5Bzoom%5D=17',
      ),
    ).resolves.toMatchObject({
      latitude: 56.829123,
      longitude: 60.596988,
      source: 'whatshere',
    });
  });

  it('resolves a Yandex Maps short link before extracting coordinates', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      url: 'https://yandex.ru/maps/54/yekaterinburg/?ll=60.597465%2C56.838011&z=17',
    } as Response);

    await expect(
      service.geocodeYandexMapsLink('https://yandex.ru/maps/-/CDuDemo'),
    ).resolves.toEqual({
      value: 'https://yandex.ru/maps/-/CDuDemo',
      resolvedUrl:
        'https://yandex.ru/maps/54/yekaterinburg/?ll=60.597465%2C56.838011&z=17',
      latitude: 56.838011,
      longitude: 60.597465,
      source: 'll',
    });
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(requestUrl).toBe('https://yandex.ru/maps/-/CDuDemo');
    expect(requestInit).toMatchObject({
      method: 'GET',
      redirect: 'follow',
    });
  });

  it('fills coordinates from a new Yandex Maps link on store update', async () => {
    prisma.store.findFirst.mockResolvedValue({
      id: 'store-1',
      name: 'Club A',
      yandexMapsUrl: null,
    });
    prisma.store.update.mockResolvedValue({ id: 'store-1' });

    await service.update(
      'store-1',
      {
        yandexMapsUrl: 'https://yandex.ru/maps/?pt=60.597465,56.838011,pm2rdm',
      },
      user,
    );

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: {
        latitude: 56.838011,
        longitude: 60.597465,
        yandexMapsUrl: 'https://yandex.ru/maps/?pt=60.597465,56.838011,pm2rdm',
      },
    });
  });

  it('rejects unsupported map links', async () => {
    await expect(
      service.geocodeYandexMapsLink(
        'https://maps.google.com/?q=56.838011,60.597465',
      ),
    ).rejects.toThrow();
  });

  it('rejects invalid coordinate values', async () => {
    prisma.store.findFirst.mockResolvedValue({
      id: 'store-1',
      name: 'Club A',
    });

    await expect(
      service.update('store-1', { latitude: '91' }, user),
    ).rejects.toThrow('Широта должна быть числом от -90 до 90');
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('geocodes address coordinates through configured Dadata token', async () => {
    config.get.mockReturnValue('dadata-token');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          suggestions: [
            {
              value: 'г Екатеринбург, ул Радищева, д 12',
              data: {
                city: 'Екатеринбург',
                region_with_type: 'Свердловская обл',
                city_fias_id: 'city-fias',
                city_kladr_id: 'city-kladr',
                timezone: 'UTC+5',
                geo_lat: '56.8291234',
                geo_lon: '60.5969876',
              },
            },
          ],
        }),
    } as unknown as Response);

    await expect(
      service.geocodeAddress('г. Екатеринбург, ул. Радищева, 12'),
    ).resolves.toEqual({
      value: 'г Екатеринбург, ул Радищева, д 12',
      city: 'Екатеринбург',
      region: 'Свердловская обл',
      cityFiasId: 'city-fias',
      cityKladrId: 'city-kladr',
      timeZone: 'Asia/Yekaterinburg',
      latitude: 56.829123,
      longitude: 60.596988,
    });
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(requestUrl).toBe(
      'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
    );
    expect(requestInit.method).toBe('POST');
    expect(requestInit.headers).toMatchObject({
      Authorization: 'Token dadata-token',
    });
  });

  it('fills missing store coordinates from address geocode inside tenant', async () => {
    config.get.mockReturnValue('dadata-token');
    prisma.store.findMany.mockResolvedValue([
      {
        id: 'store-1',
        name: '1337 Радищева',
        address: 'г. Екатеринбург, ул. Радищева, 12',
        city: null,
      },
      {
        id: 'store-2',
        name: '1337 Родонитовая',
        address: 'г. Екатеринбург, ул. Родонитовая, 33',
        city: 'Екатеринбург',
      },
    ]);
    prisma.store.update.mockResolvedValue({ id: 'store-1' });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          suggestions: [
            {
              value: 'г Екатеринбург, ул Радищева, д 12',
              data: {
                city: 'Екатеринбург',
                city_fias_id: 'city-fias',
                city_kladr_id: 'city-kladr',
                timezone: 'UTC+5',
                geo_lat: '56.8291234',
                geo_lon: '60.5969876',
              },
            },
          ],
        }),
    } as unknown as Response);

    await expect(
      service.geocodeMissingStoreCoordinates(user),
    ).resolves.toMatchObject({
      checked: 2,
      updated: 2,
      skipped: 0,
      failed: 0,
      limit: 25,
    });
    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-demo',
        isActive: true,
        address: { not: null },
        OR: [{ latitude: null }, { longitude: null }],
      },
      orderBy: { name: 'asc' },
      take: 25,
    });
    expect(prisma.store.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'store-1' },
      data: {
        latitude: 56.829123,
        longitude: 60.596988,
        city: 'Екатеринбург',
        cityFiasId: 'city-fias',
        cityKladrId: 'city-kladr',
        timeZone: 'Asia/Yekaterinburg',
      },
    });
    expect(prisma.store.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'store-2' },
      data: {
        latitude: 56.829123,
        longitude: 60.596988,
      },
    });
  });

  it('archives store only after resolving it inside tenant', async () => {
    prisma.store.findFirst.mockResolvedValue({
      id: 'store-1',
      name: 'Club A',
    });
    prisma.store.update.mockResolvedValue({ id: 'store-1', isActive: false });

    await service.archive('store-1', user);

    expect(prisma.store.findFirst).toHaveBeenCalledWith({
      where: { id: 'store-1', tenantId: 'tenant-demo' },
    });
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { isActive: false },
    });
  });
});
