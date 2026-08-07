import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FreshStoreScopeService } from './fresh-store-scope.service';

type RequestWithUser = {
  user?: AuthenticatedUser;
};

/**
 * Re-attests either NETWORK or STORES authority against PostgreSQL before a
 * handler consumes tenant/store selectors derived from the authenticated user.
 */
@Injectable()
export class FreshStoreScopeGuard implements CanActivate {
  constructor(
    private readonly freshStoreScopeService: FreshStoreScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new UnauthorizedException('Fresh tenant store scope is required');
    }

    await this.freshStoreScopeService.resolve(request.user);
    return true;
  }
}
