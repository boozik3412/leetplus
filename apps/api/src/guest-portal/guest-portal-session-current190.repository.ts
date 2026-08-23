import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const GUEST_PORTAL_SESSION_CURRENT190_CONTRACT =
  'GUEST_PORTAL_SESSION_CURRENT190_V1' as const;

export type GuestPortalSessionCurrent190Action = 'READ' | 'WRITE';

export type GuestPortalSessionCurrent190Binding = {
  sessionId: string;
  tokenVersion: number;
  tenantId: string;
  storeId: string;
  profileId: string;
  guestId: string | null;
  jtiDigest: string;
  bindingDigest: string;
};

export type GuestPortalSessionCurrent190IssueInput = Omit<
  GuestPortalSessionCurrent190Binding,
  'tokenVersion'
> & {
  ttlSeconds: number;
};

export type GuestPortalSessionCurrent190IssueResult = {
  sessionId: string;
  tokenVersion: number;
  issuedAt: Date;
  expiresAt: Date;
  executionRevision: number;
  entitlementProfileRevision: number;
  replayed: boolean;
};

export type GuestPortalSessionCurrent190RotationInput = {
  source: GuestPortalSessionCurrent190Binding;
  rotationRequestDigest: string;
  target: GuestPortalSessionCurrent190IssueInput;
};

export type GuestPortalSessionCurrent190Permit = {
  sessionId: string;
  tenantId: string;
  storeId: string;
  profileId: string;
  guestId: string | null;
  tokenVersion: number;
  expiresAt: Date;
  executionRevision: number;
  entitlementProfileRevision: number;
};

export type GuestPortalSessionCurrent190MediaPermit = {
  assetId: string;
  tenantId: string;
  contentType: string;
  byteSize: number;
};

@Injectable()
export class GuestPortalSessionCurrent190Repository {
  constructor(private readonly prisma: PrismaService) {}

  async assertPublicStore(tenantSlug: string, storeLocator: string) {
    const rows = await this.query(
      Prisma.sql`
        SELECT *
        FROM public.guest_portal_public_store_assert_current190_v1(
          ${tenantSlug},
          ${storeLocator}
        )
      `,
    );

    return this.parsePublicStorePermit(rows);
  }

  async issue(
    input: GuestPortalSessionCurrent190IssueInput,
  ): Promise<GuestPortalSessionCurrent190IssueResult> {
    const rows = await this.query(
      Prisma.sql`
        SELECT *
        FROM public.guest_portal_session_issue_current190_v1(
          ${input.sessionId},
          ${input.tenantId},
          ${input.storeId},
          ${input.profileId},
          ${input.guestId},
          ${input.jtiDigest},
          ${input.bindingDigest},
          ${input.ttlSeconds}
        )
      `,
    );

    return this.parseIssueResult(rows);
  }

  async assertSession(
    binding: GuestPortalSessionCurrent190Binding,
    action: GuestPortalSessionCurrent190Action,
  ): Promise<GuestPortalSessionCurrent190Permit> {
    const rows = await this.query(
      Prisma.sql`
        SELECT *
        FROM public.guest_portal_session_assert_current190_v1(
          ${binding.sessionId},
          ${binding.tokenVersion},
          ${binding.tenantId},
          ${binding.storeId},
          ${binding.profileId},
          ${binding.guestId},
          ${binding.jtiDigest},
          ${binding.bindingDigest},
          ${action}
        )
      `,
    );

    return this.parsePermit(rows);
  }

  async rotate(
    input: GuestPortalSessionCurrent190RotationInput,
  ): Promise<GuestPortalSessionCurrent190IssueResult> {
    const source = input.source;
    const target = input.target;
    const rows = await this.query(
      Prisma.sql`
        SELECT *
        FROM public.guest_portal_session_rotate_current190_v1(
          ${source.sessionId},
          ${source.tokenVersion},
          ${source.tenantId},
          ${source.storeId},
          ${source.profileId},
          ${source.guestId},
          ${source.jtiDigest},
          ${source.bindingDigest},
          ${input.rotationRequestDigest},
          ${target.sessionId},
          ${target.tenantId},
          ${target.storeId},
          ${target.profileId},
          ${target.guestId},
          ${target.jtiDigest},
          ${target.bindingDigest},
          ${target.ttlSeconds}
        )
      `,
    );

    return this.parseIssueResult(rows);
  }

  async revoke(
    binding: GuestPortalSessionCurrent190Binding,
    revocationRequestDigest: string,
  ) {
    const rows = await this.query(
      Prisma.sql`
        SELECT *
        FROM public.guest_portal_session_revoke_current190_v1(
          ${binding.sessionId},
          ${binding.tokenVersion},
          ${binding.tenantId},
          ${binding.storeId},
          ${binding.profileId},
          ${binding.guestId},
          ${binding.jtiDigest},
          ${binding.bindingDigest},
          ${revocationRequestDigest}
        )
      `,
    );

    return this.parseRevokeResult(rows);
  }

  async assertMedia(
    binding: GuestPortalSessionCurrent190Binding,
    assetId: string,
  ): Promise<GuestPortalSessionCurrent190MediaPermit> {
    const rows = await this.query(
      Prisma.sql`
        SELECT *
        FROM public.guest_portal_media_assert_current190_v1(
          ${binding.sessionId},
          ${binding.tokenVersion},
          ${binding.tenantId},
          ${binding.storeId},
          ${binding.profileId},
          ${binding.guestId},
          ${binding.jtiDigest},
          ${binding.bindingDigest},
          ${assetId}
        )
      `,
    );

    return this.parseMediaPermit(rows);
  }

  private async query(query: Prisma.Sql): Promise<unknown> {
    try {
      return await this.prisma.$queryRaw(query);
    } catch {
      throw new ServiceUnavailableException(
        'Persisted guest portal session candidate is unavailable',
      );
    }
  }

  private parseIssueResult(
    value: unknown,
  ): GuestPortalSessionCurrent190IssueResult {
    const row = this.exactRow(value, [
      'entitlementProfileRevision',
      'executionRevision',
      'expiresAt',
      'issuedAt',
      'replayed',
      'sessionId',
      'tokenVersion',
    ]);
    const issuedAt = this.date(row.issuedAt);
    const expiresAt = this.date(row.expiresAt);

    if (
      typeof row.sessionId !== 'string' ||
      !this.positiveInteger(row.tokenVersion) ||
      !this.positiveInteger(row.executionRevision) ||
      !this.positiveInteger(row.entitlementProfileRevision) ||
      typeof row.replayed !== 'boolean' ||
      issuedAt >= expiresAt
    ) {
      throw this.invalidResult();
    }

    return {
      sessionId: row.sessionId,
      tokenVersion: row.tokenVersion,
      issuedAt,
      expiresAt,
      executionRevision: row.executionRevision,
      entitlementProfileRevision: row.entitlementProfileRevision,
      replayed: row.replayed,
    };
  }

  private parsePermit(value: unknown): GuestPortalSessionCurrent190Permit {
    const row = this.exactRow(value, [
      'entitlementProfileRevision',
      'executionRevision',
      'expiresAt',
      'guestId',
      'profileId',
      'sessionId',
      'storeId',
      'tenantId',
      'tokenVersion',
    ]);
    const expiresAt = this.date(row.expiresAt);

    if (
      typeof row.sessionId !== 'string' ||
      typeof row.tenantId !== 'string' ||
      typeof row.storeId !== 'string' ||
      typeof row.profileId !== 'string' ||
      (row.guestId !== null && typeof row.guestId !== 'string') ||
      !this.positiveInteger(row.tokenVersion) ||
      !this.positiveInteger(row.executionRevision) ||
      !this.positiveInteger(row.entitlementProfileRevision)
    ) {
      throw this.invalidResult();
    }

    return {
      sessionId: row.sessionId,
      tenantId: row.tenantId,
      storeId: row.storeId,
      profileId: row.profileId,
      guestId: row.guestId,
      tokenVersion: row.tokenVersion,
      expiresAt,
      executionRevision: row.executionRevision,
      entitlementProfileRevision: row.entitlementProfileRevision,
    };
  }

  private parsePublicStorePermit(value: unknown) {
    const row = this.exactRow(value, [
      'entitlementProfileRevision',
      'executionRevision',
      'storeId',
      'tenantId',
    ]);
    if (
      typeof row.tenantId !== 'string' ||
      typeof row.storeId !== 'string' ||
      !this.positiveInteger(row.executionRevision) ||
      !this.positiveInteger(row.entitlementProfileRevision)
    ) {
      throw this.invalidResult();
    }
    return {
      tenantId: row.tenantId,
      storeId: row.storeId,
      executionRevision: row.executionRevision,
      entitlementProfileRevision: row.entitlementProfileRevision,
    };
  }

  private parseRevokeResult(value: unknown) {
    const row = this.exactRow(value, [
      'replayed',
      'revokedAt',
      'sessionId',
      'status',
    ]);
    const revokedAt = this.date(row.revokedAt);
    if (
      typeof row.sessionId !== 'string' ||
      row.status !== 'REVOKED' ||
      typeof row.replayed !== 'boolean'
    ) {
      throw this.invalidResult();
    }
    return {
      sessionId: row.sessionId,
      status: row.status,
      revokedAt,
      replayed: row.replayed,
    };
  }

  private parseMediaPermit(
    value: unknown,
  ): GuestPortalSessionCurrent190MediaPermit {
    const row = this.exactRow(value, [
      'assetId',
      'byteSize',
      'contentType',
      'tenantId',
    ]);
    if (
      typeof row.assetId !== 'string' ||
      typeof row.tenantId !== 'string' ||
      typeof row.contentType !== 'string' ||
      typeof row.byteSize !== 'number' ||
      !Number.isSafeInteger(row.byteSize) ||
      row.byteSize < 0
    ) {
      throw this.invalidResult();
    }
    return {
      assetId: row.assetId,
      tenantId: row.tenantId,
      contentType: row.contentType,
      byteSize: row.byteSize,
    };
  }

  private exactRow(value: unknown, expectedKeys: readonly string[]) {
    if (!Array.isArray(value) || value.length !== 1) {
      throw this.invalidResult();
    }
    const row: unknown = value[0];
    if (!this.record(row)) {
      throw this.invalidResult();
    }
    if (Object.keys(row).sort().join('|') !== expectedKeys.join('|')) {
      throw this.invalidResult();
    }
    return row;
  }

  private date(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw this.invalidResult();
    }
    return date;
  }

  private positiveInteger(value: unknown): value is number {
    return (
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    );
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private invalidResult() {
    return new ServiceUnavailableException(
      'Invalid persisted guest portal session candidate response',
    );
  }
}
