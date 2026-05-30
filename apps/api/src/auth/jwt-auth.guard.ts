import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest, AuthTokenPayload } from './auth.types';
import { resolveUserCapabilities } from './capabilities';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
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
              slug: true,
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

      return {
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
