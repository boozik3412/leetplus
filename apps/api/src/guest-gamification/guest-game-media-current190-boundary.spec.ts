import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import {
  GUEST_GAME_MEDIA_MAX_BYTES,
  GuestGameMediaService,
} from './guest-game-media.service';

describe('GuestGameMediaService CURRENT190 tenant read port', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const assetId = '22222222-2222-4222-8222-222222222222';
  const data = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  let queryRaw: jest.Mock;
  let service: GuestGameMediaService;

  beforeEach(() => {
    queryRaw = jest.fn();
    const prisma = {
      $queryRaw: queryRaw,
    } as unknown as PrismaService;
    service = new GuestGameMediaService(prisma, {} as TenantContextService);
  });

  it('reads bytes only through the exact tenant and asset predicate', async () => {
    queryRaw.mockResolvedValue([
      {
        assetId,
        tenantId,
        contentType: 'image/png',
        byteSize: data.length,
        data,
      },
    ]);

    await expect(service.readForTenant(tenantId, assetId)).resolves.toEqual({
      assetId,
      tenantId,
      contentType: 'image/png',
      buffer: Buffer.from(data),
    });
    const calls = queryRaw.mock.calls as unknown as Array<
      readonly [
        {
          strings: readonly string[];
          values: readonly unknown[];
        },
      ]
    >;
    const query = calls[0]?.[0];
    expect(query.strings.join('')).toContain('asset."tenantId" = ');
    expect(query.strings.join('')).toContain('asset."id" = ');
    expect(query.strings.join('')).toContain(
      'pg_catalog.octet_length(asset."data") = asset."byteSize"',
    );
    expect(query.strings.join('')).toContain('LIMIT 1');
    expect(query.values).toEqual([
      tenantId,
      assetId,
      GUEST_GAME_MEDIA_MAX_BYTES,
      GUEST_GAME_MEDIA_MAX_BYTES,
    ]);
  });

  it('returns no bytes when the exact tenant predicate finds no asset', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(
      service.readForTenant(tenantId, assetId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['content signature differs from metadata', { contentType: 'image/webp' }],
    ['byte metadata differs from the payload', { byteSize: data.length + 1 }],
  ])('fails closed when %s', async (_label, override) => {
    queryRaw.mockResolvedValue([
      {
        assetId,
        tenantId,
        contentType: 'image/png',
        byteSize: data.length,
        data,
        ...override,
      },
    ]);

    await expect(
      service.readForTenant(tenantId, assetId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
