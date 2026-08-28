import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { GuestBonusLedgerSchedulerService } from '../guest-gamification/guest-bonus-ledger-scheduler.service';
import {
  GuestGameMediaController,
  GuestGamePublicMediaController,
} from '../guest-gamification/guest-game-media.controller';
import { GuestGamificationModule } from '../guest-gamification/guest-gamification.module';
import { GuestGamificationController } from '../guest-gamification/guest-gamification.controller';
import { GuestGamificationService } from '../guest-gamification/guest-gamification.service';
import { GuestPortalModule } from '../guest-portal/guest-portal.module';
import { GuestPortalService } from '../guest-portal/guest-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffTeamChatService } from '../staff/staff-team-chat.service';
import { assertEntrypointRole } from './api-bootstrap';
import { CorporateGuestGamificationModule } from './corporate-guest-gamification.module';
import { CorporateRuntimeModule } from './corporate-runtime.module';
import { GuestRuntimeModule } from './guest-runtime.module';

describe('split API runtime boundary', () => {
  const originalRole = process.env.LEETPLUS_API_RUNTIME_ROLE;
  const originalBonusScheduler =
    process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED;

  afterEach(() => {
    restoreEnvironment('LEETPLUS_API_RUNTIME_ROLE', originalRole);
    restoreEnvironment(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED',
      originalBonusScheduler,
    );
  });

  it('fails closed when an entrypoint is launched with another role', () => {
    expect(() => assertEntrypointRole('GUEST', 'GUEST')).not.toThrow();
    expect(() => assertEntrypointRole('CORPORATE', 'GUEST')).toThrow(
      /GUEST API entrypoint cannot start/,
    );
    expect(() => assertEntrypointRole(undefined, 'CORPORATE')).toThrow(
      /CORPORATE API entrypoint cannot start.*COMBINED/,
    );
  });

  it('does not register guest modules in the corporate root graph', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CorporateRuntimeModule,
    ) as unknown[];

    expect(imports).not.toContain(GuestPortalModule);
    expect(imports).not.toContain(GuestGamificationModule);
    expect(imports).toContain(CorporateGuestGamificationModule);
  });

  it('keeps tenant game administration but excludes its public controller', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      CorporateGuestGamificationModule,
    ) as unknown[];

    expect(controllers).toContain(GuestGamificationController);
    expect(controllers).toContain(GuestGameMediaController);
    expect(controllers).not.toContain(GuestGamePublicMediaController);
  });

  it('compiles the corporate graph without public guest services', async () => {
    process.env.LEETPLUS_API_RUNTIME_ROLE = 'CORPORATE';

    const moduleRef = await Test.createTestingModule({
      imports: [CorporateRuntimeModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(AuthService, { strict: false })).toBeInstanceOf(
      AuthService,
    );
    expect(
      moduleRef.get(GuestGamificationService, { strict: false }),
    ).toBeInstanceOf(GuestGamificationService);
    expect(() =>
      moduleRef.get(GuestPortalService, { strict: false }),
    ).toThrow();
    expect(
      moduleRef.get(GuestBonusLedgerSchedulerService, { strict: false }),
    ).toBeInstanceOf(GuestBonusLedgerSchedulerService);

    await moduleRef.close();
  });

  it('compiles the guest graph without corporate auth or staff services', async () => {
    process.env.LEETPLUS_API_RUNTIME_ROLE = 'GUEST';
    process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [GuestRuntimeModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(GuestPortalService)).toBeInstanceOf(
      GuestPortalService,
    );
    expect(() => moduleRef.get(AuthService, { strict: false })).toThrow();
    expect(() =>
      moduleRef.get(StaffTeamChatService, { strict: false }),
    ).toThrow();

    const scheduler = moduleRef.get(GuestBonusLedgerSchedulerService);
    expect(scheduler.getRuntimeStatus()).toMatchObject({
      enabled: false,
      running: false,
      lastSkipReason: 'disabled in public guest runtime',
    });
    expect(() => scheduler.requestRun()).not.toThrow();

    await moduleRef.close();
  });
});

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
