import { Injectable } from '@nestjs/common';
import { IntegrationProvider, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import {
  buildDashboardSetupProgress,
  type DashboardSetupProgress,
} from './dashboard-setup-progress';

@Injectable()
export class DashboardSetupProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScope: FreshStoreScopeService,
  ) {}

  /** Network-wide yes/no facts only: no names, contacts or amounts leave. */
  async get(user: AuthenticatedUser): Promise<DashboardSetupProgress> {
    await this.freshStoreScope.assertNetwork(user);
    const tenantId = user.tenantId;
    const [
      activeLangameSources,
      activeStores,
      staffAccounts,
      openStaffInvites,
      launchedMissions,
      sentDailyReports,
      sale,
      gameSession,
    ] = await Promise.all([
      this.prisma.integrationSource.count({
        where: {
          tenantId,
          provider: IntegrationProvider.LANGAME,
          isActive: true,
          credential: { isActive: true },
        },
      }),
      this.prisma.store.findMany({
        where: { tenantId, isActive: true },
        select: { name: true, externalDomain: true, integrationSourceId: true },
      }),
      this.prisma.user.count({
        where: {
          tenantId,
          isActive: true,
          isPlatformAdmin: false,
          role: { not: UserRole.OWNER },
        },
      }),
      this.prisma.userInvite.count({
        where: {
          tenantId,
          revokedAt: null,
          acceptedAt: null,
          role: { not: UserRole.OWNER },
        },
      }),
      this.prisma.guestGameMission.count({
        where: { tenantId, status: { not: 'DRAFT' } },
      }),
      this.prisma.dailyReportDelivery.count({
        where: { tenantId, status: 'SENT' },
      }),
      this.prisma.salesFact.findFirst({
        where: { tenantId },
        select: { id: true },
      }),
      this.prisma.guestSession.findFirst({
        where: { tenantId },
        select: { id: true },
      }),
    ]);

    return buildDashboardSetupProgress({
      activeLangameSources,
      activeStores,
      staffAccounts,
      openStaffInvites,
      launchedMissions,
      sentDailyReports,
      hasSales: sale !== null,
      hasGameSessions: gameSession !== null,
    });
  }
}
