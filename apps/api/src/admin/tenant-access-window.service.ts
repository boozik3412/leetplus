import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TenantCustomerStage } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  OPEN_ENDED_TENANT_ACCESS_ENDS_AT,
  describeTenantAccess,
  isOpenEndedTenantAccess,
  isTimeBoundCustomerStage,
  type TenantAccessSummary,
} from '../tenancy/tenant-access-window';

export const TENANT_ACCESS_WINDOW_AUDIT_ACTION = 'TENANT_ACCESS_WINDOW_CHANGED';

const MODES = ['OPEN_ENDED', 'UNTIL', 'CLOSE_NOW'] as const;
export type TenantAccessWindowMode = (typeof MODES)[number];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TenantAccessWindowDto = {
  mode?: unknown;
  accessUntil?: unknown;
  expectedExecutionRevision?: unknown;
  reason?: unknown;
  confirmation?: unknown;
  requestId?: unknown;
  supportTicket?: unknown;
};

type ParsedCommand = {
  mode: TenantAccessWindowMode;
  accessUntil: Date | null;
  expectedExecutionRevision: number;
  reason: string;
  requestId: string;
  supportTicket: string | null;
};

const tenantAccessSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  customerStage: true,
  trialStartsAt: true,
  trialEndsAt: true,
  executionRevision: true,
  updatedAt: true,
} satisfies Prisma.TenantSelect;

type TenantAccessRow = Prisma.TenantGetPayload<{
  select: typeof tenantAccessSelect;
}>;

export type TenantAccessWindowResult = {
  ok: true;
  tenantId: string;
  tenantSlug: string;
  mode: TenantAccessWindowMode;
  access: TenantAccessSummary;
};

/**
 * Platform-admin control for how long a PILOT/BETA network may sign in:
 * until a date, open-ended (until further notice) or closed right now.
 * It only moves `Tenant.trialEndsAt`; stage, lifecycle, onboarding, module
 * entitlements, outbound and background execution are left untouched.
 */
@Injectable()
export class TenantAccessWindowService {
  constructor(private readonly prisma: PrismaService) {}

  async update(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: TenantAccessWindowDto,
    now = new Date(),
  ): Promise<TenantAccessWindowResult> {
    if (!actor?.id || !actor.isPlatformAdmin || actor.isActive === false) {
      throw new ForbiddenException('Platform administrator access is required');
    }

    const command = this.parse(dto);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: tenantAccessSelect,
    });
    if (!tenant) {
      throw new NotFoundException('Tenant was not found');
    }
    if (
      typeof dto.confirmation !== 'string' ||
      dto.confirmation.trim() !== tenant.slug
    ) {
      throw new BadRequestException('Tenant slug confirmation is required');
    }

    const requestDigest = this.digest({ tenantId: tenant.id, ...command });
    const replay = await this.findReplay(
      tenant.id,
      command.requestId,
      requestDigest,
    );
    if (replay) {
      return replay;
    }

    const nextEndsAt = this.resolveNextEndsAt(tenant, command, now);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.tenant.updateMany({
          where: {
            id: tenant.id,
            customerStage: tenant.customerStage,
            trialStartsAt: tenant.trialStartsAt,
            trialEndsAt: tenant.trialEndsAt,
            executionRevision: command.expectedExecutionRevision,
            updatedAt: tenant.updatedAt,
          },
          data: { trialEndsAt: nextEndsAt },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Tenant access window has changed; reload the page',
          );
        }

        const updated = await tx.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
          select: tenantAccessSelect,
        });
        if (
          updated.executionRevision !==
          command.expectedExecutionRevision + 1
        ) {
          throw new ConflictException(
            'Tenant execution revision did not advance once',
          );
        }

        const result: TenantAccessWindowResult = {
          ok: true,
          tenantId: updated.id,
          tenantSlug: updated.slug,
          mode: command.mode,
          access: describeTenantAccess(updated, now),
        };

        await tx.platformAdminAuditEvent.create({
          data: {
            tenantId: tenant.id,
            actorUserId: actor.id,
            requestId: command.requestId,
            action: TENANT_ACCESS_WINDOW_AUDIT_ACTION,
            targetType: 'TENANT',
            targetId: tenant.id,
            reason: command.reason,
            before: this.serializeTenant(tenant),
            after: this.serializeTenant(updated),
            metadata: {
              mode: command.mode,
              requestDigest,
              supportTicket: command.supportTicket,
              expectedExecutionRevision: command.expectedExecutionRevision,
              nextExecutionRevision: updated.executionRevision,
              confirmationRule: 'tenant_slug',
              result,
            },
          },
        });

        return result;
      });
    } catch (error) {
      const concurrentReplay = await this.findReplay(
        tenant.id,
        command.requestId,
        requestDigest,
      );
      if (concurrentReplay) {
        return concurrentReplay;
      }
      throw error;
    }
  }

  private resolveNextEndsAt(
    tenant: TenantAccessRow,
    command: ParsedCommand,
    now: Date,
  ): Date {
    if (!isTimeBoundCustomerStage(tenant.customerStage)) {
      throw new ConflictException(
        tenant.customerStage === TenantCustomerStage.INTERNAL
          ? 'Internal networks have no access time limit'
          : 'LIVE networks have no access time limit',
      );
    }
    if (!tenant.trialStartsAt || !tenant.trialEndsAt) {
      throw new ConflictException(
        'Tenant access starts with its activation; activate the network first',
      );
    }
    if (tenant.executionRevision !== command.expectedExecutionRevision) {
      throw new ConflictException(
        'Tenant access window has changed; reload the page',
      );
    }

    const currentlyOpen = now < tenant.trialEndsAt;
    let nextEndsAt: Date;

    switch (command.mode) {
      case 'OPEN_ENDED':
        if (isOpenEndedTenantAccess(tenant.trialEndsAt)) {
          throw new BadRequestException('Tenant access is already open-ended');
        }
        nextEndsAt = OPEN_ENDED_TENANT_ACCESS_ENDS_AT;
        break;
      case 'UNTIL':
        nextEndsAt = command.accessUntil as Date;
        if (nextEndsAt <= now) {
          throw new BadRequestException('accessUntil must be in the future');
        }
        if (isOpenEndedTenantAccess(nextEndsAt)) {
          throw new BadRequestException(
            'Use the open-ended mode instead of a far-future date',
          );
        }
        if (nextEndsAt.getTime() === tenant.trialEndsAt.getTime()) {
          throw new BadRequestException('Tenant access already ends then');
        }
        break;
      case 'CLOSE_NOW':
        if (!currentlyOpen) {
          throw new BadRequestException('Tenant access is already closed');
        }
        nextEndsAt = now;
        break;
    }

    if (nextEndsAt <= tenant.trialStartsAt) {
      throw new BadRequestException('Tenant access must end after it starts');
    }
    return nextEndsAt;
  }

  private async findReplay(
    tenantId: string,
    requestId: string,
    requestDigest: string,
  ): Promise<TenantAccessWindowResult | null> {
    const event = await this.prisma.platformAdminAuditEvent.findUnique({
      where: {
        tenantId_action_requestId: {
          tenantId,
          action: TENANT_ACCESS_WINDOW_AUDIT_ACTION,
          requestId,
        },
      },
      select: { metadata: true },
    });
    if (!event) {
      return null;
    }

    const metadata = event.metadata;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      metadata.requestDigest !== requestDigest ||
      !metadata.result ||
      typeof metadata.result !== 'object'
    ) {
      throw new ConflictException(
        'requestId was already used for a different access change',
      );
    }
    return metadata.result as unknown as TenantAccessWindowResult;
  }

  private parse(dto: TenantAccessWindowDto): ParsedCommand {
    if (!dto || typeof dto !== 'object' || Array.isArray(dto)) {
      throw new BadRequestException('Request body must be an object');
    }

    const mode = MODES.find((candidate) => candidate === dto.mode);
    if (!mode) {
      throw new BadRequestException(`mode must be one of ${MODES.join(', ')}`);
    }

    let accessUntil: Date | null = null;
    if (mode === 'UNTIL') {
      if (
        typeof dto.accessUntil !== 'string' ||
        !dto.accessUntil.includes('T')
      ) {
        throw new BadRequestException(
          'accessUntil must be an ISO-8601 timestamp',
        );
      }
      accessUntil = new Date(dto.accessUntil);
      if (Number.isNaN(accessUntil.getTime())) {
        throw new BadRequestException(
          'accessUntil must be an ISO-8601 timestamp',
        );
      }
    } else if (dto.accessUntil !== undefined && dto.accessUntil !== null) {
      throw new BadRequestException('accessUntil is only allowed for UNTIL');
    }

    const expectedExecutionRevision = dto.expectedExecutionRevision;
    if (
      typeof expectedExecutionRevision !== 'number' ||
      !Number.isSafeInteger(expectedExecutionRevision) ||
      expectedExecutionRevision < 0
    ) {
      throw new BadRequestException(
        'expectedExecutionRevision must be a non-negative integer',
      );
    }

    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (reason.length < 10 || reason.length > 500) {
      throw new BadRequestException('reason must contain 10-500 characters');
    }

    if (typeof dto.requestId !== 'string' || !UUID.test(dto.requestId)) {
      throw new BadRequestException('requestId must be a UUID');
    }

    let supportTicket: string | null = null;
    if (typeof dto.supportTicket === 'string' && dto.supportTicket.trim()) {
      supportTicket = dto.supportTicket.trim();
      if (supportTicket.length > 200) {
        throw new BadRequestException(
          'supportTicket must contain 1-200 characters',
        );
      }
    }

    return {
      mode,
      accessUntil,
      expectedExecutionRevision,
      reason,
      requestId: dto.requestId.toLowerCase(),
      supportTicket,
    };
  }

  private digest(
    value: {
      tenantId: string;
    } & ParsedCommand,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: value.tenantId,
          mode: value.mode,
          accessUntil: value.accessUntil?.toISOString() ?? null,
          expectedExecutionRevision: value.expectedExecutionRevision,
          reason: value.reason,
          requestId: value.requestId,
          supportTicket: value.supportTicket,
        }),
      )
      .digest('hex');
  }

  private serializeTenant(tenant: TenantAccessRow) {
    return {
      id: tenant.id,
      slug: tenant.slug,
      status: tenant.status,
      customerStage: tenant.customerStage,
      trialStartsAt: tenant.trialStartsAt?.toISOString() ?? null,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      executionRevision: tenant.executionRevision,
    };
  }
}
