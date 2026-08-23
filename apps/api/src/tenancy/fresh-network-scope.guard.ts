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
 * Transitional Gate 1MT boundary for tenant-wide workspaces whose legacy
 * service selectors are not yet safe for a STORES subject.
 */
@Injectable()
export class FreshNetworkScopeGuard implements CanActivate {
  constructor(
    private readonly freshStoreScopeService: FreshStoreScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new UnauthorizedException('Fresh tenant network scope is required');
    }

    await this.freshStoreScopeService.assertNetwork(request.user);
    return true;
  }
}
