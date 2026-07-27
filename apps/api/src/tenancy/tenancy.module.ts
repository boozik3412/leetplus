import { Global, Module } from '@nestjs/common';
import { AccessScopeService } from './access-scope.service';
import { TenantContextService } from './tenant-context.service';

@Global()
@Module({
  providers: [AccessScopeService, TenantContextService],
  exports: [AccessScopeService, TenantContextService],
})
export class TenancyModule {}
