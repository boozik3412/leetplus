import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { C61SupportRecoveryCliAdapter } from './support-recovery-c61-cli.adapter';
import { createLp571RecoveryAdapter } from './support-recovery-lp571-cli.adapter';
import {
  runDaSupportRecovery,
  type DaRecoveryService,
} from './da-support-recovery-adapter';
import { Prisma } from '@prisma/client';

export type SupportRecoveryPlan = Readonly<{
  operation: 'DA_SUPPORT_RECOVERY' | 'C61_BUDGET_REFILL' | 'LP571_BATTLE_PASS';
  mode?: 'preview' | 'apply' | 'reconcile';
  confirmation?: string;
  digest?: string;
  expectedFactUpdatedAt?: string;
  expectedSeasonUpdatedAt?: string;
  actorUserId: string;
  runtimeProfileSha256: string;
}>;

export type SupportRecoveryRuntime = Readonly<{
  user: unknown;
  da: DaRecoveryService;
  c61: C61SupportRecoveryCliAdapter;
  lp571: {
    preview(): Promise<unknown>;
    reconcile(): Promise<unknown>;
    apply(
      digest: string,
      expectedFactUpdatedAt: string,
      expectedSeasonUpdatedAt: string,
    ): Promise<unknown>;
  };
  reconcile: {
    da(): Promise<unknown>;
    c61(): Promise<unknown>;
    lp571(): Promise<unknown>;
  };
}>;

type RuntimeProfileFileSystem = Readonly<{
  lstat(path: string): {
    isFile(): boolean;
    isSymbolicLink(): boolean;
    uid: number;
    gid: number;
    mode: number;
    nlink: number;
    size: number;
  };
  open(path: string): number;
  fstat(fd: number): {
    isFile(): boolean;
    uid: number;
    gid: number;
    mode: number;
    nlink: number;
    size: number;
  };
  read(fd: number, buffer: Buffer): number;
  close(fd: number): void;
}>;

const productionRuntimeProfileFileSystem: RuntimeProfileFileSystem = {
  lstat: (path) => lstatSync(path),
  open: (path) => openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW),
  fstat: (fd) => fstatSync(fd),
  read: (fd, buffer) => readSync(fd, buffer, 0, buffer.length, null),
  close: (fd) => closeSync(fd),
};

export function loadSupportRecoveryRuntimeProfile(
  path = '/run/secrets/runtime.json',
  fileSystem: RuntimeProfileFileSystem = productionRuntimeProfileFileSystem,
  expectedSha256?: string,
): Record<string, unknown> {
  if (path !== '/run/secrets/runtime.json') {
    throw new ForbiddenException(
      'Only the canonical mounted runtime profile is allowed.',
    );
  }
  if (!expectedSha256 || !/^[a-f0-9]{64}$/iu.test(expectedSha256)) {
    throw new ConflictException(
      'Canonical runtime profile SHA-256 is required.',
    );
  }
  const metadata = fileSystem.lstat(path);
  const expectedGid = process.getgid?.();
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.uid !== 0 ||
    metadata.gid !== expectedGid ||
    (metadata.mode & 0o777) !== 0o440 ||
    metadata.nlink !== 1 ||
    metadata.size <= 0 ||
    metadata.size > 1_048_576
  ) {
    throw new ForbiddenException(
      'Runtime profile must be a root-owned private regular file.',
    );
  }
  const fd = fileSystem.open(path);
  let bytes: Buffer;
  try {
    const opened = fileSystem.fstat(fd);
    if (
      !opened.isFile() ||
      opened.uid !== metadata.uid ||
      opened.gid !== metadata.gid ||
      (opened.mode & 0o777) !== 0o440 ||
      opened.nlink !== 1 ||
      opened.size !== metadata.size
    )
      throw new ForbiddenException('Runtime profile changed after lstat.');
    bytes = Buffer.alloc(opened.size);
    if (fileSystem.read(fd, bytes) !== opened.size)
      throw new ConflictException('Runtime profile read was incomplete.');
  } finally {
    fileSystem.close(fd);
  }
  if (
    createHash('sha256').update(bytes).digest('hex') !==
    expectedSha256.toLowerCase()
  )
    throw new ConflictException('Runtime profile SHA-256 mismatch.');
  const parsed: unknown = JSON.parse(bytes.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConflictException(
      'Support runtime profile must be a JSON object.',
    );
  }
  const profile = parsed as Record<string, unknown>;
  if (typeof profile.DATABASE_URL !== 'string' || !profile.DATABASE_URL) {
    throw new ConflictException(
      'Direct runtime profile DATABASE_URL is required.',
    );
  }
  if ('env' in profile || 'user' in profile || 'supportRecovery' in profile) {
    throw new ConflictException(
      'Nested or support-specific runtime profile envelopes are forbidden.',
    );
  }
  return profile;
}

export function loadSupportRecoveryPlan(
  path = process.env.LEETPLUS_SUPPORT_RECOVERY_PLAN ??
    '/run/support-recovery/plan.json',
  fileSystem: RuntimeProfileFileSystem = productionRuntimeProfileFileSystem,
): SupportRecoveryPlan {
  const root = '/run/support-recovery';
  const resolved = resolve(path);
  const containment = relative(root, resolved);
  if (
    !containment ||
    containment.startsWith('..') ||
    containment.split('/').includes('..') ||
    resolved === root
  ) {
    throw new ForbiddenException(
      'Support plan must be under /run/support-recovery/.',
    );
  }
  const metadata = fileSystem.lstat(resolved);
  const expectedGid = process.getgid?.();
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.uid !== 0 ||
    metadata.gid !== expectedGid ||
    (metadata.mode & 0o777) !== 0o440 ||
    metadata.nlink !== 1 ||
    metadata.size <= 0 ||
    metadata.size > 1_048_576
  )
    throw new ForbiddenException(
      'Support plan must be a root-owned group-readable private regular file.',
    );
  const fd = fileSystem.open(resolved);
  let bytes: Buffer;
  try {
    const opened = fileSystem.fstat(fd);
    if (
      !opened.isFile() ||
      opened.uid !== metadata.uid ||
      opened.gid !== metadata.gid ||
      (opened.mode & 0o777) !== 0o440 ||
      opened.nlink !== 1 ||
      opened.size !== metadata.size
    )
      throw new ForbiddenException('Support plan changed after lstat.');
    bytes = Buffer.alloc(opened.size);
    if (fileSystem.read(fd, bytes) !== opened.size)
      throw new ConflictException('Support plan read was incomplete.');
  } finally {
    fileSystem.close(fd);
  }
  const parsed: unknown = JSON.parse(bytes.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConflictException('Support plan must be a JSON object.');
  }
  const plan = parsed as SupportRecoveryPlan;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(plan.actorUserId ?? '')) {
    throw new ConflictException(
      'Exact actorUserId is required in the canonical plan.',
    );
  }
  if (!/^[a-f0-9]{64}$/iu.test(plan.runtimeProfileSha256 ?? '')) {
    throw new ConflictException(
      'Exact runtimeProfileSha256 is required in the canonical plan.',
    );
  }
  if (
    !['DA_SUPPORT_RECOVERY', 'C61_BUDGET_REFILL', 'LP571_BATTLE_PASS'].includes(
      plan.operation,
    )
  ) {
    throw new ConflictException('Unknown support recovery operation.');
  }
  if (plan.mode && !['preview', 'apply', 'reconcile'].includes(plan.mode)) {
    throw new ConflictException('Unsupported support recovery mode.');
  }
  return plan;
}

export async function executeSupportRecoveryPlan(
  runtime: SupportRecoveryRuntime,
  plan: SupportRecoveryPlan,
) {
  if (process.env.LEETPLUS_SUPPORT_RECOVERY_CLI !== '1') {
    throw new ForbiddenException('LEETPLUS_SUPPORT_RECOVERY_CLI=1 required.');
  }
  const mode = plan.mode ?? 'preview';
  switch (plan.operation) {
    case 'DA_SUPPORT_RECOVERY': {
      if (mode === 'reconcile')
        return allowlisted(plan.operation, mode, await runtime.reconcile.da());
      const preview = await runDaSupportRecovery({
        service: runtime.da,
        user: runtime.user,
        mode: 'preview',
      });
      if (mode !== 'apply') return allowlisted(plan.operation, mode, preview);
      const source = preview as {
        actionCount?: number;
        digest?: string;
        allowedRuleIds?: string[];
      };
      if (!source.actionCount || !source.digest || !source.allowedRuleIds) {
        throw new ConflictException('DA preview is incomplete for apply.');
      }
      return allowlisted(
        plan.operation,
        mode,
        await runDaSupportRecovery({
          service: runtime.da,
          user: runtime.user,
          mode: 'apply',
          preview: {
            actionCount: source.actionCount,
            digest: source.digest,
            allowedRuleIds: source.allowedRuleIds,
          },
          confirmation: plan.confirmation,
        }),
      );
    }
    case 'C61_BUDGET_REFILL':
      if (mode === 'reconcile')
        return allowlisted(plan.operation, mode, await runtime.reconcile.c61());
      return allowlisted(
        plan.operation,
        mode,
        await runtime.c61.execute(runtime.user as never, {
          operation: 'C61_BUDGET_REFILL',
          ticketNumber: 'LP-BUG-C61EE785',
          factId: 'c68b1912-9a94-46c7-948c-47c1e3738bee',
          ruleId: '0ce6f7e3-99ea-4aa2-b6e2-68e8dbd1bb12',
          mode,
          digest: plan.digest,
          confirmation: plan.confirmation,
        }),
      );
    case 'LP571_BATTLE_PASS': {
      if (mode === 'reconcile')
        return allowlisted(
          plan.operation,
          mode,
          await runtime.reconcile.lp571(),
        );
      if (mode !== 'apply')
        return allowlisted(plan.operation, mode, await runtime.lp571.preview());
      if (
        !plan.digest ||
        !plan.expectedFactUpdatedAt ||
        !plan.expectedSeasonUpdatedAt
      ) {
        throw new ConflictException(
          'LP571 apply requires preview digest and exact versions.',
        );
      }
      return allowlisted(
        plan.operation,
        mode,
        await runtime.lp571.apply(
          plan.digest,
          plan.expectedFactUpdatedAt,
          plan.expectedSeasonUpdatedAt,
        ),
      );
    }
  }
}

type RecoveryQueryDb = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

export async function reconcileDaSupportRecovery(db: RecoveryQueryDb) {
  const rows = await db.$queryRaw<
    Array<{
      events: bigint;
      receipts: bigint;
      entitlements: bigint;
      wallets: bigint;
      rewards: bigint;
      intents: bigint;
      xp: bigint;
    }>
  >(Prisma.sql`
    SELECT count(DISTINCT e.id) AS events, count(DISTINCT r.id) AS receipts,
      count(DISTINCT n.id) AS entitlements, count(DISTINCT w.id) AS wallets,
      count(DISTINCT g.id) AS rewards, count(DISTINCT i.id) AS intents,
      count(DISTINCT x.id) AS xp
    FROM "GuestGameEvent" e
    LEFT JOIN "GuestGameOriginReceipt" r ON r."tenantId"=e."tenantId" AND r."eventId"=e.id AND r."factId"=${'ccffb7ba-f93d-4c4d-958f-de3db4c533fe'} AND r.policy='EXACT_OPERATOR_CANONICALIZATION' AND r.status='PROCESSED' AND r."claimedSource" IN ('EXACT_CANONICALIZATION', 'EXACT_OPERATOR_CANONICALIZATION')
    LEFT JOIN "GuestGameEntitlement" n ON n."tenantId"=e."tenantId" AND n."eventId"=e.id AND n."originKey"=e."originKey" AND n."ruleType"='LOOT_BOX' AND n."ruleId"=${'0ce6f7e3-99ea-4aa2-b6e2-68e8dbd1bb12'} AND n."sourceFactId"=${'ccffb7ba-f93d-4c4d-958f-de3db4c533fe'} AND n.status='AVAILABLE' AND n."consumedAt" IS NULL AND n."canceledAt" IS NULL
    LEFT JOIN "GuestGameRewardWalletItem" w ON w."tenantId"=n."tenantId" AND w."entitlementId"=n.id AND w.kind='LOOT_BOX_ENTITLEMENT' AND w.status='PENDING' AND w."rewardId" IS NULL AND w."eventId" IS NULL
    LEFT JOIN "GuestGameRewardIntent" i ON i."tenantId"=e."tenantId" AND (i."eventId"=e.id OR i."originKey"=e."originKey")
    LEFT JOIN "GuestGameReward" g ON g."tenantId"=e."tenantId" AND g."originKey"=e."originKey"
    LEFT JOIN "GuestGameXpPosting" x ON x."eventId"=e.id
    WHERE e.payload->>'sourceFactId'=${'ccffb7ba-f93d-4c4d-958f-de3db4c533fe'}
  `);
  return assertTerminalChain('DA', rows[0]);
}

export async function reconcileC61SupportRecovery(db: RecoveryQueryDb) {
  const origin =
    'support-budget-refill-exception:v2:c3e8aebc-b627-46fd-827e-cd250cc0a07f:c68b1912-9a94-46c7-948c-47c1e3738bee:0ce6f7e3-99ea-4aa2-b6e2-68e8dbd1bb12';
  const rows = await db.$queryRaw<
    Array<{
      receipts: bigint;
      entitlements: bigint;
      wallets: bigint;
      audits: bigint;
      blocked: bigint;
      rewards: bigint;
      intents: bigint;
      xp: bigint;
    }>
  >(Prisma.sql`
    SELECT count(DISTINCT r.id) AS receipts, count(DISTINCT n.id) AS entitlements,
      count(DISTINCT w.id) AS wallets, count(DISTINCT a.id) AS audits,
      count(DISTINCT d.id) AS blocked, count(DISTINCT g.id) AS rewards,
      count(DISTINCT i.id) AS intents, count(DISTINCT x.id) AS xp
    FROM "GuestGameOriginReceipt" r
    LEFT JOIN "GuestGameEntitlement" n ON n."tenantId"=r."tenantId" AND n."originKey"=r."originKey" AND n."eventId"=r."eventId" AND n."idempotencyKey"=r."originKey" AND n."ruleType"='LOOT_BOX' AND n."ruleId"=${'0ce6f7e3-99ea-4aa2-b6e2-68e8dbd1bb12'} AND n."sourceFactId"=${'c68b1912-9a94-46c7-948c-47c1e3738bee'} AND n.status='AVAILABLE' AND n."consumedAt" IS NULL AND n."canceledAt" IS NULL
    LEFT JOIN "GuestGameRewardWalletItem" w ON w."tenantId"=n."tenantId" AND w."entitlementId"=n.id AND w."eventId"=n."eventId" AND w.kind='LOOT_BOX_ENTITLEMENT' AND w.status='PENDING' AND w."rewardId" IS NULL
    LEFT JOIN "GuestGameAuditEvent" a ON a."tenantId"=n."tenantId" AND a."entityId"=n.id AND a.action='SUPPORT_C61_BUDGET_REFILL_EXCEPTION_APPLIED' AND a.status='PROCESSED'
    LEFT JOIN "GuestGameRuleDecision" d ON d.id=${'b3592923-6483-45a8-99e2-761b1cdedd8b'} AND d."tenantId"=r."tenantId" AND d."profileId"=n."profileId" AND d."sourceFactId"=${'c68b1912-9a94-46c7-948c-47c1e3738bee'} AND d."ruleId"=${'0ce6f7e3-99ea-4aa2-b6e2-68e8dbd1bb12'} AND d.status='BLOCKED'
    LEFT JOIN "GuestGameRewardIntent" i ON i."tenantId"=r."tenantId" AND i."originKey"=r."originKey"
    LEFT JOIN "GuestGameReward" g ON g."tenantId"=r."tenantId" AND g."originKey"=r."originKey"
    LEFT JOIN "GuestGameXpPosting" x ON x."eventId"=n."eventId"
    WHERE r."originKey"=${origin} AND r."factId"=${'c68b1912-9a94-46c7-948c-47c1e3738bee'} AND r."eventType"='SESSION_START' AND r.policy='SUPPORT_BUDGET_REFILL_EXCEPTION_V1' AND r.status='PROCESSED' AND r."claimedSource"='SERVER_APPROVED_C61_EXCEPTION'
  `);
  return assertTerminalChain('C61', rows[0], true);
}

export async function reconcileLp571SupportRecovery(db: RecoveryQueryDb) {
  const claimKey =
    'season:90e8eb75-2727-4f8d-808c-42a3ff981ce2:profile:25fc121f-c69a-4050-9bda-6def1424f45d:step:3';
  const rows = await db.$queryRaw<
    Array<{
      intents: bigint;
      rewards: bigint;
      wallets: bigint;
      xp: bigint;
      ledgers: bigint;
    }>
  >(Prisma.sql`
    SELECT count(DISTINCT i.id) AS intents, count(DISTINCT g.id) AS rewards,
      count(DISTINCT w.id) AS wallets, count(DISTINCT x.id) AS xp, count(DISTINCT l.id) AS ledgers
    FROM "GuestGameRewardIntent" i
    LEFT JOIN "GuestGameReward" g ON g.id=i."rewardId"
    LEFT JOIN "GuestGameRewardWalletItem" w ON w."rewardId"=g.id
    LEFT JOIN "GuestGameXpPosting" x ON x."eventId"=i."eventId"
    LEFT JOIN "GuestBonusLedgerEntry" l ON l."rewardId"=g.id
    WHERE i."claimKey"=${claimKey} AND i."ruleId"=${'90e8eb75-2727-4f8d-808c-42a3ff981ce2'}
  `);
  const row = rows[0];
  if (
    !row ||
    Number(row.intents) !== 1 ||
    Number(row.rewards) !== 1 ||
    Number(row.wallets) !== 1 ||
    Number(row.xp) !== 0 ||
    Number(row.ledgers) > 1
  )
    throw new ConflictException(
      'LP571 reconcile found a partial or conflicting terminal chain.',
    );
  return { outcome: 'RECONCILED', actionCount: 1 };
}

function assertTerminalChain(
  _operation: string,
  row: Record<string, bigint> | undefined,
  requireAudit = false,
) {
  if (
    !row ||
    Number(row.events ?? 1) !== 1 ||
    Number(row.receipts) !== 1 ||
    Number(row.entitlements) !== 1 ||
    Number(row.wallets) !== 1 ||
    Number(row.rewards) !== 0 ||
    Number(row.intents ?? 0) !== 0 ||
    Number(row.xp) !== 0 ||
    (requireAudit && (Number(row.audits) !== 1 || Number(row.blocked) < 1))
  )
    throw new ConflictException(
      'Reconcile found a partial or conflicting terminal chain.',
    );
  return { outcome: 'RECONCILED', actionCount: 1 };
}

function allowlisted(
  operation: SupportRecoveryPlan['operation'],
  mode: string,
  value: unknown,
) {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    operation,
    mode,
    outcome: typeof source.outcome === 'string' ? source.outcome : null,
    digest: typeof source.digest === 'string' ? source.digest : null,
    confirmationHash:
      typeof source.confirmationHash === 'string'
        ? source.confirmationHash
        : null,
    actionCount:
      typeof source.actionCount === 'number' ? source.actionCount : null,
  };
}

export function createLp571RuntimeAdapter(
  replay: Parameters<typeof createLp571RecoveryAdapter>[0],
  user: unknown,
) {
  return createLp571RecoveryAdapter(replay, user);
}
