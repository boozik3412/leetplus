import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuestCommunicationConsentStatus,
  GuestCrmStatus,
  IntegrationProvider,
  Prisma,
} from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { GuestDataFoundationService } from '../integrations/guest-data-foundation.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export type GuestsSummaryQuery = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  guestGroupId?: string;
};

export type GuestListQuery = GuestsSummaryQuery & {
  segment?: 'active' | 'new' | 'repeat' | 'risk' | 'lost' | 'quiet' | 'top';
  crmStatus?: GuestCrmStatus;
  search?: string;
  page?: string;
  pageSize?: string;
  sort?:
    | 'revenue'
    | 'sessions'
    | 'lastActivity'
    | 'registered'
    | 'rfm'
    | 'churnRisk'
    | 'ltv'
    | 'bonusLoad';
  direction?: 'asc' | 'desc';
};

export type GuestSavedFilterPayload = Omit<GuestListQuery, 'page'>;

export type GuestSavedFilterDto = {
  name?: string;
  description?: string | null;
  filters?: GuestSavedFilterPayload;
};

export type GuestAudienceDto = GuestSavedFilterDto;

export type GuestCrmLeadDto = {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  eventName?: string | null;
  crmStatus?: GuestCrmStatus;
  crmNote?: string | null;
  nextAction?: string | null;
  nextContactAt?: string | null;
  phoneConsentStatus?: GuestCommunicationConsentStatus | null;
  phoneConsentSource?: string | null;
};

export type GuestCrmLeadUpdateDto = {
  phoneConsentStatus?: GuestCommunicationConsentStatus | null;
  phoneConsentSource?: string | null;
};

export type GuestCrmTaskDto = {
  audienceId?: string | null;
  guestId?: string | null;
  leadId?: string | null;
  assignedToUserId?: string | null;
  title?: string | null;
  description?: string | null;
  dueAt?: string | null;
};

export type GuestCrmTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELED';

export type GuestCrmTaskUpdateDto = {
  status?: GuestCrmTaskStatus | null;
  assignedToUserId?: string | null;
};

export type GuestCrmTaskSortKey =
  | 'dueAt'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'target'
  | 'assignee';

export type GuestCrmTaskTargetType = 'all' | 'group' | 'guest' | 'lead';

export type GuestCrmTaskReportQuery = {
  status?: GuestCrmTaskStatus | 'all';
  assignedToUserId?: string;
  targetType?: GuestCrmTaskTargetType;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: GuestCrmTaskSortKey;
  direction?: 'asc' | 'desc';
  pageSize?: string;
};

export type GuestCrmContactEventDto = {
  audienceId?: string | null;
  guestId?: string | null;
  leadId?: string | null;
  marketingCampaignId?: string | null;
  channel?: string | null;
  result?: string | null;
  note?: string | null;
  contactedAt?: string | null;
};

export type GuestCrmUser = {
  id: string;
  displayName: string;
  email: string;
  role: string;
};

export type StaffControlQuery = GuestsSummaryQuery;

export type StaffOperatorSortKey =
  | 'shifts'
  | 'hours'
  | 'cash'
  | 'refunds'
  | 'incass'
  | 'middleCheck';

export type StaffControlAnomalyType =
  | 'refunds'
  | 'missing-incassation'
  | 'long-shift'
  | 'low-middle-check'
  | 'unmapped-operator';

export type StaffOperatorReportQuery = GuestsSummaryQuery & {
  status?: 'all' | 'linked' | 'unlinked';
  anomaly?: StaffControlAnomalyType;
  search?: string;
  sort?: StaffOperatorSortKey;
  direction?: 'asc' | 'desc';
};

export type StaffOperationKind =
  | 'refunds'
  | 'discounts'
  | 'cash'
  | 'guest'
  | 'service'
  | 'other';

export type StaffOperationSortKey = 'count' | 'amount' | 'lastSeen' | 'type';

export type StaffOperationsReportQuery = GuestsSummaryQuery & {
  kind?: StaffOperationKind | 'all';
  search?: string;
  sort?: StaffOperationSortKey;
  direction?: 'asc' | 'desc';
};

export type StaffIdentityMappingDto = {
  externalDomain?: string | null;
  externalUserId?: string | null;
  guestId?: string | null;
  note?: string | null;
};

export type GuestDashboardRow = {
  id: string;
  externalDomain: string | null;
  externalGuestId: string;
  guestGroupName: string | null;
  displayName: string;
  contact: string;
  insertedAt: string | null;
  lastActivityAt: string | null;
  sessionsCount: number;
  visitsDays: number;
  playHours: number;
  currentCountHours: number | null;
  transactionAmount: number;
  barRevenue: number;
  ltv: GuestLtvSummary;
  bonusLoad: GuestBonusLoadSummary;
  rfm: GuestRfmScore;
  churnRisk: GuestChurnRisk;
  segment: 'active' | 'new' | 'repeat' | 'risk' | 'lost' | 'quiet';
  crmStatus: GuestCrmStatus;
  crmNote: string | null;
  nextAction: string | null;
  nextContactAt: string | null;
  crmUpdatedAt: string | null;
  phoneConsentStatus: GuestCommunicationConsentStatus;
};

export type GuestChurnRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'LOST';

export type GuestChurnRisk = {
  level: GuestChurnRiskLevel;
  score: number;
  daysSinceActivity: number | null;
  expectedIntervalDays: number | null;
  thresholdDays: number | null;
  valueAtRisk: number;
  reason: string;
};

export type GuestRfmSegment =
  | 'CHAMPION'
  | 'LOYAL'
  | 'PROMISING'
  | 'NEED_ATTENTION'
  | 'AT_RISK'
  | 'LOST';

export type GuestRfmScore = {
  recencyDays: number | null;
  frequency: number;
  monetary: number;
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  totalScore: number;
  segment: GuestRfmSegment;
};

export type GuestLtvSummary = {
  totalRevenue: number;
  transactionRevenue: number;
  barRevenue: number;
  revenueDays: number;
  firstRevenueAt: string | null;
  lastRevenueAt: string | null;
  averageRevenuePerRevenueDay: number;
  averageRevenuePerCalendarDay: number;
};

export type GuestBonusLoadStatus = 'NONE' | 'NORMAL' | 'WATCH' | 'RISK';

export type GuestBonusLoadSummary = {
  currentBalance: number;
  latestSnapshotAt: string | null;
  balanceToLtvPercent: number | null;
  status: GuestBonusLoadStatus;
};

export type GuestBonusLoadNetworkSummary = {
  totalBalance: number;
  guestsWithBalance: number;
  inactiveBalance: number;
  inactiveGuests: number;
  averageBalance: number;
  balanceToPeriodRevenuePercent: number | null;
  latestSnapshotAt: string | null;
};

export type GuestRetentionWindow = {
  days: 7 | 14 | 30;
  eligibleGuests: number;
  returnedGuests: number;
  pendingGuests: number;
  percent: number;
};

export type GuestRetentionSummary = {
  cohortGuests: number;
  returnedGuests: number;
  withoutSecondActivity: number;
  averageDaysToSecondActivity: number | null;
  windows: GuestRetentionWindow[];
};

export type GuestVisitHeatmapCell = {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  hour: number;
  sessionsCount: number;
  activeGuests: number;
  playHours: number;
};

export type GuestVisitHeatmapSummary = {
  maxSessionsCount: number;
  maxActiveGuests: number;
  peak: GuestVisitHeatmapCell | null;
  cells: GuestVisitHeatmapCell[];
};

export type GuestFlowForecastConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type GuestFlowForecastDay = {
  date: string;
  weekday: GuestVisitHeatmapCell['weekday'];
  expectedSessions: number;
  expectedActiveGuests: number;
  expectedPlayHours: number;
  confidence: GuestFlowForecastConfidence;
};

export type GuestFlowForecastSummary = {
  horizonDays: number;
  baselineDays: number;
  totalExpectedSessions: number;
  totalExpectedActiveGuests: number;
  totalExpectedPlayHours: number;
  confidence: GuestFlowForecastConfidence;
  peakDay: GuestFlowForecastDay | null;
  quietDay: GuestFlowForecastDay | null;
  days: GuestFlowForecastDay[];
};

export type GuestFilterOptions = {
  stores: Array<{
    id: string;
    name: string;
    externalDomain: string | null;
    externalClubId: string | null;
  }>;
  groups: Array<{
    id: string;
    name: string;
    externalDomain: string | null;
    externalGroupId: string;
  }>;
};

export type GuestsSummary = {
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  guestGroupId: string | null;
  totalGuests: number;
  activeGuests: number;
  newGuests: number;
  repeatGuests: number;
  riskGuests: number;
  lostGuests: number;
  sessionsCount: number;
  playHours: number;
  computerCount: number | null;
  playCapacityHours: number | null;
  loadPercent: number | null;
  averageSessionMinutes: number;
  transactionsCount: number;
  transactionAmount: number;
  barRevenue: number;
  barSalesCount: number;
  bonusLoad: GuestBonusLoadNetworkSummary;
  retention: GuestRetentionSummary;
  visitHeatmap: GuestVisitHeatmapSummary;
  flowForecast: GuestFlowForecastSummary;
  dataQuality: {
    latestProfileRuns: Array<{
      domain: string;
      startedAt: string;
      status: string;
      guestsCount: number;
      sessionsCount: number;
      transactionsCount: number;
      productSalesLinked: number;
      endpointErrors: Record<string, string>;
    }>;
    unavailableEndpoints: string[];
    sessionsWithoutGuestId: number;
    transactionsWithoutGuestId: number;
    salesMissingGuestLink: number;
  };
  visitTrend: Array<{
    date: string;
    sessionsCount: number;
    activeGuests: number;
    barRevenue: number;
  }>;
  topGuests: GuestDashboardRow[];
  riskGuestsRows: GuestDashboardRow[];
  bonusLoadGuestsRows: GuestDashboardRow[];
};

export type GuestListResponse = {
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  guestGroupId: string | null;
  segment: NonNullable<GuestListQuery['segment']>;
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  sort: NonNullable<GuestListQuery['sort']>;
  direction: NonNullable<GuestListQuery['direction']>;
  rows: GuestDashboardRow[];
};

export type GuestExportFile = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

export type GuestSavedFilter = {
  id: string;
  name: string;
  description: string | null;
  filters: GuestSavedFilterPayload;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type GuestAudience = {
  id: string;
  name: string;
  description: string | null;
  filters: GuestSavedFilterPayload;
  guestsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type GuestCrmLead = {
  id: string;
  displayName: string;
  phone: string;
  email: string | null;
  source: string | null;
  eventName: string | null;
  crmStatus: GuestCrmStatus;
  crmNote: string | null;
  nextAction: string | null;
  nextContactAt: string | null;
  phoneConsentStatus: GuestCommunicationConsentStatus;
  phoneConsentSource: string | null;
  phoneConsentAt: string | null;
  unsubscribedAt: string | null;
  matchedGuestId: string | null;
  matchedGuestDisplayName: string | null;
  matchedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GuestCrmTask = {
  id: string;
  title: string;
  description: string | null;
  status: GuestCrmTaskStatus;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  audience: { id: string; name: string } | null;
  guest: { id: string; displayName: string } | null;
  lead: { id: string; displayName: string } | null;
  assignedToUser: { id: string; displayName: string; email: string } | null;
};

export type GuestCrmTaskReport = {
  status: GuestCrmTaskStatus | 'all';
  assignedToUserId: string | null;
  targetType: GuestCrmTaskTargetType;
  search: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  sort: GuestCrmTaskSortKey;
  direction: 'asc' | 'desc';
  pageSize: number;
  totalRows: number;
  summary: {
    open: number;
    inProgress: number;
    done: number;
    canceled: number;
    overdue: number;
    withAssignee: number;
    withoutAssignee: number;
  };
  rows: GuestCrmTask[];
};

export type GuestCrmContactEvent = {
  id: string;
  channel: string;
  result: string | null;
  note: string | null;
  contactedAt: string;
  createdAt: string;
  audience: { id: string; name: string } | null;
  guest: { id: string; displayName: string } | null;
  lead: { id: string; displayName: string } | null;
  marketingCampaign: { id: string; name: string } | null;
  createdBy: string | null;
};

export type GuestDetail = GuestDashboardRow & {
  crmEvents: Array<{
    id: string;
    status: GuestCrmStatus;
    note: string | null;
    nextAction: string | null;
    nextContactAt: string | null;
    createdAt: string;
    createdBy: string | null;
  }>;
  sessions: Array<{
    id: string;
    startedAt: string | null;
    stoppedAt: string | null;
    durationMinutes: number | null;
    storeName: string | null;
    externalDomain: string | null;
  }>;
  transactions: Array<{
    id: string;
    happenedAt: string | null;
    amount: number | null;
    balance: number | null;
    bonusBalance: number | null;
    type: string | null;
    storeName: string | null;
    externalDomain: string | null;
  }>;
  sales: Array<{
    id: string;
    saleDate: string;
    productName: string;
    storeName: string;
    revenue: number;
    quantity: number;
  }>;
};

export type StaffControlRow = GuestDashboardRow & {
  controlFlags: string[];
  storeNames: string[];
  lastClosedShiftExternalShiftId: string | null;
  lastClosedShiftStartedAt: string | null;
  lastClosedShiftStoppedAt: string | null;
  shiftsCount: number;
  shiftHours: number;
  shiftPaymentAmount: number;
  shiftRefundAmount: number;
  shiftIncassAmount: number;
  barRevenue: number;
  hookahRevenue: number;
  averageShiftMiddleCheck: number;
};

export type StaffControlDiagnostics = {
  latestRuns: Array<{
    domain: string;
    startedAt: string;
    endpointErrors: Record<string, string>;
    operationLogs: {
      total: number;
      candidateFields: Record<string, number>;
      operatorHints: StaffOperatorHint[];
    };
    cashTransactions: {
      total: number;
      candidateFields: Record<string, number>;
      operatorHints: StaffOperatorHint[];
    };
    langameUsers: {
      total: number;
      candidateFields: Record<string, number>;
      operatorHints: StaffOperatorHint[];
    };
    workingShifts: {
      total: number;
      candidateFields: Record<string, number>;
      operatorHints: StaffOperatorHint[];
    };
  }>;
};

export type StaffOperatorHint = {
  operatorId: string;
  count: number;
  fields: Record<string, string[]>;
};

export type StaffLangameUserSummary = {
  displayName: string;
  email: string | null;
  username: string | null;
  adminStatus: string | null;
  verified: boolean | null;
  phone: string | null;
  externalGuestId: string | null;
  workPointLabel: string | null;
  updatedAt: string;
};

export type StaffUnmatchedOperatorRow = {
  externalDomain: string | null;
  externalUserId: string;
  langameUser: StaffLangameUserSummary | null;
  storeNames: string[];
  lastClosedShiftExternalShiftId: string | null;
  lastClosedShiftStartedAt: string | null;
  lastClosedShiftStoppedAt: string | null;
  shiftsCount: number;
  shiftHours: number;
  shiftPaymentAmount: number;
  shiftRefundAmount: number;
  shiftIncassAmount: number;
  barRevenue: number;
  hookahRevenue: number;
  averageShiftMiddleCheck: number;
};

export type StaffControlAnomaly = {
  type: StaffControlAnomalyType;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  amount: number | null;
  count: number;
};

export type StaffControlReport = {
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  staffGroups: Array<{
    id: string;
    name: string;
    externalDomain: string | null;
    externalGroupId: string;
  }>;
  staffCount: number;
  activeStaff: number;
  sessionsCount: number;
  playHours: number;
  transactionAmount: number;
  barRevenue: number;
  operationLogsCount: number;
  operationAmount: number;
  shiftsCount: number;
  shiftsWithStaffLink: number;
  shiftHours: number;
  shiftPaymentAmount: number;
  shiftRefundAmount: number;
  shiftIncassAmount: number;
  averageShiftMiddleCheck: number;
  rows: StaffControlRow[];
  anomalies: StaffControlAnomaly[];
  operationTypes: Array<{
    type: string;
    count: number;
    amount: number;
  }>;
  operationKindSummary: Array<{
    kind: StaffOperationKind;
    count: number;
    amount: number;
  }>;
  unmatchedOperators: StaffUnmatchedOperatorRow[];
  diagnostics: StaffControlDiagnostics;
};

export type StaffOperationsReportRow = {
  type: string;
  kind: StaffOperationKind;
  count: number;
  amount: number;
  lastSeenAt: string | null;
  storeNames: string[];
  externalDomains: string[];
};

export type StaffOperationsReport = {
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  kind: StaffOperationKind | 'all';
  search: string | null;
  sort: StaffOperationSortKey;
  direction: 'asc' | 'desc';
  totalCount: number;
  totalAmount: number;
  kindSummary: Array<{
    kind: StaffOperationKind;
    count: number;
    amount: number;
  }>;
  rows: StaffOperationsReportRow[];
};

export type StaffIdentityMappingResult = {
  id: string;
  guestId: string;
  externalDomain: string | null;
  externalUserId: string;
  updatedShifts: number;
};

export type StaffOperatorShiftDetail = {
  externalShiftId: string | null;
  storeName: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  durationHours: number;
  paymentAmount: number;
  refundAmount: number;
  incassAmount: number;
  middleCheck: number;
  barRevenue: number;
  hookahRevenue: number;
  guestVisitsCount: number;
  uniqueGuestsCount: number;
  signals: StaffControlAnomalyType[];
};

export type StaffOperatorReportRow = {
  externalDomain: string | null;
  externalUserId: string;
  mappingId: string | null;
  mappingNote: string | null;
  linkedGuest: GuestDashboardRow | null;
  langameUser: StaffLangameUserSummary | null;
  storeNames: string[];
  lastClosedShiftExternalShiftId: string | null;
  lastClosedShiftStartedAt: string | null;
  lastClosedShiftStoppedAt: string | null;
  shiftsCount: number;
  shiftHours: number;
  shiftPaymentAmount: number;
  shiftRefundAmount: number;
  shiftIncassAmount: number;
  barRevenue: number;
  hookahRevenue: number;
  guestVisitsCount: number;
  uniqueGuestsCount: number;
  averageShiftMiddleCheck: number;
  shiftDetails: StaffOperatorShiftDetail[];
};

export type StaffOperatorReport = {
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  status: NonNullable<StaffOperatorReportQuery['status']>;
  anomaly: StaffControlAnomalyType | null;
  search: string | null;
  sort: StaffOperatorSortKey;
  direction: 'asc' | 'desc';
  rows: StaffOperatorReportRow[];
  staffOptions: GuestDashboardRow[];
};

export type GuestCrmUpdateDto = {
  crmStatus?: GuestCrmStatus;
  crmNote?: string | null;
  nextAction?: string | null;
  nextContactAt?: string | null;
};

type GuestBase = {
  id: string;
  externalDomain: string | null;
  externalGuestId: string;
  externalGuestTypeId: string | null;
  phoneMasked: string | null;
  phoneEncrypted: string | null;
  emailMasked: string | null;
  fullNameMasked: string | null;
  fullNameEncrypted: string | null;
  insertedAt: Date | null;
  lastActivityAt: Date | null;
  isDisabled: boolean;
  currentCountHours: Prisma.Decimal | null;
  crmStatus: GuestCrmStatus;
  crmNote: string | null;
  nextAction: string | null;
  nextContactAt: Date | null;
  crmUpdatedAt: Date | null;
  phoneConsentStatus: GuestCommunicationConsentStatus;
};

type GuestMetrics = {
  latestActivityAt: Date | null;
  activityDays: Set<string>;
  sessionsCount: number;
  visitsDays: Set<string>;
  playMinutes: number;
  transactionsCount: number;
  transactionAmount: number;
  barRevenue: number;
  barSalesCount: number;
  lifetimeTransactionAmount: number;
  lifetimeBarRevenue: number;
  lifetimeRevenueDays: Set<string>;
  lifetimeFirstRevenueAt: Date | null;
  lifetimeLastRevenueAt: Date | null;
  bonusBalance: number;
  bonusSnapshotAt: Date | null;
};

type StaffShiftMetrics = {
  storeNames: Set<string>;
  lastClosedShiftExternalShiftId: string | null;
  lastClosedShiftStartedAt: Date | null;
  lastClosedShiftStoppedAt: Date | null;
  shiftsCount: number;
  linkedShiftsCount: number;
  shiftMinutes: number;
  shiftPaymentAmount: number;
  shiftRefundAmount: number;
  shiftIncassAmount: number;
  barRevenue: number;
  hookahRevenue: number;
  middleCheckSum: number;
  middleCheckCount: number;
};

type StaffUnmatchedOperatorMetrics = StaffShiftMetrics & {
  externalDomain: string | null;
  externalUserId: string;
  langameUser: StaffLangameUserSummary | null;
  storeNames: Set<string>;
};

type StaffOperatorMetrics = StaffShiftMetrics & {
  externalDomain: string | null;
  externalUserId: string;
  linkedGuest: GuestDashboardRow | null;
  langameUser: StaffLangameUserSummary | null;
  mappingId: string | null;
  mappingNote: string | null;
  guestVisitsCount: number;
  uniqueGuestKeys: Set<string>;
  shiftDetails: StaffOperatorShiftDetail[];
};

type Period = {
  fromDate: Date;
  toDate: Date;
  activityFromDate: Date;
  from: string;
  to: string;
};

type ResolvedGuestFilters = {
  storeId: string | null;
  guestGroupId: string | null;
  externalDomain: string | null;
  externalGuestTypeId: string | null;
  search: string | null;
  excludedAdminGuestGroups: Array<{
    externalDomain: string | null;
    externalGuestTypeId: string;
  }>;
  onlyGuestGroups?: Array<{
    externalDomain: string | null;
    externalGuestTypeId: string;
  }>;
};

type GuestGroupsByKey = Map<string, string>;
type CsvCell = string | number | null;
type BuiltGuestList = Omit<
  GuestListResponse,
  'page' | 'pageSize' | 'totalRows' | 'totalPages'
>;

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly configService: ConfigService,
    private readonly guestDataFoundationService: GuestDataFoundationService,
  ) {}

  async getFilterOptions(user: AuthenticatedUser): Promise<GuestFilterOptions> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const [stores, groups] = await Promise.all([
      this.prisma.store.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          name: true,
          externalDomain: true,
          externalClubId: true,
        },
      }),
      this.prisma.guestGroup.findMany({
        where: { tenantId },
        orderBy: [{ externalDomain: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          externalDomain: true,
          externalGroupId: true,
        },
      }),
    ]);

    return { stores, groups };
  }

  async getSummary(
    user: AuthenticatedUser,
    query: GuestsSummaryQuery = {},
  ): Promise<GuestsSummary> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const filters = await this.resolveGuestFilters(tenantId, query);
    const { guests, metricsByGuestId, groupsByKey } =
      await this.buildGuestMetrics(tenantId, period, filters);
    const rows = guests.map((guest) =>
      this.toDashboardRow(
        guest,
        metricsByGuestId.get(guest.id),
        period,
        groupsByKey,
      ),
    );
    const activeRows = rows.filter((row) => row.segment === 'active');
    const newRows = rows.filter((row) => row.segment === 'new');
    const repeatRows = rows.filter((row) => row.segment === 'repeat');
    const riskRows = rows.filter((row) => row.segment === 'risk');
    const lostRows = rows.filter((row) => row.segment === 'lost');
    const periodMetrics = this.sumPeriodMetrics(metricsByGuestId);
    const periodRevenue = this.round(
      periodMetrics.transactionAmount + periodMetrics.barRevenue,
      2,
    );
    const bonusLoad = this.buildBonusLoadSummary(rows, periodRevenue);
    const playHours = this.round(periodMetrics.playMinutes / 60, 1);
    const computerCount = await this.resolveComputerCount(
      tenantId,
      filters.storeId,
    );
    const playCapacityHours =
      computerCount !== null
        ? this.round(computerCount * this.periodDays(period) * 24, 1)
        : null;
    const loadPercent =
      playCapacityHours && playCapacityHours > 0
        ? this.round((playHours / playCapacityHours) * 100, 1)
        : null;
    const retention = this.buildRetentionSummary(
      guests,
      metricsByGuestId,
      period,
    );
    const [trend, visitHeatmap, flowForecast, dataQuality] = await Promise.all([
      this.buildVisitTrend(tenantId, period, filters),
      this.buildVisitHeatmap(tenantId, period, filters),
      this.buildFlowForecast(tenantId, period, filters),
      this.getDataQuality(tenantId, period, filters),
    ]);

    return {
      tenantId,
      tenantSlug,
      periodFrom: period.from,
      periodTo: period.to,
      storeId: filters.storeId,
      guestGroupId: filters.guestGroupId,
      totalGuests: guests.length,
      activeGuests: activeRows.length + repeatRows.length + newRows.length,
      newGuests: newRows.length,
      repeatGuests: repeatRows.length,
      riskGuests: riskRows.length,
      lostGuests: lostRows.length,
      sessionsCount: periodMetrics.sessionsCount,
      playHours,
      computerCount,
      playCapacityHours,
      loadPercent,
      averageSessionMinutes:
        periodMetrics.sessionsCount > 0
          ? this.round(
              periodMetrics.playMinutes / periodMetrics.sessionsCount,
              0,
            )
          : 0,
      transactionsCount: periodMetrics.transactionsCount,
      transactionAmount: this.round(periodMetrics.transactionAmount, 2),
      barRevenue: this.round(periodMetrics.barRevenue, 2),
      barSalesCount: periodMetrics.barSalesCount,
      bonusLoad,
      retention,
      visitHeatmap,
      flowForecast,
      dataQuality,
      visitTrend: trend,
      topGuests: this.sortRows(rows, 'revenue', 'desc').slice(0, 12),
      riskGuestsRows: this.sortRows(riskRows, 'revenue', 'desc').slice(0, 12),
      bonusLoadGuestsRows: this.sortRows(
        rows.filter((row) => row.bonusLoad.currentBalance > 0),
        'bonusLoad',
        'desc',
      ).slice(0, 12),
    };
  }

  async getGuests(
    user: AuthenticatedUser,
    query: GuestListQuery = {},
  ): Promise<GuestListResponse> {
    const page = this.resolvePositiveInteger(query.page, 1, 1, 10_000);
    const pageSize = this.resolvePositiveInteger(query.pageSize, 50, 10, 200);
    const guestList = await this.buildGuestList(user, query);
    const totalRows = guestList.rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const offset = (normalizedPage - 1) * pageSize;

    return {
      periodFrom: guestList.periodFrom,
      periodTo: guestList.periodTo,
      storeId: guestList.storeId,
      guestGroupId: guestList.guestGroupId,
      segment: guestList.segment,
      page: normalizedPage,
      pageSize,
      totalRows,
      totalPages,
      sort: guestList.sort,
      direction: guestList.direction,
      rows: guestList.rows.slice(offset, offset + pageSize),
    };
  }

  async exportGuests(
    user: AuthenticatedUser,
    query: GuestListQuery = {},
  ): Promise<GuestExportFile> {
    const guestList = await this.buildGuestList(user, query);
    const csvRows: CsvCell[][] = [
      [
        'Гость',
        'Внешний ID',
        'Контакт',
        'Группа',
        'Сегмент',
        'CRM статус',
        'Сессии',
        'Дни визитов',
        'Часы',
        'LTV факт, руб',
        'LTV операции, руб',
        'LTV бар, руб',
        'Дней с выручкой',
        'Первая выручка',
        'Последняя выручка',
        'Бонусный остаток',
        'Бонусная нагрузка',
        'Бонус / LTV, %',
        'Дата бонусного снимка',
        'Деньги, руб',
        'Бар, руб',
        'RFM балл',
        'RFM сегмент',
        'RFM давность, дн',
        'RFM частота',
        'RFM деньги, руб',
        'Риск оттока',
        'Риск оттока, балл',
        'Дней без активности',
        'Ожидаемый интервал, дн',
        'Порог риска, дн',
        'Деньги в риске, руб',
        'Дата регистрации',
        'Последняя активность',
        'Следующий шаг',
        'Дата следующего контакта',
      ],
      ...guestList.rows.map((row) => [
        row.displayName,
        row.externalGuestId,
        row.contact,
        row.guestGroupName ?? row.externalDomain,
        this.segmentExportLabel(row.segment),
        this.crmStatusExportLabel(row.crmStatus),
        row.sessionsCount,
        row.visitsDays,
        row.playHours,
        row.ltv.totalRevenue,
        row.ltv.transactionRevenue,
        row.ltv.barRevenue,
        row.ltv.revenueDays,
        this.formatExportDate(row.ltv.firstRevenueAt),
        this.formatExportDate(row.ltv.lastRevenueAt),
        row.bonusLoad.currentBalance,
        this.bonusLoadExportLabel(row.bonusLoad.status),
        row.bonusLoad.balanceToLtvPercent ?? '',
        this.formatExportDate(row.bonusLoad.latestSnapshotAt),
        row.transactionAmount + row.barRevenue,
        row.barRevenue,
        row.rfm.totalScore,
        this.rfmSegmentExportLabel(row.rfm.segment),
        row.rfm.recencyDays ?? '',
        row.rfm.frequency,
        row.rfm.monetary,
        this.churnRiskExportLabel(row.churnRisk.level),
        row.churnRisk.score,
        row.churnRisk.daysSinceActivity ?? '',
        row.churnRisk.expectedIntervalDays ?? '',
        row.churnRisk.thresholdDays ?? '',
        row.churnRisk.valueAtRisk,
        this.formatExportDate(row.insertedAt),
        this.formatExportDate(row.lastActivityAt),
        row.nextAction,
        this.formatExportDateTime(row.nextContactAt),
      ]),
    ];

    return {
      fileName: `leetplus-guests-${guestList.periodFrom}-${guestList.periodTo}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(csvRows), 'utf8'),
    };
  }

  async getGuestSavedFilters(
    user: AuthenticatedUser,
  ): Promise<GuestSavedFilter[]> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const rows = await this.prisma.guestSavedFilter.findMany({
      where: { tenantId, report: 'guest_report' },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
    });

    return rows.map((row) => this.toGuestSavedFilter(row));
  }

  async createGuestSavedFilter(
    user: AuthenticatedUser,
    dto: GuestSavedFilterDto = {},
  ): Promise<GuestSavedFilter> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const name = this.normalizeText(dto.name, 80);

    if (!name) {
      throw new BadRequestException('Filter name is required');
    }

    const description = this.normalizeText(dto.description, 200);
    const row = await this.prisma.guestSavedFilter.create({
      data: {
        tenantId,
        createdByUserId: user.id,
        report: 'guest_report',
        name,
        description,
        filters: this.normalizeGuestSavedFilterPayload(
          dto.filters && typeof dto.filters === 'object' ? dto.filters : {},
        ),
      },
    });

    return this.toGuestSavedFilter(row);
  }

  async deleteGuestSavedFilter(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ id: string }> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const existing = await this.prisma.guestSavedFilter.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Saved filter not found');
    }

    await this.prisma.guestSavedFilter.delete({ where: { id } });

    return { id };
  }

  async getGuestAudiences(user: AuthenticatedUser): Promise<GuestAudience[]> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const rows = await this.prisma.guestAudience.findMany({
      where: { tenantId },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
    });

    return rows.map((row) => this.toGuestAudience(row));
  }

  async createGuestAudience(
    user: AuthenticatedUser,
    dto: GuestAudienceDto = {},
  ): Promise<GuestAudience> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const name = this.normalizeText(dto.name, 80);

    if (!name) {
      throw new BadRequestException('Group name is required');
    }

    const rawFilters =
      dto.filters && typeof dto.filters === 'object' ? dto.filters : {};
    const filters = this.normalizeGuestSavedFilterPayload(rawFilters);
    const normalizedFilters = this.guestSavedFilterPayload(
      filters as unknown as Prisma.JsonValue,
    );
    const guestList = await this.buildGuestList(user, normalizedFilters);
    const description = this.normalizeText(dto.description, 200);
    const memberRows = guestList.rows.map((row) => ({
      tenantId,
      guestId: row.id,
      externalDomain: row.externalDomain ?? '',
      externalGuestId: row.externalGuestId,
    }));

    const audience = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guestAudience.create({
        data: {
          tenantId,
          createdByUserId: user.id,
          name,
          description,
          filters,
          guestsCount: memberRows.length,
        },
      });

      for (let index = 0; index < memberRows.length; index += 1000) {
        await tx.guestAudienceMember.createMany({
          data: memberRows.slice(index, index + 1000).map((row) => ({
            ...row,
            audienceId: created.id,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return this.toGuestAudience(audience);
  }

  async deleteGuestAudience(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ id: string }> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const existing = await this.prisma.guestAudience.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Group not found');
    }

    await this.prisma.guestAudience.delete({ where: { id } });

    return { id };
  }

  async getGuestCrmLeads(user: AuthenticatedUser): Promise<GuestCrmLead[]> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const rows = await this.prisma.guestCrmLead.findMany({
      where: { tenantId },
      orderBy: [{ matchedAt: 'asc' }, { updatedAt: 'desc' }],
      take: 50,
      include: {
        matchedGuest: { select: this.guestSelect() },
      },
    });

    return rows.map((row) => this.toGuestCrmLead(row));
  }

  async createGuestCrmLead(
    user: AuthenticatedUser,
    dto: GuestCrmLeadDto = {},
  ): Promise<GuestCrmLead> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const phone = this.sensitiveValue(dto.phone, 'phone');

    if (!phone.hash) {
      throw new BadRequestException('Lead phone is required');
    }

    const fullName = this.sensitiveValue(dto.fullName, 'name');
    const email = this.sensitiveValue(dto.email, 'email');
    const matchedGuest = await this.prisma.guest.findFirst({
      where: { tenantId, phoneHash: phone.hash },
      orderBy: [{ lastSyncedAt: 'desc' }, { updatedAt: 'desc' }],
      select: this.guestSelect(),
    });
    const crmStatus = this.resolveCrmStatus(
      dto.crmStatus ?? GuestCrmStatus.CONTACT,
    );
    const phoneConsentStatus = this.resolvePhoneConsentStatus(
      dto.phoneConsentStatus,
    );
    const phoneConsentAt =
      phoneConsentStatus === GuestCommunicationConsentStatus.GRANTED
        ? new Date()
        : null;
    const row = await this.prisma.guestCrmLead.create({
      data: {
        tenantId,
        createdByUserId: user.id,
        matchedGuestId: matchedGuest?.id ?? null,
        fullNameHash: fullName.hash,
        fullNameMasked: fullName.masked,
        fullNameEncrypted: fullName.encrypted,
        phoneHash: phone.hash,
        phoneMasked: phone.masked,
        phoneEncrypted: phone.encrypted,
        emailHash: email.hash,
        emailMasked: email.masked,
        source: this.normalizeText(dto.source, 120),
        eventName: this.normalizeText(dto.eventName, 160),
        crmStatus,
        crmNote: this.normalizeText(dto.crmNote, 2000),
        nextAction: this.normalizeText(dto.nextAction, 160),
        nextContactAt: this.resolveOptionalDate(dto.nextContactAt),
        phoneConsentStatus,
        phoneConsentSource: this.normalizeText(dto.phoneConsentSource, 160),
        phoneConsentAt,
        unsubscribedAt:
          phoneConsentStatus === GuestCommunicationConsentStatus.UNSUBSCRIBED
            ? new Date()
            : null,
        matchedAt: matchedGuest ? new Date() : null,
      },
      include: {
        matchedGuest: { select: this.guestSelect() },
      },
    });

    if (matchedGuest) {
      await this.copyLeadCrmToMatchedGuestIfEmpty(
        tenantId,
        matchedGuest.id,
        row,
      );
    }

    if (row.nextAction || row.nextContactAt) {
      await this.prisma.guestCrmTask.create({
        data: {
          tenantId,
          createdByUserId: user.id,
          leadId: row.id,
          guestId: matchedGuest?.id ?? null,
          title:
            row.nextAction ??
            `Связаться с CRM-гостем: ${this.toGuestCrmLead(row).displayName}`,
          description: row.crmNote,
          dueAt: row.nextContactAt,
        },
      });
    }

    return this.toGuestCrmLead(row);
  }

  async updateGuestCrmLead(
    user: AuthenticatedUser,
    id: string,
    dto: GuestCrmLeadUpdateDto = {},
  ): Promise<GuestCrmLead> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const existing = await this.prisma.guestCrmLead.findFirst({
      where: { id, tenantId },
      select: { id: true, matchedGuestId: true },
    });

    if (!existing) {
      throw new NotFoundException('CRM lead not found');
    }

    const phoneConsentStatus = this.resolvePhoneConsentStatus(
      dto.phoneConsentStatus,
    );
    const phoneConsentSource = this.normalizeText(dto.phoneConsentSource, 160);
    const consentAt =
      phoneConsentStatus === GuestCommunicationConsentStatus.GRANTED
        ? new Date()
        : null;
    const unsubscribedAt =
      phoneConsentStatus === GuestCommunicationConsentStatus.UNSUBSCRIBED
        ? new Date()
        : null;
    const leadUpdate = {
      phoneConsentStatus,
      phoneConsentSource,
      phoneConsentAt: consentAt,
      unsubscribedAt,
    };

    const matchedGuestId = existing.matchedGuestId;

    if (matchedGuestId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.guestCrmLead.update({
          where: { id: existing.id },
          data: leadUpdate,
        });

        const guestUpdate = {
          phoneConsentStatus,
          phoneConsentSource,
          phoneConsentAt: consentAt,
          unsubscribedAt,
          ...(phoneConsentStatus ===
          GuestCommunicationConsentStatus.UNSUBSCRIBED
            ? {
                crmStatus: GuestCrmStatus.DO_NOT_CONTACT,
                crmUpdatedByUserId: user.id,
                crmUpdatedAt: new Date(),
              }
            : {}),
        };

        await tx.guest.update({
          where: { id: matchedGuestId },
          data: guestUpdate,
        });

        if (
          phoneConsentStatus === GuestCommunicationConsentStatus.UNSUBSCRIBED
        ) {
          await tx.guestCrmEvent.create({
            data: {
              tenantId,
              guestId: matchedGuestId,
              createdByUserId: user.id,
              status: GuestCrmStatus.DO_NOT_CONTACT,
              note: 'Гость отписался от коммуникаций',
            },
          });
        }
      });
    } else {
      await this.prisma.guestCrmLead.update({
        where: { id: existing.id },
        data: leadUpdate,
      });
    }

    const row = await this.prisma.guestCrmLead.findFirst({
      where: { id: existing.id, tenantId },
      include: {
        matchedGuest: { select: this.guestSelect() },
      },
    });

    if (!row) {
      throw new NotFoundException('CRM lead not found');
    }

    return this.toGuestCrmLead(row);
  }

  async getGuestCrmTaskReport(
    user: AuthenticatedUser,
    query: GuestCrmTaskReportQuery = {},
  ): Promise<GuestCrmTaskReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const status = this.resolveCrmTaskStatusFilter(query.status);
    const targetType = this.resolveCrmTaskTargetType(query.targetType);
    const search = this.normalizeText(query.search, 120);
    const sort = this.resolveCrmTaskSort(query.sort);
    const direction = query.direction === 'asc' ? 'asc' : 'desc';
    const pageSize = this.resolvePositiveInteger(query.pageSize, 200, 10, 1000);
    const where = this.buildCrmTaskWhere(tenantId, query);

    if (status !== 'all') {
      where.status = status;
    }

    if (query.assignedToUserId) {
      const assignedToUserId = await this.resolveCrmTaskAssignee(
        tenantId,
        query.assignedToUserId,
      );
      where.assignedToUserId = assignedToUserId;
    }

    if (targetType === 'group') {
      where.audienceId = { not: null };
    } else if (targetType === 'guest') {
      where.guestId = { not: null };
    } else if (targetType === 'lead') {
      where.leadId = { not: null };
    }

    if (search) {
      where.OR = this.buildCrmTaskSearch(search);
    }

    const rows = await this.prisma.guestCrmTask.findMany({
      where,
      include: {
        audience: { select: { id: true, name: true } },
        guest: { select: this.guestSelect() },
        lead: true,
        assignedToUser: { select: { id: true, fullName: true, email: true } },
      },
    });
    const taskRows = rows
      .map((row) => this.toGuestCrmTask(row))
      .sort((first, second) =>
        this.compareCrmTaskRows(first, second, sort, direction),
      );

    return {
      status,
      assignedToUserId: query.assignedToUserId ?? null,
      targetType,
      search,
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      sort,
      direction,
      pageSize,
      totalRows: taskRows.length,
      summary: this.buildCrmTaskSummary(taskRows),
      rows: taskRows.slice(0, pageSize),
    };
  }

  async getGuestCrmTasks(user: AuthenticatedUser): Promise<GuestCrmTask[]> {
    const report = await this.getGuestCrmTaskReport(user, {
      pageSize: '50',
      sort: 'dueAt',
      direction: 'asc',
    });

    return report.rows;
  }

  async exportGuestCrmTasks(
    user: AuthenticatedUser,
    query: GuestCrmTaskReportQuery = {},
  ): Promise<GuestExportFile> {
    const report = await this.getGuestCrmTaskReport(user, {
      ...query,
      pageSize: '1000',
    });
    const csvRows: CsvCell[][] = [
      [
        'Статус',
        'Задача',
        'Цель',
        'Группа',
        'Гость',
        'CRM-гость',
        'Ответственный',
        'Дедлайн',
        'Закрыта',
        'Создана',
        'Описание',
      ],
      ...report.rows.map((row) => [
        this.crmTaskStatusExportLabel(row.status),
        row.title,
        this.crmTaskTargetLabel(row),
        row.audience?.name ?? null,
        row.guest?.displayName ?? null,
        row.lead?.displayName ?? null,
        row.assignedToUser?.displayName ?? null,
        this.formatExportDateTime(row.dueAt),
        this.formatExportDateTime(row.completedAt),
        this.formatExportDateTime(row.createdAt),
        row.description,
      ]),
    ];

    return {
      fileName: `leetplus-crm-tasks-${report.dateFrom ?? 'all'}-${report.dateTo ?? 'all'}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(csvRows), 'utf8'),
    };
  }

  async createGuestCrmTask(
    user: AuthenticatedUser,
    dto: GuestCrmTaskDto = {},
  ): Promise<GuestCrmTask> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const audience = dto.audienceId
      ? await this.prisma.guestAudience.findFirst({
          where: { id: dto.audienceId, tenantId },
          select: { id: true, name: true, guestsCount: true },
        })
      : null;

    if (dto.audienceId && !audience) {
      throw new NotFoundException('Group not found');
    }

    const lead = dto.leadId
      ? await this.prisma.guestCrmLead.findFirst({
          where: { id: dto.leadId, tenantId },
          select: {
            id: true,
            matchedGuestId: true,
            fullNameMasked: true,
            fullNameEncrypted: true,
            phoneMasked: true,
            phoneEncrypted: true,
          },
        })
      : null;

    if (dto.leadId && !lead) {
      throw new NotFoundException('CRM lead not found');
    }

    const guestId = dto.guestId ?? lead?.matchedGuestId ?? null;
    const guest = guestId
      ? await this.prisma.guest.findFirst({
          where: { id: guestId, tenantId },
          select: this.guestSelect(),
        })
      : null;

    if (guestId && !guest) {
      throw new NotFoundException('Guest not found');
    }

    if (!audience && !lead && !guest) {
      throw new BadRequestException(
        'CRM task must be linked to a group, CRM lead, or guest',
      );
    }

    const targetTitle =
      audience?.name ??
      (lead ? this.toGuestCrmTaskLeadName(lead) : null) ??
      (guest
        ? this.toDashboardRow(guest, undefined, this.emptyPeriod(), new Map())
            .displayName
        : null) ??
      'CRM';
    const title =
      this.normalizeText(dto.title, 160) ?? `Связаться: ${targetTitle}`;
    const assignedToUserId = await this.resolveCrmTaskAssignee(
      tenantId,
      dto.assignedToUserId,
    );
    const row = await this.prisma.guestCrmTask.create({
      data: {
        tenantId,
        createdByUserId: user.id,
        audienceId: audience?.id ?? null,
        leadId: lead?.id ?? null,
        guestId: guest?.id ?? null,
        assignedToUserId,
        title,
        description: this.normalizeText(dto.description, 2000),
        dueAt: this.resolveOptionalDate(dto.dueAt),
      },
      include: {
        audience: { select: { id: true, name: true } },
        guest: { select: this.guestSelect() },
        lead: true,
        assignedToUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    return this.toGuestCrmTask(row);
  }

  async getGuestCrmUsers(user: AuthenticatedUser): Promise<GuestCrmUser[]> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const rows = await this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      select: { id: true, fullName: true, email: true, role: true },
    });

    return rows.map((row) => ({
      id: row.id,
      displayName: row.fullName ?? row.email,
      email: row.email,
      role: row.role,
    }));
  }

  async getGuestCrmContactEvents(
    user: AuthenticatedUser,
  ): Promise<GuestCrmContactEvent[]> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const rows = await this.prisma.guestCrmContactEvent.findMany({
      where: { tenantId },
      orderBy: [{ contactedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      include: {
        audience: { select: { id: true, name: true } },
        guest: { select: this.guestSelect() },
        lead: true,
        marketingCampaign: { select: { id: true, name: true } },
        createdByUser: { select: { fullName: true, email: true } },
      },
    });

    return rows.map((row) => this.toGuestCrmContactEvent(row));
  }

  async createAudienceCrmTask(
    user: AuthenticatedUser,
    audienceId: string,
    dto: GuestCrmTaskDto = {},
  ): Promise<GuestCrmTask> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const audience = await this.prisma.guestAudience.findFirst({
      where: { id: audienceId, tenantId },
      select: { id: true, name: true, guestsCount: true },
    });

    if (!audience) {
      throw new NotFoundException('Group not found');
    }

    const title =
      this.normalizeText(dto.title, 160) ??
      `Связаться с группой: ${audience.name}`;
    const row = await this.prisma.guestCrmTask.create({
      data: {
        tenantId,
        createdByUserId: user.id,
        audienceId: audience.id,
        title,
        description:
          this.normalizeText(dto.description, 2000) ??
          `Группа: ${audience.name}. Гостей: ${audience.guestsCount}.`,
        dueAt: this.resolveOptionalDate(dto.dueAt),
      },
      include: {
        audience: { select: { id: true, name: true } },
        guest: { select: this.guestSelect() },
        lead: true,
        assignedToUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    return this.toGuestCrmTask(row);
  }

  async createGuestCrmContactEvent(
    user: AuthenticatedUser,
    dto: GuestCrmContactEventDto = {},
  ): Promise<GuestCrmContactEvent> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const channel = this.normalizeText(dto.channel, 80);

    if (!channel) {
      throw new BadRequestException('Contact channel is required');
    }

    const lead = dto.leadId
      ? await this.prisma.guestCrmLead.findFirst({
          where: { id: dto.leadId, tenantId },
          select: { id: true, matchedGuestId: true },
        })
      : null;

    if (dto.leadId && !lead) {
      throw new NotFoundException('CRM lead not found');
    }

    const marketingCampaign = dto.marketingCampaignId
      ? await this.prisma.marketingCampaign.findFirst({
          where: { id: dto.marketingCampaignId, tenantId },
          select: { id: true, name: true, audienceId: true },
        })
      : null;

    if (dto.marketingCampaignId && !marketingCampaign) {
      throw new NotFoundException('Marketing campaign not found');
    }

    const audience = dto.audienceId
      ? await this.prisma.guestAudience.findFirst({
          where: { id: dto.audienceId, tenantId },
          select: { id: true },
        })
      : marketingCampaign?.audienceId
        ? await this.prisma.guestAudience.findFirst({
            where: { id: marketingCampaign.audienceId, tenantId },
            select: { id: true },
          })
        : null;

    if (dto.audienceId && !audience) {
      throw new NotFoundException('Group not found');
    }

    if (marketingCampaign?.audienceId && !audience) {
      throw new NotFoundException('Campaign group not found');
    }

    const guestId = dto.guestId ?? lead?.matchedGuestId ?? null;
    const guest = guestId
      ? await this.prisma.guest.findFirst({
          where: { id: guestId, tenantId },
          select: { id: true },
        })
      : null;

    if (guestId && !guest) {
      throw new NotFoundException('Guest not found');
    }

    if (!lead && !audience && !guest && !marketingCampaign) {
      throw new BadRequestException(
        'Contact event must be linked to a lead, guest, group, or campaign',
      );
    }

    const row = await this.prisma.guestCrmContactEvent.create({
      data: {
        tenantId,
        createdByUserId: user.id,
        leadId: lead?.id ?? null,
        audienceId: audience?.id ?? null,
        guestId: guest?.id ?? null,
        marketingCampaignId: marketingCampaign?.id ?? null,
        channel,
        result: this.normalizeText(dto.result, 120),
        note: this.normalizeText(dto.note, 2000),
        contactedAt: this.resolveOptionalDate(dto.contactedAt) ?? new Date(),
      },
      include: {
        audience: { select: { id: true, name: true } },
        guest: { select: this.guestSelect() },
        lead: true,
        marketingCampaign: { select: { id: true, name: true } },
        createdByUser: { select: { fullName: true, email: true } },
      },
    });

    return this.toGuestCrmContactEvent(row);
  }

  async updateGuestCrmTask(
    user: AuthenticatedUser,
    id: string,
    dto: GuestCrmTaskUpdateDto = {},
  ): Promise<GuestCrmTask> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const existing = await this.prisma.guestCrmTask.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, completedAt: true },
    });

    if (!existing) {
      throw new NotFoundException('CRM task not found');
    }

    const shouldUpdateStatus = 'status' in dto;
    const status = shouldUpdateStatus
      ? this.resolveCrmTaskStatus(dto.status)
      : existing.status;
    const shouldUpdateAssignee = 'assignedToUserId' in dto;
    const assignedToUserId = shouldUpdateAssignee
      ? await this.resolveCrmTaskAssignee(tenantId, dto.assignedToUserId)
      : undefined;
    const row = await this.prisma.guestCrmTask.update({
      where: { id },
      data: {
        status,
        ...(shouldUpdateAssignee ? { assignedToUserId } : {}),
        ...(shouldUpdateStatus
          ? { completedAt: status === 'DONE' ? new Date() : null }
          : {}),
      },
      include: {
        audience: { select: { id: true, name: true } },
        guest: { select: this.guestSelect() },
        lead: true,
        assignedToUser: { select: { id: true, fullName: true, email: true } },
      },
    });

    return this.toGuestCrmTask(row);
  }

  private async buildGuestList(
    user: AuthenticatedUser,
    query: GuestListQuery = {},
  ): Promise<BuiltGuestList> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const filters = await this.resolveGuestFilters(tenantId, query);
    const segment = this.resolveSegment(query.segment);
    const crmStatus = this.resolveCrmStatusFilter(query.crmStatus);
    const sort = this.resolveSort(query.sort);
    const direction = this.resolveDirection(query.direction);
    const { guests, metricsByGuestId, groupsByKey } =
      await this.buildGuestMetrics(tenantId, period, filters);
    let rows = guests.map((guest) =>
      this.toDashboardRow(
        guest,
        metricsByGuestId.get(guest.id),
        period,
        groupsByKey,
      ),
    );

    if (segment !== 'top') {
      rows = rows.filter((row) => row.segment === segment);
    }

    if (crmStatus) {
      rows = rows.filter((row) => row.crmStatus === crmStatus);
    }

    return {
      periodFrom: period.from,
      periodTo: period.to,
      storeId: filters.storeId,
      guestGroupId: filters.guestGroupId,
      segment,
      sort,
      direction,
      rows: this.sortRows(rows, sort, direction),
    };
  }

  async getGuest(user: AuthenticatedUser, id: string): Promise<GuestDetail> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod({});
    const guest = await this.prisma.guest.findFirst({
      where: { id, tenantId },
      select: this.guestSelect(),
    });

    if (!guest) {
      throw new NotFoundException('Guest not found');
    }

    const filters: ResolvedGuestFilters = {
      storeId: null,
      guestGroupId: null,
      externalDomain: null,
      externalGuestTypeId: null,
      search: null,
      excludedAdminGuestGroups: [],
      onlyGuestGroups: undefined,
    };
    const { metricsByGuestId, groupsByKey } = await this.buildGuestMetrics(
      tenantId,
      period,
      filters,
      [id],
    );
    const row = this.toDashboardRow(
      guest,
      metricsByGuestId.get(id),
      period,
      groupsByKey,
    );
    const [crmEvents, sessions, transactions, sales] = await Promise.all([
      this.prisma.guestCrmEvent.findMany({
        where: { tenantId, guestId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          note: true,
          nextAction: true,
          nextContactAt: true,
          createdAt: true,
          createdByUser: { select: { fullName: true, email: true } },
        },
      }),
      this.prisma.guestSession.findMany({
        where: { tenantId, guestId: id },
        orderBy: { startedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          startedAt: true,
          stoppedAt: true,
          durationMinutes: true,
          externalDomain: true,
          store: { select: { name: true } },
        },
      }),
      this.prisma.guestTransaction.findMany({
        where: { tenantId, guestId: id },
        orderBy: { happenedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          happenedAt: true,
          amount: true,
          balance: true,
          bonusBalance: true,
          type: true,
          externalDomain: true,
          store: { select: { name: true } },
        },
      }),
      this.prisma.salesFact.findMany({
        where: { tenantId, guestId: id, isCanceled: false },
        orderBy: { saleDate: 'desc' },
        take: 30,
        select: {
          id: true,
          saleDate: true,
          productNameAtSale: true,
          storeNameAtSale: true,
          revenue: true,
          quantity: true,
        },
      }),
    ]);

    return {
      ...row,
      crmEvents: crmEvents.map((event) => ({
        id: event.id,
        status: event.status,
        note: event.note,
        nextAction: event.nextAction,
        nextContactAt: this.toIsoDateTime(event.nextContactAt),
        createdAt: event.createdAt.toISOString(),
        createdBy:
          event.createdByUser?.fullName ?? event.createdByUser?.email ?? null,
      })),
      sessions: sessions.map((session) => ({
        id: session.id,
        startedAt: this.toIsoDateTime(session.startedAt),
        stoppedAt: this.toIsoDateTime(session.stoppedAt),
        durationMinutes: session.durationMinutes,
        storeName: session.store?.name ?? null,
        externalDomain: session.externalDomain,
      })),
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        happenedAt: this.toIsoDateTime(transaction.happenedAt),
        amount: this.decimalToNumber(transaction.amount),
        balance: this.decimalToNumber(transaction.balance),
        bonusBalance: this.decimalToNumber(transaction.bonusBalance),
        type: transaction.type,
        storeName: transaction.store?.name ?? null,
        externalDomain: transaction.externalDomain,
      })),
      sales: sales.map((sale) => ({
        id: sale.id,
        saleDate: this.toIsoDate(sale.saleDate),
        productName: sale.productNameAtSale ?? 'Товар',
        storeName: sale.storeNameAtSale ?? 'Клуб',
        revenue: this.decimalToNumber(sale.revenue) ?? 0,
        quantity: this.decimalToNumber(sale.quantity) ?? 0,
      })),
    };
  }

  async getStaffControl(
    user: AuthenticatedUser,
    query: StaffControlQuery = {},
  ): Promise<StaffControlReport> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const storeId = await this.resolveStoreId(tenantId, query.storeId);
    const [staffGroups, diagnostics] = await Promise.all([
      this.loadAdminGuestGroups(tenantId),
      this.getStaffControlDiagnostics(tenantId),
    ]);
    const emptyReport = {
      tenantId,
      tenantSlug,
      periodFrom: period.from,
      periodTo: period.to,
      storeId,
      staffGroups,
      staffCount: 0,
      activeStaff: 0,
      sessionsCount: 0,
      playHours: 0,
      transactionAmount: 0,
      barRevenue: 0,
      operationLogsCount: 0,
      operationAmount: 0,
      shiftsCount: 0,
      shiftsWithStaffLink: 0,
      shiftHours: 0,
      shiftPaymentAmount: 0,
      shiftRefundAmount: 0,
      shiftIncassAmount: 0,
      averageShiftMiddleCheck: 0,
      rows: [],
      anomalies: [],
      operationTypes: [],
      operationKindSummary: [],
      unmatchedOperators: [],
      diagnostics,
    } satisfies StaffControlReport;

    if (staffGroups.length === 0) {
      return emptyReport;
    }

    const filters: ResolvedGuestFilters = {
      storeId,
      guestGroupId: null,
      externalDomain: null,
      externalGuestTypeId: null,
      search: null,
      excludedAdminGuestGroups: [],
      onlyGuestGroups: staffGroups.map((group) => ({
        externalDomain: group.externalDomain,
        externalGuestTypeId: group.externalGroupId,
      })),
    };
    const { guests, metricsByGuestId, groupsByKey } =
      await this.buildGuestMetrics(tenantId, period, filters);
    const shiftSummary = await this.getStaffShiftSummary(
      tenantId,
      period,
      storeId,
    );
    const rows = guests
      .map((guest) =>
        this.toStaffControlRow(
          this.toDashboardRow(
            guest,
            metricsByGuestId.get(guest.id),
            period,
            groupsByKey,
          ),
          shiftSummary.byGuestId.get(guest.id),
        ),
      )
      .sort(
        (first, second) =>
          second.transactionAmount +
          second.barRevenue -
          (first.transactionAmount + first.barRevenue),
      );
    const periodMetrics = this.sumPeriodMetrics(metricsByGuestId);
    const operationRows = await this.buildStaffOperationRows(
      tenantId,
      period,
      storeId,
    );
    const operationTypes = [...operationRows]
      .sort((first, second) => second.count - first.count)
      .slice(0, 12)
      .map((row) => ({
        type: row.type,
        count: row.count,
        amount: row.amount,
      }));
    const operationKindSummary =
      this.buildStaffOperationKindSummary(operationRows);
    const operationAmount = operationRows.reduce(
      (sum, row) => sum + row.amount,
      0,
    );

    return {
      ...emptyReport,
      staffCount: guests.length,
      activeStaff: rows.filter(
        (row) =>
          row.sessionsCount > 0 ||
          row.transactionAmount > 0 ||
          row.barRevenue > 0,
      ).length,
      sessionsCount: periodMetrics.sessionsCount,
      playHours: this.round(periodMetrics.playMinutes / 60, 1),
      transactionAmount: this.round(periodMetrics.transactionAmount, 2),
      barRevenue: this.round(periodMetrics.barRevenue, 2),
      operationLogsCount: operationRows.reduce(
        (sum, row) => sum + row.count,
        0,
      ),
      operationAmount: this.round(operationAmount, 2),
      shiftsCount: shiftSummary.total.shiftsCount,
      shiftsWithStaffLink: shiftSummary.total.linkedShiftsCount,
      shiftHours: this.round(shiftSummary.total.shiftMinutes / 60, 1),
      shiftPaymentAmount: this.round(shiftSummary.total.shiftPaymentAmount, 2),
      shiftRefundAmount: this.round(shiftSummary.total.shiftRefundAmount, 2),
      shiftIncassAmount: this.round(shiftSummary.total.shiftIncassAmount, 2),
      averageShiftMiddleCheck:
        shiftSummary.total.middleCheckCount > 0
          ? this.round(
              shiftSummary.total.middleCheckSum /
                shiftSummary.total.middleCheckCount,
              2,
            )
          : 0,
      rows,
      anomalies: this.buildStaffControlAnomalies(
        rows,
        shiftSummary.unmatchedOperators,
      ),
      operationTypes,
      operationKindSummary,
      unmatchedOperators: shiftSummary.unmatchedOperators,
    };
  }

  async getStaffOperators(
    user: AuthenticatedUser,
    query: StaffOperatorReportQuery = {},
  ): Promise<StaffOperatorReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const storeId = await this.resolveStoreId(tenantId, query.storeId);
    const status = this.resolveStaffOperatorStatus(query.status);
    const anomaly = this.resolveStaffOperatorAnomaly(query.anomaly);
    const search = this.normalizeText(query.search, 120);
    const sort = this.resolveStaffOperatorSort(query.sort);
    const direction = query.direction === 'asc' ? 'asc' : 'desc';
    const [operatorRows, staffOptions] = await Promise.all([
      this.buildStaffOperatorRows(tenantId, period, storeId),
      this.loadStaffGuestOptions(tenantId, period),
    ]);
    const filteredRows = operatorRows
      .filter((row) => this.matchesStaffOperatorStatus(row, status))
      .filter((row) => this.matchesStaffOperatorAnomaly(row, anomaly))
      .filter((row) => this.matchesStaffOperatorSearch(row, search))
      .sort((first, second) =>
        this.compareStaffOperatorRows(first, second, sort, direction),
      );

    return {
      periodFrom: period.from,
      periodTo: period.to,
      storeId,
      status,
      anomaly,
      search,
      sort,
      direction,
      rows: filteredRows,
      staffOptions,
    };
  }

  async exportStaffOperators(
    user: AuthenticatedUser,
    query: StaffOperatorReportQuery = {},
  ): Promise<GuestExportFile> {
    const report = await this.getStaffOperators(user, query);
    const csvRows: CsvCell[][] = [
      [
        'Администратор',
        'user_id',
        'Домен Langame',
        'Привязка',
        'ID привязки',
        'Клубы',
        'Последняя смена ID',
        'Последняя смена начало',
        'Последняя смена конец',
        'Смены',
        'Часы',
        'Касса, руб',
        'Возвраты, руб',
        'Инкассация, руб',
        'Бар, руб',
        'Кальяны, руб',
        'Средний чек, руб',
        'Сигналы',
        'Комментарий привязки',
      ],
      ...report.rows.map((row) => [
        row.linkedGuest?.displayName ??
          row.langameUser?.displayName ??
          `user_id ${row.externalUserId}`,
        row.externalUserId,
        row.externalDomain,
        row.linkedGuest ? 'Привязан' : 'Без привязки',
        row.mappingId,
        row.storeNames.join(', '),
        row.lastClosedShiftExternalShiftId,
        this.formatExportDateTime(row.lastClosedShiftStartedAt),
        this.formatExportDateTime(row.lastClosedShiftStoppedAt),
        row.shiftsCount,
        row.shiftHours,
        row.shiftPaymentAmount,
        row.shiftRefundAmount,
        row.shiftIncassAmount,
        row.barRevenue,
        row.hookahRevenue,
        row.averageShiftMiddleCheck,
        this.staffOperatorSignalLabels(row),
        row.mappingNote,
      ]),
    ];

    return {
      fileName: `leetplus-staff-operators-${report.periodFrom}-${report.periodTo}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(csvRows), 'utf8'),
    };
  }

  async getStaffOperations(
    user: AuthenticatedUser,
    query: StaffOperationsReportQuery = {},
  ): Promise<StaffOperationsReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const storeId = await this.resolveStoreId(tenantId, query.storeId);
    const kind = this.resolveStaffOperationKind(query.kind);
    const search = this.normalizeText(query.search, 120);
    const sort = this.resolveStaffOperationSort(query.sort);
    const direction = query.direction === 'asc' ? 'asc' : 'desc';
    const allRows = await this.buildStaffOperationRows(
      tenantId,
      period,
      storeId,
    );
    const kindSummary = this.buildStaffOperationKindSummary(allRows);
    const rows = allRows
      .filter((row) => kind === 'all' || row.kind === kind)
      .filter((row) => this.matchesStaffOperationSearch(row, search))
      .sort((first, second) =>
        this.compareStaffOperationRows(first, second, sort, direction),
      );

    return {
      periodFrom: period.from,
      periodTo: period.to,
      storeId,
      kind,
      search,
      sort,
      direction,
      totalCount: rows.reduce((sum, row) => sum + row.count, 0),
      totalAmount: this.round(
        rows.reduce((sum, row) => sum + row.amount, 0),
        2,
      ),
      kindSummary,
      rows,
    };
  }

  async exportStaffOperations(
    user: AuthenticatedUser,
    query: StaffOperationsReportQuery = {},
  ): Promise<GuestExportFile> {
    const report = await this.getStaffOperations(user, query);
    const csvRows: CsvCell[][] = [
      [
        'Категория',
        'Тип операции',
        'Количество',
        'Сумма, руб',
        'Последняя операция',
        'Клубы',
        'Источники Langame',
      ],
      ...report.rows.map((row) => [
        this.staffOperationKindExportLabel(row.kind),
        row.type,
        row.count,
        row.amount,
        this.formatExportDateTime(row.lastSeenAt),
        row.storeNames.join(', '),
        row.externalDomains.join(', '),
      ]),
    ];

    return {
      fileName: `leetplus-staff-operations-${report.periodFrom}-${report.periodTo}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(csvRows), 'utf8'),
    };
  }

  async updateGuestCrm(
    user: AuthenticatedUser,
    id: string,
    dto: GuestCrmUpdateDto,
  ): Promise<GuestDetail> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const guest = await this.prisma.guest.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!guest) {
      throw new NotFoundException('Guest not found');
    }

    const data = this.normalizeCrmUpdate(dto);

    await this.prisma.$transaction([
      this.prisma.guest.update({
        where: { id },
        data: {
          ...data,
          crmUpdatedByUserId: user.id,
          crmUpdatedAt: new Date(),
        },
      }),
      this.prisma.guestCrmEvent.create({
        data: {
          tenantId,
          guestId: id,
          createdByUserId: user.id,
          status: data.crmStatus,
          note: data.crmNote,
          nextAction: data.nextAction,
          nextContactAt: data.nextContactAt,
        },
      }),
    ]);

    return this.getGuest(user, id);
  }

  async mapStaffIdentity(
    user: AuthenticatedUser,
    dto: StaffIdentityMappingDto,
  ): Promise<StaffIdentityMappingResult> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const externalUserId = this.normalizeExternalUserId(dto.externalUserId);
    const externalDomain = this.normalizeText(dto.externalDomain, 255) ?? '';
    const shiftExternalDomain = externalDomain || null;
    const guestId = this.normalizeRequiredId(dto.guestId, 'guestId');
    const note = this.normalizeText(dto.note, 1000);
    const [guest, staffGroups] = await Promise.all([
      this.prisma.guest.findFirst({
        where: { id: guestId, tenantId },
        select: {
          id: true,
          externalDomain: true,
          externalGuestTypeId: true,
        },
      }),
      this.loadAdminGuestGroups(tenantId),
    ]);

    if (!guest) {
      throw new NotFoundException('Guest not found');
    }

    const isStaffGuest = staffGroups.some(
      (group) =>
        group.externalDomain === guest.externalDomain &&
        group.externalGroupId === guest.externalGuestTypeId,
    );

    if (!isStaffGuest) {
      throw new BadRequestException('Selected guest is not a staff guest');
    }

    const mapping = await this.prisma.guestStaffIdentityMapping.upsert({
      where: {
        tenantId_externalProvider_externalDomain_externalUserId: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain,
          externalUserId,
        },
      },
      create: {
        tenantId,
        guestId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain,
        externalUserId,
        note,
        createdByUserId: user.id,
      },
      update: {
        guestId,
        note,
        createdByUserId: user.id,
      },
      select: {
        id: true,
        guestId: true,
        externalDomain: true,
        externalUserId: true,
      },
    });
    const updatedShifts = await this.prisma.guestWorkingShift.updateMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: shiftExternalDomain,
        externalUserId,
      },
      data: { guestId },
    });

    return {
      id: mapping.id,
      guestId: mapping.guestId,
      externalDomain: mapping.externalDomain || null,
      externalUserId: mapping.externalUserId,
      updatedShifts: updatedShifts.count,
    };
  }

  async unmapStaffIdentity(
    user: AuthenticatedUser,
    mappingId: string,
  ): Promise<{ id: string; updatedShifts: number }> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const mapping = await this.prisma.guestStaffIdentityMapping.findFirst({
      where: { id: mappingId, tenantId },
      select: {
        id: true,
        guestId: true,
        externalDomain: true,
        externalUserId: true,
      },
    });

    if (!mapping) {
      throw new NotFoundException('Staff identity mapping not found');
    }

    await this.prisma.guestStaffIdentityMapping.delete({
      where: { id: mapping.id },
    });
    const updatedShifts = await this.prisma.guestWorkingShift.updateMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: mapping.externalDomain || null,
        externalUserId: mapping.externalUserId,
        guestId: mapping.guestId,
      },
      data: { guestId: null },
    });

    return { id: mapping.id, updatedShifts: updatedShifts.count };
  }

  private async buildGuestMetrics(
    tenantId: string,
    period: Period,
    filters: ResolvedGuestFilters,
    guestIds?: string[],
  ) {
    const guestWhere = this.buildGuestWhere(tenantId, filters, guestIds);
    const storeWhere = filters.storeId ? { storeId: filters.storeId } : {};
    const [allGuests, groupsByKey] = await Promise.all([
      this.prisma.guest.findMany({
        where: guestWhere,
        select: this.guestSelect(),
      }),
      this.loadGuestGroups(tenantId),
    ]);
    const [sessions, transactions, sales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          startedAt: { lte: period.toDate },
          OR: [
            { stoppedAt: null },
            { stoppedAt: { gte: period.activityFromDate } },
          ],
          ...storeWhere,
        },
        select: {
          guestId: true,
          startedAt: true,
          stoppedAt: true,
          durationMinutes: true,
        },
      }),
      this.prisma.guestTransaction.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          happenedAt: { gte: period.activityFromDate, lte: period.toDate },
          ...storeWhere,
        },
        select: {
          guestId: true,
          happenedAt: true,
          amount: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          saleDate: { gte: period.activityFromDate, lte: period.toDate },
          isCanceled: false,
          ...storeWhere,
        },
        select: {
          guestId: true,
          saleDate: true,
          revenue: true,
        },
      }),
    ]);
    const metricsByGuestId = new Map<string, GuestMetrics>();

    const now = new Date();

    for (const session of sessions) {
      if (!session.guestId || !session.startedAt) {
        continue;
      }
      const metrics = this.ensureMetrics(metricsByGuestId, session.guestId);
      const sessionActivityAt = this.sessionActivityAt(
        session.startedAt,
        session.stoppedAt,
        session.durationMinutes,
        now,
      );
      this.applyLatest(metrics, sessionActivityAt);
      this.addActivityDay(metrics, sessionActivityAt);

      if (
        this.sessionOverlapsPeriod(
          session.startedAt,
          session.stoppedAt,
          session.durationMinutes,
          period.fromDate,
          period.toDate,
          now,
        )
      ) {
        metrics.sessionsCount += 1;
        this.addOverlapVisitDays(
          metrics.visitsDays,
          session.startedAt,
          session.stoppedAt,
          session.durationMinutes,
          period.fromDate,
          period.toDate,
          now,
        );
        metrics.playMinutes += this.sessionOverlapMinutes(
          session.startedAt,
          session.stoppedAt,
          session.durationMinutes,
          period.fromDate,
          period.toDate,
          now,
        );
      }
    }

    for (const transaction of transactions) {
      if (!transaction.guestId || !transaction.happenedAt) {
        continue;
      }
      const metrics = this.ensureMetrics(metricsByGuestId, transaction.guestId);
      this.applyLatest(metrics, transaction.happenedAt);
      this.addActivityDay(metrics, transaction.happenedAt);

      if (transaction.happenedAt >= period.fromDate) {
        metrics.transactionsCount += 1;
        metrics.transactionAmount += Math.abs(
          this.decimalToNumber(transaction.amount) ?? 0,
        );
      }
    }

    for (const sale of sales) {
      if (!sale.guestId) {
        continue;
      }
      const metrics = this.ensureMetrics(metricsByGuestId, sale.guestId);
      this.applyLatest(metrics, sale.saleDate);
      this.addActivityDay(metrics, sale.saleDate);

      if (sale.saleDate >= period.fromDate) {
        metrics.barSalesCount += 1;
        metrics.barRevenue += this.decimalToNumber(sale.revenue) ?? 0;
      }
    }

    const guests = filters.storeId
      ? allGuests.filter((guest) => metricsByGuestId.has(guest.id))
      : allGuests;
    const selectedGuestIds = guests.map((guest) => guest.id);

    await this.applyLifetimeRevenueMetrics(
      tenantId,
      guestWhere,
      filters,
      metricsByGuestId,
      selectedGuestIds,
    );
    await this.applyLatestBonusBalanceMetrics(
      tenantId,
      metricsByGuestId,
      selectedGuestIds,
    );

    return { guests, metricsByGuestId, groupsByKey };
  }

  private async applyLatestBonusBalanceMetrics(
    tenantId: string,
    metricsByGuestId: Map<string, GuestMetrics>,
    guestIds: string[],
  ) {
    if (guestIds.length === 0) {
      return;
    }

    const snapshots = await this.prisma.guestBonusBalanceSnapshot.findMany({
      where: {
        tenantId,
        guestId: { in: guestIds },
      },
      distinct: ['guestId'],
      orderBy: [{ guestId: 'asc' }, { snapshotDate: 'desc' }],
      select: {
        guestId: true,
        snapshotDate: true,
        bonusBalance: true,
      },
    });

    for (const snapshot of snapshots) {
      if (!snapshot.guestId) {
        continue;
      }

      const metrics = this.ensureMetrics(metricsByGuestId, snapshot.guestId);
      metrics.bonusBalance = Math.max(
        0,
        this.decimalToNumber(snapshot.bonusBalance) ?? 0,
      );
      metrics.bonusSnapshotAt = snapshot.snapshotDate;
    }
  }

  private async applyLifetimeRevenueMetrics(
    tenantId: string,
    guestWhere: Prisma.GuestWhereInput,
    filters: ResolvedGuestFilters,
    metricsByGuestId: Map<string, GuestMetrics>,
    guestIds: string[],
  ) {
    if (guestIds.length === 0) {
      return;
    }

    const selectedGuestIds = new Set(guestIds);
    const storeWhere = filters.storeId ? { storeId: filters.storeId } : {};
    const [transactions, sales] = await Promise.all([
      this.prisma.guestTransaction.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          ...storeWhere,
        },
        select: {
          guestId: true,
          happenedAt: true,
          amount: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          isCanceled: false,
          ...storeWhere,
        },
        select: {
          guestId: true,
          saleDate: true,
          revenue: true,
        },
      }),
    ]);

    for (const transaction of transactions) {
      if (
        !transaction.guestId ||
        !transaction.happenedAt ||
        !selectedGuestIds.has(transaction.guestId)
      ) {
        continue;
      }

      const metrics = this.ensureMetrics(metricsByGuestId, transaction.guestId);
      metrics.lifetimeTransactionAmount += Math.abs(
        this.decimalToNumber(transaction.amount) ?? 0,
      );
      this.applyLifetimeRevenueDate(metrics, transaction.happenedAt);
    }

    for (const sale of sales) {
      if (!sale.guestId || !selectedGuestIds.has(sale.guestId)) {
        continue;
      }

      const metrics = this.ensureMetrics(metricsByGuestId, sale.guestId);
      metrics.lifetimeBarRevenue += this.decimalToNumber(sale.revenue) ?? 0;
      this.applyLifetimeRevenueDate(metrics, sale.saleDate);
    }
  }

  private buildGuestWhere(
    tenantId: string,
    filters: ResolvedGuestFilters,
    guestIds?: string[],
  ): Prisma.GuestWhereInput {
    const where: Prisma.GuestWhereInput = {
      tenantId,
      ...(guestIds ? { id: { in: guestIds } } : {}),
    };

    if (filters.externalGuestTypeId) {
      where.externalGuestTypeId = filters.externalGuestTypeId;
      where.externalDomain = filters.externalDomain;
    }

    if (filters.onlyGuestGroups?.length) {
      where.OR = filters.onlyGuestGroups.map((group) => ({
        externalDomain: group.externalDomain,
        externalGuestTypeId: group.externalGuestTypeId,
      }));
    }

    if (filters.excludedAdminGuestGroups.length > 0) {
      where.NOT = {
        OR: filters.excludedAdminGuestGroups.map((group) => ({
          externalDomain: group.externalDomain,
          externalGuestTypeId: group.externalGuestTypeId,
        })),
      };
    }

    if (filters.search) {
      const searchHashes = this.searchHashes(filters.search);
      where.OR = [
        { externalGuestId: { contains: filters.search, mode: 'insensitive' } },
        { phoneMasked: { contains: filters.search, mode: 'insensitive' } },
        { emailMasked: { contains: filters.search, mode: 'insensitive' } },
        { fullNameMasked: { contains: filters.search, mode: 'insensitive' } },
        ...(searchHashes.phoneHash
          ? [{ phoneHash: searchHashes.phoneHash }]
          : []),
        ...(searchHashes.fullNameHash
          ? [{ fullNameHash: searchHashes.fullNameHash }]
          : []),
        {
          bonusProgramNumber: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    return where;
  }

  private async buildVisitTrend(
    tenantId: string,
    period: Period,
    filters: ResolvedGuestFilters,
  ) {
    const storeWhere = filters.storeId ? { storeId: filters.storeId } : {};
    const guestWhere = this.buildGuestWhere(tenantId, filters);
    const [sessions, sales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          startedAt: { lte: period.toDate },
          OR: [{ stoppedAt: null }, { stoppedAt: { gte: period.fromDate } }],
          ...storeWhere,
        },
        select: {
          guestId: true,
          startedAt: true,
          stoppedAt: true,
          durationMinutes: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          saleDate: { gte: period.fromDate, lte: period.toDate },
          isCanceled: false,
          ...storeWhere,
        },
        select: { saleDate: true, revenue: true },
      }),
    ]);
    const trend = new Map<
      string,
      { sessionsCount: number; activeGuestIds: Set<string>; barRevenue: number }
    >();

    for (const day of this.daysBetween(period.fromDate, period.toDate)) {
      trend.set(day, {
        sessionsCount: 0,
        activeGuestIds: new Set<string>(),
        barRevenue: 0,
      });
    }

    const now = new Date();

    for (const session of sessions) {
      if (!session.startedAt || !session.guestId) {
        continue;
      }
      for (const day of this.overlapVisitDays(
        session.startedAt,
        session.stoppedAt,
        session.durationMinutes,
        period.fromDate,
        period.toDate,
        now,
      )) {
        const row = trend.get(day);
        if (!row) {
          continue;
        }
        row.sessionsCount += 1;
        row.activeGuestIds.add(session.guestId);
      }
    }

    for (const sale of sales) {
      const day = this.toIsoDate(sale.saleDate);
      const row = trend.get(day);
      if (!row) {
        continue;
      }
      row.barRevenue += this.decimalToNumber(sale.revenue) ?? 0;
    }

    return Array.from(trend.entries()).map(([date, row]) => ({
      date,
      sessionsCount: row.sessionsCount,
      activeGuests: row.activeGuestIds.size,
      barRevenue: this.round(row.barRevenue, 2),
    }));
  }

  private async buildVisitHeatmap(
    tenantId: string,
    period: Period,
    filters: ResolvedGuestFilters,
  ): Promise<GuestVisitHeatmapSummary> {
    const storeWhere = filters.storeId ? { storeId: filters.storeId } : {};
    const guestWhere = this.buildGuestWhere(tenantId, filters);
    const sessions = await this.prisma.guestSession.findMany({
      where: {
        tenantId,
        guest: { is: guestWhere },
        startedAt: { gte: period.fromDate, lte: period.toDate },
        ...storeWhere,
      },
      select: {
        guestId: true,
        startedAt: true,
        stoppedAt: true,
        durationMinutes: true,
      },
    });
    const cells = new Map<
      string,
      {
        weekday: GuestVisitHeatmapCell['weekday'];
        hour: number;
        sessionsCount: number;
        activeGuestIds: Set<string>;
        playMinutes: number;
      }
    >();

    for (let weekday = 1; weekday <= 7; weekday += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        cells.set(`${weekday}:${hour}`, {
          weekday: weekday as GuestVisitHeatmapCell['weekday'],
          hour,
          sessionsCount: 0,
          activeGuestIds: new Set<string>(),
          playMinutes: 0,
        });
      }
    }

    const now = new Date();

    for (const session of sessions) {
      if (!session.guestId || !session.startedAt) {
        continue;
      }

      const weekday = this.weekdayFromDate(session.startedAt);
      const hour = session.startedAt.getUTCHours();
      const cell = cells.get(`${weekday}:${hour}`);

      if (!cell) {
        continue;
      }

      cell.sessionsCount += 1;
      cell.activeGuestIds.add(session.guestId);
      cell.playMinutes += this.sessionOverlapMinutes(
        session.startedAt,
        session.stoppedAt,
        session.durationMinutes,
        period.fromDate,
        period.toDate,
        now,
      );
    }

    const heatmapCells = Array.from(cells.values()).map((cell) => ({
      weekday: cell.weekday,
      hour: cell.hour,
      sessionsCount: cell.sessionsCount,
      activeGuests: cell.activeGuestIds.size,
      playHours: this.round(cell.playMinutes / 60, 1),
    }));
    const maxSessionsCount = Math.max(
      ...heatmapCells.map((cell) => cell.sessionsCount),
      0,
    );
    const maxActiveGuests = Math.max(
      ...heatmapCells.map((cell) => cell.activeGuests),
      0,
    );
    const peak =
      heatmapCells
        .filter((cell) => cell.sessionsCount > 0)
        .sort(
          (first, second) =>
            second.sessionsCount - first.sessionsCount ||
            second.activeGuests - first.activeGuests ||
            second.playHours - first.playHours,
        )[0] ?? null;

    return {
      maxSessionsCount,
      maxActiveGuests,
      peak,
      cells: heatmapCells,
    };
  }

  private async buildFlowForecast(
    tenantId: string,
    period: Period,
    filters: ResolvedGuestFilters,
  ): Promise<GuestFlowForecastSummary> {
    const horizonDays = 7;
    const baselineTo = new Date(period.toDate);
    const baselineFrom = this.startOfUtcDay(period.toDate);
    baselineFrom.setUTCDate(baselineFrom.getUTCDate() - 55);
    const baselineDayKeys = this.daysBetween(baselineFrom, baselineTo);
    const dailyRows = new Map<
      string,
      {
        weekday: GuestVisitHeatmapCell['weekday'];
        sessionsCount: number;
        activeGuestIds: Set<string>;
        playMinutes: number;
      }
    >();

    for (const day of baselineDayKeys) {
      const date = new Date(`${day}T00:00:00.000Z`);
      dailyRows.set(day, {
        weekday: this.weekdayFromDate(date),
        sessionsCount: 0,
        activeGuestIds: new Set<string>(),
        playMinutes: 0,
      });
    }

    const storeWhere = filters.storeId ? { storeId: filters.storeId } : {};
    const guestWhere = this.buildGuestWhere(tenantId, filters);
    const sessions = await this.prisma.guestSession.findMany({
      where: {
        tenantId,
        guest: { is: guestWhere },
        startedAt: { lte: baselineTo },
        OR: [{ stoppedAt: null }, { stoppedAt: { gte: baselineFrom } }],
        ...storeWhere,
      },
      select: {
        guestId: true,
        startedAt: true,
        stoppedAt: true,
        durationMinutes: true,
      },
    });
    const now = new Date();

    for (const session of sessions) {
      if (!session.guestId || !session.startedAt) {
        continue;
      }

      for (const day of this.overlapVisitDays(
        session.startedAt,
        session.stoppedAt,
        session.durationMinutes,
        baselineFrom,
        baselineTo,
        now,
      )) {
        const row = dailyRows.get(day);
        if (!row) {
          continue;
        }

        const dayStart = new Date(`${day}T00:00:00.000Z`);
        const dayEnd = new Date(`${day}T23:59:59.999Z`);
        row.sessionsCount += 1;
        row.activeGuestIds.add(session.guestId);
        row.playMinutes += this.sessionOverlapMinutes(
          session.startedAt,
          session.stoppedAt,
          session.durationMinutes,
          dayStart,
          dayEnd,
          now,
        );
      }
    }

    const weekdayBuckets = new Map<
      GuestVisitHeatmapCell['weekday'],
      {
        daysCount: number;
        observedDays: number;
        sessionsCount: number;
        activeGuestsSum: number;
        playMinutes: number;
      }
    >();

    for (let weekday = 1; weekday <= 7; weekday += 1) {
      weekdayBuckets.set(weekday as GuestVisitHeatmapCell['weekday'], {
        daysCount: 0,
        observedDays: 0,
        sessionsCount: 0,
        activeGuestsSum: 0,
        playMinutes: 0,
      });
    }

    for (const row of dailyRows.values()) {
      const bucket = weekdayBuckets.get(row.weekday);
      if (!bucket) {
        continue;
      }

      bucket.daysCount += 1;
      bucket.sessionsCount += row.sessionsCount;
      bucket.activeGuestsSum += row.activeGuestIds.size;
      bucket.playMinutes += row.playMinutes;

      if (row.sessionsCount > 0) {
        bucket.observedDays += 1;
      }
    }

    const forecastStart = this.startOfUtcDay(period.toDate);
    forecastStart.setUTCDate(forecastStart.getUTCDate() + 1);
    const days: GuestFlowForecastDay[] = [];

    for (let index = 0; index < horizonDays; index += 1) {
      const forecastDate = new Date(forecastStart);
      forecastDate.setUTCDate(forecastStart.getUTCDate() + index);
      const weekday = this.weekdayFromDate(forecastDate);
      const bucket = weekdayBuckets.get(weekday);
      const daysCount = Math.max(bucket?.daysCount ?? 0, 1);

      days.push({
        date: this.toIsoDate(forecastDate),
        weekday,
        expectedSessions: Math.round((bucket?.sessionsCount ?? 0) / daysCount),
        expectedActiveGuests: Math.round(
          (bucket?.activeGuestsSum ?? 0) / daysCount,
        ),
        expectedPlayHours: this.round(
          (bucket?.playMinutes ?? 0) / daysCount / 60,
          1,
        ),
        confidence: this.resolveFlowForecastConfidence(
          baselineDayKeys.length,
          bucket?.observedDays ?? 0,
        ),
      });
    }

    const totalExpectedSessions = days.reduce(
      (sum, day) => sum + day.expectedSessions,
      0,
    );
    const totalExpectedActiveGuests = days.reduce(
      (sum, day) => sum + day.expectedActiveGuests,
      0,
    );
    const totalExpectedPlayHours = this.round(
      days.reduce((sum, day) => sum + day.expectedPlayHours, 0),
      1,
    );
    const peakDay =
      [...days].sort(
        (first, second) =>
          second.expectedSessions - first.expectedSessions ||
          second.expectedActiveGuests - first.expectedActiveGuests,
      )[0] ?? null;
    const quietDay =
      [...days].sort(
        (first, second) =>
          first.expectedSessions - second.expectedSessions ||
          first.expectedActiveGuests - second.expectedActiveGuests,
      )[0] ?? null;
    const observedDays = Array.from(weekdayBuckets.values()).reduce(
      (sum, bucket) => sum + bucket.observedDays,
      0,
    );

    return {
      horizonDays,
      baselineDays: baselineDayKeys.length,
      totalExpectedSessions,
      totalExpectedActiveGuests,
      totalExpectedPlayHours,
      confidence: this.resolveFlowForecastConfidence(
        baselineDayKeys.length,
        observedDays,
      ),
      peakDay,
      quietDay,
      days,
    };
  }

  private async getDataQuality(
    tenantId: string,
    period: Period,
    filters: ResolvedGuestFilters,
  ) {
    const storeWhere = filters.storeId ? { storeId: filters.storeId } : {};
    const [
      latestProfileRuns,
      sessionsWithoutGuestId,
      transactionsWithoutGuestId,
      salesMissingGuestLink,
    ] = await Promise.all([
      this.prisma.guestDataProfileRun.findMany({
        where: {
          tenantId,
          provider: IntegrationProvider.LANGAME,
        },
        orderBy: { startedAt: 'desc' },
        take: 3,
        select: {
          domain: true,
          startedAt: true,
          status: true,
          guestsCount: true,
          sessionsCount: true,
          transactionsCount: true,
          productSalesLinked: true,
          profile: true,
        },
      }),
      this.prisma.guestSession.count({
        where: {
          tenantId,
          guestId: null,
          startedAt: { gte: period.fromDate, lte: period.toDate },
          ...storeWhere,
        },
      }),
      this.prisma.guestTransaction.count({
        where: {
          tenantId,
          guestId: null,
          happenedAt: { gte: period.fromDate, lte: period.toDate },
          ...storeWhere,
        },
      }),
      this.prisma.salesFact.count({
        where: {
          tenantId,
          externalGuestId: { not: null },
          guestId: null,
          saleDate: { gte: period.fromDate, lte: period.toDate },
          ...storeWhere,
        },
      }),
    ]);
    const formattedRuns = latestProfileRuns.map((run) => {
      const endpointErrors = this.endpointErrorsFromProfile(run.profile);

      return {
        domain: run.domain,
        startedAt: run.startedAt.toISOString(),
        status: run.status,
        guestsCount: run.guestsCount,
        sessionsCount: run.sessionsCount,
        transactionsCount: run.transactionsCount,
        productSalesLinked: run.productSalesLinked,
        endpointErrors,
      };
    });
    const unavailableEndpoints = Array.from(
      new Set(
        formattedRuns.flatMap((run) => Object.keys(run.endpointErrors)).sort(),
      ),
    );

    return {
      latestProfileRuns: formattedRuns,
      unavailableEndpoints,
      sessionsWithoutGuestId,
      transactionsWithoutGuestId,
      salesMissingGuestLink,
    };
  }

  private async resolveGuestFilters(
    tenantId: string,
    query: GuestsSummaryQuery & { search?: string },
  ): Promise<ResolvedGuestFilters> {
    const storeId = this.blankToNull(query.storeId);
    const guestGroupId = this.blankToNull(query.guestGroupId);
    const search = this.normalizeSearch(query.search);
    const groups = await this.prisma.guestGroup.findMany({
      where: { tenantId },
      select: {
        id: true,
        externalDomain: true,
        externalGroupId: true,
        name: true,
      },
    });
    const adminGuestGroups = groups.filter((group) =>
      this.isAdminGuestGroupName(group.name),
    );
    let excludedAdminGuestGroups = adminGuestGroups
      .filter((group) => this.isAdminGuestGroupName(group.name))
      .map((group) => ({
        externalDomain: group.externalDomain,
        externalGuestTypeId: group.externalGroupId,
      }));
    let externalDomain: string | null = null;
    let externalGuestTypeId: string | null = null;

    if (storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: storeId, tenantId },
        select: { id: true },
      });

      if (!store) {
        throw new BadRequestException('storeId is not available');
      }
    }

    if (guestGroupId) {
      const group = groups.find((candidate) => candidate.id === guestGroupId);

      if (!group) {
        throw new BadRequestException('guestGroupId is not available');
      }

      externalDomain = group.externalDomain;
      externalGuestTypeId = group.externalGroupId;

      if (this.isAdminGuestGroupName(group.name)) {
        excludedAdminGuestGroups = [];
      }
    }

    return {
      storeId,
      guestGroupId,
      externalDomain,
      externalGuestTypeId,
      search,
      excludedAdminGuestGroups,
      onlyGuestGroups: undefined,
    };
  }

  private async resolveStoreId(tenantId: string, value: string | undefined) {
    const storeId = this.blankToNull(value);

    if (!storeId) {
      return null;
    }

    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: { id: true },
    });

    if (!store) {
      throw new BadRequestException('storeId is not available');
    }

    return storeId;
  }

  private async loadAdminGuestGroups(tenantId: string) {
    const groups = await this.prisma.guestGroup.findMany({
      where: { tenantId },
      orderBy: [{ externalDomain: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        externalDomain: true,
        externalGroupId: true,
      },
    });

    return groups.filter((group) => this.isAdminGuestGroupName(group.name));
  }

  private async getOperationTypeSummary(
    tenantId: string,
    period: Period,
    storeId: string | null,
  ) {
    const rows = await this.prisma.guestOperationLog.findMany({
      where: {
        tenantId,
        happenedAt: { gte: period.fromDate, lte: period.toDate },
        ...(storeId ? { storeId } : {}),
      },
      select: {
        type: true,
        amount: true,
      },
    });
    const byType = new Map<string, { count: number; amount: number }>();

    for (const row of rows) {
      const type = row.type?.trim() || 'unknown';
      const current = byType.get(type) ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += Math.abs(this.decimalToNumber(row.amount) ?? 0);
      byType.set(type, current);
    }

    return Array.from(byType.entries())
      .map(([type, row]) => ({
        type,
        count: row.count,
        amount: this.round(row.amount, 2),
      }))
      .sort((first, second) => second.count - first.count)
      .slice(0, 12);
  }

  private async buildStaffOperationRows(
    tenantId: string,
    period: Period,
    storeId: string | null,
  ): Promise<StaffOperationsReportRow[]> {
    const rows = await this.prisma.guestOperationLog.findMany({
      where: {
        tenantId,
        happenedAt: { gte: period.fromDate, lte: period.toDate },
        ...(storeId ? { storeId } : {}),
      },
      select: {
        type: true,
        amount: true,
        happenedAt: true,
        externalDomain: true,
        store: { select: { name: true } },
      },
    });
    const byType = new Map<
      string,
      {
        type: string;
        kind: StaffOperationKind;
        count: number;
        amount: number;
        lastSeenAt: Date | null;
        storeNames: Set<string>;
        externalDomains: Set<string>;
      }
    >();

    for (const row of rows) {
      const type = row.type?.trim() || 'unknown';
      const current = byType.get(type) ?? {
        type,
        kind: this.staffOperationKind(type),
        count: 0,
        amount: 0,
        lastSeenAt: null,
        storeNames: new Set<string>(),
        externalDomains: new Set<string>(),
      };

      current.count += 1;
      current.amount += Math.abs(this.decimalToNumber(row.amount) ?? 0);
      if (
        row.happenedAt &&
        (!current.lastSeenAt || row.happenedAt > current.lastSeenAt)
      ) {
        current.lastSeenAt = row.happenedAt;
      }
      if (row.store?.name) {
        current.storeNames.add(row.store.name);
      }
      if (row.externalDomain) {
        current.externalDomains.add(row.externalDomain);
      }
      byType.set(type, current);
    }

    return Array.from(byType.values()).map((row) => ({
      type: row.type,
      kind: row.kind,
      count: row.count,
      amount: this.round(row.amount, 2),
      lastSeenAt: this.toIsoDateTime(row.lastSeenAt),
      storeNames: Array.from(row.storeNames).sort(),
      externalDomains: Array.from(row.externalDomains).sort(),
    }));
  }

  private buildStaffOperationKindSummary(rows: StaffOperationsReportRow[]) {
    const byKind = new Map<
      StaffOperationKind,
      { count: number; amount: number }
    >();

    for (const row of rows) {
      const current = byKind.get(row.kind) ?? { count: 0, amount: 0 };
      current.count += row.count;
      current.amount += row.amount;
      byKind.set(row.kind, current);
    }

    return Array.from(byKind.entries())
      .map(([kind, row]) => ({
        kind,
        count: row.count,
        amount: this.round(row.amount, 2),
      }))
      .sort((first, second) => second.amount - first.amount);
  }

  private staffOperationKind(type: string): StaffOperationKind {
    const text = type.toLowerCase();

    if (
      text.includes('refund') ||
      text.includes('return') ||
      text.includes('cancel') ||
      text.includes('void') ||
      text.includes('возврат') ||
      text.includes('отмен')
    ) {
      return 'refunds';
    }
    if (
      text.includes('discount') ||
      text.includes('bonus') ||
      text.includes('promo') ||
      text.includes('скид') ||
      text.includes('бонус') ||
      text.includes('промо')
    ) {
      return 'discounts';
    }
    if (
      text.includes('cash') ||
      text.includes('pay') ||
      text.includes('deposit') ||
      text.includes('balance') ||
      text.includes('касс') ||
      text.includes('оплат') ||
      text.includes('пополн') ||
      text.includes('баланс')
    ) {
      return 'cash';
    }
    if (
      text.includes('guest') ||
      text.includes('client') ||
      text.includes('user') ||
      text.includes('гост') ||
      text.includes('клиент')
    ) {
      return 'guest';
    }
    if (
      text.includes('session') ||
      text.includes('shift') ||
      text.includes('tariff') ||
      text.includes('service') ||
      text.includes('сеанс') ||
      text.includes('сесс') ||
      text.includes('смен') ||
      text.includes('тариф') ||
      text.includes('услуг')
    ) {
      return 'service';
    }

    return 'other';
  }

  private staffOperationKindExportLabel(kind: StaffOperationKind) {
    switch (kind) {
      case 'refunds':
        return 'Возвраты и отмены';
      case 'discounts':
        return 'Скидки и бонусы';
      case 'cash':
        return 'Касса и деньги';
      case 'guest':
        return 'Гости';
      case 'service':
        return 'Смены и услуги';
      case 'other':
        return 'Прочее';
    }
  }

  private async getStaffShiftSummary(
    tenantId: string,
    period: Period,
    storeId: string | null,
  ) {
    const [rows, langameUsersByKey] = await Promise.all([
      this.prisma.guestWorkingShift.findMany({
        where: {
          tenantId,
          startedAt: { gte: period.fromDate, lte: period.toDate },
          ...(storeId ? { storeId } : {}),
        },
        select: {
          guestId: true,
          externalDomain: true,
          externalShiftId: true,
          externalUserId: true,
          startedAt: true,
          stoppedAt: true,
          durationMinutes: true,
          cashAmount: true,
          cashlessAmount: true,
          refundsCash: true,
          refundsCashless: true,
          mobilePay: true,
          yandexPay: true,
          incassAmount: true,
          middleCheck: true,
          store: { select: { name: true } },
        },
      }),
      this.loadLangameStaffUsersByOperatorKey(tenantId),
    ]);
    const total = this.emptyStaffShiftMetrics();
    const byGuestId = new Map<string, StaffShiftMetrics>();
    const byUnmatchedOperator = new Map<
      string,
      StaffUnmatchedOperatorMetrics
    >();

    for (const row of rows) {
      const paymentAmount =
        (this.decimalToNumber(row.cashAmount) ?? 0) +
        (this.decimalToNumber(row.cashlessAmount) ?? 0) +
        (this.decimalToNumber(row.mobilePay) ?? 0) +
        (this.decimalToNumber(row.yandexPay) ?? 0);
      const refundAmount =
        (this.decimalToNumber(row.refundsCash) ?? 0) +
        (this.decimalToNumber(row.refundsCashless) ?? 0);
      const incassAmount = this.decimalToNumber(row.incassAmount) ?? 0;
      const middleCheck = this.decimalToNumber(row.middleCheck);

      this.addShiftMetrics(total, {
        linked: Boolean(row.guestId),
        externalShiftId: row.externalShiftId,
        startedAt: row.startedAt,
        stoppedAt: row.stoppedAt,
        durationMinutes: row.durationMinutes ?? 0,
        paymentAmount,
        refundAmount,
        incassAmount,
        middleCheck,
      });

      if (!row.guestId) {
        if (row.externalUserId) {
          const key = this.staffOperatorKey(
            row.externalDomain,
            row.externalUserId,
          );
          const operatorMetrics =
            byUnmatchedOperator.get(key) ??
            this.emptyStaffUnmatchedOperatorMetrics(
              row.externalDomain,
              row.externalUserId,
              langameUsersByKey.get(key) ?? null,
            );

          if (row.store?.name) {
            operatorMetrics.storeNames.add(row.store.name);
          }

          this.addShiftMetrics(operatorMetrics, {
            linked: false,
            externalShiftId: row.externalShiftId,
            startedAt: row.startedAt,
            stoppedAt: row.stoppedAt,
            durationMinutes: row.durationMinutes ?? 0,
            paymentAmount,
            refundAmount,
            incassAmount,
            middleCheck,
          });
          byUnmatchedOperator.set(key, operatorMetrics);
        }

        continue;
      }

      const guestMetrics =
        byGuestId.get(row.guestId) ?? this.emptyStaffShiftMetrics();
      if (row.store?.name) {
        guestMetrics.storeNames.add(row.store.name);
      }
      this.addShiftMetrics(guestMetrics, {
        linked: true,
        externalShiftId: row.externalShiftId,
        startedAt: row.startedAt,
        stoppedAt: row.stoppedAt,
        durationMinutes: row.durationMinutes ?? 0,
        paymentAmount,
        refundAmount,
        incassAmount,
        middleCheck,
      });
      byGuestId.set(row.guestId, guestMetrics);
    }

    const unmatchedOperators = Array.from(byUnmatchedOperator.values())
      .map((row) => this.toUnmatchedOperatorRow(row))
      .sort(
        (first, second) =>
          second.shiftPaymentAmount - first.shiftPaymentAmount ||
          second.shiftsCount - first.shiftsCount,
      )
      .slice(0, 20);

    return { total, byGuestId, unmatchedOperators };
  }

  private async buildStaffOperatorRows(
    tenantId: string,
    period: Period,
    storeId: string | null,
  ): Promise<StaffOperatorReportRow[]> {
    const [rows, mappings, groupsByKey, sales, sessions, langameUsersByKey] =
      await Promise.all([
        this.prisma.guestWorkingShift.findMany({
          where: {
            tenantId,
            startedAt: { gte: period.fromDate, lte: period.toDate },
            ...(storeId ? { storeId } : {}),
            externalUserId: { not: null },
          },
          select: {
            guestId: true,
            storeId: true,
            externalDomain: true,
            externalShiftId: true,
            externalUserId: true,
            startedAt: true,
            stoppedAt: true,
            durationMinutes: true,
            cashAmount: true,
            cashlessAmount: true,
            refundsCash: true,
            refundsCashless: true,
            mobilePay: true,
            yandexPay: true,
            incassAmount: true,
            middleCheck: true,
            store: { select: { name: true } },
            guest: { select: this.guestSelect() },
          },
        }),
        this.prisma.guestStaffIdentityMapping.findMany({
          where: { tenantId, externalProvider: IntegrationProvider.LANGAME },
          select: {
            id: true,
            externalDomain: true,
            externalUserId: true,
            note: true,
            guest: { select: this.guestSelect() },
          },
        }),
        this.loadGuestGroups(tenantId),
        this.prisma.salesFact.findMany({
          where: {
            tenantId,
            saleDate: { gte: period.fromDate, lte: period.toDate },
            isCanceled: false,
            ...(storeId ? { storeId } : {}),
          },
          select: {
            storeId: true,
            saleDate: true,
            revenue: true,
            productNameAtSale: true,
            product: {
              select: {
                name: true,
                category: { select: { name: true } },
              },
            },
          },
        }),
        this.prisma.guestSession.findMany({
          where: {
            tenantId,
            startedAt: { gte: period.fromDate, lte: period.toDate },
            ...(storeId ? { storeId } : {}),
          },
          select: {
            guestId: true,
            storeId: true,
            externalDomain: true,
            externalGuestId: true,
            externalSessionId: true,
            startedAt: true,
            stoppedAt: true,
          },
        }),
        this.loadLangameStaffUsersByOperatorKey(tenantId),
      ]);
    const mappingsByKey = new Map(
      mappings.map((mapping) => [
        this.staffOperatorKey(
          mapping.externalDomain || null,
          mapping.externalUserId,
        ),
        mapping,
      ]),
    );
    const byOperator = new Map<string, StaffOperatorMetrics>();
    const shiftDetailsByKey = new Map<string, StaffOperatorShiftDetail>();
    const shiftGuestKeysByKey = new Map<string, Set<string>>();

    for (const row of rows) {
      if (!row.externalUserId) {
        continue;
      }

      const key = this.staffOperatorKey(row.externalDomain, row.externalUserId);
      const mapping = mappingsByKey.get(key);
      const linkedGuest = mapping?.guest ?? row.guest ?? null;
      const metrics =
        byOperator.get(key) ??
        this.emptyStaffOperatorMetrics(
          row.externalDomain,
          row.externalUserId,
          mapping?.id ?? null,
          mapping?.note ?? null,
          langameUsersByKey.get(key) ?? null,
          linkedGuest
            ? this.toDashboardRow(linkedGuest, undefined, period, groupsByKey)
            : null,
        );

      if (!metrics.linkedGuest && linkedGuest) {
        metrics.linkedGuest = this.toDashboardRow(
          linkedGuest,
          undefined,
          period,
          groupsByKey,
        );
      }
      if (!metrics.mappingId && mapping?.id) {
        metrics.mappingId = mapping.id;
        metrics.mappingNote = mapping.note;
      }
      if (row.store?.name) {
        metrics.storeNames.add(row.store.name);
      }

      const paymentAmount = this.shiftPaymentAmount(row);
      const refundAmount = this.shiftRefundAmount(row);
      const incassAmount = this.decimalToNumber(row.incassAmount) ?? 0;
      const middleCheck = this.decimalToNumber(row.middleCheck);
      this.addShiftMetrics(metrics, {
        linked: Boolean(metrics.linkedGuest),
        externalShiftId: row.externalShiftId,
        startedAt: row.startedAt,
        stoppedAt: row.stoppedAt,
        durationMinutes: row.durationMinutes ?? 0,
        paymentAmount,
        refundAmount,
        incassAmount,
        middleCheck,
      });
      const shiftDetail: StaffOperatorShiftDetail = {
        externalShiftId: row.externalShiftId,
        storeName: row.store?.name ?? null,
        startedAt: this.toIsoDateTime(row.startedAt),
        stoppedAt: this.toIsoDateTime(row.stoppedAt),
        durationHours: this.round((row.durationMinutes ?? 0) / 60, 1),
        paymentAmount: this.round(paymentAmount, 2),
        refundAmount: this.round(refundAmount, 2),
        incassAmount: this.round(incassAmount, 2),
        middleCheck: this.round(middleCheck ?? 0, 2),
        barRevenue: 0,
        hookahRevenue: 0,
        guestVisitsCount: 0,
        uniqueGuestsCount: 0,
        signals: [],
      };
      const shiftKey = this.staffOperatorShiftKey({
        externalDomain: row.externalDomain,
        externalUserId: row.externalUserId,
        externalShiftId: row.externalShiftId,
        startedAt: row.startedAt,
        storeId: row.storeId,
      });
      metrics.shiftDetails.push(shiftDetail);
      shiftDetailsByKey.set(shiftKey, shiftDetail);
      byOperator.set(key, metrics);
    }

    const shiftsByStoreId = new Map<string, typeof rows>();
    for (const row of rows) {
      if (
        !row.storeId ||
        !row.externalUserId ||
        !row.startedAt ||
        !row.stoppedAt
      ) {
        continue;
      }

      const storeRows = shiftsByStoreId.get(row.storeId) ?? [];
      storeRows.push(row);
      shiftsByStoreId.set(row.storeId, storeRows);
    }

    for (const sale of sales) {
      const saleStoreId = sale.storeId;
      if (!saleStoreId) {
        continue;
      }

      const matchingShift = (shiftsByStoreId.get(saleStoreId) ?? []).find(
        (row) =>
          row.startedAt &&
          sale.saleDate >= row.startedAt &&
          sale.saleDate <= (row.stoppedAt ?? period.toDate),
      );
      if (!matchingShift?.externalUserId) {
        continue;
      }

      const key = this.staffOperatorKey(
        matchingShift.externalDomain,
        matchingShift.externalUserId,
      );
      const metrics = byOperator.get(key);
      if (!metrics) {
        continue;
      }

      const revenue = this.decimalToNumber(sale.revenue) ?? 0;
      metrics.barRevenue += revenue;
      const shiftDetail = shiftDetailsByKey.get(
        this.staffOperatorShiftKey({
          externalDomain: matchingShift.externalDomain,
          externalUserId: matchingShift.externalUserId,
          externalShiftId: matchingShift.externalShiftId,
          startedAt: matchingShift.startedAt,
          storeId: matchingShift.storeId,
        }),
      );
      if (shiftDetail) {
        shiftDetail.barRevenue = this.round(
          shiftDetail.barRevenue + revenue,
          2,
        );
      }
      if (
        this.isHookahSale(
          sale.productNameAtSale,
          sale.product?.name,
          sale.product?.category?.name,
        )
      ) {
        metrics.hookahRevenue += revenue;
        if (shiftDetail) {
          shiftDetail.hookahRevenue = this.round(
            shiftDetail.hookahRevenue + revenue,
            2,
          );
        }
      }
    }

    for (const session of sessions) {
      const sessionStoreId = session.storeId;
      const sessionAt = session.startedAt ?? session.stoppedAt;

      if (!sessionStoreId || !sessionAt) {
        continue;
      }

      const matchingShift = (shiftsByStoreId.get(sessionStoreId) ?? []).find(
        (row) =>
          row.startedAt &&
          sessionAt >= row.startedAt &&
          sessionAt <= (row.stoppedAt ?? period.toDate),
      );
      if (!matchingShift?.externalUserId) {
        continue;
      }

      const key = this.staffOperatorKey(
        matchingShift.externalDomain,
        matchingShift.externalUserId,
      );
      const metrics = byOperator.get(key);
      if (!metrics) {
        continue;
      }

      const shiftKey = this.staffOperatorShiftKey({
        externalDomain: matchingShift.externalDomain,
        externalUserId: matchingShift.externalUserId,
        externalShiftId: matchingShift.externalShiftId,
        startedAt: matchingShift.startedAt,
        storeId: matchingShift.storeId,
      });
      const shiftDetail = shiftDetailsByKey.get(shiftKey);
      const guestKey =
        session.guestId ??
        (session.externalGuestId
          ? `${session.externalDomain ?? ''}:${session.externalGuestId}`
          : session.externalSessionId);

      metrics.guestVisitsCount += 1;
      if (guestKey) {
        metrics.uniqueGuestKeys.add(guestKey);
      }

      if (shiftDetail) {
        shiftDetail.guestVisitsCount += 1;

        if (guestKey) {
          const shiftGuestKeys =
            shiftGuestKeysByKey.get(shiftKey) ?? new Set<string>();
          shiftGuestKeys.add(guestKey);
          shiftGuestKeysByKey.set(shiftKey, shiftGuestKeys);
          shiftDetail.uniqueGuestsCount = shiftGuestKeys.size;
        }
      }
    }

    return Array.from(byOperator.values()).map((metrics) =>
      this.toStaffOperatorReportRow(metrics),
    );
  }

  private async loadLangameStaffUsersByOperatorKey(tenantId: string) {
    const rows = await this.prisma.langameStaffUser.findMany({
      where: { tenantId },
      select: {
        externalDomain: true,
        externalUserId: true,
        email: true,
        username: true,
        adminStatus: true,
        verified: true,
        phone: true,
        externalGuestId: true,
        workPoint: true,
        updatedAt: true,
      },
      take: 2000,
    });

    return new Map(
      rows.map((row) => [
        this.staffOperatorKey(row.externalDomain, row.externalUserId),
        this.toStaffLangameUserSummary(row),
      ]),
    );
  }

  private toStaffLangameUserSummary(row: {
    externalUserId: string;
    email: string | null;
    username: string | null;
    adminStatus: string | null;
    verified: boolean | null;
    phone: string | null;
    externalGuestId: string | null;
    workPoint: Prisma.JsonValue | null;
    updatedAt: Date;
  }): StaffLangameUserSummary {
    return {
      displayName: row.username ?? row.email ?? `user_id ${row.externalUserId}`,
      email: row.email,
      username: row.username,
      adminStatus: row.adminStatus,
      verified: row.verified,
      phone: row.phone,
      externalGuestId: row.externalGuestId,
      workPointLabel: this.langameJsonLabel(row.workPoint),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private langameJsonLabel(value: Prisma.JsonValue | null): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value === 'string') {
      return value.trim() || null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? `${value.length} item(s)` : null;
    }

    const objectValue = value as Record<string, Prisma.JsonValue>;
    const directLabel = [
      objectValue.name,
      objectValue.title,
      objectValue.club_name,
      objectValue.clubName,
      objectValue.id,
    ]
      .map((candidate) =>
        typeof candidate === 'string' || typeof candidate === 'number'
          ? String(candidate)
          : null,
      )
      .find((candidate) => candidate && candidate.trim());

    if (directLabel) {
      return directLabel;
    }

    return JSON.stringify(objectValue).slice(0, 120);
  }

  private emptyStaffShiftMetrics(): StaffShiftMetrics {
    return {
      storeNames: new Set<string>(),
      lastClosedShiftExternalShiftId: null,
      lastClosedShiftStartedAt: null,
      lastClosedShiftStoppedAt: null,
      shiftsCount: 0,
      linkedShiftsCount: 0,
      shiftMinutes: 0,
      shiftPaymentAmount: 0,
      shiftRefundAmount: 0,
      shiftIncassAmount: 0,
      barRevenue: 0,
      hookahRevenue: 0,
      middleCheckSum: 0,
      middleCheckCount: 0,
    };
  }

  private addShiftMetrics(
    metrics: StaffShiftMetrics,
    values: {
      linked: boolean;
      externalShiftId: string | null;
      startedAt: Date | null;
      stoppedAt: Date | null;
      durationMinutes: number;
      paymentAmount: number;
      refundAmount: number;
      incassAmount: number;
      middleCheck: number | null;
    },
  ) {
    metrics.shiftsCount += 1;
    metrics.linkedShiftsCount += values.linked ? 1 : 0;
    metrics.shiftMinutes += values.durationMinutes;
    metrics.shiftPaymentAmount += values.paymentAmount;
    metrics.shiftRefundAmount += values.refundAmount;
    metrics.shiftIncassAmount += values.incassAmount;

    if (
      values.startedAt &&
      values.stoppedAt &&
      (!metrics.lastClosedShiftStoppedAt ||
        values.stoppedAt > metrics.lastClosedShiftStoppedAt)
    ) {
      metrics.lastClosedShiftExternalShiftId = values.externalShiftId;
      metrics.lastClosedShiftStartedAt = values.startedAt;
      metrics.lastClosedShiftStoppedAt = values.stoppedAt;
    }

    if (values.middleCheck !== null) {
      metrics.middleCheckSum += values.middleCheck;
      metrics.middleCheckCount += 1;
    }
  }

  private emptyStaffUnmatchedOperatorMetrics(
    externalDomain: string | null,
    externalUserId: string,
    langameUser: StaffLangameUserSummary | null,
  ): StaffUnmatchedOperatorMetrics {
    return {
      ...this.emptyStaffShiftMetrics(),
      externalDomain,
      externalUserId,
      langameUser,
      storeNames: new Set<string>(),
    };
  }

  private emptyStaffOperatorMetrics(
    externalDomain: string | null,
    externalUserId: string,
    mappingId: string | null,
    mappingNote: string | null,
    langameUser: StaffLangameUserSummary | null,
    linkedGuest: GuestDashboardRow | null,
  ): StaffOperatorMetrics {
    return {
      ...this.emptyStaffShiftMetrics(),
      externalDomain,
      externalUserId,
      linkedGuest,
      langameUser,
      mappingId,
      mappingNote,
      guestVisitsCount: 0,
      uniqueGuestKeys: new Set<string>(),
      shiftDetails: [],
    };
  }

  private toUnmatchedOperatorRow(
    metrics: StaffUnmatchedOperatorMetrics,
  ): StaffUnmatchedOperatorRow {
    return {
      externalDomain: metrics.externalDomain,
      externalUserId: metrics.externalUserId,
      langameUser: metrics.langameUser,
      storeNames: Array.from(metrics.storeNames).sort(),
      lastClosedShiftExternalShiftId: metrics.lastClosedShiftExternalShiftId,
      lastClosedShiftStartedAt: this.toIsoDateTime(
        metrics.lastClosedShiftStartedAt,
      ),
      lastClosedShiftStoppedAt: this.toIsoDateTime(
        metrics.lastClosedShiftStoppedAt,
      ),
      shiftsCount: metrics.shiftsCount,
      shiftHours: this.round(metrics.shiftMinutes / 60, 1),
      shiftPaymentAmount: this.round(metrics.shiftPaymentAmount, 2),
      shiftRefundAmount: this.round(metrics.shiftRefundAmount, 2),
      shiftIncassAmount: this.round(metrics.shiftIncassAmount, 2),
      barRevenue: this.round(metrics.barRevenue, 2),
      hookahRevenue: this.round(metrics.hookahRevenue, 2),
      averageShiftMiddleCheck:
        metrics.middleCheckCount > 0
          ? this.round(metrics.middleCheckSum / metrics.middleCheckCount, 2)
          : 0,
    };
  }

  private toStaffOperatorReportRow(
    metrics: StaffOperatorMetrics,
  ): StaffOperatorReportRow {
    return {
      externalDomain: metrics.externalDomain,
      externalUserId: metrics.externalUserId,
      mappingId: metrics.mappingId,
      mappingNote: metrics.mappingNote,
      linkedGuest: metrics.linkedGuest,
      langameUser: metrics.langameUser,
      storeNames: Array.from(metrics.storeNames).sort(),
      lastClosedShiftExternalShiftId: metrics.lastClosedShiftExternalShiftId,
      lastClosedShiftStartedAt: this.toIsoDateTime(
        metrics.lastClosedShiftStartedAt,
      ),
      lastClosedShiftStoppedAt: this.toIsoDateTime(
        metrics.lastClosedShiftStoppedAt,
      ),
      shiftsCount: metrics.shiftsCount,
      shiftHours: this.round(metrics.shiftMinutes / 60, 1),
      shiftPaymentAmount: this.round(metrics.shiftPaymentAmount, 2),
      shiftRefundAmount: this.round(metrics.shiftRefundAmount, 2),
      shiftIncassAmount: this.round(metrics.shiftIncassAmount, 2),
      barRevenue: this.round(metrics.barRevenue, 2),
      hookahRevenue: this.round(metrics.hookahRevenue, 2),
      guestVisitsCount: metrics.guestVisitsCount,
      uniqueGuestsCount: metrics.uniqueGuestKeys.size,
      averageShiftMiddleCheck:
        metrics.middleCheckCount > 0
          ? this.round(metrics.middleCheckSum / metrics.middleCheckCount, 2)
          : 0,
      shiftDetails: this.prepareStaffOperatorShiftDetails(metrics),
    };
  }

  private prepareStaffOperatorShiftDetails(
    metrics: StaffOperatorMetrics,
  ): StaffOperatorShiftDetail[] {
    return metrics.shiftDetails
      .map((shift) => ({
        ...shift,
        signals: this.staffOperatorShiftSignals(shift, metrics),
      }))
      .sort((first, second) => {
        const signalDelta = second.signals.length - first.signals.length;
        if (signalDelta !== 0) {
          return signalDelta;
        }

        return (
          new Date(second.stoppedAt ?? second.startedAt ?? 0).getTime() -
          new Date(first.stoppedAt ?? first.startedAt ?? 0).getTime()
        );
      })
      .slice(0, 8);
  }

  private staffOperatorShiftSignals(
    shift: StaffOperatorShiftDetail,
    metrics: StaffOperatorMetrics,
  ): StaffControlAnomalyType[] {
    const signals: StaffControlAnomalyType[] = [];

    if (!metrics.linkedGuest && shift.paymentAmount >= 10000) {
      signals.push('unmapped-operator');
    }
    if (shift.refundAmount > 0) {
      signals.push('refunds');
    }
    if (shift.paymentAmount >= 10000 && shift.incassAmount <= 0) {
      signals.push('missing-incassation');
    }
    if (shift.durationHours >= 14) {
      signals.push('long-shift');
    }
    if (
      shift.middleCheck > 0 &&
      shift.middleCheck < 100 &&
      shift.paymentAmount >= 5000
    ) {
      signals.push('low-middle-check');
    }

    return signals;
  }

  private staffOperatorShiftKey(values: {
    externalDomain: string | null;
    externalUserId: string;
    externalShiftId: string | null;
    startedAt: Date | null;
    storeId: string | null;
  }) {
    return [
      this.staffOperatorKey(values.externalDomain, values.externalUserId),
      values.externalShiftId ?? 'shift',
      values.startedAt?.toISOString() ?? 'start',
      values.storeId ?? 'store',
    ].join('|');
  }

  private shiftPaymentAmount(row: {
    cashAmount: Prisma.Decimal | null;
    cashlessAmount: Prisma.Decimal | null;
    mobilePay: Prisma.Decimal | null;
    yandexPay: Prisma.Decimal | null;
  }) {
    return (
      (this.decimalToNumber(row.cashAmount) ?? 0) +
      (this.decimalToNumber(row.cashlessAmount) ?? 0) +
      (this.decimalToNumber(row.mobilePay) ?? 0) +
      (this.decimalToNumber(row.yandexPay) ?? 0)
    );
  }

  private shiftRefundAmount(row: {
    refundsCash: Prisma.Decimal | null;
    refundsCashless: Prisma.Decimal | null;
  }) {
    return (
      (this.decimalToNumber(row.refundsCash) ?? 0) +
      (this.decimalToNumber(row.refundsCashless) ?? 0)
    );
  }

  private isHookahSale(
    productNameAtSale: string | null,
    productName: string | null | undefined,
    categoryName: string | null | undefined,
  ) {
    const text = [productNameAtSale, productName, categoryName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return text.includes('кальян') || text.includes('hookah');
  }

  private async getStaffControlDiagnostics(
    tenantId: string,
  ): Promise<StaffControlDiagnostics> {
    const latestRuns = await this.prisma.guestDataProfileRun.findMany({
      where: {
        tenantId,
        provider: IntegrationProvider.LANGAME,
      },
      orderBy: { startedAt: 'desc' },
      take: 3,
      select: {
        domain: true,
        startedAt: true,
        profile: true,
      },
    });

    return {
      latestRuns: latestRuns.map((run) => {
        const operationLogs = this.profileSection(run.profile, 'operationLogs');
        const cashTransactions = this.profileSection(
          run.profile,
          'cashTransactions',
        );
        const langameUsers = this.profileSection(run.profile, 'langameUsers');
        const workingShifts = this.profileSection(run.profile, 'workingShifts');

        return {
          domain: run.domain,
          startedAt: run.startedAt.toISOString(),
          endpointErrors: this.endpointErrorsFromProfile(run.profile),
          operationLogs,
          cashTransactions,
          langameUsers,
          workingShifts,
        };
      }),
    };
  }

  private async loadStaffGuestOptions(
    tenantId: string,
    period: Period,
  ): Promise<GuestDashboardRow[]> {
    const staffGroups = await this.loadAdminGuestGroups(tenantId);

    if (staffGroups.length === 0) {
      return [];
    }

    const [guests, groupsByKey] = await Promise.all([
      this.prisma.guest.findMany({
        where: {
          tenantId,
          OR: staffGroups.map((group) => ({
            externalDomain: group.externalDomain,
            externalGuestTypeId: group.externalGroupId,
          })),
        },
        orderBy: [{ lastActivityAt: 'desc' }, { externalGuestId: 'asc' }],
        select: this.guestSelect(),
      }),
      this.loadGuestGroups(tenantId),
    ]);

    return guests
      .map((guest) =>
        this.toDashboardRow(guest, undefined, period, groupsByKey),
      )
      .sort((first, second) =>
        first.displayName.localeCompare(second.displayName),
      );
  }

  private resolveStaffOperatorStatus(
    value: StaffOperatorReportQuery['status'],
  ) {
    if (value === 'linked' || value === 'unlinked') {
      return value;
    }

    return 'all';
  }

  private resolveStaffOperatorSort(value: StaffOperatorReportQuery['sort']) {
    const allowed: StaffOperatorSortKey[] = [
      'shifts',
      'hours',
      'cash',
      'refunds',
      'incass',
      'middleCheck',
    ];

    return value && allowed.includes(value) ? value : 'cash';
  }

  private resolveStaffOperatorAnomaly(
    value: StaffOperatorReportQuery['anomaly'],
  ): StaffControlAnomalyType | null {
    const allowed: StaffControlAnomalyType[] = [
      'refunds',
      'missing-incassation',
      'long-shift',
      'low-middle-check',
      'unmapped-operator',
    ];

    return value && allowed.includes(value) ? value : null;
  }

  private resolveStaffOperationKind(
    value: StaffOperationsReportQuery['kind'],
  ): StaffOperationKind | 'all' {
    const allowed: Array<StaffOperationKind | 'all'> = [
      'all',
      'refunds',
      'discounts',
      'cash',
      'guest',
      'service',
      'other',
    ];

    return value && allowed.includes(value) ? value : 'all';
  }

  private resolveStaffOperationSort(
    value: StaffOperationsReportQuery['sort'],
  ): StaffOperationSortKey {
    const allowed: StaffOperationSortKey[] = [
      'count',
      'amount',
      'lastSeen',
      'type',
    ];

    return value && allowed.includes(value) ? value : 'amount';
  }

  private matchesStaffOperationSearch(
    row: StaffOperationsReportRow,
    search: string | null,
  ) {
    if (!search) {
      return true;
    }

    const needle = search.toLocaleLowerCase('ru-RU');
    const haystack = [
      row.type,
      row.kind,
      ...row.storeNames,
      ...row.externalDomains,
    ]
      .join(' ')
      .toLocaleLowerCase('ru-RU');

    return haystack.includes(needle);
  }

  private compareStaffOperationRows(
    first: StaffOperationsReportRow,
    second: StaffOperationsReportRow,
    sort: StaffOperationSortKey,
    direction: 'asc' | 'desc',
  ) {
    const multiplier = direction === 'asc' ? 1 : -1;

    if (sort === 'type') {
      return first.type.localeCompare(second.type) * multiplier;
    }

    const difference =
      this.staffOperationSortValue(first, sort) -
      this.staffOperationSortValue(second, sort);

    if (difference !== 0) {
      return difference * multiplier;
    }

    return first.type.localeCompare(second.type);
  }

  private staffOperationSortValue(
    row: StaffOperationsReportRow,
    sort: StaffOperationSortKey,
  ) {
    switch (sort) {
      case 'count':
        return row.count;
      case 'amount':
        return row.amount;
      case 'lastSeen':
        return new Date(row.lastSeenAt ?? 0).getTime();
      case 'type':
        return 0;
    }
  }

  private matchesStaffOperatorStatus(
    row: StaffOperatorReportRow,
    status: NonNullable<StaffOperatorReportQuery['status']>,
  ) {
    if (status === 'linked') {
      return Boolean(row.linkedGuest);
    }

    if (status === 'unlinked') {
      return !row.linkedGuest;
    }

    return true;
  }

  private matchesStaffOperatorAnomaly(
    row: StaffOperatorReportRow,
    anomaly: StaffControlAnomalyType | null,
  ) {
    if (!anomaly) {
      return true;
    }

    switch (anomaly) {
      case 'refunds':
        return row.shiftRefundAmount > 0;
      case 'missing-incassation':
        return row.shiftPaymentAmount >= 10_000 && row.shiftIncassAmount <= 0;
      case 'long-shift':
        return row.shiftsCount > 0 && row.shiftHours / row.shiftsCount >= 14;
      case 'low-middle-check':
        return (
          row.averageShiftMiddleCheck > 0 &&
          row.averageShiftMiddleCheck < 100 &&
          row.shiftPaymentAmount >= 5_000
        );
      case 'unmapped-operator':
        return !row.linkedGuest && row.shiftPaymentAmount >= 10_000;
    }
  }

  private staffOperatorSignalLabels(row: StaffOperatorReportRow) {
    const signals: Array<[StaffControlAnomalyType, string]> = [
      ['refunds', 'Возвраты'],
      ['missing-incassation', 'Касса без инкассации'],
      ['long-shift', 'Длинные смены'],
      ['low-middle-check', 'Низкий средний чек'],
      ['unmapped-operator', 'Без привязки'],
    ];

    return signals
      .filter(([type]) => this.matchesStaffOperatorAnomaly(row, type))
      .map(([, label]) => label)
      .join(', ');
  }

  private matchesStaffOperatorSearch(
    row: StaffOperatorReportRow,
    search: string | null,
  ) {
    if (!search) {
      return true;
    }

    const needle = search.toLocaleLowerCase('ru-RU');
    const haystack = [
      row.externalDomain,
      row.externalUserId,
      row.mappingNote,
      row.langameUser?.displayName,
      row.langameUser?.email,
      row.langameUser?.username,
      row.langameUser?.adminStatus,
      row.langameUser?.phone,
      row.langameUser?.workPointLabel,
      row.linkedGuest?.displayName,
      row.linkedGuest?.externalGuestId,
      row.linkedGuest?.guestGroupName,
      ...row.storeNames,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('ru-RU');

    return haystack.includes(needle);
  }

  private compareStaffOperatorRows(
    first: StaffOperatorReportRow,
    second: StaffOperatorReportRow,
    sort: StaffOperatorSortKey,
    direction: 'asc' | 'desc',
  ) {
    const multiplier = direction === 'asc' ? 1 : -1;
    const difference =
      this.staffOperatorSortValue(first, sort) -
      this.staffOperatorSortValue(second, sort);

    if (difference !== 0) {
      return difference * multiplier;
    }

    return (
      first.externalUserId.localeCompare(second.externalUserId) * multiplier
    );
  }

  private staffOperatorSortValue(
    row: StaffOperatorReportRow,
    sort: StaffOperatorSortKey,
  ) {
    switch (sort) {
      case 'shifts':
        return row.shiftsCount;
      case 'hours':
        return row.shiftHours;
      case 'refunds':
        return row.shiftRefundAmount;
      case 'incass':
        return row.shiftIncassAmount;
      case 'middleCheck':
        return row.averageShiftMiddleCheck;
      case 'cash':
        return row.shiftPaymentAmount;
    }
  }

  private staffOperatorKey(
    externalDomain: string | null,
    externalUserId: string,
  ) {
    return `${externalDomain ?? ''}:${externalUserId}`;
  }

  private toStaffControlRow(
    row: GuestDashboardRow,
    shiftMetrics?: StaffShiftMetrics,
  ): StaffControlRow {
    const controlFlags: string[] = [];
    const totalMoney = row.transactionAmount + row.barRevenue;

    if (row.sessionsCount === 0 && totalMoney === 0) {
      controlFlags.push('Нет активности за период');
    }

    if (row.transactionAmount > 0 && row.sessionsCount === 0) {
      controlFlags.push('Деньги без сессий');
    }

    if (row.playHours >= 20) {
      controlFlags.push('Много часов');
    }

    return {
      ...row,
      controlFlags,
      storeNames: Array.from(shiftMetrics?.storeNames ?? []).sort(),
      lastClosedShiftExternalShiftId:
        shiftMetrics?.lastClosedShiftExternalShiftId ?? null,
      lastClosedShiftStartedAt: this.toIsoDateTime(
        shiftMetrics?.lastClosedShiftStartedAt ?? null,
      ),
      lastClosedShiftStoppedAt: this.toIsoDateTime(
        shiftMetrics?.lastClosedShiftStoppedAt ?? null,
      ),
      shiftsCount: shiftMetrics?.shiftsCount ?? 0,
      shiftHours: this.round((shiftMetrics?.shiftMinutes ?? 0) / 60, 1),
      shiftPaymentAmount: this.round(shiftMetrics?.shiftPaymentAmount ?? 0, 2),
      shiftRefundAmount: this.round(shiftMetrics?.shiftRefundAmount ?? 0, 2),
      shiftIncassAmount: this.round(shiftMetrics?.shiftIncassAmount ?? 0, 2),
      hookahRevenue: this.round(shiftMetrics?.hookahRevenue ?? 0, 2),
      averageShiftMiddleCheck:
        shiftMetrics && shiftMetrics.middleCheckCount > 0
          ? this.round(
              shiftMetrics.middleCheckSum / shiftMetrics.middleCheckCount,
              2,
            )
          : 0,
    };
  }

  private buildStaffControlAnomalies(
    rows: StaffControlRow[],
    unmatchedOperators: StaffUnmatchedOperatorRow[],
  ): StaffControlAnomaly[] {
    const allRows = [
      ...rows.map((row) => ({
        name: row.displayName,
        shiftsCount: row.shiftsCount,
        shiftHours: row.shiftHours,
        shiftPaymentAmount: row.shiftPaymentAmount,
        shiftRefundAmount: row.shiftRefundAmount,
        shiftIncassAmount: row.shiftIncassAmount,
        averageShiftMiddleCheck: row.averageShiftMiddleCheck,
        isMapped: true,
      })),
      ...unmatchedOperators.map((row) => ({
        name: `user_id ${row.externalUserId}`,
        shiftsCount: row.shiftsCount,
        shiftHours: row.shiftHours,
        shiftPaymentAmount: row.shiftPaymentAmount,
        shiftRefundAmount: row.shiftRefundAmount,
        shiftIncassAmount: row.shiftIncassAmount,
        averageShiftMiddleCheck: row.averageShiftMiddleCheck,
        isMapped: false,
      })),
    ];
    const anomalies: StaffControlAnomaly[] = [];
    const refunds = allRows.filter((row) => row.shiftRefundAmount > 0);
    const missingIncassation = allRows.filter(
      (row) => row.shiftPaymentAmount >= 10_000 && row.shiftIncassAmount <= 0,
    );
    const longShifts = allRows.filter(
      (row) => row.shiftsCount > 0 && row.shiftHours / row.shiftsCount >= 14,
    );
    const lowMiddleCheck = allRows.filter(
      (row) =>
        row.averageShiftMiddleCheck > 0 &&
        row.averageShiftMiddleCheck < 100 &&
        row.shiftPaymentAmount >= 5_000,
    );
    const unmappedHighCash = allRows.filter(
      (row) => !row.isMapped && row.shiftPaymentAmount >= 10_000,
    );

    if (refunds.length > 0) {
      anomalies.push({
        type: 'refunds',
        severity:
          refunds.reduce((sum, row) => sum + row.shiftRefundAmount, 0) >= 5_000
            ? 'high'
            : 'medium',
        title: 'Возвраты по сменам',
        description: this.staffAnomalyDescription(
          refunds,
          (row) =>
            `${row.name}: ${this.round(row.shiftRefundAmount, 0).toLocaleString('ru-RU')} руб`,
        ),
        amount: this.round(
          refunds.reduce((sum, row) => sum + row.shiftRefundAmount, 0),
          2,
        ),
        count: refunds.length,
      });
    }

    if (missingIncassation.length > 0) {
      anomalies.push({
        type: 'missing-incassation',
        severity: 'high',
        title: 'Касса без инкассации',
        description: this.staffAnomalyDescription(
          missingIncassation,
          (row) =>
            `${row.name}: касса ${this.round(row.shiftPaymentAmount, 0).toLocaleString('ru-RU')} руб`,
        ),
        amount: this.round(
          missingIncassation.reduce(
            (sum, row) => sum + row.shiftPaymentAmount,
            0,
          ),
          2,
        ),
        count: missingIncassation.length,
      });
    }

    if (unmappedHighCash.length > 0) {
      anomalies.push({
        type: 'unmapped-operator',
        severity: 'high',
        title: 'Операторы без привязки',
        description: this.staffAnomalyDescription(
          unmappedHighCash,
          (row) =>
            `${row.name}: касса ${this.round(row.shiftPaymentAmount, 0).toLocaleString('ru-RU')} руб`,
        ),
        amount: this.round(
          unmappedHighCash.reduce(
            (sum, row) => sum + row.shiftPaymentAmount,
            0,
          ),
          2,
        ),
        count: unmappedHighCash.length,
      });
    }

    if (longShifts.length > 0) {
      anomalies.push({
        type: 'long-shift',
        severity: 'medium',
        title: 'Длинные смены',
        description: this.staffAnomalyDescription(
          longShifts,
          (row) =>
            `${row.name}: средняя смена ${this.round(row.shiftHours / row.shiftsCount, 1).toLocaleString('ru-RU')} ч (${row.shiftsCount.toLocaleString('ru-RU')} смен)`,
        ),
        amount: null,
        count: longShifts.length,
      });
    }

    if (lowMiddleCheck.length > 0) {
      anomalies.push({
        type: 'low-middle-check',
        severity: 'medium',
        title: 'Низкий средний чек',
        description: this.staffAnomalyDescription(
          lowMiddleCheck,
          (row) =>
            `${row.name}: ${this.round(row.averageShiftMiddleCheck, 0).toLocaleString('ru-RU')} руб`,
        ),
        amount: null,
        count: lowMiddleCheck.length,
      });
    }

    return anomalies.sort(
      (first, second) =>
        this.staffAnomalySeverityRank(second.severity) -
          this.staffAnomalySeverityRank(first.severity) ||
        (second.amount ?? 0) - (first.amount ?? 0) ||
        second.count - first.count,
    );
  }

  private staffAnomalyDescription<T>(rows: T[], format: (row: T) => string) {
    const shownRows = rows.slice(0, 3).map(format);
    const hiddenCount = rows.length - shownRows.length;

    return hiddenCount > 0
      ? `${shownRows.join('; ')}; еще ${hiddenCount}`
      : shownRows.join('; ');
  }

  private staffAnomalySeverityRank(severity: StaffControlAnomaly['severity']) {
    if (severity === 'high') {
      return 3;
    }

    if (severity === 'medium') {
      return 2;
    }

    return 1;
  }

  private isAdminGuestGroupName(name: string) {
    const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();

    return (
      normalized.includes('администратор') ||
      normalized.includes('админ') ||
      normalized.includes('admin')
    );
  }

  private async loadGuestGroups(tenantId: string): Promise<GuestGroupsByKey> {
    const groups = await this.prisma.guestGroup.findMany({
      where: { tenantId },
      select: {
        externalDomain: true,
        externalGroupId: true,
        name: true,
      },
    });

    return new Map(
      groups.map((group) => [
        this.guestGroupKey(group.externalDomain, group.externalGroupId),
        group.name,
      ]),
    );
  }

  private toDashboardRow(
    guest: GuestBase,
    metrics: GuestMetrics | undefined,
    period: Period,
    groupsByKey: GuestGroupsByKey,
  ): GuestDashboardRow {
    const latestActivityAt = this.maxDate(
      guest.lastActivityAt,
      metrics?.latestActivityAt ?? null,
    );
    const segment = this.segmentGuest(guest, metrics, latestActivityAt, period);
    const transactionAmount = this.round(metrics?.transactionAmount ?? 0, 2);
    const barRevenue = this.round(metrics?.barRevenue ?? 0, 2);
    const ltv = this.buildGuestLtv(metrics);
    const rfm = this.buildGuestRfmScore(
      latestActivityAt,
      metrics,
      transactionAmount + barRevenue,
      period,
    );
    const churnRisk = this.buildGuestChurnRisk(
      latestActivityAt,
      metrics,
      transactionAmount + barRevenue,
      period,
    );
    const guestGroupName = guest.externalGuestTypeId
      ? (groupsByKey.get(
          this.guestGroupKey(guest.externalDomain, guest.externalGuestTypeId),
        ) ?? null)
      : null;

    return {
      id: guest.id,
      externalDomain: guest.externalDomain,
      externalGuestId: guest.externalGuestId,
      guestGroupName,
      displayName:
        this.decryptSensitiveValue(guest.fullNameEncrypted) ??
        guest.fullNameMasked ??
        guest.emailMasked ??
        this.decryptSensitiveValue(guest.phoneEncrypted) ??
        guest.phoneMasked ??
        `Гость #${guest.externalGuestId}`,
      contact:
        this.decryptSensitiveValue(guest.phoneEncrypted) ??
        guest.phoneMasked ??
        guest.emailMasked ??
        'нет контакта',
      insertedAt: this.toIsoDateTime(guest.insertedAt),
      lastActivityAt: this.toIsoDateTime(latestActivityAt),
      sessionsCount: metrics?.sessionsCount ?? 0,
      visitsDays: metrics?.visitsDays.size ?? 0,
      playHours: this.round((metrics?.playMinutes ?? 0) / 60, 1),
      currentCountHours: this.decimalToNumber(guest.currentCountHours),
      transactionAmount,
      barRevenue,
      ltv,
      bonusLoad: this.buildGuestBonusLoad(metrics, ltv, segment),
      rfm,
      churnRisk,
      segment,
      crmStatus: guest.crmStatus,
      crmNote: guest.crmNote,
      nextAction: guest.nextAction,
      nextContactAt: this.toIsoDateTime(guest.nextContactAt),
      crmUpdatedAt: this.toIsoDateTime(guest.crmUpdatedAt),
      phoneConsentStatus: guest.phoneConsentStatus,
    };
  }

  private segmentGuest(
    guest: GuestBase,
    metrics: GuestMetrics | undefined,
    latestActivityAt: Date | null,
    period: Period,
  ): GuestDashboardRow['segment'] {
    if (guest.insertedAt && guest.insertedAt >= period.fromDate) {
      return 'new';
    }

    if (!latestActivityAt || guest.isDisabled) {
      return 'lost';
    }

    const daysSinceActivity = this.daysBetweenDates(
      latestActivityAt,
      period.toDate,
    );

    if (daysSinceActivity >= 30) {
      return 'lost';
    }

    if (daysSinceActivity >= 14) {
      return 'risk';
    }

    if (
      (metrics?.sessionsCount ?? 0) >= 2 ||
      (metrics?.visitsDays.size ?? 0) >= 2
    ) {
      return 'repeat';
    }

    if (
      (metrics?.sessionsCount ?? 0) > 0 ||
      (metrics?.transactionsCount ?? 0) > 0 ||
      (metrics?.barSalesCount ?? 0) > 0
    ) {
      return 'active';
    }

    return 'quiet';
  }

  private buildGuestRfmScore(
    latestActivityAt: Date | null,
    metrics: GuestMetrics | undefined,
    monetary: number,
    period: Period,
  ): GuestRfmScore {
    const recencyDays = latestActivityAt
      ? Math.max(0, this.daysBetweenDates(latestActivityAt, period.toDate))
      : null;
    const frequency = Math.max(
      metrics?.visitsDays.size ?? 0,
      metrics?.sessionsCount ?? 0,
    );
    const recencyScore = this.rfmRecencyScore(recencyDays);
    const frequencyScore = this.rfmFrequencyScore(frequency);
    const monetaryScore = this.rfmMonetaryScore(monetary);
    const totalScore = recencyScore + frequencyScore + monetaryScore;

    return {
      recencyDays,
      frequency,
      monetary: this.round(monetary, 2),
      recencyScore,
      frequencyScore,
      monetaryScore,
      totalScore,
      segment: this.resolveRfmSegment(
        recencyScore,
        frequencyScore,
        monetaryScore,
        totalScore,
      ),
    };
  }

  private buildGuestLtv(metrics: GuestMetrics | undefined): GuestLtvSummary {
    const transactionRevenue = this.round(
      metrics?.lifetimeTransactionAmount ?? 0,
      2,
    );
    const barRevenue = this.round(metrics?.lifetimeBarRevenue ?? 0, 2);
    const totalRevenue = this.round(transactionRevenue + barRevenue, 2);
    const revenueDays = metrics?.lifetimeRevenueDays.size ?? 0;
    const firstRevenueAt = metrics?.lifetimeFirstRevenueAt ?? null;
    const lastRevenueAt = metrics?.lifetimeLastRevenueAt ?? null;
    const calendarDays =
      firstRevenueAt && lastRevenueAt
        ? this.daysBetweenDates(firstRevenueAt, lastRevenueAt) + 1
        : 0;

    return {
      totalRevenue,
      transactionRevenue,
      barRevenue,
      revenueDays,
      firstRevenueAt: this.toIsoDateTime(firstRevenueAt),
      lastRevenueAt: this.toIsoDateTime(lastRevenueAt),
      averageRevenuePerRevenueDay:
        revenueDays > 0 ? this.round(totalRevenue / revenueDays, 2) : 0,
      averageRevenuePerCalendarDay:
        calendarDays > 0 ? this.round(totalRevenue / calendarDays, 2) : 0,
    };
  }

  private buildGuestBonusLoad(
    metrics: GuestMetrics | undefined,
    ltv: GuestLtvSummary,
    segment: GuestDashboardRow['segment'],
  ): GuestBonusLoadSummary {
    const currentBalance = this.round(metrics?.bonusBalance ?? 0, 2);
    const status = this.resolveBonusLoadStatus(currentBalance, segment);

    return {
      currentBalance,
      latestSnapshotAt: this.toIsoDateTime(metrics?.bonusSnapshotAt ?? null),
      balanceToLtvPercent:
        currentBalance > 0 && ltv.totalRevenue > 0
          ? this.round((currentBalance / ltv.totalRevenue) * 100, 1)
          : null,
      status,
    };
  }

  private buildBonusLoadSummary(
    rows: GuestDashboardRow[],
    periodRevenue: number,
  ): GuestBonusLoadNetworkSummary {
    let totalBalance = 0;
    let guestsWithBalance = 0;
    let inactiveBalance = 0;
    let inactiveGuests = 0;
    let latestSnapshotAt: Date | null = null;

    for (const row of rows) {
      const balance = row.bonusLoad.currentBalance;
      if (balance <= 0) {
        continue;
      }

      totalBalance += balance;
      guestsWithBalance += 1;

      if (row.bonusLoad.latestSnapshotAt) {
        latestSnapshotAt = this.maxDate(
          latestSnapshotAt,
          new Date(row.bonusLoad.latestSnapshotAt),
        );
      }

      if (row.bonusLoad.status === 'RISK' || row.bonusLoad.status === 'WATCH') {
        inactiveBalance += balance;
        inactiveGuests += 1;
      }
    }

    return {
      totalBalance: this.round(totalBalance, 2),
      guestsWithBalance,
      inactiveBalance: this.round(inactiveBalance, 2),
      inactiveGuests,
      averageBalance:
        guestsWithBalance > 0
          ? this.round(totalBalance / guestsWithBalance, 2)
          : 0,
      balanceToPeriodRevenuePercent:
        totalBalance > 0 && periodRevenue > 0
          ? this.round((totalBalance / periodRevenue) * 100, 1)
          : null,
      latestSnapshotAt: this.toIsoDateTime(latestSnapshotAt),
    };
  }

  private resolveBonusLoadStatus(
    balance: number,
    segment: GuestDashboardRow['segment'],
  ): GuestBonusLoadStatus {
    if (balance <= 0) {
      return 'NONE';
    }

    if (segment === 'risk' || segment === 'lost') {
      return 'RISK';
    }

    if (segment === 'quiet') {
      return 'WATCH';
    }

    return 'NORMAL';
  }

  private buildGuestChurnRisk(
    latestActivityAt: Date | null,
    metrics: GuestMetrics | undefined,
    monetary: number,
    period: Period,
  ): GuestChurnRisk {
    if (!latestActivityAt) {
      return {
        level: 'LOST',
        score: 100,
        daysSinceActivity: null,
        expectedIntervalDays: null,
        thresholdDays: null,
        valueAtRisk: this.round(monetary, 2),
        reason: 'нет активности в доступной истории',
      };
    }

    const daysSinceActivity = Math.max(
      0,
      this.daysBetweenDates(latestActivityAt, period.toDate),
    );
    const expectedIntervalDays = this.resolveExpectedVisitIntervalDays(metrics);
    const thresholdDays = expectedIntervalDays
      ? Math.max(7, Math.ceil(expectedIntervalDays * 1.5))
      : 14;
    const ratio = thresholdDays > 0 ? daysSinceActivity / thresholdDays : 0;
    const score = Math.min(100, Math.max(0, Math.round(ratio * 100)));
    const level = this.resolveChurnRiskLevel(daysSinceActivity, thresholdDays);

    return {
      level,
      score,
      daysSinceActivity,
      expectedIntervalDays,
      thresholdDays,
      valueAtRisk: this.round(
        level === 'HIGH' || level === 'LOST'
          ? monetary
          : level === 'MEDIUM'
            ? monetary * 0.5
            : 0,
        2,
      ),
      reason:
        expectedIntervalDays !== null
          ? `нет активности ${daysSinceActivity} дн.; обычный интервал ${expectedIntervalDays} дн.`
          : `нет активности ${daysSinceActivity} дн.; мало истории, используется базовый порог`,
    };
  }

  private resolveExpectedVisitIntervalDays(metrics: GuestMetrics | undefined) {
    const activityDays = [
      ...(metrics?.activityDays ?? new Set<string>()),
    ].sort();

    if (activityDays.length < 2) {
      return null;
    }

    const intervals = activityDays
      .slice(1)
      .map((day, index) =>
        this.daysBetweenDates(new Date(activityDays[index]), new Date(day)),
      )
      .filter((value) => value > 0)
      .sort((left, right) => left - right);

    if (intervals.length === 0) {
      return null;
    }

    const middleIndex = Math.floor(intervals.length / 2);
    const median =
      intervals.length % 2 === 0
        ? (intervals[middleIndex - 1] + intervals[middleIndex]) / 2
        : intervals[middleIndex];

    return Math.min(Math.max(Math.round(median), 1), 90);
  }

  private buildRetentionSummary(
    guests: GuestBase[],
    metricsByGuestId: Map<string, GuestMetrics>,
    period: Period,
  ): GuestRetentionSummary {
    const cohort = guests
      .filter((guest) => {
        if (!guest.insertedAt) {
          return false;
        }

        const insertedDay = this.startOfUtcDay(guest.insertedAt);

        return insertedDay >= period.fromDate && insertedDay <= period.toDate;
      })
      .map((guest) => {
        const insertedDay = this.startOfUtcDay(guest.insertedAt as Date);
        const daysToSecondActivity = this.resolveDaysToSecondActivity(
          insertedDay,
          metricsByGuestId.get(guest.id),
        );

        return {
          ageDays: Math.max(
            0,
            this.daysBetweenDates(insertedDay, period.toDate),
          ),
          daysToSecondActivity,
        };
      });

    const returnedGuests = cohort.filter(
      (row) => row.daysToSecondActivity !== null,
    ).length;
    const daysToSecondActivity = cohort
      .map((row) => row.daysToSecondActivity)
      .filter((value): value is number => value !== null);
    const windows = ([7, 14, 30] as const).map((days) => {
      const eligibleGuests = cohort.filter((row) => row.ageDays >= days).length;
      const returnedInWindow = cohort.filter(
        (row) =>
          row.ageDays >= days &&
          row.daysToSecondActivity !== null &&
          row.daysToSecondActivity <= days,
      ).length;

      return {
        days,
        eligibleGuests,
        returnedGuests: returnedInWindow,
        pendingGuests: Math.max(0, cohort.length - eligibleGuests),
        percent:
          eligibleGuests > 0
            ? this.round((returnedInWindow / eligibleGuests) * 100, 1)
            : 0,
      };
    });

    return {
      cohortGuests: cohort.length,
      returnedGuests,
      withoutSecondActivity: Math.max(0, cohort.length - returnedGuests),
      averageDaysToSecondActivity:
        daysToSecondActivity.length > 0
          ? this.round(
              daysToSecondActivity.reduce((sum, value) => sum + value, 0) /
                daysToSecondActivity.length,
              1,
            )
          : null,
      windows,
    };
  }

  private resolveDaysToSecondActivity(
    insertedDay: Date,
    metrics: GuestMetrics | undefined,
  ) {
    const activityDays = [...(metrics?.activityDays ?? new Set<string>())]
      .map((day) => this.startOfUtcDay(new Date(`${day}T00:00:00.000Z`)))
      .filter((day) => day >= insertedDay)
      .sort((first, second) => first.getTime() - second.getTime());

    const secondActivityDay = activityDays.find(
      (day) => this.daysBetweenDates(insertedDay, day) > 0,
    );

    return secondActivityDay
      ? this.daysBetweenDates(insertedDay, secondActivityDay)
      : null;
  }

  private resolveChurnRiskLevel(
    daysSinceActivity: number,
    thresholdDays: number,
  ): GuestChurnRiskLevel {
    if (daysSinceActivity >= 60) {
      return 'LOST';
    }

    if (daysSinceActivity >= thresholdDays) {
      return 'HIGH';
    }

    if (daysSinceActivity >= Math.ceil(thresholdDays * 0.7)) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private rfmRecencyScore(recencyDays: number | null) {
    if (recencyDays === null) return 1;
    if (recencyDays <= 7) return 5;
    if (recencyDays <= 14) return 4;
    if (recencyDays <= 30) return 3;
    if (recencyDays <= 60) return 2;
    return 1;
  }

  private rfmFrequencyScore(frequency: number) {
    if (frequency >= 8) return 5;
    if (frequency >= 4) return 4;
    if (frequency >= 2) return 3;
    if (frequency >= 1) return 2;
    return 1;
  }

  private rfmMonetaryScore(monetary: number) {
    if (monetary >= 10_000) return 5;
    if (monetary >= 5_000) return 4;
    if (monetary >= 2_000) return 3;
    if (monetary >= 500) return 2;
    return 1;
  }

  private resolveRfmSegment(
    recencyScore: number,
    frequencyScore: number,
    monetaryScore: number,
    totalScore: number,
  ): GuestRfmSegment {
    if (recencyScore <= 2 && totalScore <= 8) {
      return 'LOST';
    }

    if (recencyScore <= 2 && monetaryScore >= 3) {
      return 'AT_RISK';
    }

    if (totalScore >= 13) {
      return 'CHAMPION';
    }

    if (frequencyScore >= 4 || monetaryScore >= 4) {
      return 'LOYAL';
    }

    if (recencyScore >= 4 && totalScore >= 8) {
      return 'PROMISING';
    }

    return 'NEED_ATTENTION';
  }

  private normalizeCrmUpdate(dto: GuestCrmUpdateDto) {
    return {
      crmStatus: this.resolveCrmStatus(dto.crmStatus),
      crmNote: this.normalizeText(dto.crmNote, 2000),
      nextAction: this.normalizeText(dto.nextAction, 160),
      nextContactAt: this.resolveOptionalDate(dto.nextContactAt),
    };
  }

  private resolveCrmStatus(value: GuestCrmUpdateDto['crmStatus']) {
    if (!value) {
      return GuestCrmStatus.NONE;
    }

    if (!Object.values(GuestCrmStatus).includes(value)) {
      throw new BadRequestException('crmStatus is not supported');
    }

    return value;
  }

  private normalizeText(value: string | null | undefined, maxLength: number) {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    return trimmed.slice(0, maxLength);
  }

  private normalizeGuestSavedFilterPayload(
    filters: GuestSavedFilterPayload,
  ): Prisma.InputJsonObject {
    const payload: Record<string, string> = {};
    const dateFrom = this.normalizeText(filters.dateFrom, 20);
    const dateTo = this.normalizeText(filters.dateTo, 20);
    const storeId = this.normalizeText(filters.storeId, 120);
    const guestGroupId = this.normalizeText(filters.guestGroupId, 120);
    const search = this.normalizeText(filters.search, 120);

    if (dateFrom) {
      payload.dateFrom = dateFrom;
    }
    if (dateTo) {
      payload.dateTo = dateTo;
    }
    if (storeId) {
      payload.storeId = storeId;
    }
    if (guestGroupId) {
      payload.guestGroupId = guestGroupId;
    }
    if (filters.segment) {
      payload.segment = this.resolveSegment(filters.segment);
    }
    if (filters.crmStatus) {
      const crmStatus = this.resolveCrmStatusFilter(filters.crmStatus);

      if (crmStatus) {
        payload.crmStatus = crmStatus;
      }
    }
    if (search) {
      payload.search = search;
    }
    if (filters.pageSize) {
      payload.pageSize = String(
        this.resolvePositiveInteger(filters.pageSize, 200, 10, 1000),
      );
    }
    if (filters.sort) {
      payload.sort = this.resolveSort(filters.sort);
    }
    if (filters.direction) {
      payload.direction = this.resolveDirection(filters.direction);
    }

    return payload;
  }

  private toGuestSavedFilter(row: {
    id: string;
    name: string;
    description: string | null;
    filters: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
    lastUsedAt: Date | null;
  }): GuestSavedFilter {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      filters: this.guestSavedFilterPayload(row.filters),
      createdAt:
        this.toIsoDateTime(row.createdAt) ?? row.createdAt.toISOString(),
      updatedAt:
        this.toIsoDateTime(row.updatedAt) ?? row.updatedAt.toISOString(),
      lastUsedAt: this.toIsoDateTime(row.lastUsedAt),
    };
  }

  private toGuestAudience(row: {
    id: string;
    name: string;
    description: string | null;
    filters: Prisma.JsonValue;
    guestsCount: number;
    createdAt: Date;
    updatedAt: Date;
  }): GuestAudience {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      filters: this.guestSavedFilterPayload(row.filters),
      guestsCount: row.guestsCount,
      createdAt:
        this.toIsoDateTime(row.createdAt) ?? row.createdAt.toISOString(),
      updatedAt:
        this.toIsoDateTime(row.updatedAt) ?? row.updatedAt.toISOString(),
    };
  }

  private toGuestCrmLead(row: {
    id: string;
    fullNameMasked: string | null;
    fullNameEncrypted: string | null;
    phoneMasked: string | null;
    phoneEncrypted: string | null;
    emailMasked: string | null;
    source: string | null;
    eventName: string | null;
    crmStatus: GuestCrmStatus;
    crmNote: string | null;
    nextAction: string | null;
    nextContactAt: Date | null;
    phoneConsentStatus: GuestCommunicationConsentStatus;
    phoneConsentSource: string | null;
    phoneConsentAt: Date | null;
    unsubscribedAt: Date | null;
    matchedGuestId: string | null;
    matchedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    matchedGuest?: GuestBase | null;
  }): GuestCrmLead {
    const leadName =
      this.decryptSensitiveValue(row.fullNameEncrypted) ??
      row.fullNameMasked ??
      'Ручной CRM-гость';
    const matchedGuestDisplayName = row.matchedGuest
      ? this.toDashboardRow(
          row.matchedGuest,
          undefined,
          this.emptyPeriod(),
          new Map(),
        ).displayName
      : null;

    return {
      id: row.id,
      displayName: leadName,
      phone:
        this.decryptSensitiveValue(row.phoneEncrypted) ??
        row.phoneMasked ??
        'телефон скрыт',
      email: row.emailMasked,
      source: row.source,
      eventName: row.eventName,
      crmStatus: row.crmStatus,
      crmNote: row.crmNote,
      nextAction: row.nextAction,
      nextContactAt: this.toIsoDateTime(row.nextContactAt),
      phoneConsentStatus: row.phoneConsentStatus,
      phoneConsentSource: row.phoneConsentSource,
      phoneConsentAt: this.toIsoDateTime(row.phoneConsentAt),
      unsubscribedAt: this.toIsoDateTime(row.unsubscribedAt),
      matchedGuestId: row.matchedGuestId,
      matchedGuestDisplayName,
      matchedAt: this.toIsoDateTime(row.matchedAt),
      createdAt:
        this.toIsoDateTime(row.createdAt) ?? row.createdAt.toISOString(),
      updatedAt:
        this.toIsoDateTime(row.updatedAt) ?? row.updatedAt.toISOString(),
    };
  }

  private toGuestCrmTask(row: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    dueAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    audience?: { id: string; name: string } | null;
    guest?: GuestBase | null;
    lead?: {
      id: string;
      fullNameMasked: string | null;
      fullNameEncrypted: string | null;
      phoneMasked: string | null;
      phoneEncrypted: string | null;
    } | null;
    assignedToUser?: {
      id: string;
      fullName: string | null;
      email: string;
    } | null;
  }): GuestCrmTask {
    const assignedToUser = row.assignedToUser
      ? {
          id: row.assignedToUser.id,
          displayName: row.assignedToUser.fullName ?? row.assignedToUser.email,
          email: row.assignedToUser.email,
        }
      : null;

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: this.resolveCrmTaskStatus(row.status),
      dueAt: this.toIsoDateTime(row.dueAt),
      completedAt: this.toIsoDateTime(row.completedAt),
      createdAt:
        this.toIsoDateTime(row.createdAt) ?? row.createdAt.toISOString(),
      updatedAt:
        this.toIsoDateTime(row.updatedAt) ?? row.updatedAt.toISOString(),
      audience: row.audience ?? null,
      guest: row.guest
        ? {
            id: row.guest.id,
            displayName: this.toDashboardRow(
              row.guest,
              undefined,
              this.emptyPeriod(),
              new Map(),
            ).displayName,
          }
        : null,
      lead: row.lead
        ? {
            id: row.lead.id,
            displayName:
              this.decryptSensitiveValue(row.lead.fullNameEncrypted) ??
              row.lead.fullNameMasked ??
              this.decryptSensitiveValue(row.lead.phoneEncrypted) ??
              row.lead.phoneMasked ??
              'Ручной CRM-гость',
          }
        : null,
      assignedToUser,
    };
  }

  private toGuestCrmTaskLeadName(lead: {
    fullNameMasked: string | null;
    fullNameEncrypted: string | null;
    phoneMasked: string | null;
    phoneEncrypted: string | null;
  }) {
    return (
      this.decryptSensitiveValue(lead.fullNameEncrypted) ??
      lead.fullNameMasked ??
      this.decryptSensitiveValue(lead.phoneEncrypted) ??
      lead.phoneMasked ??
      'Ручной CRM-гость'
    );
  }

  private toGuestCrmContactEvent(row: {
    id: string;
    channel: string;
    result: string | null;
    note: string | null;
    contactedAt: Date;
    createdAt: Date;
    audience?: { id: string; name: string } | null;
    guest?: GuestBase | null;
    lead?: {
      id: string;
      fullNameMasked: string | null;
      fullNameEncrypted: string | null;
      phoneMasked: string | null;
      phoneEncrypted: string | null;
    } | null;
    marketingCampaign?: { id: string; name: string } | null;
    createdByUser?: { fullName: string | null; email: string } | null;
  }): GuestCrmContactEvent {
    return {
      id: row.id,
      channel: row.channel,
      result: row.result,
      note: row.note,
      contactedAt:
        this.toIsoDateTime(row.contactedAt) ?? row.contactedAt.toISOString(),
      createdAt:
        this.toIsoDateTime(row.createdAt) ?? row.createdAt.toISOString(),
      audience: row.audience ?? null,
      guest: row.guest
        ? {
            id: row.guest.id,
            displayName: this.toDashboardRow(
              row.guest,
              undefined,
              this.emptyPeriod(),
              new Map(),
            ).displayName,
          }
        : null,
      lead: row.lead
        ? {
            id: row.lead.id,
            displayName:
              this.decryptSensitiveValue(row.lead.fullNameEncrypted) ??
              row.lead.fullNameMasked ??
              this.decryptSensitiveValue(row.lead.phoneEncrypted) ??
              row.lead.phoneMasked ??
              'Р СѓС‡РЅРѕР№ CRM-РіРѕСЃС‚СЊ',
          }
        : null,
      marketingCampaign: row.marketingCampaign ?? null,
      createdBy: row.createdByUser
        ? (row.createdByUser.fullName ?? row.createdByUser.email)
        : null,
    };
  }

  private buildCrmTaskWhere(
    tenantId: string,
    query: GuestCrmTaskReportQuery,
  ): Prisma.GuestCrmTaskWhereInput {
    const where: Prisma.GuestCrmTaskWhereInput = { tenantId };
    const dateFrom = this.normalizeText(query.dateFrom, 20);
    const dateTo = this.normalizeText(query.dateTo, 20);

    if (dateFrom || dateTo) {
      const dueAt: Prisma.DateTimeNullableFilter = {};

      if (dateFrom) {
        const from = this.parseDateInput(dateFrom, 'dateFrom');
        from.setUTCHours(0, 0, 0, 0);
        dueAt.gte = from;
      }

      if (dateTo) {
        const to = this.parseDateInput(dateTo, 'dateTo');
        to.setUTCHours(23, 59, 59, 999);
        dueAt.lte = to;
      }

      where.dueAt = dueAt;
    }

    return where;
  }

  private buildCrmTaskSearch(search: string): Prisma.GuestCrmTaskWhereInput[] {
    const textFilter = { contains: search, mode: 'insensitive' as const };

    return [
      { title: textFilter },
      { description: textFilter },
      { audience: { is: { name: textFilter } } },
      { assignedToUser: { is: { fullName: textFilter } } },
      { assignedToUser: { is: { email: textFilter } } },
      { guest: { is: { externalGuestId: textFilter } } },
      { guest: { is: { fullNameMasked: textFilter } } },
      { guest: { is: { phoneMasked: textFilter } } },
      { lead: { is: { fullNameMasked: textFilter } } },
      { lead: { is: { phoneMasked: textFilter } } },
      { lead: { is: { emailMasked: textFilter } } },
    ];
  }

  private buildCrmTaskSummary(rows: GuestCrmTask[]) {
    const now = new Date();

    return rows.reduce(
      (summary, row) => {
        if (row.status === 'OPEN') {
          summary.open += 1;
        } else if (row.status === 'IN_PROGRESS') {
          summary.inProgress += 1;
        } else if (row.status === 'DONE') {
          summary.done += 1;
        } else if (row.status === 'CANCELED') {
          summary.canceled += 1;
        }

        if (
          row.dueAt &&
          row.status !== 'DONE' &&
          row.status !== 'CANCELED' &&
          new Date(row.dueAt) < now
        ) {
          summary.overdue += 1;
        }

        if (row.assignedToUser) {
          summary.withAssignee += 1;
        } else {
          summary.withoutAssignee += 1;
        }

        return summary;
      },
      {
        open: 0,
        inProgress: 0,
        done: 0,
        canceled: 0,
        overdue: 0,
        withAssignee: 0,
        withoutAssignee: 0,
      },
    );
  }

  private compareCrmTaskRows(
    first: GuestCrmTask,
    second: GuestCrmTask,
    sort: GuestCrmTaskSortKey,
    direction: 'asc' | 'desc',
  ) {
    const modifier = direction === 'asc' ? 1 : -1;
    const firstValue = this.crmTaskSortValue(first, sort);
    const secondValue = this.crmTaskSortValue(second, sort);

    if (firstValue < secondValue) {
      return -1 * modifier;
    }

    if (firstValue > secondValue) {
      return 1 * modifier;
    }

    return second.createdAt.localeCompare(first.createdAt);
  }

  private crmTaskSortValue(row: GuestCrmTask, sort: GuestCrmTaskSortKey) {
    if (sort === 'status') {
      const order: Record<GuestCrmTaskStatus, number> = {
        OPEN: 1,
        IN_PROGRESS: 2,
        DONE: 3,
        CANCELED: 4,
      };
      return order[row.status];
    }

    if (sort === 'target') {
      return this.crmTaskTargetLabel(row).toLocaleLowerCase('ru-RU');
    }

    if (sort === 'assignee') {
      return (
        row.assignedToUser?.displayName.toLocaleLowerCase('ru-RU') ??
        'яяя без ответственного'
      );
    }

    return row[sort] ?? '9999-12-31T23:59:59.999Z';
  }

  private crmTaskTargetLabel(row: GuestCrmTask) {
    return (
      row.audience?.name ??
      row.lead?.displayName ??
      row.guest?.displayName ??
      'Без цели'
    );
  }

  private resolveCrmTaskStatusFilter(
    value?: string | null,
  ): GuestCrmTaskStatus | 'all' {
    if (value === 'all') {
      return 'all';
    }

    return this.resolveCrmTaskStatus(value);
  }

  private resolveCrmTaskSort(value?: string | null): GuestCrmTaskSortKey {
    const allowed: GuestCrmTaskSortKey[] = [
      'dueAt',
      'createdAt',
      'updatedAt',
      'status',
      'target',
      'assignee',
    ];

    return allowed.includes(value as GuestCrmTaskSortKey)
      ? (value as GuestCrmTaskSortKey)
      : 'dueAt';
  }

  private resolveCrmTaskTargetType(
    value?: string | null,
  ): GuestCrmTaskTargetType {
    if (value === 'group' || value === 'guest' || value === 'lead') {
      return value;
    }

    return 'all';
  }

  private crmTaskStatusExportLabel(status: GuestCrmTaskStatus) {
    const labels: Record<GuestCrmTaskStatus, string> = {
      OPEN: 'Новая',
      IN_PROGRESS: 'В работе',
      DONE: 'Готово',
      CANCELED: 'Отменена',
    };

    return labels[status];
  }

  private resolveCrmTaskStatus(value?: string | null): GuestCrmTaskStatus {
    if (
      value === 'OPEN' ||
      value === 'IN_PROGRESS' ||
      value === 'DONE' ||
      value === 'CANCELED'
    ) {
      return value;
    }

    return 'OPEN';
  }

  private async resolveCrmTaskAssignee(
    tenantId: string,
    userId?: string | null,
  ) {
    const normalized = this.normalizeText(userId, 80);

    if (!normalized) {
      return null;
    }

    const assignee = await this.prisma.user.findFirst({
      where: { id: normalized, tenantId },
      select: { id: true },
    });

    if (!assignee) {
      throw new NotFoundException('CRM task assignee not found');
    }

    return assignee.id;
  }

  private resolvePhoneConsentStatus(
    value?: string | null,
  ): GuestCommunicationConsentStatus {
    if (
      value === GuestCommunicationConsentStatus.GRANTED ||
      value === GuestCommunicationConsentStatus.DENIED ||
      value === GuestCommunicationConsentStatus.UNSUBSCRIBED
    ) {
      return value;
    }

    return GuestCommunicationConsentStatus.UNKNOWN;
  }

  private async copyLeadCrmToMatchedGuestIfEmpty(
    tenantId: string,
    guestId: string,
    lead: {
      createdByUserId: string | null;
      crmStatus: GuestCrmStatus;
      crmNote: string | null;
      nextAction: string | null;
      nextContactAt: Date | null;
      phoneConsentStatus: GuestCommunicationConsentStatus;
    },
  ) {
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, tenantId },
      select: {
        id: true,
        crmStatus: true,
        crmNote: true,
        nextAction: true,
        nextContactAt: true,
        phoneConsentStatus: true,
      },
    });

    if (!guest || guest.crmStatus !== GuestCrmStatus.NONE) {
      return;
    }

    const update = {
      crmStatus: lead.crmStatus,
      crmNote: guest.crmNote ?? lead.crmNote,
      nextAction: guest.nextAction ?? lead.nextAction,
      nextContactAt: guest.nextContactAt ?? lead.nextContactAt,
      phoneConsentStatus: guest.phoneConsentStatus,
      crmUpdatedByUserId: lead.createdByUserId,
      crmUpdatedAt: new Date(),
    };

    if (
      guest.phoneConsentStatus === GuestCommunicationConsentStatus.UNKNOWN &&
      lead.phoneConsentStatus !== GuestCommunicationConsentStatus.UNKNOWN
    ) {
      update.phoneConsentStatus = lead.phoneConsentStatus;
    }

    await this.prisma.$transaction([
      this.prisma.guest.update({
        where: { id: guest.id },
        data: update,
      }),
      this.prisma.guestCrmEvent.create({
        data: {
          tenantId,
          guestId: guest.id,
          createdByUserId: lead.createdByUserId,
          status: update.crmStatus,
          note: update.crmNote,
          nextAction: update.nextAction,
          nextContactAt: update.nextContactAt,
        },
      }),
    ]);
  }

  private emptyPeriod(): Period {
    const now = new Date();

    return {
      fromDate: now,
      toDate: now,
      activityFromDate: now,
      from: this.toIsoDate(now),
      to: this.toIsoDate(now),
    };
  }

  private guestSavedFilterPayload(
    value: Prisma.JsonValue,
  ): GuestSavedFilterPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const raw = value as Record<string, unknown>;
    const payload: GuestSavedFilterPayload = {};
    const dateFrom = this.stringJsonField(raw.dateFrom);
    const dateTo = this.stringJsonField(raw.dateTo);
    const storeId = this.stringJsonField(raw.storeId);
    const guestGroupId = this.stringJsonField(raw.guestGroupId);
    const segment = this.stringJsonField(raw.segment);
    const crmStatus = this.stringJsonField(raw.crmStatus);
    const search = this.stringJsonField(raw.search);
    const pageSize = this.stringJsonField(raw.pageSize);
    const sort = this.stringJsonField(raw.sort);
    const direction = this.stringJsonField(raw.direction);

    if (dateFrom) payload.dateFrom = dateFrom;
    if (dateTo) payload.dateTo = dateTo;
    if (storeId) payload.storeId = storeId;
    if (guestGroupId) payload.guestGroupId = guestGroupId;
    if (segment)
      payload.segment = segment as GuestSavedFilterPayload['segment'];
    if (crmStatus) {
      payload.crmStatus = crmStatus as GuestSavedFilterPayload['crmStatus'];
    }
    if (search) payload.search = search;
    if (pageSize) payload.pageSize = pageSize;
    if (sort) payload.sort = sort as GuestSavedFilterPayload['sort'];
    if (direction) {
      payload.direction = direction as GuestSavedFilterPayload['direction'];
    }

    return payload;
  }

  private stringJsonField(value: unknown) {
    return typeof value === 'string' && value ? value : undefined;
  }

  private normalizeExternalUserId(value: string | null | undefined) {
    const normalized = this.normalizeText(value, 120);

    if (!normalized) {
      throw new BadRequestException('externalUserId is required');
    }

    return normalized;
  }

  private normalizeRequiredId(value: string | null | undefined, field: string) {
    const normalized = this.normalizeText(value, 120);

    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }

    return normalized;
  }

  private resolveOptionalDate(value: string | null | undefined) {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    return this.parseDateInput(trimmed, 'nextContactAt');
  }

  private resolvePeriod(query: GuestsSummaryQuery): Period {
    const now = new Date();
    const defaultTo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const toDate = query.dateTo
      ? this.parseDateInput(query.dateTo, 'dateTo')
      : defaultTo;
    const fromDate = query.dateFrom
      ? this.parseDateInput(query.dateFrom, 'dateFrom')
      : new Date(toDate);

    if (!query.dateFrom) {
      fromDate.setUTCDate(fromDate.getUTCDate() - 29);
    }

    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    const activityFromDate = new Date(fromDate);
    activityFromDate.setUTCDate(activityFromDate.getUTCDate() - 60);

    return {
      fromDate,
      toDate,
      activityFromDate,
      from: this.toIsoDate(fromDate),
      to: this.toIsoDate(toDate),
    };
  }

  private periodDays(period: Period) {
    return Math.max(
      1,
      Math.floor(
        (this.startOfUtcDay(period.toDate).getTime() -
          this.startOfUtcDay(period.fromDate).getTime()) /
          86_400_000,
      ) + 1,
    );
  }

  private async resolveComputerCount(tenantId: string, storeId: string | null) {
    const currentCount = await this.loadComputerCount(tenantId, storeId);

    if (currentCount !== null) {
      return currentCount;
    }

    try {
      await this.guestDataFoundationService.syncComputerCountsForTenant(
        tenantId,
      );
    } catch {
      return null;
    }

    return this.loadComputerCount(tenantId, storeId);
  }

  private async loadComputerCount(tenantId: string, storeId: string | null) {
    const stores = await this.prisma.store.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(storeId ? { id: storeId } : {}),
        computerCount: { not: null },
      },
      select: {
        computerCount: true,
      },
    });

    if (stores.length === 0) {
      return null;
    }

    return stores.reduce((sum, store) => sum + (store.computerCount ?? 0), 0);
  }

  private parseDateInput(value: string, field: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException(`${field} must be YYYY-MM-DD`);
    }

    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private resolveSegment(value: GuestListQuery['segment']) {
    const allowed = ['active', 'new', 'repeat', 'risk', 'lost', 'quiet', 'top'];
    return allowed.includes(value ?? '') ? (value ?? 'top') : 'top';
  }

  private resolveCrmStatusFilter(value: GuestListQuery['crmStatus']) {
    if (!value) {
      return null;
    }

    return Object.values(GuestCrmStatus).includes(value) ? value : null;
  }

  private resolveSort(value: GuestListQuery['sort']) {
    const allowed = [
      'revenue',
      'sessions',
      'lastActivity',
      'registered',
      'rfm',
      'churnRisk',
      'ltv',
      'bonusLoad',
    ];
    return allowed.includes(value ?? '') ? (value ?? 'revenue') : 'revenue';
  }

  private resolveDirection(value: GuestListQuery['direction']) {
    return value === 'asc' ? 'asc' : 'desc';
  }

  private resolvePositiveInteger(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    const parsed = Number(value ?? fallback);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }

  private segmentExportLabel(segment: GuestDashboardRow['segment']) {
    const labels: Record<GuestDashboardRow['segment'], string> = {
      active: 'Активный',
      new: 'Новый',
      repeat: 'Повторный',
      risk: 'В риске',
      lost: 'Потерянный',
      quiet: 'Тихий',
    };

    return labels[segment];
  }

  private rfmSegmentExportLabel(segment: GuestRfmSegment) {
    const labels: Record<GuestRfmSegment, string> = {
      CHAMPION: 'Чемпион',
      LOYAL: 'Лояльный',
      PROMISING: 'Перспективный',
      NEED_ATTENTION: 'Нужен контакт',
      AT_RISK: 'VIP в риске',
      LOST: 'Потерянный',
    };

    return labels[segment];
  }

  private churnRiskExportLabel(level: GuestChurnRiskLevel) {
    const labels: Record<GuestChurnRiskLevel, string> = {
      LOW: 'Низкий',
      MEDIUM: 'Наблюдать',
      HIGH: 'Высокий',
      LOST: 'Потерян',
    };

    return labels[level];
  }

  private bonusLoadExportLabel(status: GuestBonusLoadStatus) {
    const labels: Record<GuestBonusLoadStatus, string> = {
      NONE: 'Нет бонусов',
      NORMAL: 'Активный остаток',
      WATCH: 'Наблюдать',
      RISK: 'Бонусы без активности',
    };

    return labels[status];
  }

  private crmStatusExportLabel(status: GuestCrmStatus) {
    const labels: Record<GuestCrmStatus, string> = {
      NONE: 'Без статуса',
      WATCH: 'Наблюдать',
      CONTACT: 'Связаться',
      INVITED: 'Приглашен',
      LOYAL: 'Лояльный',
      VIP: 'VIP',
      PROBLEM: 'Проблемный',
      DO_NOT_CONTACT: 'Не контактировать',
    };

    return labels[status];
  }

  private formatExportDate(value: string | null) {
    return this.formatExportDateValue(value, false);
  }

  private formatExportDateTime(value: string | null) {
    return this.formatExportDateValue(value, true);
  }

  private formatExportDateValue(value: string | null, includeTime: boolean) {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      ...(includeTime ? ({ hour: '2-digit', minute: '2-digit' } as const) : {}),
      timeZone: 'UTC',
    }).format(date);
  }

  private toCsv(rows: CsvCell[][]) {
    return `\uFEFF${rows.map((row) => this.csvRow(row)).join('\n')}`;
  }

  private csvRow(row: CsvCell[]) {
    return row.map((cell) => this.csvCell(cell)).join(';');
  }

  private csvCell(cell: CsvCell) {
    const value = cell === null ? '' : String(cell);

    return `"${value.replaceAll('"', '""')}"`;
  }

  private guestSelect() {
    return {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      externalGuestTypeId: true,
      phoneMasked: true,
      phoneEncrypted: true,
      emailMasked: true,
      fullNameMasked: true,
      fullNameEncrypted: true,
      insertedAt: true,
      lastActivityAt: true,
      isDisabled: true,
      currentCountHours: true,
      crmStatus: true,
      crmNote: true,
      nextAction: true,
      nextContactAt: true,
      crmUpdatedAt: true,
      phoneConsentStatus: true,
    } satisfies Prisma.GuestSelect;
  }

  private ensureMetrics(map: Map<string, GuestMetrics>, guestId: string) {
    const existing = map.get(guestId);

    if (existing) {
      return existing;
    }

    const created: GuestMetrics = {
      latestActivityAt: null,
      activityDays: new Set<string>(),
      sessionsCount: 0,
      visitsDays: new Set<string>(),
      playMinutes: 0,
      transactionsCount: 0,
      transactionAmount: 0,
      barRevenue: 0,
      barSalesCount: 0,
      lifetimeTransactionAmount: 0,
      lifetimeBarRevenue: 0,
      lifetimeRevenueDays: new Set<string>(),
      lifetimeFirstRevenueAt: null,
      lifetimeLastRevenueAt: null,
      bonusBalance: 0,
      bonusSnapshotAt: null,
    };
    map.set(guestId, created);

    return created;
  }

  private sumPeriodMetrics(metricsByGuestId: Map<string, GuestMetrics>) {
    const totals = {
      sessionsCount: 0,
      playMinutes: 0,
      transactionsCount: 0,
      transactionAmount: 0,
      barRevenue: 0,
      barSalesCount: 0,
    };

    for (const metrics of metricsByGuestId.values()) {
      totals.sessionsCount += metrics.sessionsCount;
      totals.playMinutes += metrics.playMinutes;
      totals.transactionsCount += metrics.transactionsCount;
      totals.transactionAmount += metrics.transactionAmount;
      totals.barRevenue += metrics.barRevenue;
      totals.barSalesCount += metrics.barSalesCount;
    }

    return totals;
  }

  private sortRows(
    rows: GuestDashboardRow[],
    sort: NonNullable<GuestListQuery['sort']>,
    direction: NonNullable<GuestListQuery['direction']>,
  ) {
    const multiplier = direction === 'asc' ? 1 : -1;

    return [...rows].sort((first, second) => {
      const compare =
        sort === 'sessions'
          ? first.sessionsCount - second.sessionsCount
          : sort === 'lastActivity'
            ? (first.lastActivityAt ?? '').localeCompare(
                second.lastActivityAt ?? '',
              )
            : sort === 'registered'
              ? (first.insertedAt ?? '').localeCompare(second.insertedAt ?? '')
              : sort === 'rfm'
                ? first.rfm.totalScore - second.rfm.totalScore
                : sort === 'churnRisk'
                  ? first.churnRisk.score - second.churnRisk.score
                  : sort === 'ltv'
                    ? first.ltv.totalRevenue - second.ltv.totalRevenue
                    : sort === 'bonusLoad'
                      ? first.bonusLoad.currentBalance -
                        second.bonusLoad.currentBalance
                      : first.transactionAmount +
                        first.barRevenue -
                        (second.transactionAmount + second.barRevenue);

      if (compare !== 0) {
        return compare * multiplier;
      }

      const tieBreaker =
        first.transactionAmount +
        first.barRevenue -
        (second.transactionAmount + second.barRevenue);
      if (tieBreaker !== 0) {
        return tieBreaker * -1;
      }

      return first.displayName.localeCompare(second.displayName);
    });
  }

  private applyLatest(metrics: GuestMetrics, value: Date | null) {
    if (!this.isValidDate(value)) {
      return;
    }

    metrics.latestActivityAt = this.maxDate(metrics.latestActivityAt, value);
  }

  private addActivityDay(metrics: GuestMetrics, value: Date | null) {
    if (!this.isValidDate(value)) {
      return;
    }

    const day = this.toIsoDate(value);
    if (day) {
      metrics.activityDays.add(day);
    }
  }

  private applyLifetimeRevenueDate(metrics: GuestMetrics, value: Date | null) {
    if (!this.isValidDate(value)) {
      return;
    }

    const day = this.toIsoDate(value);
    if (day) {
      metrics.lifetimeRevenueDays.add(day);
    }
    metrics.lifetimeFirstRevenueAt = this.minDate(
      metrics.lifetimeFirstRevenueAt,
      value,
    );
    metrics.lifetimeLastRevenueAt = this.maxDate(
      metrics.lifetimeLastRevenueAt,
      value,
    );
  }

  private sessionActivityAt(
    startedAt: Date,
    stoppedAt: Date | null,
    durationMinutes: number | null,
    now: Date,
  ) {
    return this.effectiveSessionStoppedAt(
      startedAt,
      stoppedAt,
      durationMinutes,
      now,
    );
  }

  private sessionOverlapsPeriod(
    startedAt: Date,
    stoppedAt: Date | null,
    durationMinutes: number | null,
    periodFrom: Date,
    periodTo: Date,
    now: Date,
  ) {
    const effectiveStoppedAt = this.effectiveSessionStoppedAt(
      startedAt,
      stoppedAt,
      durationMinutes,
      now,
    );

    return startedAt <= periodTo && effectiveStoppedAt > periodFrom;
  }

  private sessionOverlapMinutes(
    startedAt: Date,
    stoppedAt: Date | null,
    durationMinutes: number | null,
    periodFrom: Date,
    periodTo: Date,
    now: Date,
  ) {
    const effectiveStoppedAt = this.effectiveSessionStoppedAt(
      startedAt,
      stoppedAt,
      durationMinutes,
      now,
    );
    const overlapFrom = startedAt > periodFrom ? startedAt : periodFrom;
    const overlapTo =
      effectiveStoppedAt < periodTo ? effectiveStoppedAt : periodTo;
    const minutes = Math.floor(
      (overlapTo.getTime() - overlapFrom.getTime()) / 60000,
    );

    return Math.max(0, minutes);
  }

  private addOverlapVisitDays(
    days: Set<string>,
    startedAt: Date,
    stoppedAt: Date | null,
    durationMinutes: number | null,
    periodFrom: Date,
    periodTo: Date,
    now: Date,
  ) {
    for (const day of this.overlapVisitDays(
      startedAt,
      stoppedAt,
      durationMinutes,
      periodFrom,
      periodTo,
      now,
    )) {
      days.add(day);
    }
  }

  private overlapVisitDays(
    startedAt: Date,
    stoppedAt: Date | null,
    durationMinutes: number | null,
    periodFrom: Date,
    periodTo: Date,
    now: Date,
  ) {
    if (
      !this.sessionOverlapsPeriod(
        startedAt,
        stoppedAt,
        durationMinutes,
        periodFrom,
        periodTo,
        now,
      )
    ) {
      return [];
    }

    const effectiveStoppedAt = this.effectiveSessionStoppedAt(
      startedAt,
      stoppedAt,
      durationMinutes,
      now,
    );
    const from = this.startOfUtcDay(
      startedAt > periodFrom ? startedAt : periodFrom,
    );
    const to = this.startOfUtcDay(
      effectiveStoppedAt < periodTo ? effectiveStoppedAt : periodTo,
    );
    const days: string[] = [];

    for (
      const cursor = new Date(from);
      cursor <= to;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      days.push(this.toIsoDate(cursor));
    }

    return days;
  }

  private effectiveSessionStoppedAt(
    startedAt: Date,
    stoppedAt: Date | null,
    durationMinutes: number | null,
    now: Date,
  ) {
    if (stoppedAt && stoppedAt >= startedAt) {
      return stoppedAt;
    }

    if (durationMinutes && durationMinutes > 0) {
      return new Date(startedAt.getTime() + durationMinutes * 60000);
    }

    return now > startedAt ? now : startedAt;
  }

  private maxDate(first: Date | null, second: Date | null) {
    if (!this.isValidDate(first)) {
      first = null;
    }
    if (!this.isValidDate(second)) {
      second = null;
    }

    if (!first) {
      return second;
    }
    if (!second) {
      return first;
    }

    return first > second ? first : second;
  }

  private minDate(first: Date | null, second: Date | null) {
    if (!this.isValidDate(first)) {
      first = null;
    }
    if (!this.isValidDate(second)) {
      second = null;
    }

    if (!first) {
      return second;
    }
    if (!second) {
      return first;
    }

    return first < second ? first : second;
  }

  private daysBetweenDates(from: Date, to: Date) {
    if (!this.isValidDate(from) || !this.isValidDate(to)) {
      return 0;
    }

    return Math.floor(
      (this.startOfUtcDay(to).getTime() - this.startOfUtcDay(from).getTime()) /
        86_400_000,
    );
  }

  private weekdayFromDate(value: Date): GuestVisitHeatmapCell['weekday'] {
    const day = value.getUTCDay();

    return (day === 0 ? 7 : day) as GuestVisitHeatmapCell['weekday'];
  }

  private resolveFlowForecastConfidence(
    baselineDays: number,
    observedDays: number,
  ): GuestFlowForecastConfidence {
    if (baselineDays >= 42 && observedDays >= 21) {
      return 'HIGH';
    }

    if (baselineDays >= 21 && observedDays >= 7) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private daysBetween(from: Date, to: Date) {
    if (!this.isValidDate(from) || !this.isValidDate(to)) {
      return [];
    }

    const days: string[] = [];
    const cursor = this.startOfUtcDay(from);
    const end = this.startOfUtcDay(to);

    while (cursor <= end) {
      days.push(this.toIsoDate(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return days;
  }

  private startOfUtcDay(value: Date) {
    if (!this.isValidDate(value)) {
      return new Date(0);
    }

    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private endpointErrorsFromProfile(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const endpointErrors = value.endpointErrors;
    if (
      !endpointErrors ||
      typeof endpointErrors !== 'object' ||
      Array.isArray(endpointErrors)
    ) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(endpointErrors).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  }

  private profileSection(value: Prisma.JsonValue, sectionName: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { total: 0, candidateFields: {}, operatorHints: [] };
    }

    const section = value[sectionName];
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      return { total: 0, candidateFields: {}, operatorHints: [] };
    }

    return {
      total:
        typeof section.total === 'number' && Number.isFinite(section.total)
          ? section.total
          : 0,
      candidateFields: this.numericRecord(section.candidateFields),
      operatorHints: this.operatorHintsFromProfile(value, sectionName),
    };
  }

  private operatorHintsFromProfile(
    value: Prisma.JsonValue,
    sectionName: string,
  ): StaffOperatorHint[] {
    if (!this.isRecord(value)) {
      return [];
    }

    const operatorHints = value.operatorHints;
    if (!this.isRecord(operatorHints)) {
      return [];
    }

    const section = operatorHints[sectionName];
    if (!this.isRecord(section)) {
      return [];
    }

    return Object.entries(section)
      .map(([operatorId, hint]) =>
        this.operatorHintFromProfileEntry(operatorId, hint),
      )
      .filter((hint): hint is StaffOperatorHint => Boolean(hint))
      .sort((first, second) => second.count - first.count)
      .slice(0, 8);
  }

  private operatorHintFromProfileEntry(
    operatorId: string,
    value: unknown,
  ): StaffOperatorHint | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const count = value.count;
    const fields = value.fields;

    return {
      operatorId,
      count: typeof count === 'number' && Number.isFinite(count) ? count : 0,
      fields: this.stringArrayRecord(fields),
    };
  }

  private stringArrayRecord(value: unknown): Record<string, string[]> {
    if (!this.isRecord(value)) {
      return {};
    }

    const result: Record<string, string[]> = {};

    for (const [key, values] of Object.entries(value)) {
      if (!Array.isArray(values)) {
        continue;
      }

      const samples = values
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 5);

      if (samples.length > 0) {
        result[key] = samples;
      }
    }

    return result;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private numericRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      ),
    );
  }

  private decimalToNumber(value: Prisma.Decimal | null) {
    if (!value) {
      return null;
    }

    try {
      const parsed = value.toNumber();

      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private toIsoDate(value: Date) {
    return this.isValidDate(value) ? value.toISOString().slice(0, 10) : '';
  }

  private toIsoDateTime(value: Date | null) {
    return this.isValidDate(value) ? value.toISOString() : null;
  }

  private round(value: number, digits: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  private isValidDate(value: Date | null | undefined): value is Date {
    return value instanceof Date && Number.isFinite(value.getTime());
  }

  private blankToNull(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeSearch(value: string | undefined) {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    return trimmed.slice(0, 80);
  }

  private searchHashes(value: string) {
    const phone = value.replace(/\D/g, '');
    const fullName = value.toLowerCase().replace(/\s+/g, ' ').trim();

    return {
      phoneHash: phone
        ? createHmac('sha256', this.piiSecret()).update(phone).digest('hex')
        : null,
      fullNameHash: fullName.includes(' ')
        ? createHmac('sha256', this.piiSecret()).update(fullName).digest('hex')
        : null,
    };
  }

  private sensitiveValue(
    value: string | null | undefined,
    type: 'phone' | 'email' | 'name',
  ) {
    const normalized = this.normalizeSensitiveValue(value, type);
    if (!normalized) {
      return { hash: null, masked: null, encrypted: null };
    }

    return {
      hash: createHmac('sha256', this.piiSecret())
        .update(normalized)
        .digest('hex'),
      masked: this.maskSensitiveValue(normalized, type),
      encrypted:
        type === 'email'
          ? null
          : this.encryptSensitiveValue(
              this.displaySensitiveValue(value, type) ?? normalized,
            ),
    };
  }

  private normalizeSensitiveValue(
    value: string | null | undefined,
    type: 'phone' | 'email' | 'name',
  ) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    if (type === 'phone') {
      const digits = trimmed.replace(/\D/g, '');
      return digits || null;
    }

    return trimmed.toLowerCase().replace(/\s+/g, ' ');
  }

  private maskSensitiveValue(value: string, type: 'phone' | 'email' | 'name') {
    if (type === 'phone') {
      return value.length <= 4 ? '****' : `***${value.slice(-4)}`;
    }

    if (type === 'email') {
      const [local, domain] = value.split('@');
      return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
    }

    return value
      .split(' ')
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}.`)
      .join(' ');
  }

  private displaySensitiveValue(
    value: string | null | undefined,
    type: 'phone' | 'email' | 'name',
  ) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    if (type === 'name') {
      return trimmed.replace(/\s+/g, ' ');
    }

    if (type === 'phone') {
      return trimmed;
    }

    return trimmed.toLowerCase();
  }

  private encryptSensitiveValue(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.piiEncryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  private guestGroupKey(domain: string | null, externalGroupId: string) {
    return `${domain ?? 'unknown'}:${externalGroupId}`;
  }

  private decryptSensitiveValue(value: string | null) {
    if (!value) {
      return null;
    }

    const parts = value.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      return null;
    }

    try {
      const [, iv, tag, encrypted] = parts;
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.piiEncryptionKey(),
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));

      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }

  private piiEncryptionKey() {
    return createHash('sha256').update(this.piiSecret()).digest();
  }

  private piiSecret() {
    const secret =
      this.configService.get<string>('APP_ENCRYPTION_KEY')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim();

    if (!secret) {
      throw new BadRequestException('APP_ENCRYPTION_KEY is not configured');
    }

    return secret;
  }
}
