import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type InitialOwnerInviteDeliveryBoundary = Pick<
  Prisma.TransactionClient,
  '$queryRaw'
>;

export type InitialOwnerInviteDeliveryGateInput = {
  tenantId: string;
  inviteId: string;
  tokenHash: string;
};

type DeliveryAssertionRow = {
  sent: boolean;
};

@Injectable()
export class InitialOwnerInviteDeliveryGateService {
  constructor(private readonly prisma: PrismaService) {}

  async assertSent(input: InitialOwnerInviteDeliveryGateInput): Promise<void> {
    await this.assertSentThrough(this.prisma, input);
  }

  async assertSentInTransaction(
    tx: Prisma.TransactionClient,
    input: InitialOwnerInviteDeliveryGateInput,
  ): Promise<void> {
    const candidate = tx as unknown as Record<string, unknown>;
    if (
      typeof candidate.$connect === 'function' ||
      typeof candidate.$disconnect === 'function'
    ) {
      throw new ServiceUnavailableException({
        message:
          'Initial owner invite delivery assertion requires an interactive transaction',
        reasonCode:
          'INITIAL_OWNER_INVITE_DELIVERY_ASSERTION_TRANSACTION_REQUIRED',
      });
    }
    await this.assertSentThrough(tx, input);
  }

  private async assertSentThrough(
    boundary: InitialOwnerInviteDeliveryBoundary,
    input: InitialOwnerInviteDeliveryGateInput,
  ): Promise<void> {
    try {
      const rows = await boundary.$queryRaw<DeliveryAssertionRow[]>(Prisma.sql`
        SELECT public."identity_initial_owner_invite_delivery_assert_sent_v1"(
          ${input.tenantId}::TEXT,
          ${input.inviteId}::TEXT,
          ${input.tokenHash}::TEXT
        ) AS sent
      `);
      if (rows.length !== 1 || typeof rows[0]?.sent !== 'boolean') {
        throw this.invalidResponse();
      }
      if (!rows[0].sent) {
        throw new UnauthorizedException({
          message: 'Initial owner invite delivery is not verified',
          reasonCode: 'INITIAL_OWNER_INVITE_DELIVERY_NOT_SENT',
        });
      }
    } catch (error) {
      throw this.boundaryError(error);
    }
  }

  private boundaryError(error: unknown): Error {
    if (
      error instanceof ConflictException ||
      error instanceof ServiceUnavailableException ||
      error instanceof UnauthorizedException
    ) {
      return error;
    }
    const errorCode = this.errorCode(error);
    const sqlState = this.sqlState(error);
    if (errorCode === 'P2034' || sqlState === '40001' || sqlState === '40P01') {
      return new ConflictException({
        message: 'Initial owner invite delivery assertion must be retried',
        reasonCode: 'INITIAL_OWNER_INVITE_DELIVERY_ASSERTION_RETRY_REQUIRED',
      });
    }
    if (sqlState === '42501') {
      return new ServiceUnavailableException({
        message: 'Initial owner invite delivery boundary is not enrolled',
        reasonCode:
          'INITIAL_OWNER_INVITE_DELIVERY_ASSERTION_BOUNDARY_NOT_ENROLLED',
      });
    }
    return new ServiceUnavailableException({
      message: 'Initial owner invite delivery boundary is unavailable',
      reasonCode:
        'INITIAL_OWNER_INVITE_DELIVERY_ASSERTION_BOUNDARY_UNAVAILABLE',
    });
  }

  private sqlState(error: unknown): string | null {
    if (!this.record(error)) {
      return null;
    }
    const code = this.errorCode(error);
    if (
      code === 'P2010' &&
      this.record(error.meta) &&
      typeof error.meta.code === 'string' &&
      /^[0-9A-Z]{5}$/u.test(error.meta.code)
    ) {
      return error.meta.code;
    }
    if (code && /^[0-9A-Z]{5}$/u.test(code)) {
      return code;
    }
    return null;
  }

  private errorCode(error: unknown): string | null {
    return this.record(error) && typeof error.code === 'string'
      ? error.code
      : null;
  }

  private invalidResponse(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      message:
        'Initial owner invite delivery boundary returned an invalid response',
      reasonCode: 'INITIAL_OWNER_INVITE_DELIVERY_ASSERTION_RESPONSE_INVALID',
    });
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
