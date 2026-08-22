import { ServiceUnavailableException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import {
  assertDesignPartnerDatabaseAdmission,
  assertScheduledHttpAllowed,
  assertStandaloneProcessAllowed,
} from './design-partner-runtime-policy';

function config(
  value: unknown,
  tenantSlug = 'partner-club',
  tenantDomain = 'partner-club.leetplus.ru',
) {
  return {
    get: jest.fn((key: string) => {
      if (key === 'DESIGN_PARTNER_ISOLATED_MODE') return value;
      if (key === 'DESIGN_PARTNER_TENANT_SLUG') return tenantSlug;
      if (key === 'DESIGN_PARTNER_TENANT_DOMAIN') return tenantDomain;
      return undefined;
    }),
  } as unknown as ConfigService;
}

describe('assertScheduledHttpAllowed', () => {
  it.each([undefined, null, '', 'false', ' FALSE '])(
    'allows the ordinary runtime marker %p',
    (value) => {
      expect(() => assertScheduledHttpAllowed(config(value))).not.toThrow();
    },
  );

  it.each(['true', ' TRUE ', true, 'unexpected'])(
    'fails closed for isolated or malformed marker %p',
    (value) => {
      expect(() => assertScheduledHttpAllowed(config(value))).toThrow(
        ServiceUnavailableException,
      );
    },
  );
});

describe('assertStandaloneProcessAllowed', () => {
  it('keeps ordinary standalone process behavior unchanged', () => {
    expect(() =>
      assertStandaloneProcessAllowed({}, 'EXAMPLE_PROCESS_ENABLED'),
    ).not.toThrow();
  });

  it('blocks isolated processes unless a separate exact enable flag exists', () => {
    expect(() =>
      assertStandaloneProcessAllowed(
        {
          DESIGN_PARTNER_ISOLATED_MODE: 'true',
          EXAMPLE_PROCESS_ENABLED: 'false',
        },
        'EXAMPLE_PROCESS_ENABLED',
      ),
    ).toThrow(/requires a separate design-partner GO/);
  });

  it('rejects the provisioning manifest HMAC key in an isolated process', () => {
    expect(() =>
      assertStandaloneProcessAllowed(
        {
          DESIGN_PARTNER_ISOLATED_MODE: 'true',
          DESIGN_PARTNER_MANIFEST_HMAC_KEY: 'must-not-reach-runtime',
          EXAMPLE_PROCESS_ENABLED: 'true',
        },
        'EXAMPLE_PROCESS_ENABLED',
      ),
    ).toThrow(
      /DESIGN_PARTNER_MANIFEST_HMAC_KEY must be absent from design-partner runtime/,
    );
  });

  it('enforces process-specific destructive startup settings', () => {
    const base = {
      DESIGN_PARTNER_ISOLATED_MODE: 'true',
      EXAMPLE_PROCESS_ENABLED: 'true',
    };

    expect(() =>
      assertStandaloneProcessAllowed(base, 'EXAMPLE_PROCESS_ENABLED', {
        DELETE_REMOTE_STATE_ON_START: 'false',
      }),
    ).toThrow(/DELETE_REMOTE_STATE_ON_START must equal false/);
    expect(() =>
      assertStandaloneProcessAllowed(
        { ...base, DELETE_REMOTE_STATE_ON_START: 'false' },
        'EXAMPLE_PROCESS_ENABLED',
        { DELETE_REMOTE_STATE_ON_START: 'false' },
      ),
    ).not.toThrow();
  });

  it('pins every enabled isolated process to its derived isolated API origin', () => {
    const base = {
      DESIGN_PARTNER_ISOLATED_MODE: 'true',
      DESIGN_PARTNER_TENANT_SLUG: 'partner-club',
      EXAMPLE_PROCESS_ENABLED: 'true',
    };

    expect(() =>
      assertStandaloneProcessAllowed(
        {
          ...base,
          EXAMPLE_API_URL: 'https://api.leetplus.ru',
        },
        'EXAMPLE_PROCESS_ENABLED',
        {},
        'EXAMPLE_API_URL',
      ),
    ).toThrow(/must equal https:\/\/api-partner-club\.leetplus\.ru/);
    expect(() =>
      assertStandaloneProcessAllowed(
        {
          ...base,
          EXAMPLE_API_URL: 'https://api-partner-club.leetplus.ru',
        },
        'EXAMPLE_PROCESS_ENABLED',
        {},
        'EXAMPLE_API_URL',
      ),
    ).not.toThrow();
  });

  it('is wired into every standalone guest-game entrypoint', () => {
    const entrypoints = [
      {
        path: join(
          __dirname,
          '..',
          'guest-gamification',
          'guest-game-delivery-bot-consumer.cli.ts',
        ),
        enabledKey: 'GUEST_GAME_BOT_CONSUMER_ENABLED',
        apiUrlKey: 'GUEST_GAME_BOT_CONSUMER_API_URL',
        dryRunKey: 'GUEST_GAME_BOT_CONSUMER_DRY_RUN',
      },
      {
        path: join(
          __dirname,
          '..',
          'guest-portal',
          'telegram-edge-adapter.cli.ts',
        ),
        enabledKey: 'GUEST_GAME_TG_EDGE_ADAPTER_ENABLED',
        apiUrlKey: 'GUEST_GAME_TG_EDGE_LEETPLUS_API_URL',
        dryRunKey: 'GUEST_GAME_TG_EDGE_DRY_RUN',
      },
      {
        path: join(
          __dirname,
          '..',
          'guest-portal',
          'telegram-edge-poller.cli.ts',
        ),
        enabledKey: 'GUEST_GAME_TG_EDGE_POLLER_ENABLED',
        apiUrlKey: 'GUEST_GAME_TG_EDGE_LEETPLUS_API_URL',
        dryRunKey: 'GUEST_GAME_TG_EDGE_DRY_RUN',
        requiredSetting: 'GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START',
      },
    ];

    for (const entrypoint of entrypoints) {
      const source = readFileSync(entrypoint.path, 'utf8');
      expect(source).toContain('assertStandaloneProcessAllowed(');
      expect(source).toContain(entrypoint.enabledKey);
      expect(source).toContain(entrypoint.apiUrlKey);
      expect(source).toContain(entrypoint.dryRunKey);
      if (entrypoint.requiredSetting) {
        expect(source).toContain(entrypoint.requiredSetting);
        expect(source).toContain(`: 'false'`);
      }
    }
  });
});

function database({
  markers = [],
  tenantCount = 0,
}: {
  markers?: unknown[];
  tenantCount?: number;
} = {}) {
  return {
    platformAdminAuditEvent: {
      findMany: jest.fn().mockResolvedValue(markers),
    },
    tenant: {
      count: jest.fn().mockResolvedValue(tenantCount),
    },
  } as unknown as Pick<PrismaService, 'platformAdminAuditEvent' | 'tenant'>;
}

function provisionMarker(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-d',
    metadata: {
      profileVersion: 'SINGLE_DESIGN_PARTNER_V1',
      manifestDigest: 'a'.repeat(64),
      manifestHmacKeyVersion: 'v1',
      ownerInviteId: 'invite-owner',
      ownerInviteExpiresAt: '2099-08-01T12:00:00.000Z',
      ownerInviteDigest: 'b'.repeat(64),
      accessExpiresAt: '2099-08-15T12:00:00.000Z',
    },
    tenant: {
      id: 'tenant-d',
      slug: 'partner-club',
      domain: 'partner-club.leetplus.ru',
      status: 'SUSPENDED',
      stores: [{ isActive: false, gamificationEnabled: false }],
      userRoleOverrides: [
        {
          role: 'OWNER',
          permissions: [
            'view_dashboard',
            'view_reports',
            'view_assortment_reports',
            'view_assortment_products',
            'view_assortment_catalog',
            'view_assortment_stores',
            'view_staff_knowledge',
            'edit_staff_knowledge',
            'review_staff_knowledge',
            'publish_staff_knowledge',
            'manage_users',
          ],
        },
      ],
      userAccessRoles: [],
      users: [],
      platformAdminAuditEvents: [],
      userInvites: [
        {
          id: 'invite-owner',
          email: 'owner@partner.invalid',
          role: 'OWNER',
          accessScope: 'NETWORK',
          customRoleId: null,
          storeIds: [],
          tokenHash: 'c'.repeat(64),
          acceptedAt: null,
          acceptedByUserId: null,
          expiresAt: new Date('2099-08-01T12:00:00.000Z'),
        },
      ],
      integrationSources: [],
      integrationCredentials: [],
    },
    ...overrides,
  };
}

describe('assertDesignPartnerDatabaseAdmission', () => {
  it('allows ordinary databases without a design-partner marker', async () => {
    await expect(
      assertDesignPartnerDatabaseAdmission(
        database({ tenantCount: 4 }),
        config(false),
      ),
    ).resolves.toBeUndefined();
  });

  it('allows isolated startup against an empty pre-provisioning database', async () => {
    await expect(
      assertDesignPartnerDatabaseAdmission(database(), config(true)),
    ).resolves.toBeUndefined();
  });

  it('rejects a design-partner marker when isolated mode is missing', async () => {
    await expect(
      assertDesignPartnerDatabaseAdmission(
        database({ markers: [provisionMarker()], tenantCount: 1 }),
        config(undefined),
      ),
    ).rejects.toThrow(/requires DESIGN_PARTNER_ISOLATED_MODE=true/);
  });

  it('accepts only the exact suspended one-tenant/one-store topology', async () => {
    const admitted = database({
      markers: [provisionMarker()],
      tenantCount: 1,
    });
    const activated = database({
      markers: [
        provisionMarker({
          tenant: {
            id: 'tenant-d',
            status: 'ACTIVE',
            stores: [{ isActive: true, gamificationEnabled: true }],
          },
        }),
      ],
      tenantCount: 1,
    });

    await expect(
      assertDesignPartnerDatabaseAdmission(admitted, config(true)),
    ).resolves.toBeUndefined();
    await expect(
      assertDesignPartnerDatabaseAdmission(activated, config(true)),
    ).rejects.toThrow(/one exact suspended tenant/);
  });

  it('rejects isolated mode against a shared tenant database', async () => {
    await expect(
      assertDesignPartnerDatabaseAdmission(
        database({ tenantCount: 4 }),
        config(true),
      ),
    ).rejects.toThrow(/only an empty tenant database/);
  });

  it('rejects expired access and IAM or integration drift at startup', async () => {
    const baseTenant = provisionMarker().tenant as Record<string, unknown>;
    const driftedMarkers = [
      provisionMarker({
        metadata: {
          profileVersion: 'SINGLE_DESIGN_PARTNER_V1',
          manifestDigest: 'a'.repeat(64),
          manifestHmacKeyVersion: 'v1',
          ownerInviteId: 'invite-owner',
          ownerInviteExpiresAt: '2099-08-01T12:00:00.000Z',
          ownerInviteDigest: 'b'.repeat(64),
          accessExpiresAt: '2026-07-27T12:00:00.000Z',
        },
      }),
      provisionMarker({
        tenant: {
          ...baseTenant,
          userAccessRoles: [{ id: 'unexpected-role' }],
        },
      }),
      provisionMarker({
        tenant: {
          ...baseTenant,
          integrationSources: [{ id: 'unexpected-source' }],
        },
      }),
      provisionMarker({
        tenant: {
          ...baseTenant,
          userInvites: [
            {
              ...(baseTenant.userInvites as Record<string, unknown>[])[0],
              tokenHash: 'not-a-hash',
            },
          ],
        },
      }),
      provisionMarker({
        metadata: {
          profileVersion: 'SINGLE_DESIGN_PARTNER_V1',
          manifestDigest: 'a'.repeat(64),
          manifestHmacKeyVersion: 'v1',
          ownerInviteId: 'invite-owner',
          ownerInviteExpiresAt: '2099-08-16T12:00:00.000Z',
          ownerInviteDigest: 'b'.repeat(64),
          accessExpiresAt: '2099-08-15T12:00:00.000Z',
        },
      }),
      provisionMarker({
        tenant: {
          ...baseTenant,
          userInvites: [
            {
              ...(baseTenant.userInvites as Record<string, unknown>[])[0],
              expiresAt: new Date('2099-08-02T12:00:00.000Z'),
            },
          ],
        },
      }),
    ];

    for (const marker of driftedMarkers) {
      await expect(
        assertDesignPartnerDatabaseAdmission(
          database({ markers: [marker], tenantCount: 1 }),
          config(true),
          new Date('2026-07-28T12:00:00.000Z'),
        ),
      ).rejects.toThrow(/one exact suspended tenant/);
    }
  });

  it('rejects a database for a different expected tenant identity', async () => {
    await expect(
      assertDesignPartnerDatabaseAdmission(
        database({ markers: [provisionMarker()], tenantCount: 1 }),
        config(true, 'another-club', 'another-club.leetplus.ru'),
      ),
    ).rejects.toThrow(/one exact suspended tenant/);
  });
});
