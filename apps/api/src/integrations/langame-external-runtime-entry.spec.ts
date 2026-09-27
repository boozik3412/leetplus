import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = readFileSync(
  path.resolve(
    __dirname,
    '../../../../deploy/leetplus-compose/runtime-entry.cjs',
  ),
  'utf8',
);

function launch(
  profile: Record<string, string> = {},
  capability: string | null = 'LANGAME_EXTERNAL_SET1_V1',
) {
  const releaseSha = 'a'.repeat(40);
  const builtAt = '2026-09-27T00:00:00.000Z';
  const child = { kill: jest.fn(), on: jest.fn() };
  const spawn = jest.fn().mockReturnValue(child);
  const env: Record<string, string> = {
    RELEASE_SHA: releaseSha,
    BUILD_TIME: builtAt,
    EXPECTED_DATABASE_MIGRATION: 'fixture',
    EXPECTED_DATABASE_MIGRATION_COUNT: '191',
    LANGAME_EXTERNAL_WORKER_RUN_ID: '528948b2-6840-4ad0-9854-7993fedbe8df',
    LANGAME_EXTERNAL_WORKER_BUSINESS_DATE: '2026-09-26',
  };
  const context = {
    require: (name: string) => {
      if (name === 'node:child_process') return { spawn };
      if (name === 'node:fs')
        return {
          readFileSync: (file: string) =>
            file === '/app/release.json'
              ? JSON.stringify({
                  contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1',
                  releaseSha,
                  builtAt,
                  migration: 'fixture',
                  migrationCount: 191,
                  ...(capability
                    ? { externalWorkerCapability: capability }
                    : {}),
                })
              : JSON.stringify(profile),
          lstatSync: () => ({
            isFile: () => true,
            isSymbolicLink: () => false,
            size: 500,
            mode: 0o640,
          }),
        };
      throw new Error('Unknown fixture dependency');
    },
    process: {
      argv: ['node', 'runtime-entry.cjs', 'langame-external-daily-worker'],
      getuid: () => 12042,
      umask: jest.fn(),
      env,
      execPath: 'node',
      on: jest.fn(),
    },
    console: { error: jest.fn() },
  };
  return {
    run: (): void => {
      vm.runInNewContext(source, context);
    },
    spawn,
    env,
  };
}

describe('external worker runtime entry actual sandboxed execution', () => {
  it('launches only the dedicated CLI with a capable image and data-only secret profile', () => {
    const subject = launch({
      DATABASE_URL: 'fixture-unused',
      APP_ENCRYPTION_KEY: 'fixture-unused',
      INTEGRATION_ENCRYPTION_KEY: 'fixture-unused',
      LANGAME_EXTERNAL_WORKER_TENANT_SLUG: 'set-1',
    });
    subject.run();
    expect(subject.spawn).toHaveBeenCalledWith(
      'node',
      ['/app/apps/api/dist/integrations/langame-external-daily-worker.cli.js'],
      expect.objectContaining({ cwd: '/app' }),
    );
  });

  it('refuses an image without the optional release capability before child startup', () => {
    const subject = launch({}, null);
    expect(() => subject.run()).toThrow('admitted application capability');
    expect(subject.spawn).not.toHaveBeenCalled();
  });

  it('rejects Auth, approval root, unknown flags and native run/date secret overrides', () => {
    for (const key of [
      'JWT_SECRET',
      'LANGAME_EXTERNAL_TENANT_APPROVAL_PUBLIC_KEY_SPKI_B64',
      'LANGAME_EXTERNAL_WORKER_ALL_TENANTS',
      'LANGAME_EXTERNAL_WORKER_RUN_ID',
      'LANGAME_EXTERNAL_WORKER_BUSINESS_DATE',
    ]) {
      const subject = launch({ [key]: 'fixture-unused' });
      expect(() => subject.run()).toThrow();
      expect(subject.spawn).not.toHaveBeenCalled();
    }
  });
});
