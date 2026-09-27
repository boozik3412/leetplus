import { TenantCustomerStage } from '@prisma/client';
import {
  createLangameExternalPilotAuthority,
  externalLangamePilotAllows,
  isLangameExternalPilotAuthority,
} from './langame-external-pilot-authority';

const input = {
  tenantId: '8cc79086-ed43-44fa-83d3-20207ec48758',
  tenantSlug: 'set-1',
  sourceId: '94a3842b-847e-4c4d-89b0-7cb8976a9f17',
  storeId: 'ecee16ef-f0cb-4307-b079-e2f0303c3a16',
  externalDomain: '1171.langame.ru',
  externalClubId: '1',
  profileRevision: 1,
  storeRevision: 0,
  executionRevision: 1,
  customerStage: TenantCustomerStage.LIVE,
};

describe('exact external Langame pilot authority', () => {
  it('accepts only a frozen exact tenant, source, Store and revision', () => {
    const authority = createLangameExternalPilotAuthority(input);
    expect(isLangameExternalPilotAuthority(authority, input.tenantId)).toBe(
      true,
    );
    expect(isLangameExternalPilotAuthority(authority, 'another-tenant')).toBe(
      false,
    );
    expect(
      isLangameExternalPilotAuthority(
        JSON.parse(JSON.stringify(authority)),
        input.tenantId,
      ),
    ).toBe(false);
    for (const invalid of [
      { tenantId: 'demo' },
      { tenantId: '9297cc94-1506-4639-a255-52e703ce98ae' },
      { tenantSlug: 'demo' },
      { externalDomain: '1172.langame.ru' },
      { externalClubId: '2' },
      { sourceId: 'another' },
      { storeId: 'another' },
      { externalClubId: '0' },
      { profileRevision: 0 },
      { storeRevision: -1 },
      { executionRevision: 0 },
      { customerStage: TenantCustomerStage.INTERNAL },
      { customerStage: TenantCustomerStage.PILOT },
    ]) {
      expect(() =>
        createLangameExternalPilotAuthority({ ...input, ...invalid }),
      ).toThrow();
    }
  });

  it('allows only exact LIVE daily, guest foundation and snapshots jobs', () => {
    const authority = createLangameExternalPilotAuthority(input);
    for (const jobKind of [
      'LANGAME_DAILY_SYNC',
      'LANGAME_GUEST_DATA_FOUNDATION',
      'LANGAME_BUSINESS_SNAPSHOT',
    ]) {
      expect(
        externalLangamePilotAllows(authority, {
          tenantId: input.tenantId,
          customerStage: TenantCustomerStage.LIVE,
          profileRevision: 1,
          executionRevision: 1,
          jobKind,
        }),
      ).toBe(true);
    }
    for (const jobKind of [
      'LANGAME_SCHEDULED_SYNC',
      'GUEST_BONUS_LEDGER_LANGAME',
      'GUEST_GAME_DELIVERY_DISPATCH',
    ]) {
      expect(
        externalLangamePilotAllows(authority, {
          tenantId: input.tenantId,
          customerStage: TenantCustomerStage.LIVE,
          profileRevision: 1,
          executionRevision: 1,
          jobKind,
        }),
      ).toBe(false);
    }
    expect(
      externalLangamePilotAllows(authority, {
        tenantId: input.tenantId,
        customerStage: TenantCustomerStage.LIVE,
        profileRevision: 1,
        executionRevision: 2,
        jobKind: 'LANGAME_DAILY_SYNC',
      }),
    ).toBe(false);
    expect(
      externalLangamePilotAllows(authority, {
        tenantId: input.tenantId,
        customerStage: TenantCustomerStage.LIVE,
        profileRevision: 2,
        executionRevision: 1,
        jobKind: 'LANGAME_DAILY_SYNC',
      }),
    ).toBe(false);
  });
});
