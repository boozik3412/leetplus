import { Injectable, Logger } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVE_LINK_STATUS = 'ACTIVE';
const PENDING_REBIND_LINK_STATUS = 'PENDING_REBIND';
const SUPERSEDED_LINK_STATUS = 'SUPERSEDED';
const CONFLICT_LINK_STATUS = 'CONFLICT';
const IDENTITY_LINK_EVENT_TYPE = 'GAME_PROFILE_IDENTITY_LINKED';
const IDENTITY_LINK_EVENT_SOURCE = 'IDENTITY_RESOLVER';
// PostgreSQL accepts at most 32767 bind variables per prepared statement.
// Keep enough headroom for the tenant/status predicates and future filters.
const PROFILE_PHONE_HASH_BATCH_SIZE = 10_000;

export type GuestIdentityBackfillSummary = {
  rewards: number;
  events: number;
  deliveries: number;
  bonusLedgerEntries: number;
  activityRawRecords: number;
  activityFacts: number;
  activitySyncStates: number;
  activitySourceSyncStates: number;
};

export type GuestIdentityResolutionStatus =
  | 'LINKED'
  | 'ALREADY_LINKED'
  | 'REBOUND'
  | 'PENDING_REBIND'
  | 'CONFLICT'
  | 'NOT_LINKED';

export type GuestIdentityResolutionResult = {
  status: GuestIdentityResolutionStatus;
  profileId: string | null;
  guestId: string | null;
  previousGuestId: string | null;
  linkedNow: boolean;
  backfilled: GuestIdentityBackfillSummary;
};

export type GuestIdentitySnapshotCandidate = {
  guestId: string;
  externalGuestId: string;
  phoneHashes: string[];
  phoneMasked: string | null;
};

export type GuestIdentitySnapshotReconcileResult = {
  candidates: number;
  profiles: number;
  linked: number;
  rebound: number;
  pendingRebind: number;
  alreadyLinked: number;
  conflicts: number;
  ambiguous: number;
};

type ResolveExactMatchInput = {
  tenantId: string;
  profileId: string;
  guestId: string;
  externalProvider: IntegrationProvider;
  externalDomain: string;
  externalGuestId: string;
  acceptedPhoneHashes: string[];
  phoneMasked: string | null;
  matchSource: string;
  verifiedAt?: Date;
  requiredRebindConfirmations?: number;
};

const emptyBackfillSummary = (): GuestIdentityBackfillSummary => ({
  rewards: 0,
  events: 0,
  deliveries: 0,
  bonusLedgerEntries: 0,
  activityRawRecords: 0,
  activityFacts: 0,
  activitySyncStates: 0,
  activitySourceSyncStates: 0,
});

@Injectable()
export class GuestIdentityResolverService {
  private readonly logger = new Logger(GuestIdentityResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reconcileDomainSnapshot(input: {
    tenantId: string;
    externalProvider: IntegrationProvider;
    externalDomain: string;
    candidates: GuestIdentitySnapshotCandidate[];
    syncedAt: Date;
    complete: boolean;
  }): Promise<GuestIdentitySnapshotReconcileResult> {
    const result: GuestIdentitySnapshotReconcileResult = {
      candidates: input.candidates.length,
      profiles: 0,
      linked: 0,
      rebound: 0,
      pendingRebind: 0,
      alreadyLinked: 0,
      conflicts: 0,
      ambiguous: 0,
    };

    if (!input.complete) {
      return result;
    }

    const candidates = dedupeSnapshotCandidates(input.candidates);
    const phoneHashes = uniqueStrings(
      candidates.flatMap((candidate) => candidate.phoneHashes),
    );

    if (phoneHashes.length === 0) {
      await this.supersedePendingDomainLinks(input);
      return result;
    }

    const profiles = await this.findActiveProfilesByPhoneHashes(
      input.tenantId,
      phoneHashes,
    );
    result.profiles = profiles.length;

    const profileIdsByPhoneHash = new Map<string, Set<string>>();
    for (const profile of profiles) {
      if (!profile.phoneHash) {
        continue;
      }
      const profileIds =
        profileIdsByPhoneHash.get(profile.phoneHash) ?? new Set();
      profileIds.add(profile.id);
      profileIdsByPhoneHash.set(profile.phoneHash, profileIds);
    }

    const candidatesByPhoneHash = new Map<
      string,
      Map<string, GuestIdentitySnapshotCandidate>
    >();
    for (const candidate of candidates) {
      for (const candidatePhoneHash of candidate.phoneHashes) {
        const candidatesForHash =
          candidatesByPhoneHash.get(candidatePhoneHash) ??
          new Map<string, GuestIdentitySnapshotCandidate>();
        candidatesForHash.set(candidate.guestId, candidate);
        candidatesByPhoneHash.set(candidatePhoneHash, candidatesForHash);
      }
    }

    const profileIdsByCandidate = new Map<string, Set<string>>();
    for (const candidate of candidates) {
      const matchedProfileIds = new Set<string>();
      for (const candidatePhoneHash of candidate.phoneHashes) {
        for (const matchedProfileId of profileIdsByPhoneHash.get(
          candidatePhoneHash,
        ) ?? []) {
          matchedProfileIds.add(matchedProfileId);
        }
      }
      profileIdsByCandidate.set(candidate.guestId, matchedProfileIds);
    }

    const validConfirmationPairs = new Set<string>();
    for (const profile of profiles) {
      if (!profile.phoneHash) {
        continue;
      }
      const matchedCandidates = [
        ...(candidatesByPhoneHash.get(profile.phoneHash)?.values() ?? []),
      ];
      const candidate = matchedCandidates[0];
      if (
        matchedCandidates.length === 1 &&
        candidate &&
        profileIdsByCandidate.get(candidate.guestId)?.size === 1
      ) {
        validConfirmationPairs.add(
          identityPairKey(profile.id, candidate.guestId),
        );
      }
    }

    const pendingLinks =
      await this.prisma.guestGameProfileIdentityLink.findMany({
        where: {
          tenantId: input.tenantId,
          externalProvider: input.externalProvider,
          externalDomain: input.externalDomain,
          status: PENDING_REBIND_LINK_STATUS,
        },
        select: { id: true, profileId: true, guestId: true },
      });
    const stalePendingIds = pendingLinks
      .filter(
        (link) =>
          !validConfirmationPairs.has(
            identityPairKey(link.profileId, link.guestId),
          ),
      )
      .map((link) => link.id);
    if (stalePendingIds.length > 0) {
      await this.prisma.guestGameProfileIdentityLink.updateMany({
        where: {
          id: { in: stalePendingIds },
          status: PENDING_REBIND_LINK_STATUS,
          lastSeenAt: { lte: input.syncedAt },
        },
        data: {
          status: SUPERSEDED_LINK_STATUS,
          supersededAt: input.syncedAt,
        },
      });
    }

    for (const profile of profiles) {
      if (!profile.phoneHash) {
        continue;
      }

      const matchedCandidates = [
        ...(candidatesByPhoneHash.get(profile.phoneHash)?.values() ?? []),
      ];
      const candidate = matchedCandidates[0];

      if (
        matchedCandidates.length !== 1 ||
        !candidate ||
        profileIdsByCandidate.get(candidate.guestId)?.size !== 1
      ) {
        result.ambiguous += 1;
        continue;
      }

      const resolution = await this.resolveExactMatch({
        tenantId: input.tenantId,
        profileId: profile.id,
        guestId: candidate.guestId,
        externalProvider: input.externalProvider,
        externalDomain: input.externalDomain,
        externalGuestId: candidate.externalGuestId,
        acceptedPhoneHashes: candidate.phoneHashes,
        phoneMasked: candidate.phoneMasked,
        matchSource: 'GUEST_FOUNDATION_COMPLETE_SYNC',
        verifiedAt: input.syncedAt,
        requiredRebindConfirmations: 2,
      });

      if (resolution.status === 'LINKED') result.linked += 1;
      if (resolution.status === 'REBOUND') result.rebound += 1;
      if (resolution.status === 'PENDING_REBIND') result.pendingRebind += 1;
      if (resolution.status === 'ALREADY_LINKED') result.alreadyLinked += 1;
      if (resolution.status === 'CONFLICT') result.conflicts += 1;
    }

    return result;
  }

  private async findActiveProfilesByPhoneHashes(
    tenantId: string,
    phoneHashes: string[],
  ) {
    const profiles: Array<{ id: string; phoneHash: string | null }> = [];

    for (
      let offset = 0;
      offset < phoneHashes.length;
      offset += PROFILE_PHONE_HASH_BATCH_SIZE
    ) {
      const batch = phoneHashes.slice(
        offset,
        offset + PROFILE_PHONE_HASH_BATCH_SIZE,
      );
      const batchProfiles = await this.prisma.guestGameProfile.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          phoneHash: { in: batch },
        },
        select: { id: true, phoneHash: true },
      });
      profiles.push(...batchProfiles);
    }

    return profiles;
  }

  async resolveExactMatch(
    input: ResolveExactMatchInput,
  ): Promise<GuestIdentityResolutionResult> {
    const verifiedAt = input.verifiedAt ?? new Date();
    const requiredConfirmations = Math.max(
      1,
      input.requiredRebindConfirmations ?? 1,
    );
    const acceptedPhoneHashes = uniqueStrings(input.acceptedPhoneHashes);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const lockKey = [
          input.tenantId,
          input.profileId,
          input.externalProvider,
          input.externalDomain,
        ].join(':');
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text
        `;

        const guestLockKey = [input.tenantId, 'guest', input.guestId].join(':');
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${guestLockKey}))::text
        `;

        await tx.guestGameProfileIdentityLink.updateMany({
          where: {
            tenantId: input.tenantId,
            guestId: input.guestId,
            status: ACTIVE_LINK_STATUS,
            profile: { status: { not: 'ACTIVE' } },
          },
          data: {
            status: SUPERSEDED_LINK_STATUS,
            supersededAt: verifiedAt,
          },
        });

        const [profile, guest, activeLink, candidateLink, guestOwnerLink] =
          await Promise.all([
            tx.guestGameProfile.findFirst({
              where: {
                id: input.profileId,
                tenantId: input.tenantId,
                status: 'ACTIVE',
              },
              select: {
                id: true,
                guestId: true,
                phoneHash: true,
                contactMasked: true,
                displayName: true,
                guest: {
                  select: {
                    id: true,
                    externalProvider: true,
                    externalDomain: true,
                  },
                },
              },
            }),
            tx.guest.findFirst({
              where: {
                id: input.guestId,
                tenantId: input.tenantId,
                isDisabled: false,
                externalProvider: input.externalProvider,
                externalDomain: input.externalDomain,
                externalGuestId: input.externalGuestId,
              },
              select: {
                id: true,
                phoneHash: true,
                phoneMasked: true,
                emailMasked: true,
                fullNameMasked: true,
                externalProvider: true,
                externalDomain: true,
                externalGuestId: true,
              },
            }),
            tx.guestGameProfileIdentityLink.findFirst({
              where: {
                tenantId: input.tenantId,
                profileId: input.profileId,
                externalProvider: input.externalProvider,
                externalDomain: input.externalDomain,
                status: ACTIVE_LINK_STATUS,
              },
            }),
            tx.guestGameProfileIdentityLink.findUnique({
              where: {
                tenantId_profileId_externalProvider_externalDomain_guestId: {
                  tenantId: input.tenantId,
                  profileId: input.profileId,
                  externalProvider: input.externalProvider,
                  externalDomain: input.externalDomain,
                  guestId: input.guestId,
                },
              },
            }),
            tx.guestGameProfileIdentityLink.findFirst({
              where: {
                tenantId: input.tenantId,
                guestId: input.guestId,
                status: ACTIVE_LINK_STATUS,
                profile: { status: 'ACTIVE' },
              },
              select: { id: true, profileId: true },
            }),
          ]);

        if (
          !profile ||
          !guest ||
          !profile.phoneHash ||
          !guest.phoneHash ||
          !acceptedPhoneHashes.includes(profile.phoneHash) ||
          !acceptedPhoneHashes.includes(guest.phoneHash)
        ) {
          return this.result(
            'NOT_LINKED',
            profile?.id ?? null,
            guest?.id ?? null,
          );
        }

        if (guestOwnerLink && guestOwnerLink.profileId !== profile.id) {
          await this.saveConflictLink(tx, input, candidateLink, verifiedAt);
          return this.result(
            'CONFLICT',
            profile.id,
            guest.id,
            activeLink?.guestId ?? null,
          );
        }

        if (activeLink?.guestId === guest.id) {
          await tx.guestGameProfileIdentityLink.update({
            where: { id: activeLink.id },
            data: {
              externalGuestId: guest.externalGuestId,
              matchSource: input.matchSource,
              confidence: 'EXACT',
              consecutiveMatches: { increment: 1 },
              verifiedAt,
              lastSeenAt: verifiedAt,
              supersededAt: null,
            },
          });
          const backfilled = await this.backfillIdentityScope(
            tx,
            input.tenantId,
            profile.id,
            guest,
          );
          await this.updateLegacyPrimaryGuest(tx, profile, guest, activeLink);

          return {
            status: 'ALREADY_LINKED',
            profileId: profile.id,
            guestId: guest.id,
            previousGuestId: null,
            linkedNow: false,
            backfilled,
          };
        }

        const previousGuestId = activeLink?.guestId ?? null;
        const nextConfirmationCount =
          candidateLink?.status === PENDING_REBIND_LINK_STATUS
            ? candidateLink.consecutiveMatches + 1
            : 1;

        if (activeLink && nextConfirmationCount < requiredConfirmations) {
          await this.upsertCandidateLink(tx, input, guest, {
            status: PENDING_REBIND_LINK_STATUS,
            consecutiveMatches: nextConfirmationCount,
            verifiedAt,
          });
          return this.result(
            'PENDING_REBIND',
            profile.id,
            guest.id,
            previousGuestId,
          );
        }

        if (activeLink) {
          await tx.guestGameProfileIdentityLink.update({
            where: { id: activeLink.id },
            data: {
              status: SUPERSEDED_LINK_STATUS,
              supersededAt: verifiedAt,
              lastSeenAt: verifiedAt,
            },
          });
        }

        const link = await this.upsertCandidateLink(tx, input, guest, {
          status: ACTIVE_LINK_STATUS,
          consecutiveMatches: nextConfirmationCount,
          verifiedAt,
        });
        await tx.guestGameProfileIdentityLink.updateMany({
          where: {
            tenantId: input.tenantId,
            profileId: profile.id,
            externalProvider: input.externalProvider,
            externalDomain: input.externalDomain,
            id: { not: link.id },
            status: { in: [PENDING_REBIND_LINK_STATUS, CONFLICT_LINK_STATUS] },
          },
          data: {
            status: SUPERSEDED_LINK_STATUS,
            supersededAt: verifiedAt,
          },
        });

        await this.updateLegacyPrimaryGuest(tx, profile, guest, activeLink);
        const backfilled = await this.backfillIdentityScope(
          tx,
          input.tenantId,
          profile.id,
          guest,
        );
        await this.recordIdentityLinkEvent(tx, {
          tenantId: input.tenantId,
          profileId: profile.id,
          guestId: guest.id,
          previousGuestId,
          externalProvider: guest.externalProvider,
          externalDomain: guest.externalDomain,
          externalGuestId: guest.externalGuestId,
          matchSource: input.matchSource,
          phoneMasked: input.phoneMasked ?? guest.phoneMasked,
          backfilled,
          occurredAt: verifiedAt,
        });

        return {
          status: activeLink ? 'REBOUND' : 'LINKED',
          profileId: profile.id,
          guestId: guest.id,
          previousGuestId,
          linkedNow: true,
          backfilled,
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        this.logger.warn(
          `Identity link race resolved as conflict for profile ${input.profileId} in ${input.externalDomain}.`,
        );
        return this.result('CONFLICT', input.profileId, input.guestId);
      }
      throw error;
    }
  }

  async findActiveGuestForProfileDomain(input: {
    tenantId: string;
    profileId: string;
    externalProvider: IntegrationProvider;
    externalDomain: string;
  }) {
    const link = await this.prisma.guestGameProfileIdentityLink.findFirst({
      where: {
        tenantId: input.tenantId,
        profileId: input.profileId,
        externalProvider: input.externalProvider,
        externalDomain: input.externalDomain,
        status: ACTIVE_LINK_STATUS,
        guest: { isDisabled: false },
        profile: { status: 'ACTIVE' },
      },
      select: {
        guest: true,
      },
    });

    return link?.guest ?? null;
  }

  async listActiveGuestIds(tenantId: string, profileId: string) {
    const links = await this.prisma.guestGameProfileIdentityLink.findMany({
      where: {
        tenantId,
        profileId,
        status: ACTIVE_LINK_STATUS,
        guest: { isDisabled: false },
        profile: { status: 'ACTIVE' },
      },
      select: { guestId: true },
    });
    return uniqueStrings(links.map((link) => link.guestId));
  }

  private async supersedePendingDomainLinks(input: {
    tenantId: string;
    externalProvider: IntegrationProvider;
    externalDomain: string;
    syncedAt: Date;
  }) {
    await this.prisma.guestGameProfileIdentityLink.updateMany({
      where: {
        tenantId: input.tenantId,
        externalProvider: input.externalProvider,
        externalDomain: input.externalDomain,
        status: PENDING_REBIND_LINK_STATUS,
        lastSeenAt: { lte: input.syncedAt },
      },
      data: {
        status: SUPERSEDED_LINK_STATUS,
        supersededAt: input.syncedAt,
      },
    });
  }

  private async saveConflictLink(
    tx: Prisma.TransactionClient,
    input: ResolveExactMatchInput,
    candidateLink: { id: string } | null,
    verifiedAt: Date,
  ) {
    if (candidateLink) {
      if (candidateLink.id) {
        await tx.guestGameProfileIdentityLink.update({
          where: { id: candidateLink.id },
          data: {
            status: CONFLICT_LINK_STATUS,
            matchSource: input.matchSource,
            confidence: 'EXACT',
            verifiedAt,
            lastSeenAt: verifiedAt,
          },
        });
      }
      return;
    }

    await tx.guestGameProfileIdentityLink.create({
      data: {
        tenantId: input.tenantId,
        profileId: input.profileId,
        guestId: input.guestId,
        externalProvider: input.externalProvider,
        externalDomain: input.externalDomain,
        externalGuestId: input.externalGuestId,
        status: CONFLICT_LINK_STATUS,
        matchSource: input.matchSource,
        confidence: 'EXACT',
        consecutiveMatches: 1,
        verifiedAt,
        lastSeenAt: verifiedAt,
      },
    });
  }

  private async upsertCandidateLink(
    tx: Prisma.TransactionClient,
    input: ResolveExactMatchInput,
    guest: {
      id: string;
      externalGuestId: string;
    },
    state: {
      status: string;
      consecutiveMatches: number;
      verifiedAt: Date;
    },
  ) {
    return tx.guestGameProfileIdentityLink.upsert({
      where: {
        tenantId_profileId_externalProvider_externalDomain_guestId: {
          tenantId: input.tenantId,
          profileId: input.profileId,
          externalProvider: input.externalProvider,
          externalDomain: input.externalDomain,
          guestId: guest.id,
        },
      },
      create: {
        tenantId: input.tenantId,
        profileId: input.profileId,
        guestId: guest.id,
        externalProvider: input.externalProvider,
        externalDomain: input.externalDomain,
        externalGuestId: guest.externalGuestId,
        status: state.status,
        matchSource: input.matchSource,
        confidence: 'EXACT',
        consecutiveMatches: state.consecutiveMatches,
        verifiedAt: state.verifiedAt,
        lastSeenAt: state.verifiedAt,
        supersededAt: null,
      },
      update: {
        externalGuestId: guest.externalGuestId,
        status: state.status,
        matchSource: input.matchSource,
        confidence: 'EXACT',
        consecutiveMatches: state.consecutiveMatches,
        verifiedAt: state.verifiedAt,
        lastSeenAt: state.verifiedAt,
        supersededAt: null,
      },
    });
  }

  private async updateLegacyPrimaryGuest(
    tx: Prisma.TransactionClient,
    profile: {
      id: string;
      guestId: string | null;
      contactMasked: string | null;
      displayName: string | null;
      guest: {
        id: string;
        externalProvider: IntegrationProvider | null;
        externalDomain: string | null;
      } | null;
    },
    guest: {
      id: string;
      phoneMasked: string | null;
      emailMasked: string | null;
      fullNameMasked: string | null;
      externalProvider: IntegrationProvider | null;
      externalDomain: string | null;
      externalGuestId: string;
    },
    previousDomainLink: { guestId: string } | null,
  ) {
    const primaryIsSameDomain =
      profile.guest?.externalProvider === guest.externalProvider &&
      profile.guest?.externalDomain === guest.externalDomain;
    const shouldReplacePrimary =
      !profile.guestId ||
      profile.guestId === previousDomainLink?.guestId ||
      primaryIsSameDomain;

    await tx.guestGameProfile.update({
      where: { id: profile.id },
      data: {
        ...(shouldReplacePrimary ? { guestId: guest.id } : {}),
        contactMasked:
          profile.contactMasked ?? guest.phoneMasked ?? guest.emailMasked,
        displayName:
          profile.displayName ?? guest.fullNameMasked ?? guest.externalGuestId,
      },
    });
  }

  private async backfillIdentityScope(
    tx: Prisma.TransactionClient,
    tenantId: string,
    profileId: string,
    guest: {
      id: string;
      externalProvider: IntegrationProvider | null;
      externalDomain: string | null;
      externalGuestId: string;
    },
  ): Promise<GuestIdentityBackfillSummary> {
    if (!guest.externalProvider || !guest.externalDomain) {
      return emptyBackfillSummary();
    }

    const externalIdentity = {
      tenantId,
      externalProvider: guest.externalProvider,
      externalDomain: guest.externalDomain,
      externalGuestId: guest.externalGuestId,
    };
    // Operational records remain profile-scoped: a later domain rebind must not
    // rewrite the guest identity attached to an already-created reward/event.
    const [
      activityRawRecords,
      activityFacts,
      activitySyncStates,
      activitySourceSyncStates,
    ] = await Promise.all([
      tx.guestActivityRawRecord.updateMany({
        where: { ...externalIdentity, profileId: null },
        data: { profileId },
      }),
      tx.guestActivityFact.updateMany({
        where: { ...externalIdentity, profileId: null },
        data: { profileId },
      }),
      tx.guestActivitySyncState.updateMany({
        where: { ...externalIdentity, profileId: null },
        data: { profileId },
      }),
      tx.guestActivitySourceSyncState.updateMany({
        where: { ...externalIdentity, profileId: null },
        data: { profileId },
      }),
    ]);

    return {
      rewards: 0,
      events: 0,
      deliveries: 0,
      bonusLedgerEntries: 0,
      activityRawRecords: activityRawRecords.count,
      activityFacts: activityFacts.count,
      activitySyncStates: activitySyncStates.count,
      activitySourceSyncStates: activitySourceSyncStates.count,
    };
  }

  private async recordIdentityLinkEvent(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      profileId: string;
      guestId: string;
      previousGuestId: string | null;
      externalProvider: IntegrationProvider | null;
      externalDomain: string | null;
      externalGuestId: string;
      matchSource: string;
      phoneMasked: string | null;
      backfilled: GuestIdentityBackfillSummary;
      occurredAt: Date;
    },
  ) {
    await tx.guestGameEvent.createMany({
      data: [
        {
          tenantId: input.tenantId,
          profileId: input.profileId,
          guestId: input.guestId,
          eventType: IDENTITY_LINK_EVENT_TYPE,
          source: IDENTITY_LINK_EVENT_SOURCE,
          externalProvider: input.externalProvider,
          externalDomain: input.externalDomain,
          externalId: [
            'identity-link',
            input.profileId,
            input.externalDomain,
            input.guestId,
          ].join(':'),
          occurredAt: input.occurredAt,
          payload: {
            matchSource: input.matchSource,
            previousGuestId: input.previousGuestId,
            phoneMasked: input.phoneMasked,
            externalGuestId: input.externalGuestId,
            backfilled: input.backfilled,
          },
          note: 'A game profile identity was linked to an exact domain-scoped Langame guest.',
          createdAt: input.occurredAt,
        },
      ],
      skipDuplicates: true,
    });
  }

  private result(
    status: GuestIdentityResolutionStatus,
    profileId: string | null,
    guestId: string | null,
    previousGuestId: string | null = null,
  ): GuestIdentityResolutionResult {
    return {
      status,
      profileId,
      guestId,
      previousGuestId,
      linkedNow: false,
      backfilled: emptyBackfillSummary(),
    };
  }
}

function dedupeSnapshotCandidates(
  candidates: GuestIdentitySnapshotCandidate[],
) {
  return [
    ...new Map(
      candidates.map((candidate) => [
        candidate.guestId,
        {
          ...candidate,
          phoneHashes: uniqueStrings(candidate.phoneHashes),
        },
      ]),
    ).values(),
  ];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function identityPairKey(profileId: string, guestId: string) {
  return `${profileId}:${guestId}`;
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
