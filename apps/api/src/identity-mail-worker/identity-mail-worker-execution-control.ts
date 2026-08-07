import type {
  IdentityMailWorkerExecutionContext,
  IdentityMailWorkerExecutionControl,
  IdentityMailWorkerExecutionMode,
} from './identity-mail-worker.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const MODE_PRIORITY: Readonly<Record<IdentityMailWorkerExecutionMode, number>> =
  Object.freeze({
    ACTIVE: 0,
    DRAINING: 1,
    KILLED: 2,
  });

/**
 * Process-local, monotonic control used by the dormant provider-boundary
 * acceptance harness. It carries tenant identifiers and modes only: no
 * credentials, provider receipts or invitation material.
 */
export class DormantIdentityMailWorkerExecutionController implements IdentityMailWorkerExecutionControl {
  private globalMode: IdentityMailWorkerExecutionMode = 'ACTIVE';
  private readonly tenantModes = new Map<
    string,
    IdentityMailWorkerExecutionMode
  >();

  beginGlobalDrain(): void {
    this.globalMode = advance(this.globalMode, 'DRAINING');
  }

  killGlobal(): void {
    this.globalMode = 'KILLED';
  }

  beginTenantDrain(tenantId: string): void {
    this.setTenantMode(tenantId, 'DRAINING');
  }

  killTenant(tenantId: string): void {
    this.setTenantMode(tenantId, 'KILLED');
  }

  modeAt(
    context: IdentityMailWorkerExecutionContext,
  ): IdentityMailWorkerExecutionMode {
    if (context.tenantId === null) {
      return this.globalMode;
    }
    assertTenantId(context.tenantId);
    const tenantMode = this.tenantModes.get(context.tenantId) ?? 'ACTIVE';
    return MODE_PRIORITY[this.globalMode] >= MODE_PRIORITY[tenantMode]
      ? this.globalMode
      : tenantMode;
  }

  snapshot(): Readonly<{
    globalMode: IdentityMailWorkerExecutionMode;
    tenants: readonly Readonly<{
      tenantId: string;
      mode: IdentityMailWorkerExecutionMode;
    }>[];
  }> {
    return Object.freeze({
      globalMode: this.globalMode,
      tenants: Object.freeze(
        [...this.tenantModes.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([tenantId, mode]) => Object.freeze({ tenantId, mode })),
      ),
    });
  }

  private setTenantMode(
    tenantId: string,
    requested: Exclude<IdentityMailWorkerExecutionMode, 'ACTIVE'>,
  ): void {
    assertTenantId(tenantId);
    const current = this.tenantModes.get(tenantId) ?? 'ACTIVE';
    this.tenantModes.set(tenantId, advance(current, requested));
  }
}

function advance(
  current: IdentityMailWorkerExecutionMode,
  requested: IdentityMailWorkerExecutionMode,
): IdentityMailWorkerExecutionMode {
  return MODE_PRIORITY[current] >= MODE_PRIORITY[requested]
    ? current
    : requested;
}

function assertTenantId(tenantId: string): void {
  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error('IDENTITY_MAIL_WORKER_CONTROL_TENANT_INVALID');
  }
}
