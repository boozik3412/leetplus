import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ALLOWED_IMPLEMENTATION = 'auth/identity-email-claim.service.ts';
const ALLOWED_TENANT_LOCK_IMPLEMENTATIONS = new Set([
  ALLOWED_IMPLEMENTATION,
  'guest-portal/guest-portal-current190-tenant-revoke.coordinator.ts',
  'identity-mail-worker/identity-mail-worker.repository.ts',
  'identity-mail-worker/identity-mail-worker-v2-candidate.repository.ts',
  'users/employee-invite-delivery-coordinator.ts',
  'users/employee-invite-mail-worker-current189.repository.ts',
]);
const ALLOWED_USER_OWNERSHIP_WRITERS = new Set(['auth/auth.service.ts']);
const ALLOWED_INVITE_WRITERS = new Set([
  'admin/founder-owner-invite-lifecycle.service.ts',
  'auth/auth.service.ts',
  'users/users.service.ts',
]);
const FORBIDDEN_BOUNDARY_REFERENCES = [
  'prisma.identityEmailClaim',
  'tx.identityEmailClaim',
  'identity_email_claim_lock_v1',
  'identity_email_claim_reserve_invite_v1',
  'identity_email_claim_reserve_invite_v2',
  'identity_email_claim_assert_invite_v1',
  'identity_email_claim_assert_invite_locator_v1',
  'identity_email_claim_transition_v1',
  'identity_email_claim_release_v1',
  'identity_email_claim_transition_v2',
  'identity_email_claim_release_v2',
] as const;
const TENANT_LOCK_DOMAIN = 'leetplus:identity-mail-tenant:v1:';

describe('Identity email claim application boundary', () => {
  it('keeps all claim table and RPC access inside the sealed service', async () => {
    const sourceRoot = join(__dirname, '..');
    const files = await typescriptFiles(sourceRoot);
    const violations: string[] = [];

    for (const file of files) {
      const path = relative(sourceRoot, file).replaceAll('\\', '/');
      if (path === ALLOWED_IMPLEMENTATION || path.endsWith('.spec.ts')) {
        continue;
      }
      const source = await readFile(file, 'utf8');
      for (const reference of FORBIDDEN_BOUNDARY_REFERENCES) {
        if (source.includes(reference)) {
          violations.push(`${path}:${reference}`);
        }
      }
      if (
        source.includes(TENANT_LOCK_DOMAIN) &&
        !ALLOWED_TENANT_LOCK_IMPLEMENTATIONS.has(path)
      ) {
        violations.push(`${path}:${TENANT_LOCK_DOMAIN}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('shares the exact tenant lock domain only across admitted cross-path implementations', async () => {
    const sourceRoot = join(__dirname, '..');

    for (const path of ALLOWED_TENANT_LOCK_IMPLEMENTATIONS) {
      const source = await readFile(join(sourceRoot, path), 'utf8');
      expect(
        source.match(new RegExp(TENANT_LOCK_DOMAIN, 'gu')) ?? [],
      ).toHaveLength(1);
    }
  });

  it('keeps User creation and UserInvite mutation inside admitted workflows', async () => {
    const sourceRoot = join(__dirname, '..');
    const files = await typescriptFiles(sourceRoot);
    const violations: string[] = [];

    for (const file of files) {
      const path = relative(sourceRoot, file).replaceAll('\\', '/');
      if (path.endsWith('.spec.ts')) {
        continue;
      }
      const source = await readFile(file, 'utf8');
      if (
        /\b(?:this\.)?(?:prisma|tx)\.user\.(?:create|createMany|upsert)\s*\(/u.test(
          source,
        ) &&
        !ALLOWED_USER_OWNERSHIP_WRITERS.has(path)
      ) {
        violations.push(`${path}:User ownership writer`);
      }
      if (
        /\b(?:this\.)?(?:prisma|tx)\.userInvite\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/u.test(
          source,
        ) &&
        !ALLOWED_INVITE_WRITERS.has(path)
      ) {
        violations.push(`${path}:UserInvite writer`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('routes every active invite transition through the shared tenant transaction adapter', async () => {
    const sourceRoot = join(__dirname, '..');
    const admittedCallers = [
      { path: 'auth/auth.service.ts', expectedCalls: 1 },
      { path: 'users/users.service.ts', expectedCalls: 3 },
    ] as const;

    for (const caller of admittedCallers) {
      const source = await readFile(join(sourceRoot, caller.path), 'utf8');
      expect(source).not.toContain('.bindTransaction(');
      expect(source.match(/\.runTenantTransaction\s*\(/gu) ?? []).toHaveLength(
        caller.expectedCalls,
      );
    }

    const provisioningSource = await readFile(
      join(sourceRoot, 'admin/shared-tenant-provisioning.service.ts'),
      'utf8',
    );
    expect(provisioningSource).not.toContain('.bindTransaction(');
    expect(provisioningSource).toContain('recoverProtectedActivationShell(');
    expect(
      provisioningSource.match(/\.lockTenantTransaction\s*\(/gu) ?? [],
    ).toHaveLength(3);

    const founderLifecycleSource = await readFile(
      join(sourceRoot, 'admin/founder-owner-invite-lifecycle.service.ts'),
      'utf8',
    );
    expect(founderLifecycleSource).not.toContain('.bindTransaction(');
    expect(
      founderLifecycleSource.match(/\.lockTenantTransaction\s*\(/gu) ?? [],
    ).toHaveLength(3);
    expect(
      founderLifecycleSource.match(/\.releaseInvite\s*\(/gu) ?? [],
    ).toHaveLength(1);
    expect(
      founderLifecycleSource.match(/\.userInvite\.updateMany\s*\(/gu) ?? [],
    ).toHaveLength(1);
    expect(
      founderLifecycleSource.match(/founder_owner_invite_reissue_v1/gu) ?? [],
    ).toHaveLength(1);
  });
});

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await typescriptFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}
