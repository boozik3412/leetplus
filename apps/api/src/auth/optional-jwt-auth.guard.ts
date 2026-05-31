import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantLifecycleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest, AuthTokenPayload } from './auth.types';
import { resolveUserCapabilities } from './capabilities';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization) {
      return true;
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization header');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<AuthTokenPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          tenant: {
            select: {
              slug: true,
              status: true,
            },
          },
          customRole: {
            select: {
              id: true,
              name: true,
              permissions: true,
            },
          },
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid authorization token');
      }

      if (
        user.tenant.status !== TenantLifecycleStatus.ACTIVE &&
        !user.isPlatformAdmin
      ) {
        throw new UnauthorizedException('Invalid authorization token');
      }

      request.user = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        customRoleId: user.customRole?.id ?? user.customRoleId ?? null,
        customRoleName: user.customRole?.name ?? null,
        permissions: resolveUserCapabilities(user),
        isActive: user.isActive,
        isPlatformAdmin: user.isPlatformAdmin,
        tenantId: user.tenantId,
        tenantSlug: user.tenant.slug,
        tenantStatus: user.tenant.status,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid authorization token');
    }
  }
}
