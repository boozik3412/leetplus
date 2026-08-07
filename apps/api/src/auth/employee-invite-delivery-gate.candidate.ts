import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

type EmployeeInviteDeliveryBoundary = Pick<
  Prisma.TransactionClient,
  '$queryRaw'
>;

export const EMPLOYEE_INVITE_DELIVERY_GATE_DORMANT_POLICY = Object.freeze({
  enabled: false,
  executionMode: 'DORMANT_TEST_ONLY' as const,
  environment: 'test' as const,
});

export type EmployeeInviteDeliveryGateDormantPolicy = Readonly<{
  enabled: boolean;
  executionMode: 'DORMANT_TEST_ONLY';
  environment: 'test' | 'ci';
}>;

export type EmployeeInviteDeliveryGateInput = Readonly<{
  tenantId: string;
  inviteId: string;
  tokenHash: string;
}>;

type DeliveryAssertionRow = {
  sent: boolean;
};

/**
 * Candidate-only preview/accept seam for employee invitations. It is absent
 * from AuthModule and cannot execute in production. Activation must happen
 * only after CURRENT189 is canonical, roles/grants are attested, and the SMTP
 * provider acceptance suite is green.
 */
export class EmployeeInviteDeliveryGateCandidate {
  constructor(
    private readonly boundary: EmployeeInviteDeliveryBoundary,
    private readonly policy: EmployeeInviteDeliveryGateDormantPolicy = EMPLOYEE_INVITE_DELIVERY_GATE_DORMANT_POLICY,
  ) {}

  async assertSent(input: EmployeeInviteDeliveryGateInput): Promise<void> {
    this.assertDormantPolicy();
    this.assertInput(input);
    await this.assertSentThrough(this.boundary, input);
  }

  async assertSentInTransaction(
    tx: Prisma.TransactionClient,
    input: EmployeeInviteDeliveryGateInput,
  ): Promise<void> {
    this.assertDormantPolicy();
    this.assertInput(input);
    const candidate = tx as unknown as Record<string, unknown>;
    if (
      typeof candidate.$connect === 'function' ||
      typeof candidate.$disconnect === 'function'
    ) {
      throw new ServiceUnavailableException({
        message:
          'Employee invite delivery assertion requires an interactive transaction',
        reasonCode: 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_TRANSACTION_REQUIRED',
      });
    }
    await this.assertSentThrough(tx, input);
  }

  private async assertSentThrough(
    boundary: EmployeeInviteDeliveryBoundary,
    input: EmployeeInviteDeliveryGateInput,
  ): Promise<void> {
    try {
      const rows = await boundary.$queryRaw<DeliveryAssertionRow[]>(Prisma.sql`
        SELECT public."identity_employee_invite_delivery_assert_sent_current189_v1"(
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
          message: 'Employee invite delivery is not verified',
          reasonCode: 'EMPLOYEE_INVITE_DELIVERY_NOT_SENT',
        });
      }
    } catch (error) {
      throw this.boundaryError(error);
    }
  }

  private assertDormantPolicy(): void {
    if (
      process.env.NODE_ENV === 'production' ||
      this.policy.enabled !== true ||
      this.policy.executionMode !== 'DORMANT_TEST_ONLY' ||
      !['test', 'ci'].includes(this.policy.environment)
    ) {
      throw new ServiceUnavailableException({
        message: 'Employee invite delivery assertion is dormant',
        reasonCode: 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_DORMANT',
      });
    }
  }

  private assertInput(input: EmployeeInviteDeliveryGateInput): void {
    if (
      !UUID_PATTERN.test(input.tenantId) ||
      !UUID_PATTERN.test(input.inviteId) ||
      !SHA256_PATTERN.test(input.tokenHash)
    ) {
      throw new BadRequestException({
        message: 'Employee invite delivery assertion input is invalid',
        reasonCode: 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_INPUT_INVALID',
      });
    }
  }

  private boundaryError(error: unknown): Error {
    if (
      error instanceof BadRequestException ||
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
        message: 'Employee invite delivery assertion must be retried',
        reasonCode: 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_RETRY_REQUIRED',
      });
    }
    if (sqlState === '42501' || sqlState === '42883') {
      return new ServiceUnavailableException({
        message: 'Employee invite delivery boundary is not enrolled',
        reasonCode: 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_BOUNDARY_NOT_ENROLLED',
      });
    }
    return new ServiceUnavailableException({
      message: 'Employee invite delivery boundary is unavailable',
      reasonCode: 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_BOUNDARY_UNAVAILABLE',
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
      message: 'Employee invite delivery boundary returned an invalid response',
      reasonCode: 'EMPLOYEE_INVITE_DELIVERY_ASSERTION_RESPONSE_INVALID',
    });
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
