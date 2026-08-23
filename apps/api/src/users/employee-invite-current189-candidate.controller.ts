import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  EmployeeInviteCurrent189DormantRouteApplication,
  type EmployeeInviteCurrent189SafeResponse,
} from './employee-invite-current189-route-policy';

const MAXIMUM_COMMAND_BYTES = 8 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ISSUE_FIELDS = new Set([
  'requestId',
  'email',
  'fullName',
  'role',
  'customRoleId',
  'scope',
  'storeIds',
  'expiresAt',
]);
const REVOKE_FIELDS = new Set(['requestId', 'reason']);

/**
 * Dormant CURRENT189 Nest transport candidate.
 *
 * The decorator metadata makes the future HTTP contract executable in an
 * isolated test module. This controller is deliberately absent from every
 * production Nest module and must not be registered before canonical/runtime
 * admission is complete.
 */
@Controller('users')
@Roles(UserRole.OWNER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeeInviteCurrent189CandidateController {
  constructor(
    private readonly application: EmployeeInviteCurrent189DormantRouteApplication,
  ) {}

  @Post('invites')
  @HttpCode(HttpStatus.CREATED)
  createInvite(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmployeeInviteCurrent189SafeResponse> {
    this.setPrivateHeaders(response);
    this.assertCommandTransport(
      contentType,
      contentLength,
      idempotencyKey,
      body,
      ISSUE_FIELDS,
    );
    return this.application.dispatch({
      handler: 'createInvite',
      method: 'POST',
      path: '/users/invites',
      actor,
      body,
    });
  }

  @Patch('invites/:id')
  @HttpCode(HttpStatus.OK)
  updateInvite(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') inviteId: string,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmployeeInviteCurrent189SafeResponse> {
    this.setPrivateHeaders(response);
    this.assertInviteId(inviteId);
    this.assertCommandTransport(
      contentType,
      contentLength,
      idempotencyKey,
      body,
      ISSUE_FIELDS,
    );
    return this.application.dispatch({
      handler: 'updateInvite',
      method: 'PATCH',
      path: '/users/invites/:id',
      actor,
      inviteId,
      body,
    });
  }

  @Delete('invites/:id')
  @HttpCode(HttpStatus.OK)
  cancelInvite(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') inviteId: string,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmployeeInviteCurrent189SafeResponse> {
    this.setPrivateHeaders(response);
    this.assertInviteId(inviteId);
    this.assertCommandTransport(
      contentType,
      contentLength,
      idempotencyKey,
      body,
      REVOKE_FIELDS,
    );
    return this.application.dispatch({
      handler: 'cancelInvite',
      method: 'DELETE',
      path: '/users/invites/:id',
      actor,
      inviteId,
      body,
    });
  }

  private assertCommandTransport(
    contentType: string | undefined,
    contentLength: string | undefined,
    idempotencyKey: string | undefined,
    body: unknown,
    fields: ReadonlySet<string>,
  ): void {
    if (contentType?.trim().toLowerCase() !== 'application/json') {
      throw invalidTransport('EMPLOYEE_INVITE_CURRENT189_MEDIA_TYPE_INVALID');
    }
    if (
      contentLength !== undefined &&
      (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength) ||
        Number(contentLength) > MAXIMUM_COMMAND_BYTES)
    ) {
      throw invalidTransport('EMPLOYEE_INVITE_CURRENT189_BODY_TOO_LARGE');
    }
    if (!record(body) || !exactKeys(body, fields)) {
      throw invalidTransport('EMPLOYEE_INVITE_CURRENT189_BODY_SHAPE_INVALID');
    }
    let serializedBytes: number;
    try {
      serializedBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
    } catch {
      throw invalidTransport('EMPLOYEE_INVITE_CURRENT189_BODY_SHAPE_INVALID');
    }
    if (serializedBytes < 2 || serializedBytes > MAXIMUM_COMMAND_BYTES) {
      throw invalidTransport('EMPLOYEE_INVITE_CURRENT189_BODY_TOO_LARGE');
    }
    if (
      contentLength !== undefined &&
      Number(contentLength) !== serializedBytes
    ) {
      throw invalidTransport(
        'EMPLOYEE_INVITE_CURRENT189_CONTENT_LENGTH_MISMATCH',
      );
    }
    if (
      !UUID_PATTERN.test(idempotencyKey ?? '') ||
      body.requestId !== idempotencyKey
    ) {
      throw invalidTransport(
        'EMPLOYEE_INVITE_CURRENT189_IDEMPOTENCY_BINDING_INVALID',
      );
    }
  }

  private assertInviteId(inviteId: string): void {
    if (!UUID_PATTERN.test(inviteId)) {
      throw invalidTransport('EMPLOYEE_INVITE_CURRENT189_INVITE_ID_INVALID');
    }
  }

  private setPrivateHeaders(response: Response): void {
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    response.setHeader('Vary', 'Authorization, Cookie, Idempotency-Key');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  }
}

function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.size &&
    actual.every((field) => expected.has(field))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidTransport(reasonCode: string): BadRequestException {
  return new BadRequestException({
    message: 'Employee invite request is invalid',
    reasonCode,
  });
}
