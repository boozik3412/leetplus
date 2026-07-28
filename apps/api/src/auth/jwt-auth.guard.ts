import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { resolveAccessScopeEnforcementMode } from '../config/environment-validation';
import { PrismaService } from '../prisma/prisma.service';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { TenantExecutionPolicyService } from '../tenancy/tenant-execution-policy.service';
import { AuthenticatedRequest, AuthTokenPayload } from './auth.types';
import { resolveUserCapabilities } from './capabilities';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly accessScopeService: AccessScopeService,
    private readonly tenantExecutionPolicy: TenantExecutionPolicyService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authorization bearer token is required');
    }

    request.user = await this.verifyToken(token);
    return true;
  }

  protected async verifyToken(token: string) {
    try {
      const payload =
        await this.jwtService.verifyAsync<AuthTokenPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          tenant: {
            select: {
              id: true,
              slug: true,
              status: true,
              customerStage: true,
              onboardingStatus: true,
              trialStartsAt: true,
              trialEndsAt: true,
              entitlementProfileRevision: true,
            },
          },
          customRole: {
            select: {
              id: true,
              name: true,
              permissions: true,
            },
          },
          storeAccesses: {
            select: {
              storeId: true,
              store: {
                select: {
                  tenantId: true,
                },
              },
            },
          },
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid authorization token');
      }

      if (!user.isPlatformAdmin) {
        this.tenantExecutionPolicy.assertSessionAllowed(user.tenant);
      }

      const roleOverride = user.customRole
        ? null
        : await this.prisma.userRoleOverride.findUnique({
            where: {
              tenantId_role: {
                tenantId: user.tenantId,
                role: user.role,
              },
            },
            select: {
              permissions: true,
            },
          });
      const accessScopeEnforcementMode = resolveAccessScopeEnforcementMode(
        this.configService.get<string>('ACCESS_SCOPE_ENFORCEMENT_MODE'),
      );

      if (
        accessScopeEnforcementMode === 'SHADOW' &&
        user.accessScope === null
      ) {
        this.logger.warn(
          JSON.stringify({
            event: 'access_scope_shadow_unclassified_subject',
            reasonCode: 'SCOPE_MISSING',
            decision: 'DENY',
            userId: user.id,
            tenantId: user.tenantId,
            legacyStoreCount: user.storeAccesses.length,
            releaseSha: this.configService.get<string>('RELEASE_SHA') ?? null,
          }),
        );
      }
      const accessScope = this.accessScopeService.fromPersisted(user);

      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        customRoleId: user.customRole?.id ?? user.customRoleId ?? null,
        customRoleName: user.customRole?.name ?? null,
        hasRoleOverride: Boolean(roleOverride),
        permissions: resolveUserCapabilities({ ...user, roleOverride }),
        isActive: user.isActive,
        isPlatformAdmin: user.isPlatformAdmin,
        tenantId: user.tenantId,
        tenantSlug: user.tenant.slug,
        tenantStatus: user.tenant.status,
        tenantCustomerStage: user.tenant.customerStage,
        tenantOnboardingStatus: user.tenant.onboardingStatus,
        tenantTrialStartsAt: user.tenant.trialStartsAt,
        tenantTrialEndsAt: user.tenant.trialEndsAt,
        tenantEntitlementProfileRevision:
          user.tenant.entitlementProfileRevision,
        accessScope: accessScope.mode,
        allowedStoreIds: accessScope.storeIds,
      };
    } catch {
      throw new UnauthorizedException('Invalid authorization token');
    }
  }

  protected extractBearerToken(request: AuthenticatedRequest): string | null {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
