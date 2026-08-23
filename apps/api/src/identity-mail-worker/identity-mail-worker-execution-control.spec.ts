import { DormantIdentityMailWorkerExecutionController } from './identity-mail-worker-execution-control';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

describe('DormantIdentityMailWorkerExecutionController', () => {
  it('keeps tenant drain isolated and combines it with the global mode', () => {
    const control = new DormantIdentityMailWorkerExecutionController();

    control.beginTenantDrain(TENANT_A);
    expect(mode(control, TENANT_A)).toBe('DRAINING');
    expect(mode(control, TENANT_B)).toBe('ACTIVE');

    control.beginGlobalDrain();
    expect(mode(control, TENANT_A)).toBe('DRAINING');
    expect(mode(control, TENANT_B)).toBe('DRAINING');

    control.killGlobal();
    expect(mode(control, TENANT_A)).toBe('KILLED');
    expect(mode(control, TENANT_B)).toBe('KILLED');
  });

  it('never weakens a tenant kill back to drain', () => {
    const control = new DormantIdentityMailWorkerExecutionController();

    control.killTenant(TENANT_A);
    control.beginTenantDrain(TENANT_A);

    expect(mode(control, TENANT_A)).toBe('KILLED');
    expect(control.snapshot()).toEqual({
      globalMode: 'ACTIVE',
      tenants: [{ tenantId: TENANT_A, mode: 'KILLED' }],
    });
  });

  it('rejects a malformed tenant identifier without storing it', () => {
    const control = new DormantIdentityMailWorkerExecutionController();

    expect(() => control.killTenant('demo')).toThrow(
      'IDENTITY_MAIL_WORKER_CONTROL_TENANT_INVALID',
    );
    expect(control.snapshot()).toEqual({
      globalMode: 'ACTIVE',
      tenants: [],
    });
  });
});

function mode(
  control: DormantIdentityMailWorkerExecutionController,
  tenantId: string,
) {
  return control.modeAt({ boundary: 'BEFORE_CLAIM', tenantId });
}
