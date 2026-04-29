import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedRequest, AuthTokenPayload } from './auth.types';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

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
      request.user = {
        id: payload.sub,
        email: payload.email,
        fullName: null,
        role: payload.role,
        isPlatformAdmin: payload.isPlatformAdmin,
        tenantId: payload.tenantId,
        tenantSlug: payload.tenantSlug,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid authorization token');
    }
  }
}
