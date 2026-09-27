import { TenantCustomerStage, TenantModule } from '@prisma/client';

export const EZ_GAME_LANGAME_SCOPE = Object.freeze({
  tenantId: '8cc79086-ed43-44fa-83d3-20207ec48758',
  tenantSlug: 'set-1',
  sourceId: '94a3842b-847e-4c4d-89b0-7cb8976a9f17',
  storeId: 'ecee16ef-f0cb-4307-b079-e2f0303c3a16',
  domain: '1171.langame.ru',
  clubId: '1',
});

const pilotAuthority = Symbol('LangameExternalPilotAuthority');

export type LangameExternalPilotAuthority = Readonly<{
  [pilotAuthority]: true;
  tenantId: string;
  tenantSlug: string;
  sourceId: string;
  storeId: string;
  externalDomain: string;
  externalClubId: string;
  profileRevision: number;
  executionRevision: number;
  storeRevision: number;
  customerStage: typeof TenantCustomerStage.LIVE;
}>;

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const domain = /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.langame(?:pro)?\.ru$/;
const clubId = /^[1-9][0-9]{0,18}$/;

/**
 * Constructed only by the dedicated worker after its signed, exact-profile
 * launcher has attested the active release and tenant. This symbol never
 * crosses HTTP/JSON and cannot be requested by a corporate API caller.
 */
export function createLangameExternalPilotAuthority(input: {
  tenantId: string;
  tenantSlug: string;
  sourceId: string;
  storeId: string;
  externalDomain: string;
  externalClubId: string;
  profileRevision: number;
  executionRevision: number;
  storeRevision: number;
  customerStage: TenantCustomerStage;
}): LangameExternalPilotAuthority {
  if (
    input.tenantId !== EZ_GAME_LANGAME_SCOPE.tenantId ||
    input.tenantSlug !== EZ_GAME_LANGAME_SCOPE.tenantSlug ||
    input.sourceId !== EZ_GAME_LANGAME_SCOPE.sourceId ||
    input.storeId !== EZ_GAME_LANGAME_SCOPE.storeId ||
    input.externalDomain !== EZ_GAME_LANGAME_SCOPE.domain ||
    input.externalClubId !== EZ_GAME_LANGAME_SCOPE.clubId ||
    !uuid.test(input.tenantId) ||
    !uuid.test(input.sourceId) ||
    !uuid.test(input.storeId) ||
    !slug.test(input.tenantSlug) ||
    !domain.test(input.externalDomain) ||
    !clubId.test(input.externalClubId) ||
    !Number.isSafeInteger(input.profileRevision) ||
    input.profileRevision < 1 ||
    !Number.isSafeInteger(input.executionRevision) ||
    input.executionRevision < 1 ||
    !Number.isSafeInteger(input.storeRevision) ||
    input.storeRevision < 0 ||
    input.customerStage !== TenantCustomerStage.LIVE
  ) {
    throw new Error('External Langame pilot identity is invalid');
  }
  return Object.freeze({
    ...input,
    [pilotAuthority]: true,
  }) as LangameExternalPilotAuthority;
}

export function isLangameExternalPilotAuthority(
  value: unknown,
  tenantId: string,
): value is LangameExternalPilotAuthority {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as LangameExternalPilotAuthority)[pilotAuthority] === true &&
    Object.isFrozen(value) &&
    (value as LangameExternalPilotAuthority).tenantId === tenantId,
  );
}

const EXTERNAL_LANGAME_PILOT_JOB_KINDS: ReadonlySet<string> = new Set([
  'LANGAME_DAILY_SYNC',
  'LANGAME_GUEST_DATA_FOUNDATION',
  'LANGAME_BUSINESS_SNAPSHOT',
]);

// Imported guest facts need local GAMIFICATION writes, not provider reward
// authority. Keeping its OUTBOUND flag off also fences the bonus-ledger path.
export function externalLangameDataRequirements(
  modules: readonly TenantModule[],
) {
  return modules.map((module) => ({
    module,
    action:
      module === TenantModule.GAMIFICATION
        ? ('WRITE' as const)
        : ('OUTBOUND' as const),
  }));
}

export function externalLangamePilotAllows(
  authority: unknown,
  input: {
    tenantId: string;
    customerStage: TenantCustomerStage | null;
    profileRevision: number | null;
    executionRevision: number | null;
    jobKind: string;
  },
) {
  return (
    isLangameExternalPilotAuthority(authority, input.tenantId) &&
    input.customerStage === authority.customerStage &&
    input.profileRevision === authority.profileRevision &&
    input.executionRevision === authority.executionRevision &&
    EXTERNAL_LANGAME_PILOT_JOB_KINDS.has(input.jobKind)
  );
}
