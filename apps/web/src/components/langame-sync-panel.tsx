"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { LangameSettings } from "@/lib/langame-settings";

type SyncPeriod = "today" | "last7" | "last30" | "custom";

type SyncResult = {
  sources: number;
  failedSources: number;
  stores: number;
  products: number;
  inventorySnapshots: number;
  salesFacts: number;
  clubRevenueFacts: number;
  discrepancies: number;
};

type GuestSyncStatus = {
  status: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
  running: boolean;
  latestRun: GuestSyncRun | null;
  recentRuns: GuestSyncRun[];
};

type GuestSyncRun = {
  domain: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  guestsCount: number;
  sessionsCount: number;
  transactionsCount: number;
  productSalesLinked: number;
  errorMessage: string | null;
  diagnostics: {
    endpointErrors: Record<string, string>;
    guestLogs: GuestLogDiagnostics;
    pcTypesInClubs: FieldDiagnostics;
    pcTypeLinks: FieldDiagnostics;
  };
};

type GuestLogDiagnostics = {
  total: number;
  withoutGuestId: number;
  invalidDates: number;
  typeCounts: Record<string, number>;
};

type FieldDiagnostics = {
  total: number;
  fieldCounts: Record<string, number>;
  candidateFields: Record<string, number>;
};

type SyncStepStatus = "idle" | "running" | "success" | "error";

type CombinedSyncResult = {
  assortment: SyncResult | null;
  guests: GuestSyncStatus | null;
};

type LangameSyncJob = LangameSettings["syncJobs"][number];

type SourceSyncHealth = {
  id: string;
  domain: string;
  name: string;
  status: "SUCCESS" | "FAILED" | "IDLE";
  lastSyncedAt: string | null;
  errorMessage: string | null;
  latestJob: LangameSyncJob | null;
};

type EndpointUsageStatus =
  | "IN_USE"
  | "PLANNED"
  | "NEEDS_PARAMETERS"
  | "WRITE_DECISION";

type EndpointGroup =
  | "dashboard"
  | "guests"
  | "assortment"
  | "marketing"
  | "staff"
  | "service";

type EndpointMethod = "GET" | "POST";

type RouteDiagnosticsStatus = "idle" | "loading" | "success" | "error";

type ServiceDiagnosticsStatus = "idle" | "loading" | "success" | "error";

type RouteDiagnosticsSource = {
  domain: string;
  status: "SUCCESS" | "FAILED";
  routesCount: number;
  routes: {
    method: string | null;
    path: string | null;
  }[];
  errorMessage: string | null;
};

type RouteDiagnosticsResult = {
  checkedAt: string;
  sources: RouteDiagnosticsSource[];
};

type ServiceEndpointDiagnostics = {
  key: string;
  title: string;
  path: string;
  status: "SUCCESS" | "FAILED";
  rowCount: number;
  payloadKind: "array" | "object" | "scalar" | "empty";
  fieldKeys: string[];
  summary: string | null;
  errorMessage: string | null;
};

type ServiceDiagnosticsSource = {
  domain: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  endpoints: ServiceEndpointDiagnostics[];
};

type ServiceDiagnosticsResult = {
  checkedAt: string;
  sources: ServiceDiagnosticsSource[];
};

type GuestSearchField =
  | "auto"
  | "phone"
  | "email"
  | "guest_id"
  | "fio"
  | "bonus_program_number";

type GuestSearchStatus = "idle" | "loading" | "success" | "error";

type GuestSearchResultItem = {
  externalGuestId: string | null;
  guestTypeId: string | null;
  phoneMasked: string | null;
  emailMasked: string | null;
  fullNameMasked: string | null;
  bonusProgramNumberMasked: string | null;
  dateLastActivity: string | null;
  rawKeys: string[];
};

type GuestSearchDiagnosticsSource = {
  domain: string;
  status: "SUCCESS" | "FAILED";
  requestKeys: string[];
  resultsCount: number;
  results: GuestSearchResultItem[];
  errorMessage: string | null;
};

type GuestSearchDiagnosticsResult = {
  checkedAt: string;
  queryField: GuestSearchField;
  sources: GuestSearchDiagnosticsSource[];
};

type EndpointProfileKey =
  | "allOperationsLog"
  | "transactions"
  | "balances"
  | "cashTransactions"
  | "workingShifts"
  | "productExpenses"
  | "productArrivals"
  | "clubs"
  | "products"
  | "goods"
  | "pcTypesInClubs"
  | "pcTypeLinks"
  | "guests"
  | "guestDetails"
  | "guestGroups"
  | "guestBalances"
  | "guestBonusBalances"
  | "guestSessions"
  | "guestLogs"
  | "tariffsByDays"
  | "tariffsGroups"
  | "tariffsTimePeriod"
  | "tariffsTypesGroups"
  | "users";

type EndpointProfileParamMode =
  | "none"
  | "page"
  | "date_page"
  | "date"
  | "club"
  | "club_page"
  | "club_date"
  | "guest_id";

type EndpointProfileStatus = "idle" | "loading" | "success" | "error";
type EndpointSnapshotStatus = "idle" | "loading" | "success" | "error";

type EndpointProfileOption = {
  key: EndpointProfileKey;
  title: string;
  path: string;
  group: EndpointGroup;
  paramMode: EndpointProfileParamMode;
  requiredParams: string[];
  description: string;
};

type EndpointProfileDiagnosticsSource = {
  domain: string;
  status: "SUCCESS" | "FAILED";
  path: string;
  requestParams: Record<string, string>;
  rowCount: number;
  payloadKind: "array" | "object" | "scalar" | "empty";
  fieldKeys: string[];
  summary: string | null;
  errorMessage: string | null;
};

type EndpointProfileDiagnosticsResult = {
  checkedAt: string;
  endpoint: Omit<EndpointProfileOption, "description">;
  sources: EndpointProfileDiagnosticsSource[];
};

type EndpointSnapshotSource = EndpointProfileDiagnosticsSource & {
  snapshotRunId: string | null;
};

type EndpointSnapshotResult = {
  startedAt: string;
  finishedAt: string;
  endpoint: Omit<EndpointProfileOption, "description">;
  sources: EndpointSnapshotSource[];
};

type EndpointProfileHealthStatus =
  | "ready"
  | "partial"
  | "stale"
  | "failed"
  | "unchecked";

type EndpointProfileHealth = {
  endpoint: EndpointProfileOption;
  status: EndpointProfileHealthStatus;
  checkedCount: number;
  expectedCount: number;
  successCount: number;
  errorCount: number;
  latestCheckedAt: string | null;
  rowCount: number;
  nextAction: string;
};

type EndpointMapItem = {
  method: EndpointMethod;
  path: string;
  group: EndpointGroup;
  title: string;
  description: string;
  usageStatus: EndpointUsageStatus;
  freshnessSource:
    | "assortment"
    | "guests"
    | "routes"
    | "service"
    | "planned"
    | "write";
};

const guestSyncPollIntervalMs = 4000;
const guestSyncPollAttempts = 75;

const endpointGroupOrder: EndpointGroup[] = [
  "dashboard",
  "guests",
  "assortment",
  "marketing",
  "staff",
  "service",
];

const endpointGroupLabels: Record<EndpointGroup, string> = {
  dashboard: "Сводный дашборд и выручка",
  guests: "Гости, CRM и геймификация",
  assortment: "Ассортимент и склад",
  marketing: "Маркетинг и тарифы",
  staff: "Персонал и операции",
  service: "Сервисные данные",
};

const endpointStatusLabels: Record<EndpointUsageStatus, string> = {
  IN_USE: "используется",
  PLANNED: "запланирован",
  NEEDS_PARAMETERS: "нужны параметры",
  WRITE_DECISION: "write-решение",
};

const guestSearchFieldLabels: Record<GuestSearchField, string> = {
  auto: "Авто",
  phone: "Телефон",
  email: "Email",
  guest_id: "ID гостя",
  fio: "ФИО",
  bonus_program_number: "Бонусная карта",
};

const endpointProfileOptions: EndpointProfileOption[] = [
  {
    key: "allOperationsLog",
    title: "Операции и игровые списания",
    path: "/public_api/all_operations_log/list",
    group: "dashboard",
    paramMode: "date",
    requiredParams: ["dateFrom", "dateTo"],
    description: "База для сценариев выручки, пополнений и сетевой сверки.",
  },
  {
    key: "transactions",
    title: "Транзакции гостей",
    path: "/public_api/transactions/list",
    group: "dashboard",
    paramMode: "date_page",
    requiredParams: ["dateFrom", "dateTo"],
    description: "Пополнения, движения баланса и гостевой денежный слой.",
  },
  {
    key: "balances",
    title: "Состояние балансов",
    path: "/public_api/balances/list",
    group: "dashboard",
    paramMode: "page",
    requiredParams: [],
    description: "Сверка денег на балансах гостей и нераспределенных сумм.",
  },
  {
    key: "cashTransactions",
    title: "Кассовые операции",
    path: "/public_api/log_cash_transaction/list",
    group: "dashboard",
    paramMode: "club_date",
    requiredParams: ["clubId", "dateFrom", "dateTo"],
    description: "Смена, касса и операционный контроль по конкретному клубу.",
  },
  {
    key: "workingShifts",
    title: "Рабочие смены",
    path: "/public_api/working_shifts/list",
    group: "staff",
    paramMode: "date_page",
    requiredParams: ["dateFrom", "dateTo"],
    description: "Связка смен, операторов Langame и контроля администраторов.",
  },
  {
    key: "productExpenses",
    title: "Списания и продажи товаров",
    path: "/public_api/products/expense",
    group: "assortment",
    paramMode: "date_page",
    requiredParams: ["dateFrom", "dateTo"],
    description: "Бар, списания, продажи, маржа и факты для промо-наборов.",
  },
  {
    key: "productArrivals",
    title: "Приходы товаров",
    path: "/public_api/products/arrival",
    group: "assortment",
    paramMode: "page",
    requiredParams: [],
    description: "Приходы для no-sales, новинок, supplier scorecard и движения товаров.",
  },
  {
    key: "clubs",
    title: "Клубы",
    path: "/public_api/clubs/list",
    group: "assortment",
    paramMode: "none",
    requiredParams: [],
    description: "Справочник клубов и нормализация источников сети.",
  },
  {
    key: "products",
    title: "Справочник товаров",
    path: "/public_api/products/list",
    group: "assortment",
    paramMode: "page",
    requiredParams: [],
    description: "Внешний справочник номенклатуры Langame.",
  },
  {
    key: "goods",
    title: "Остатки товаров клуба",
    path: "/public_api/goods/list",
    group: "assortment",
    paramMode: "club_page",
    requiredParams: ["clubId"],
    description: "Остатки и клубные товарные позиции, нужен ID клуба.",
  },
  {
    key: "pcTypesInClubs",
    title: "Типы ПК в клубах",
    path: "/public_api/global/types_of_pc_in_clubs/list",
    group: "assortment",
    paramMode: "none",
    requiredParams: [],
    description: "Основа расчета загрузки через доступные PC-часы.",
  },
  {
    key: "pcTypeLinks",
    title: "Связи ПК с типами",
    path: "/public_api/global/linking_pc_by_type/list",
    group: "assortment",
    paramMode: "none",
    requiredParams: [],
    description: "Связь машин с типами ПК для загрузки и тарификации.",
  },
  {
    key: "guests",
    title: "Гости",
    path: "/public_api/guests/list",
    group: "guests",
    paramMode: "page",
    requiredParams: [],
    description: "Профили гостей, статусы и базовая CRM-идентичность.",
  },
  {
    key: "guestDetails",
    title: "Карточка гостя",
    path: "/public_api/guests/{guest_id}",
    group: "guests",
    paramMode: "guest_id",
    requiredParams: ["guestId"],
    description: "Точечная проверка детальной карточки гостя по ID.",
  },
  {
    key: "guestGroups",
    title: "Группы гостей",
    path: "/public_api/guests/groups",
    group: "guests",
    paramMode: "none",
    requiredParams: [],
    description: "Группы, статусы и сегменты для CRM и геймификации.",
  },
  {
    key: "guestBalances",
    title: "Балансы гостей",
    path: "/public_api/guests/balance",
    group: "guests",
    paramMode: "page",
    requiredParams: [],
    description: "Деньги на счетах гостей и риск неиспользованного депозита.",
  },
  {
    key: "guestBonusBalances",
    title: "Бонусные балансы гостей",
    path: "/public_api/guests/bonus_balance",
    group: "guests",
    paramMode: "page",
    requiredParams: [],
    description: "Бонусная нагрузка и база будущих правил наград.",
  },
  {
    key: "guestSessions",
    title: "Сессии гостей",
    path: "/public_api/guests/sessions",
    group: "guests",
    paramMode: "date_page",
    requiredParams: ["dateFrom", "dateTo"],
    description: "Визиты, длительность игры, лутбоксы и battle pass.",
  },
  {
    key: "guestLogs",
    title: "Логи гостей",
    path: "/public_api/guests/logs",
    group: "guests",
    paramMode: "date_page",
    requiredParams: ["dateFrom", "dateTo"],
    description: "События гостя для миссий, антифрода и аудита.",
  },
  {
    key: "tariffsByDays",
    title: "Тарифы по дням",
    path: "/public_api/tariffs/by_days/list",
    group: "marketing",
    paramMode: "none",
    requiredParams: [],
    description: "Дни недели и тарифные условия промо.",
  },
  {
    key: "tariffsGroups",
    title: "Группы тарифов",
    path: "/public_api/tariffs/groups/list",
    group: "marketing",
    paramMode: "none",
    requiredParams: [],
    description: "Пакеты и группы тарифов для промо-сценариев.",
  },
  {
    key: "tariffsTimePeriod",
    title: "Тарифные периоды",
    path: "/public_api/tariffs/time_period/list",
    group: "marketing",
    paramMode: "none",
    requiredParams: [],
    description: "Тихие часы, окна спроса и условия миссий.",
  },
  {
    key: "tariffsTypesGroups",
    title: "Типы тарифных групп",
    path: "/public_api/tariffs/types_groups/list",
    group: "marketing",
    paramMode: "none",
    requiredParams: [],
    description: "Типы сессий и тарифных групп для конструктора офферов.",
  },
  {
    key: "users",
    title: "Операторы Langame",
    path: "/public_api/users/list",
    group: "staff",
    paramMode: "page",
    requiredParams: [],
    description: "Внешний справочник операторов для связки со StaffMember.",
  },
];

const langameEndpointMap: EndpointMapItem[] = [
  {
    method: "GET",
    path: "/public_api/all_operations_log/list",
    group: "dashboard",
    title: "Операции и игровые списания",
    description: "База для общей выручки, онлайн-пополнений и сетевой сверки.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/transactions/list",
    group: "dashboard",
    title: "Транзакции гостей",
    description: "Пополнения, движения баланса и гостевой слой отчетности.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/balances/list",
    group: "dashboard",
    title: "Состояние балансов",
    description: "Планируемый источник для сверки денег на балансах гостей.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/log_cash_transaction/list",
    group: "dashboard",
    title: "Кассовые операции",
    description: "Операционный контроль смен и денежной дисциплины.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/working_shifts/list",
    group: "dashboard",
    title: "Рабочие смены",
    description: "Связь выручки, администраторов и сменных итогов.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/list",
    group: "guests",
    title: "Справочник гостей",
    description: "Основной read-only источник для CRM и сегментов гостей.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/{guest_id}",
    group: "guests",
    title: "Карточка гостя",
    description: "План для точечного обновления профиля, телефона и статусов.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/guests/balance",
    group: "guests",
    title: "Баланс гостя",
    description: "Деньги на балансе для CRM, рисков и будущего гостевого логина.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/bonus_balance",
    group: "guests",
    title: "Бонусный баланс",
    description: "Бонусы, промо-эффект и будущие награды миссий.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/groups",
    group: "guests",
    title: "Группы гостей",
    description: "Сегменты CRM, механики маркетинга и правила лутбоксов.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/logs",
    group: "guests",
    title: "Логи гостей",
    description: "Нужна проверка типов событий для миссий, квестов и anti-fraud.",
    usageStatus: "NEEDS_PARAMETERS",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/sessions",
    group: "guests",
    title: "Игровые сессии",
    description: "Основа для активности, стартов сессий и будущих лутбоксов.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "POST",
    path: "/public_api/guests/search",
    group: "guests",
    title: "Точечный поиск гостя",
    description: "Диагностика для ручного поиска, связки телефона и messenger-профиля.",
    usageStatus: "NEEDS_PARAMETERS",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/clubs/list",
    group: "assortment",
    title: "Клубы сети",
    description: "Справочник клубов для всех отчетов, ролей и фильтров.",
    usageStatus: "IN_USE",
    freshnessSource: "assortment",
  },
  {
    method: "GET",
    path: "/public_api/products/list",
    group: "assortment",
    title: "Товары Langame",
    description: "Справочник позиций бара и товарных отчетов.",
    usageStatus: "IN_USE",
    freshnessSource: "assortment",
  },
  {
    method: "GET",
    path: "/public_api/goods/list",
    group: "assortment",
    title: "Номенклатура",
    description: "Связь товарных карточек, себестоимости и ассортимента.",
    usageStatus: "IN_USE",
    freshnessSource: "assortment",
  },
  {
    method: "GET",
    path: "/public_api/products/expense",
    group: "assortment",
    title: "Списания и продажи",
    description: "Факты бара, списаний и расхода товаров по клубам.",
    usageStatus: "IN_USE",
    freshnessSource: "assortment",
  },
  {
    method: "GET",
    path: "/public_api/products/arrival",
    group: "assortment",
    title: "Приходы товаров",
    description: "Следующий источник для поставок, новинок и движения склада.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/global/types_of_pc_in_clubs/list",
    group: "assortment",
    title: "Типы ПК в клубах",
    description: "Карта компьютерных мест для загрузки и тарифных условий.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/global/linking_pc_by_type/list",
    group: "assortment",
    title: "Привязка ПК к типам",
    description: "Связь машин, типов ПК и игровой загрузки по клубам.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/tariffs/by_days/list",
    group: "marketing",
    title: "Тарифы по дням",
    description: "План для условий миссий, промо-наборов и battle pass.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/tariffs/groups/list",
    group: "marketing",
    title: "Группы тарифов",
    description: "Справочник тарифных сегментов для маркетинговых механик.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/tariffs/time_period/list",
    group: "marketing",
    title: "Периоды тарифов",
    description: "Тихие часы, будни, вечерние окна и условия офферов.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/tariffs/types_groups/list",
    group: "marketing",
    title: "Типы тарифных групп",
    description: "Нормализация тарифных правил для конструктора маркетинга.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/users/list",
    group: "staff",
    title: "Операторы Langame",
    description: "План для сверки администраторов, смен и действий.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "POST",
    path: "/public_api/pc/manage",
    group: "staff",
    title: "Управление ПК",
    description: "Только будущий write-контур с ролями, audit trail и dry-run.",
    usageStatus: "WRITE_DECISION",
    freshnessSource: "write",
  },
  {
    method: "GET",
    path: "/public_api/config/list",
    group: "service",
    title: "Конфигурация Langame",
    description: "Диагностика настроек источника и доступных модулей без KPI.",
    usageStatus: "IN_USE",
    freshnessSource: "service",
  },
  {
    method: "GET",
    path: "/public_api/puf/profiles/list",
    group: "service",
    title: "PUF-профили",
    description: "Диагностика профилей оборудования и различий между клубами.",
    usageStatus: "IN_USE",
    freshnessSource: "service",
  },
  {
    method: "GET",
    path: "/public_api/routes",
    group: "service",
    title: "Карта маршрутов",
    description: "Диагностика доступности Langame endpoints без раскрытия API key.",
    usageStatus: "IN_USE",
    freshnessSource: "routes",
  },
  {
    method: "GET",
    path: "/public_api/ver/get_adminconsole",
    group: "service",
    title: "Версия Admin Console",
    description: "Диагностика версии Admin Console по каждому источнику.",
    usageStatus: "IN_USE",
    freshnessSource: "service",
  },
  {
    method: "GET",
    path: "/public_api/ver/get_po",
    group: "service",
    title: "Версия ПО",
    description: "Диагностика версии ПО и совместимости источников.",
    usageStatus: "IN_USE",
    freshnessSource: "service",
  },
  {
    method: "GET",
    path: "/public_api/ver/get_terminal",
    group: "service",
    title: "Версия терминала",
    description: "Диагностика терминального контура без бизнес-расчетов.",
    usageStatus: "IN_USE",
    freshnessSource: "service",
  },
];

const syncPeriodOptions: { value: SyncPeriod; label: string; caption: string }[] = [
  {
    value: "today",
    label: "Сегодня",
    caption: "Текущие сутки",
  },
  {
    value: "last7",
    label: "7 дней",
    caption: "Оперативная сверка",
  },
  {
    value: "last30",
    label: "30 дней",
    caption: "Контроль месяца",
  },
  {
    value: "custom",
    label: "Произвольно",
    caption: "Задать даты вручную",
  },
];

function getErrorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return "Не удалось выполнить запрос";
}

export function LangameSyncPanel({
  initialSettings,
}: {
  initialSettings: LangameSettings;
}) {
  const today = getTodayInputValue();
  const [settings, setSettings] = useState(initialSettings);
  const [syncPeriod, setSyncPeriod] = useState<SyncPeriod>("last7");
  const [syncDateFrom, setSyncDateFrom] = useState(shiftDateInput(today, -6));
  const [syncDateTo, setSyncDateTo] = useState(today);
  const [includeGuestLogs, setIncludeGuestLogs] = useState(false);
  const [syncResult, setSyncResult] = useState<CombinedSyncResult | null>(null);
  const [latestGuestStatus, setLatestGuestStatus] =
    useState<GuestSyncStatus | null>(null);
  const [assortmentStatus, setAssortmentStatus] =
    useState<SyncStepStatus>("idle");
  const [guestStatus, setGuestStatus] = useState<SyncStepStatus>("idle");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [routeDiagnostics, setRouteDiagnostics] =
    useState<RouteDiagnosticsResult | null>(null);
  const [routeDiagnosticsStatus, setRouteDiagnosticsStatus] =
    useState<RouteDiagnosticsStatus>("idle");
  const [routeDiagnosticsError, setRouteDiagnosticsError] =
    useState<string | null>(null);
  const [serviceDiagnostics, setServiceDiagnostics] =
    useState<ServiceDiagnosticsResult | null>(null);
  const [serviceDiagnosticsStatus, setServiceDiagnosticsStatus] =
    useState<ServiceDiagnosticsStatus>("idle");
  const [serviceDiagnosticsError, setServiceDiagnosticsError] =
    useState<string | null>(null);
  const [guestSearchQuery, setGuestSearchQuery] = useState("");
  const [guestSearchField, setGuestSearchField] =
    useState<GuestSearchField>("auto");
  const [guestSearchResult, setGuestSearchResult] =
    useState<GuestSearchDiagnosticsResult | null>(null);
  const [guestSearchStatus, setGuestSearchStatus] =
    useState<GuestSearchStatus>("idle");
  const [guestSearchError, setGuestSearchError] = useState<string | null>(null);
  const [endpointProfileKey, setEndpointProfileKey] =
    useState<EndpointProfileKey>("transactions");
  const [endpointProfileSourceId, setEndpointProfileSourceId] = useState("");
  const [endpointProfileClubId, setEndpointProfileClubId] = useState("");
  const [endpointProfileGuestId, setEndpointProfileGuestId] = useState("");
  const [endpointProfilePage, setEndpointProfilePage] = useState("1");
  const [endpointProfilePageLimit, setEndpointProfilePageLimit] = useState("20");
  const [endpointProfileResult, setEndpointProfileResult] =
    useState<EndpointProfileDiagnosticsResult | null>(null);
  const [endpointProfileStatus, setEndpointProfileStatus] =
    useState<EndpointProfileStatus>("idle");
  const [endpointProfileError, setEndpointProfileError] =
    useState<string | null>(null);
  const [endpointSnapshotResult, setEndpointSnapshotResult] =
    useState<EndpointSnapshotResult | null>(null);
  const [endpointSnapshotStatus, setEndpointSnapshotStatus] =
    useState<EndpointSnapshotStatus>("idle");
  const [endpointSnapshotError, setEndpointSnapshotError] =
    useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadGuestStatus() {
      const status = await fetchGuestSyncStatus();

      if (!ignore) {
        setLatestGuestStatus(status);
      }
    }

    void loadGuestStatus();

    return () => {
      ignore = true;
    };
  }, []);

  function selectSyncPeriod(period: SyncPeriod) {
    setSyncPeriod(period);

    if (period === "today") {
      setSyncDateFrom(today);
      setSyncDateTo(today);
    } else if (period === "last7") {
      setSyncDateFrom(shiftDateInput(today, -6));
      setSyncDateTo(today);
    } else if (period === "last30") {
      setSyncDateFrom(shiftDateInput(today, -29));
      setSyncDateTo(today);
    }
  }

  async function syncAllLangameData() {
    setError(null);
    setSuccess(null);
    setSyncResult(null);
    setAssortmentStatus("running");
    setGuestStatus("running");
    setIsSyncing(true);

    try {
      const [assortmentResult, guestResult] = await Promise.allSettled([
        syncAssortmentData(syncDateFrom, syncDateTo),
        syncGuestFoundation(syncDateFrom, syncDateTo, includeGuestLogs),
      ]);
      const assortment =
        assortmentResult.status === "fulfilled" ? assortmentResult.value : null;
      const guests =
        guestResult.status === "fulfilled" ? guestResult.value : null;
      const result = {
        assortment,
        guests,
      };
      setSyncResult(result);
      setLatestGuestStatus(guests);

      if (!assortment) {
        setAssortmentStatus("error");
      } else {
        setAssortmentStatus(
          assortment.failedSources > 0 ? "error" : "success",
        );
      }

      if (guests?.status === "FAILED" || !guests) {
        setGuestStatus("error");
      } else {
        setGuestStatus("success");
      }

      if (!assortment || !guests) {
        const failure = [assortmentResult, guestResult].find(
          (item) => item.status === "rejected",
        );
        setError(
          failure?.status === "rejected" && failure.reason instanceof Error
            ? failure.reason.message
            : "Синхронизация завершилась не полностью. Проверьте детали ниже.",
        );
      } else if (guests.status === "FAILED") {
        setError(
          guests.latestRun?.errorMessage ??
            "Гостевая синхронизация завершилась с ошибкой.",
        );
      } else {
        setSuccess("Общая синхронизация Langame завершена.");
      }

      await refreshSettings();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "API недоступен");
      setAssortmentStatus("error");
      setGuestStatus("error");
    } finally {
      setIsSyncing(false);
    }
  }

  async function refreshSettings() {
    const response = await fetch("/api/integrations/langame/settings");

    if (response.ok) {
      setSettings((await response.json()) as LangameSettings);
    }
  }

  async function checkRouteDiagnostics() {
    setRouteDiagnosticsStatus("loading");
    setRouteDiagnosticsError(null);

    try {
      const response = await fetch(
        "/api/integrations/langame/routes-diagnostics",
        {
          cache: "no-store",
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data));
      }

      setRouteDiagnostics(data as RouteDiagnosticsResult);
      setRouteDiagnosticsStatus("success");
    } catch (routeError) {
      setRouteDiagnosticsStatus("error");
      setRouteDiagnosticsError(
        routeError instanceof Error
          ? routeError.message
          : "Не удалось проверить карту маршрутов Langame",
      );
    }
  }

  async function checkServiceDiagnostics() {
    setServiceDiagnosticsStatus("loading");
    setServiceDiagnosticsError(null);

    try {
      const response = await fetch(
        "/api/integrations/langame/service-diagnostics",
        {
          cache: "no-store",
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data));
      }

      setServiceDiagnostics(data as ServiceDiagnosticsResult);
      setServiceDiagnosticsStatus("success");
    } catch (serviceError) {
      setServiceDiagnosticsStatus("error");
      setServiceDiagnosticsError(
        serviceError instanceof Error
          ? serviceError.message
          : "Не удалось проверить сервисные endpoints Langame",
      );
    }
  }

  async function checkEndpointProfileDiagnostics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const selectedEndpoint = endpointProfileOptions.find(
      (endpoint) => endpoint.key === endpointProfileKey,
    );

    if (!selectedEndpoint) {
      setEndpointProfileError("Endpoint не найден в карте профилирования");
      setEndpointProfileStatus("error");
      return;
    }

    if (
      selectedEndpoint.requiredParams.includes("clubId") &&
      !endpointProfileClubId.trim()
    ) {
      setEndpointProfileError("Укажите ID клуба для выбранного endpoint");
      setEndpointProfileStatus("error");
      return;
    }

    if (
      selectedEndpoint.requiredParams.includes("guestId") &&
      !endpointProfileGuestId.trim()
    ) {
      setEndpointProfileError("Укажите ID гостя для выбранного endpoint");
      setEndpointProfileStatus("error");
      return;
    }

    setEndpointProfileStatus("loading");
    setEndpointProfileError(null);
    setEndpointProfileResult(null);

    try {
      const response = await fetch(
        "/api/integrations/langame/endpoint-profile-diagnostics",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpointKey: endpointProfileKey,
            sourceId: endpointProfileSourceId || undefined,
            dateFrom: syncDateFrom,
            dateTo: syncDateTo,
            clubId: endpointProfileClubId.trim() || undefined,
            guestId: endpointProfileGuestId.trim() || undefined,
            page: endpointProfilePage,
            pageLimit: endpointProfilePageLimit,
          }),
          cache: "no-store",
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data));
      }

      setEndpointProfileResult(data as EndpointProfileDiagnosticsResult);
      setEndpointProfileStatus("success");
      await refreshSettings();
    } catch (profileError) {
      setEndpointProfileStatus("error");
      setEndpointProfileError(
        profileError instanceof Error
          ? profileError.message
          : "Не удалось профилировать endpoint Langame",
      );
    }
  }

  async function runEndpointSnapshot() {
    const selectedEndpoint = endpointProfileOptions.find(
      (endpoint) => endpoint.key === endpointProfileKey,
    );

    if (!selectedEndpoint) {
      setEndpointSnapshotError("Endpoint не найден в карте snapshot");
      setEndpointSnapshotStatus("error");
      return;
    }

    if (
      selectedEndpoint.requiredParams.includes("clubId") &&
      !endpointProfileClubId.trim()
    ) {
      setEndpointSnapshotError("Укажите ID клуба для выбранного endpoint");
      setEndpointSnapshotStatus("error");
      return;
    }

    if (
      selectedEndpoint.requiredParams.includes("guestId") &&
      !endpointProfileGuestId.trim()
    ) {
      setEndpointSnapshotError("Укажите ID гостя для выбранного endpoint");
      setEndpointSnapshotStatus("error");
      return;
    }

    setEndpointSnapshotStatus("loading");
    setEndpointSnapshotError(null);
    setEndpointSnapshotResult(null);

    try {
      const response = await fetch(
        "/api/integrations/langame/endpoint-snapshot",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpointKey: endpointProfileKey,
            sourceId: endpointProfileSourceId || undefined,
            dateFrom: syncDateFrom,
            dateTo: syncDateTo,
            clubId: endpointProfileClubId.trim() || undefined,
            guestId: endpointProfileGuestId.trim() || undefined,
            page: endpointProfilePage,
            pageLimit: endpointProfilePageLimit,
          }),
          cache: "no-store",
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data));
      }

      setEndpointSnapshotResult(data as EndpointSnapshotResult);
      setEndpointSnapshotStatus("success");
      await refreshSettings();
    } catch (snapshotError) {
      setEndpointSnapshotStatus("error");
      setEndpointSnapshotError(
        snapshotError instanceof Error
          ? snapshotError.message
          : "Не удалось создать snapshot Langame endpoint",
      );
    }
  }

  async function searchGuestDiagnostics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!guestSearchQuery.trim()) {
      setGuestSearchError("Введите телефон, email, ID или ФИО гостя");
      setGuestSearchStatus("error");
      return;
    }

    setGuestSearchStatus("loading");
    setGuestSearchError(null);
    setGuestSearchResult(null);

    try {
      const response = await fetch(
        "/api/integrations/langame/guests/search-diagnostics",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: guestSearchQuery.trim(),
            field: guestSearchField,
          }),
          cache: "no-store",
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data));
      }

      setGuestSearchResult(data as GuestSearchDiagnosticsResult);
      setGuestSearchStatus("success");
    } catch (searchError) {
      setGuestSearchStatus("error");
      setGuestSearchError(
        searchError instanceof Error
          ? searchError.message
          : "Не удалось проверить guests/search",
      );
    }
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Общая синхронизация
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Все данные Langame за выбранный период
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Одна кнопка обновляет клубы, товары, остатки, продажи, общую
              выручку, гостей, сессии, пополнения баланса, покупки бара и
              служебные логи.
            </p>
          </div>

          <button
            type="button"
            onClick={syncAllLangameData}
            disabled={
              !settings.hasApiKey ||
              !syncDateFrom ||
              !syncDateTo ||
              isSyncing
            }
            className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            {isSyncing ? "Синхронизация..." : "Запустить общую синхронизацию"}
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {syncPeriodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => selectSyncPeriod(option.value)}
                className={[
                  "rounded-lg border px-4 py-3 text-left transition",
                  syncPeriod === option.value
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
                    : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-700",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs opacity-70">
                  {option.caption}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Дата начала
              </span>
              <input
                type="date"
                value={syncDateFrom}
                onChange={(event) => {
                  setSyncPeriod("custom");
                  setSyncDateFrom(event.target.value);
                }}
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Дата окончания
              </span>
              <input
                type="date"
                value={syncDateTo}
                onChange={(event) => {
                  setSyncPeriod("custom");
                  setSyncDateTo(event.target.value);
                }}
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm transition hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900">
          <input
            type="checkbox"
            checked={includeGuestLogs}
            onChange={(event) => setIncludeGuestLogs(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700"
          />
          <span>
            <span className="block font-semibold text-zinc-950 dark:text-zinc-50">
              Проверить `guests/logs` для геймификации
            </span>
            <span className="mt-1 block leading-5 text-zinc-600 dark:text-zinc-400">
              Опционально загрузит типы событий гостя за выбранный период для
              миссий, лутбоксов, battle pass и anti-fraud. Обычная
              синхронизация остается легче, если флаг выключен.
            </span>
          </span>
        </label>

        {isSyncing ? (
          <SyncProgress
            assortmentStatus={assortmentStatus}
            guestStatus={guestStatus}
            periodFrom={syncDateFrom}
            periodTo={syncDateTo}
          />
        ) : null}

        {syncResult ? <SyncResultSummary result={syncResult} /> : null}

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}
      </div>

      <SyncHealthSummary
        latestGuestStatus={latestGuestStatus}
        settings={settings}
      />
      <EndpointMapPanel
        diagnostics={routeDiagnostics}
        diagnosticsError={routeDiagnosticsError}
        diagnosticsStatus={routeDiagnosticsStatus}
        latestGuestStatus={latestGuestStatus}
        onCheckDiagnostics={checkRouteDiagnostics}
        settings={settings}
      />
      <EndpointProfileQualityOverview
        selectedProfileKey={endpointProfileKey}
        settings={settings}
        onSelectProfileKey={setEndpointProfileKey}
      />
      <EndpointProfileDiagnosticsPanel
        clubId={endpointProfileClubId}
        dateFrom={syncDateFrom}
        dateTo={syncDateTo}
        guestId={endpointProfileGuestId}
        page={endpointProfilePage}
        pageLimit={endpointProfilePageLimit}
        profileError={endpointProfileError}
        profileKey={endpointProfileKey}
        profileStatus={endpointProfileStatus}
        result={endpointProfileResult}
        settings={settings}
        snapshotError={endpointSnapshotError}
        snapshotResult={endpointSnapshotResult}
        snapshotStatus={endpointSnapshotStatus}
        sourceId={endpointProfileSourceId}
        onClubIdChange={setEndpointProfileClubId}
        onGuestIdChange={setEndpointProfileGuestId}
        onPageChange={setEndpointProfilePage}
        onPageLimitChange={setEndpointProfilePageLimit}
        onProfileKeyChange={setEndpointProfileKey}
        onSourceIdChange={setEndpointProfileSourceId}
        onSnapshot={runEndpointSnapshot}
        onSubmit={checkEndpointProfileDiagnostics}
      />
      <ServiceDiagnosticsPanel
        diagnostics={serviceDiagnostics}
        diagnosticsError={serviceDiagnosticsError}
        diagnosticsStatus={serviceDiagnosticsStatus}
        onCheckDiagnostics={checkServiceDiagnostics}
        settings={settings}
      />
      <GuestSearchDiagnosticsPanel
        field={guestSearchField}
        query={guestSearchQuery}
        result={guestSearchResult}
        searchError={guestSearchError}
        searchStatus={guestSearchStatus}
        settings={settings}
        onFieldChange={setGuestSearchField}
        onQueryChange={setGuestSearchQuery}
        onSubmit={searchGuestDiagnostics}
      />
      <LatestGuestDiagnostics status={latestGuestStatus} />
      <div className="grid gap-6 xl:grid-cols-2">
        <SyncHistory jobs={settings.syncJobs} />
        <GuestSyncHistory status={latestGuestStatus} />
      </div>
    </section>
  );
}

function SyncProgress({
  assortmentStatus,
  guestStatus,
  periodFrom,
  periodTo,
}: {
  assortmentStatus: SyncStepStatus;
  guestStatus: SyncStepStatus;
  periodFrom: string;
  periodTo: string;
}) {
  return (
    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <p className="font-medium">Синхронизация выполняется</p>
      <p className="mt-1">
        Период: {formatDateLabel(periodFrom)} - {formatDateLabel(periodTo)}.
        Дождитесь результата на этой странице.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SyncStepCard
          title="Ассортимент"
          description="Клубы, товары, остатки, продажи и выручка клубов."
          status={assortmentStatus}
        />
        <SyncStepCard
          title="Гости"
          description="Гости, сессии, транзакции, покупки бара, смены и ПК."
          status={guestStatus}
        />
      </div>
    </div>
  );
}

function SyncStepCard({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: SyncStepStatus;
}) {
  return (
    <div className="rounded-md border border-amber-200/80 bg-white/70 p-3 dark:border-amber-900/70 dark:bg-zinc-950/40">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{title}</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-zinc-900 dark:text-amber-200">
          {syncStepLabel(status)}
        </span>
      </div>
      <p className="mt-1 text-xs opacity-80">{description}</p>
    </div>
  );
}

function SyncResultSummary({ result }: { result: CombinedSyncResult }) {
  const guestRun = result.guests?.latestRun ?? null;
  const guestDiagnostics = guestRun?.diagnostics ?? null;

  return (
    <div className="mt-5 rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-sm font-semibold">Результат синхронизации</h3>
      {result.assortment ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Metric label="Источников" value={result.assortment.sources} />
          <Metric label="Ошибок" value={result.assortment.failedSources} />
          <Metric label="Клубов" value={result.assortment.stores} />
          <Metric label="Товаров" value={result.assortment.products} />
          <Metric label="Остатков" value={result.assortment.inventorySnapshots} />
          <Metric label="Продаж" value={result.assortment.salesFacts} />
          <Metric label="Выручка клубов" value={result.assortment.clubRevenueFacts} />
          <Metric label="Расхождений" value={result.assortment.discrepancies} />
        </div>
      ) : null}
      {guestRun ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Гостей" value={guestRun.guestsCount} />
          <Metric label="Сессий" value={guestRun.sessionsCount} />
          <Metric label="Транзакций" value={guestRun.transactionsCount} />
          <Metric label="Покупок бара" value={guestRun.productSalesLinked} />
        </div>
      ) : null}
      {guestDiagnostics ? (
        <PcDiagnostics diagnostics={guestDiagnostics} className="mt-4" />
      ) : null}
    </div>
  );
}

function SyncHealthSummary({
  settings,
  latestGuestStatus,
}: {
  settings: LangameSettings;
  latestGuestStatus: GuestSyncStatus | null;
}) {
  const sourceRows = getSourceSyncHealth(settings);
  const activeSourcesCount = settings.sources.filter(
    (source) => source.isActive,
  ).length;
  const failedSources = sourceRows.filter((source) => source.status === "FAILED");
  const sourcesWithoutSuccess = sourceRows.filter(
    (source) => !source.lastSyncedAt && source.status !== "FAILED",
  );
  const latestSuccess = settings.latestSuccessfulSyncJob;
  const latestSuccessTime = latestSuccess ? getSyncJobTime(latestSuccess) : null;
  const guestRun = latestGuestStatus?.latestRun ?? null;
  const guestStatus = guestRun?.status ?? latestGuestStatus?.status ?? "IDLE";
  const guestEndpointErrors = Object.entries(
    guestRun?.diagnostics.endpointErrors ?? {},
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Статус данных
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Состояние синхронизации
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            Последний успешный запуск, активные источники и видимые ошибки
            собраны в одном месте.
          </p>
        </div>
        <span className={statusBadgeClass(guestStatus)}>
          Гости: {syncStatusLabel(guestStatus)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SyncHealthMetric
          detail="активных Langame-доменов"
          label="Источники"
          value={`${activeSourcesCount}/${settings.sources.length}`}
        />
        <SyncHealthMetric
          detail={latestSuccess?.domain ?? "успешных запусков пока нет"}
          label="Последний успех"
          value={latestSuccessTime ? formatDateTime(latestSuccessTime) : "не было"}
        />
        <SyncHealthMetric
          detail={
            failedSources.length > 0
              ? failedSources.map((source) => source.domain).join(", ")
              : "критичных ошибок нет"
          }
          label="Ошибки источников"
          tone={failedSources.length > 0 ? "danger" : "neutral"}
          value={failedSources.length}
        />
        <SyncHealthMetric
          detail={
            guestRun
              ? `${formatDateTime(guestRun.startedAt)}, endpoint-ошибок: ${guestEndpointErrors.length}`
              : "гостевых запусков пока нет"
          }
          label="Гостевой слой"
          tone={statusTone(guestStatus)}
          value={syncStatusLabel(guestStatus)}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Источники Langame
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Последний запуск по каждому активному домену и последняя
                успешная дата данных.
              </p>
            </div>
            {sourcesWithoutSuccess.length > 0 ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                без успеха: {sourcesWithoutSuccess.length}
              </span>
            ) : null}
          </div>

          {sourceRows.length > 0 ? (
            <div className="mt-3 space-y-2">
              {sourceRows.map((source) => (
                <div
                  key={source.id}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-zinc-950 dark:text-zinc-50">
                        {source.name && source.name !== source.domain
                          ? `${source.name} · ${source.domain}`
                          : source.domain}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {source.lastSyncedAt
                          ? `Данные источника: ${formatDateTime(source.lastSyncedAt)}`
                          : "успешной синхронизации источника пока нет"}
                      </p>
                    </div>
                    <span className={statusBadgeClass(source.status)}>
                      {sourceStatusLabel(source.status)}
                    </span>
                  </div>
                  {source.errorMessage ? (
                    <p className="mt-2 break-words text-xs text-red-700 dark:text-red-300">
                      {compactEndpointError(source.errorMessage)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              Активные Langame-источники пока не настроены.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Гостевая синхронизация
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Последний foundation-запуск и ошибки дополнительных endpoints.
              </p>
            </div>
            <span className={statusBadgeClass(guestStatus)}>
              {syncStatusLabel(guestStatus)}
            </span>
          </div>

          {guestRun ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Последний запуск</p>
                  <p className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">
                    {formatDateTime(guestRun.startedAt)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{guestRun.domain}</p>
                </div>
                <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Endpoint-ошибки</p>
                  <p
                    className={[
                      "mt-1 font-medium",
                      guestEndpointErrors.length > 0
                        ? "text-red-700 dark:text-red-300"
                        : "text-zinc-950 dark:text-zinc-50",
                    ].join(" ")}
                  >
                    {guestEndpointErrors.length}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {guestEndpointErrors.length > 0
                      ? guestEndpointErrors
                          .map(([endpoint]) => endpoint)
                          .slice(0, 2)
                          .join(", ")
                      : "ошибок нет"}
                  </p>
                </div>
              </div>
              {guestRun.errorMessage ? (
                <p className="break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
                  {compactEndpointError(guestRun.errorMessage)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              Гостевых запусков пока не было.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EndpointMapPanel({
  settings,
  latestGuestStatus,
  diagnostics,
  diagnosticsStatus,
  diagnosticsError,
  onCheckDiagnostics,
}: {
  settings: LangameSettings;
  latestGuestStatus: GuestSyncStatus | null;
  diagnostics: RouteDiagnosticsResult | null;
  diagnosticsStatus: RouteDiagnosticsStatus;
  diagnosticsError: string | null;
  onCheckDiagnostics: () => void;
}) {
  const availableRouteKeys = getAvailableRouteKeys(diagnostics);
  const endpointsByGroup = endpointGroupOrder.map((group) => ({
    group,
    endpoints: langameEndpointMap.filter((endpoint) => endpoint.group === group),
  }));
  const inUseCount = langameEndpointMap.filter(
    (endpoint) => endpoint.usageStatus === "IN_USE",
  ).length;
  const plannedCount = langameEndpointMap.filter(
    (endpoint) =>
      endpoint.usageStatus === "PLANNED" ||
      endpoint.usageStatus === "NEEDS_PARAMETERS",
  ).length;
  const writeCount = langameEndpointMap.filter(
    (endpoint) => endpoint.usageStatus === "WRITE_DECISION",
  ).length;
  const availableCount = diagnostics
    ? langameEndpointMap.filter((endpoint) =>
        availableRouteKeys.has(routeKey(endpoint.method, endpoint.path)),
      ).length
    : null;
  const latestAssortmentJob = settings.latestSuccessfulSyncJob;
  const latestGuestRun = latestGuestStatus?.latestRun ?? null;
  const successfulDiagnosticSources =
    diagnostics?.sources.filter((source) => source.status === "SUCCESS") ?? [];
  const failedDiagnosticSources =
    diagnostics?.sources.filter((source) => source.status === "FAILED") ?? [];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Карта Langame API
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Endpoints, свежесть данных и статус включения
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Раздел показывает, какие маршруты уже используются в LeetPlus, какие
            запланированы для CRM, маркетинга, ассортимента и персонала, а какие
            требуют отдельного write-решения.
          </p>
        </div>
        <button
          type="button"
          onClick={onCheckDiagnostics}
          disabled={diagnosticsStatus === "loading" || !settings.hasApiKey}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-950 hover:bg-zinc-950 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-zinc-950 dark:disabled:border-zinc-800 dark:disabled:text-zinc-500"
        >
          {diagnosticsStatus === "loading"
            ? "Проверяем маршруты..."
            : "Проверить доступность маршрутов"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SyncHealthMetric
          detail="из подтвержденной карты Langame API"
          label="Endpoints"
          value={langameEndpointMap.length}
        />
        <SyncHealthMetric
          detail="уже входят в текущий sync-контур"
          label="Используются"
          value={inUseCount}
        />
        <SyncHealthMetric
          detail="следующие источники для развития модулей"
          label="В плане"
          value={plannedCount}
        />
        <SyncHealthMetric
          detail="требует ролей, аудита и отдельного включения"
          label="Write"
          tone="warning"
          value={writeCount}
        />
        <SyncHealthMetric
          detail={
            diagnostics
              ? `успешных источников: ${successfulDiagnosticSources.length}`
              : "нажмите проверку маршрутов"
          }
          label="Доступно"
          value={availableCount === null ? "не проверено" : availableCount}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <EndpointFreshnessCard
          detail={
            latestAssortmentJob
              ? latestAssortmentJob.domain
              : "успешного запуска пока нет"
          }
          label="Ассортимент"
          value={
            latestAssortmentJob
              ? formatDateTime(getSyncJobTime(latestAssortmentJob))
              : "не обновлялся"
          }
        />
        <EndpointFreshnessCard
          detail={
            latestGuestRun
              ? `${latestGuestRun.domain}, ${syncStatusLabel(latestGuestRun.status)}`
              : "гостевого запуска пока нет"
          }
          label="Гости и операции"
          value={
            latestGuestRun
              ? formatDateTime(latestGuestRun.finishedAt ?? latestGuestRun.startedAt)
              : "не обновлялись"
          }
        />
        <EndpointFreshnessCard
          detail={
            diagnostics
              ? `источников: ${diagnostics.sources.length}, ошибок: ${failedDiagnosticSources.length}`
              : "проверка выполняется вручную"
          }
          label="Маршруты"
          tone={failedDiagnosticSources.length > 0 ? "warning" : "neutral"}
          value={diagnostics ? formatDateTime(diagnostics.checkedAt) : "не проверялись"}
        />
      </div>

      {diagnosticsError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
          {diagnosticsError}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {endpointsByGroup.map(({ group, endpoints }) => (
          <div
            key={group}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {endpointGroupLabels[group]}
              </h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                {endpoints.length} endpoints
              </span>
            </div>

            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              {endpoints.map((endpoint) => {
                const availability = getEndpointAvailability(
                  endpoint,
                  availableRouteKeys,
                  diagnostics,
                );

                return (
                  <div
                    key={`${endpoint.method}-${endpoint.path}`}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              endpoint.method === "GET"
                                ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
                            ].join(" ")}
                          >
                            {endpoint.method}
                          </span>
                          <p className="font-medium text-zinc-950 dark:text-zinc-50">
                            {endpoint.title}
                          </p>
                        </div>
                        <p className="mt-1 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {endpoint.path}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <span className={endpointStatusBadgeClass(endpoint.usageStatus)}>
                          {endpointStatusLabels[endpoint.usageStatus]}
                        </span>
                        <span className={availabilityBadgeClass(availability)}>
                          {availabilityLabel(availability)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {endpoint.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndpointProfileQualityOverview({
  settings,
  selectedProfileKey,
  onSelectProfileKey,
}: {
  settings: LangameSettings;
  selectedProfileKey: EndpointProfileKey;
  onSelectProfileKey: (key: EndpointProfileKey) => void;
}) {
  const profiles = buildEndpointProfileHealth(settings);
  const checkedProfiles = profiles.filter(
    (profile) => profile.status !== "unchecked",
  );
  const readyProfiles = profiles.filter((profile) => profile.status === "ready");
  const staleProfiles = profiles.filter((profile) => profile.status === "stale");
  const problemProfiles = profiles.filter(
    (profile) =>
      profile.status === "partial" || profile.status === "failed",
  );
  const profilesByGroup = endpointGroupOrder
    .map((group) => ({
      group,
      profiles: profiles.filter((profile) => profile.endpoint.group === group),
    }))
    .filter(({ profiles: groupProfiles }) => groupProfiles.length > 0);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Качество данных Langame
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Production-профили endpoint
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Это сохраненные результаты ручных проверок, а не живой запрос при
            открытии страницы. Их используем как gate перед переносом endpoint
            в snapshot-джобы и бизнес-расчеты.
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          профиль: {checkedProfiles.length}/{profiles.length}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SyncHealthMetric
          detail="endpoint с сохраненным production-профилем"
          label="Проверено"
          value={checkedProfiles.length}
        />
        <SyncHealthMetric
          detail="все активные источники успешны и профиль свежий"
          label="Готово к snapshot"
          value={readyProfiles.length}
        />
        <SyncHealthMetric
          detail="профиль старше 24 часов, нужна перепроверка"
          label="Устарело"
          tone={staleProfiles.length > 0 ? "warning" : "neutral"}
          value={staleProfiles.length}
        />
        <SyncHealthMetric
          detail="есть ошибки или проверены не все активные источники"
          label="Проблемы"
          tone={problemProfiles.length > 0 ? "danger" : "neutral"}
          value={problemProfiles.length}
        />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {profilesByGroup.map(({ group, profiles: groupProfiles }) => (
          <div
            key={group}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {endpointGroupLabels[group]}
              </h3>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {groupProfiles.filter((profile) => profile.status !== "unchecked").length}/
                {groupProfiles.length}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {groupProfiles.map((profile) => {
                const isSelected = profile.endpoint.key === selectedProfileKey;

                return (
                  <button
                    key={profile.endpoint.key}
                    type="button"
                    onClick={() => onSelectProfileKey(profile.endpoint.key)}
                    className={[
                      "w-full rounded-md border px-3 py-2 text-left text-sm transition",
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 dark:border-emerald-500/80 dark:bg-emerald-950/30"
                        : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-zinc-950 dark:text-zinc-50">
                          {profile.endpoint.title}
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {profile.endpoint.path}
                        </p>
                      </div>
                      <span className={endpointProfileHealthBadgeClass(profile.status)}>
                        {endpointProfileHealthLabel(profile.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {endpointProfileHealthDetail(profile)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      {profile.nextAction}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndpointProfileDiagnosticsPanel({
  settings,
  profileKey,
  sourceId,
  clubId,
  guestId,
  page,
  pageLimit,
  dateFrom,
  dateTo,
  result,
  snapshotResult,
  profileStatus,
  snapshotStatus,
  profileError,
  snapshotError,
  onProfileKeyChange,
  onSourceIdChange,
  onClubIdChange,
  onGuestIdChange,
  onPageChange,
  onPageLimitChange,
  onSubmit,
  onSnapshot,
}: {
  settings: LangameSettings;
  profileKey: EndpointProfileKey;
  sourceId: string;
  clubId: string;
  guestId: string;
  page: string;
  pageLimit: string;
  dateFrom: string;
  dateTo: string;
  result: EndpointProfileDiagnosticsResult | null;
  snapshotResult: EndpointSnapshotResult | null;
  profileStatus: EndpointProfileStatus;
  snapshotStatus: EndpointSnapshotStatus;
  profileError: string | null;
  snapshotError: string | null;
  onProfileKeyChange: (key: EndpointProfileKey) => void;
  onSourceIdChange: (sourceId: string) => void;
  onClubIdChange: (clubId: string) => void;
  onGuestIdChange: (guestId: string) => void;
  onPageChange: (page: string) => void;
  onPageLimitChange: (pageLimit: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSnapshot: () => void;
}) {
  const selectedEndpoint =
    endpointProfileOptions.find((endpoint) => endpoint.key === profileKey) ??
    endpointProfileOptions[0];
  const activeSources = settings.sources.filter((source) => source.isActive);
  const needsClubId = selectedEndpoint.requiredParams.includes("clubId");
  const needsGuestId = selectedEndpoint.requiredParams.includes("guestId");
  const usesDate =
    selectedEndpoint.paramMode === "date" ||
    selectedEndpoint.paramMode === "date_page" ||
    selectedEndpoint.paramMode === "club_date";
  const usesPage =
    selectedEndpoint.paramMode === "page" ||
    selectedEndpoint.paramMode === "date_page" ||
    selectedEndpoint.paramMode === "club_page";
  const failedSources =
    result?.sources.filter((source) => source.status === "FAILED") ?? [];
  const successfulSources =
    result?.sources.filter((source) => source.status === "SUCCESS") ?? [];
  const latestProfiles = (settings.endpointProfiles ?? []).filter(
    (profile) => profile.endpointKey === selectedEndpoint.key,
  );
  const latestSnapshots = (settings.endpointSnapshots ?? []).filter(
    (snapshot) => snapshot.endpointKey === selectedEndpoint.key,
  );
  const selectedCandidate = (settings.endpointSnapshotCandidates ?? []).find(
    (candidate) => candidate.endpointKey === selectedEndpoint.key,
  );
  const canRunSnapshot =
    selectedCandidate?.status === "READY" &&
    snapshotStatus !== "loading" &&
    settings.hasApiKey &&
    (!needsClubId || Boolean(clubId.trim())) &&
    (!needsGuestId || Boolean(guestId.trim()));

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Профилирование данных
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Ручная проверка GET endpoint перед включением в расчеты
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Проверка запускается только по кнопке: один выбранный endpoint,
            ограниченная страница данных, реальные параметры, поля ответа,
            пустые ответы и ошибки по каждому активному источнику.
          </p>
        </div>
        {result ? (
          <span
            className={[
              "rounded-full px-2.5 py-1 text-xs font-medium",
              failedSources.length > 0
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
            ].join(" ")}
          >
            {successfulSources.length} OK, ошибок {failedSources.length}
          </span>
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)_repeat(4,minmax(7rem,0.45fr))_auto]"
      >
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Endpoint
          </span>
          <select
            value={profileKey}
            onChange={(event) =>
              onProfileKeyChange(event.target.value as EndpointProfileKey)
            }
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {endpointProfileOptions.map((endpoint) => (
              <option key={endpoint.key} value={endpoint.key}>
                {endpointGroupLabels[endpoint.group]} - {endpoint.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Источник
          </span>
          <select
            value={sourceId}
            onChange={(event) => onSourceIdChange(event.target.value)}
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Все источники</option>
            {activeSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.domain}
              </option>
            ))}
          </select>
        </label>

        {usesPage ? (
          <>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Стр.
              </span>
              <input
                value={page}
                onChange={(event) => onPageChange(event.target.value)}
                inputMode="numeric"
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Лимит
              </span>
              <input
                value={pageLimit}
                onChange={(event) => onPageLimitChange(event.target.value)}
                inputMode="numeric"
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </>
        ) : (
          <div className="hidden xl:block" />
        )}

        {needsClubId ? (
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Club ID
            </span>
            <input
              value={clubId}
              onChange={(event) => onClubIdChange(event.target.value)}
              inputMode="numeric"
              placeholder="Напр. 1"
              className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        ) : (
          <div className="hidden xl:block" />
        )}

        {needsGuestId ? (
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Guest ID
            </span>
            <input
              value={guestId}
              onChange={(event) => onGuestIdChange(event.target.value)}
              inputMode="numeric"
              placeholder="ID"
              className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        ) : (
          <div className="hidden xl:block" />
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={
              profileStatus === "loading" ||
              !settings.hasApiKey ||
              (needsClubId && !clubId.trim()) ||
              (needsGuestId && !guestId.trim())
            }
            className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            {profileStatus === "loading" ? "Проверяем..." : "Профилировать"}
          </button>
          <button
            type="button"
            disabled={!canRunSnapshot}
            onClick={onSnapshot}
            className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-emerald-500 dark:hover:text-emerald-300 dark:disabled:border-zinc-800 dark:disabled:text-zinc-600"
          >
            {snapshotStatus === "loading" ? "Snapshot..." : "Создать snapshot"}
          </button>
        </div>
      </form>

      <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">
          {selectedEndpoint.title}
        </span>{" "}
        <span className="font-mono">{selectedEndpoint.path}</span>.{" "}
        {selectedEndpoint.description}{" "}
        {usesDate
          ? `Период берется из общей формы синхронизации: ${formatDateLabel(dateFrom)} - ${formatDateLabel(dateTo)}.`
          : "Период для этого endpoint не нужен."}
        <span className="mt-1 block font-medium text-zinc-700 dark:text-zinc-200">
          Snapshot gate:{" "}
          {selectedCandidate
            ? `${endpointSnapshotCandidateStatusLabel(selectedCandidate.status)}. ${selectedCandidate.nextAction}`
            : "сначала нужен сохраненный production-профиль."}
        </span>
      </div>

      <LatestEndpointProfiles
        profiles={latestProfiles}
        snapshots={latestSnapshots}
        selectedEndpoint={selectedEndpoint}
      />

      {profileError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
          {profileError}
        </p>
      ) : null}

      {snapshotError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
          {snapshotError}
        </p>
      ) : null}

      {snapshotResult ? (
        <EndpointSnapshotResultSummary result={snapshotResult} />
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Проверено: {formatDateTime(result.checkedAt)}</span>
            <span>{result.endpoint.title}</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            {result.sources.map((source) => (
              <div
                key={source.domain}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      {source.domain}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {source.path}
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      source.status === "SUCCESS"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200",
                    ].join(" ")}
                  >
                    {source.status === "SUCCESS" ? "успех" : "ошибка"}
                  </span>
                </div>

                {Object.keys(source.requestParams).length > 0 ? (
                  <p className="mt-3 break-words rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    {Object.entries(source.requestParams)
                      .map(([key, value]) => `${key}=${value}`)
                      .join("&")}
                  </p>
                ) : (
                  <p className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    Query-параметры не отправлялись.
                  </p>
                )}

                {source.errorMessage ? (
                  <p className="mt-3 break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
                    {compactEndpointError(source.errorMessage)}
                  </p>
                ) : (
                  <div className="mt-3 space-y-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-2 py-1 dark:bg-zinc-950">
                        {source.payloadKind}
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 dark:bg-zinc-950">
                        строк: {source.rowCount}
                      </span>
                      {source.summary ? (
                        <span className="rounded-full bg-white px-2 py-1 dark:bg-zinc-950">
                          {source.summary}
                        </span>
                      ) : null}
                    </div>
                    {source.fieldKeys.length > 0 ? (
                      <p className="leading-5">
                        Поля: {source.fieldKeys.slice(0, 18).join(", ")}
                        {source.fieldKeys.length > 18 ? "..." : ""}
                      </p>
                    ) : (
                      <p>Поля не обнаружены или endpoint вернул пустой/scalar ответ.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LatestEndpointProfiles({
  profiles,
  snapshots,
  selectedEndpoint,
}: {
  profiles: LangameSettings["endpointProfiles"];
  snapshots: LangameSettings["endpointSnapshots"];
  selectedEndpoint: EndpointProfileOption;
}) {
  if (profiles.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-zinc-300 px-3 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        Для {selectedEndpoint.title} сохраненных production-профилей пока нет.
        Запустите ручную проверку, чтобы зафиксировать свежесть и качество
        данных перед подключением к расчетам.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Последние сохраненные профили и snapshot
        </p>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          профили: {profiles.length}, snapshot: {snapshots.length}
        </span>
      </div>
      {snapshots.length > 0 ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                    Snapshot: {snapshot.domain}
                  </p>
                  <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                    {formatDateTime(snapshot.finishedAt ?? snapshot.startedAt)}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    snapshot.status === "SUCCESS"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100"
                      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200",
                  ].join(" ")}
                >
                  {snapshot.status === "SUCCESS" ? "готов" : "ошибка"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-zinc-600 dark:text-zinc-300">
                <span className="rounded-full bg-white px-2 py-1 dark:bg-zinc-950">
                  строк: {snapshot.rowCount}
                </span>
                {snapshot.payloadKind ? (
                  <span className="rounded-full bg-white px-2 py-1 dark:bg-zinc-950">
                    {snapshot.payloadKind}
                  </span>
                ) : null}
              </div>
              {snapshot.summary ? (
                <p className="mt-2 leading-5 text-zinc-500 dark:text-zinc-400">
                  {snapshot.summary}
                </p>
              ) : null}
              {snapshot.errorMessage ? (
                <p className="mt-2 break-words text-red-600 dark:text-red-300">
                  {compactEndpointError(snapshot.errorMessage)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-zinc-300 px-3 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Snapshot для {selectedEndpoint.title} еще не создавался. После
          успешного gate можно вручную сохранить подготовленный запуск.
        </div>
      )}
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="rounded-md border border-zinc-200 bg-white px-3 py-3 text-xs dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {profile.domain}
                </p>
                <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                  {formatDateTime(profile.checkedAt)}
                </p>
              </div>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  profile.status === "SUCCESS"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200",
                ].join(" ")}
              >
                {profile.status === "SUCCESS" ? "OK" : "ошибка"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-zinc-500 dark:text-zinc-400">
              <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-900">
                строк: {profile.rowCount}
              </span>
              {profile.payloadKind ? (
                <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-900">
                  {profile.payloadKind}
                </span>
              ) : null}
            </div>
            {profile.fieldKeys.length > 0 ? (
              <p className="mt-2 leading-5 text-zinc-500 dark:text-zinc-400">
                Поля: {profile.fieldKeys.slice(0, 10).join(", ")}
                {profile.fieldKeys.length > 10 ? "..." : ""}
              </p>
            ) : null}
            {profile.errorMessage ? (
              <p className="mt-2 break-words text-red-600 dark:text-red-300">
                {compactEndpointError(profile.errorMessage)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function EndpointSnapshotResultSummary({
  result,
}: {
  result: EndpointSnapshotResult;
}) {
  const failedSources = result.sources.filter(
    (source) => source.status === "FAILED",
  );
  const successfulSources = result.sources.filter(
    (source) => source.status === "SUCCESS",
  );

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Snapshot создан: {result.endpoint.title}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {formatDateTime(result.finishedAt)}. Успешно:{" "}
            {successfulSources.length}, ошибок: {failedSources.length}
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-zinc-950 dark:text-emerald-200">
          ручной запуск
        </span>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        {result.sources.map((source) => (
          <div
            key={`${source.domain}-${source.snapshotRunId ?? source.status}`}
            className="rounded-md border border-white bg-white px-3 py-3 text-xs dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {source.domain}
                </p>
                <p className="mt-1 break-all font-mono text-zinc-500 dark:text-zinc-400">
                  {source.path}
                </p>
              </div>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  source.status === "SUCCESS"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200",
                ].join(" ")}
              >
                {source.status === "SUCCESS" ? "готов" : "ошибка"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-zinc-500 dark:text-zinc-400">
              <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-900">
                строк: {source.rowCount}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-900">
                {source.payloadKind}
              </span>
            </div>
            {source.summary ? (
              <p className="mt-2 leading-5 text-zinc-500 dark:text-zinc-400">
                {source.summary}
              </p>
            ) : null}
            {source.errorMessage ? (
              <p className="mt-2 break-words text-red-600 dark:text-red-300">
                {compactEndpointError(source.errorMessage)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceDiagnosticsPanel({
  settings,
  diagnostics,
  diagnosticsStatus,
  diagnosticsError,
  onCheckDiagnostics,
}: {
  settings: LangameSettings;
  diagnostics: ServiceDiagnosticsResult | null;
  diagnosticsStatus: ServiceDiagnosticsStatus;
  diagnosticsError: string | null;
  onCheckDiagnostics: () => void;
}) {
  const sources = diagnostics?.sources ?? [];
  const successfulSources = sources.filter((source) => source.status === "SUCCESS");
  const partialSources = sources.filter((source) => source.status === "PARTIAL");
  const failedSources = sources.filter((source) => source.status === "FAILED");
  const endpoints = sources.flatMap((source) => source.endpoints);
  const successfulEndpoints = endpoints.filter(
    (endpoint) => endpoint.status === "SUCCESS",
  );
  const failedEndpoints = endpoints.filter(
    (endpoint) => endpoint.status === "FAILED",
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Сервисная диагностика
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Конфигурация, PUF-профили и версии Langame
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Ручная проверка сервисного окружения по активным источникам. Эти
            данные помогают увидеть расхождения версий и модулей, но не
            попадают в расчеты выручки, гостей, ассортимента или персонала.
          </p>
        </div>
        <button
          type="button"
          onClick={onCheckDiagnostics}
          disabled={diagnosticsStatus === "loading" || !settings.hasApiKey}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-950 hover:bg-zinc-950 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-zinc-950 dark:disabled:border-zinc-800 dark:disabled:text-zinc-500"
        >
          {diagnosticsStatus === "loading"
            ? "Проверяем сервис..."
            : "Проверить сервисные endpoints"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SyncHealthMetric
          detail="config, PUF и версии"
          label="Endpoints"
          value={diagnostics ? successfulEndpoints.length + failedEndpoints.length : 5}
        />
        <SyncHealthMetric
          detail="ответили без ошибок"
          label="Успешно"
          value={diagnostics ? successfulEndpoints.length : "не проверено"}
        />
        <SyncHealthMetric
          detail="нужна проверка источника или прав"
          label="Ошибки"
          tone={failedEndpoints.length > 0 ? "warning" : "neutral"}
          value={diagnostics ? failedEndpoints.length : "не проверено"}
        />
        <SyncHealthMetric
          detail={
            diagnostics
              ? `${successfulSources.length} OK, ${partialSources.length} частично, ${failedSources.length} ошибок`
              : "проверка выполняется вручную"
          }
          label="Источники"
          tone={failedSources.length > 0 || partialSources.length > 0 ? "warning" : "neutral"}
          value={diagnostics ? sources.length : settings.sources.length}
        />
      </div>

      {diagnostics ? (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Последняя проверка: {formatDateTime(diagnostics.checkedAt)}
        </p>
      ) : null}

      {diagnosticsError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
          {diagnosticsError}
        </p>
      ) : null}

      {diagnostics ? (
        <div className="mt-4 space-y-3">
          {sources.map((source) => (
            <div
              key={source.domain}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {source.domain}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Сервисные данные показываются отдельно от бизнес-KPI.
                  </p>
                </div>
                <span className={serviceSourceStatusClass(source.status)}>
                  {serviceSourceStatusLabel(source.status)}
                </span>
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {source.endpoints.map((endpoint) => (
                  <div
                    key={`${source.domain}-${endpoint.key}`}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-zinc-950 dark:text-zinc-50">
                          {endpoint.title}
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {endpoint.path}
                        </p>
                      </div>
                      <span
                        className={
                          endpoint.status === "SUCCESS"
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                            : "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-200"
                        }
                      >
                        {endpoint.status === "SUCCESS" ? "OK" : "Ошибка"}
                      </span>
                    </div>

                    {endpoint.status === "SUCCESS" ? (
                      <div className="mt-3 grid gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-900">
                            {endpoint.payloadKind}
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-900">
                            строк: {endpoint.rowCount}
                          </span>
                          {endpoint.summary ? (
                            <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-900">
                              {endpoint.summary}
                            </span>
                          ) : null}
                        </div>
                        {endpoint.fieldKeys.length > 0 ? (
                          <p className="leading-5">
                            Поля: {endpoint.fieldKeys.slice(0, 12).join(", ")}
                            {endpoint.fieldKeys.length > 12 ? "..." : ""}
                          </p>
                        ) : (
                          <p>Поля не обнаружены или endpoint вернул scalar.</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs leading-5 text-red-600 dark:text-red-300">
                        {endpoint.errorMessage ?? "Endpoint не ответил"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GuestSearchDiagnosticsPanel({
  settings,
  query,
  field,
  result,
  searchStatus,
  searchError,
  onQueryChange,
  onFieldChange,
  onSubmit,
}: {
  settings: LangameSettings;
  query: string;
  field: GuestSearchField;
  result: GuestSearchDiagnosticsResult | null;
  searchStatus: GuestSearchStatus;
  searchError: string | null;
  onQueryChange: (query: string) => void;
  onFieldChange: (field: GuestSearchField) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const failedSources =
    result?.sources.filter((source) => source.status === "FAILED") ?? [];
  const successfulSources =
    result?.sources.filter((source) => source.status === "SUCCESS") ?? [];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Точечный поиск гостя
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Диагностика `POST /guests/search`
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Проверьте один телефон, email, ID, ФИО или бонусную карту по
            активным Langame-источникам. LeetPlus не сохраняет результат и
            показывает только маскированные персональные данные.
          </p>
        </div>
        {result ? (
          <span
            className={[
              "rounded-full px-2.5 py-1 text-xs font-medium",
              failedSources.length > 0
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
            ].join(" ")}
          >
            {successfulSources.length} источников, ошибок {failedSources.length}
          </span>
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr_auto]"
      >
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Тип поиска
          </span>
          <select
            value={field}
            onChange={(event) =>
              onFieldChange(event.target.value as GuestSearchField)
            }
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {Object.entries(guestSearchFieldLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Значение
          </span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Телефон, email, ID, ФИО или бонусная карта"
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          disabled={
            searchStatus === "loading" || !settings.hasApiKey || !query.trim()
          }
          className="mt-6 rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
        >
          {searchStatus === "loading" ? "Ищем..." : "Проверить"}
        </button>
      </form>

      <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        Сценарий нужен для будущей привязки гостя к Telegram/MAX, ручного
        сопоставления CRM-лида и гостевого логина по телефону. Это не массовая
        синхронизация и не write-действие в Langame.
      </div>

      {searchError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
          {searchError}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Проверено: {formatDateTime(result.checkedAt)}</span>
            <span>Поле: {guestSearchFieldLabels[result.queryField]}</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            {result.sources.map((source) => (
              <div
                key={source.domain}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      {source.domain}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      payload: {source.requestKeys.join(", ")}
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      source.status === "SUCCESS"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200",
                    ].join(" ")}
                  >
                    {source.status === "SUCCESS" ? "успех" : "ошибка"}
                  </span>
                </div>

                {source.errorMessage ? (
                  <p className="mt-3 break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
                    {compactEndpointError(source.errorMessage)}
                  </p>
                ) : source.results.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {source.results.map((guest, index) => (
                      <div
                        key={`${source.domain}-${guest.externalGuestId ?? index}`}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-zinc-950 dark:text-zinc-50">
                            ID {guest.externalGuestId ?? "не указан"}
                          </p>
                          <span className="text-xs text-zinc-500">
                            {guest.dateLastActivity ?? "активность неизвестна"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                          {[
                            guest.fullNameMasked,
                            guest.phoneMasked,
                            guest.emailMasked,
                            guest.bonusProgramNumberMasked
                              ? `карта ${guest.bonusProgramNumberMasked}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "персональные поля не вернулись"}
                        </p>
                      </div>
                    ))}
                    {source.resultsCount > source.results.length ? (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Показано {source.results.length} из{" "}
                        {source.resultsCount} строк.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    Совпадений нет или Langame вернул другой формат ответа.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LatestGuestDiagnostics({
  status,
}: {
  status: GuestSyncStatus | null;
}) {
  const latestRun = status?.latestRun;

  if (!latestRun) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">
            Диагностика гостевой синхронизации
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Последний запуск: {latestRun.domain}, {formatDateTime(latestRun.startedAt)}.
          </p>
        </div>
        <span
          className={[
            "rounded-full px-2.5 py-1 text-xs font-medium",
            latestRun.status === "SUCCESS"
              ? "bg-emerald-50 text-emerald-700"
              : latestRun.status === "FAILED"
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-700",
          ].join(" ")}
        >
          {syncStatusLabel(latestRun.status)}
        </span>
      </div>
      <PcDiagnostics diagnostics={latestRun.diagnostics} className="mt-4" />
    </div>
  );
}

function PcDiagnostics({
  diagnostics,
  className = "",
}: {
  diagnostics: NonNullable<GuestSyncStatus["latestRun"]>["diagnostics"];
  className?: string;
}) {
  const endpointErrors = Object.entries(diagnostics.endpointErrors);
  const pcTypeFields = Object.keys(diagnostics.pcTypesInClubs.fieldCounts);
  const pcLinkFields = Object.keys(diagnostics.pcTypeLinks.fieldCounts);
  const guestLogTypes = formatTypeCounts(diagnostics.guestLogs.typeCounts);

  return (
    <div className={className}>
      <div className="grid gap-3 md:grid-cols-4">
        <DiagnosticCard
          title="Типы ПК в клубах"
          value={diagnostics.pcTypesInClubs.total}
          details={
            pcTypeFields.length > 0
              ? pcTypeFields.slice(0, 6).join(", ")
              : "полей нет"
          }
        />
        <DiagnosticCard
          title="Связи ПК с типами"
          value={diagnostics.pcTypeLinks.total}
          details={
            pcLinkFields.length > 0
              ? pcLinkFields.slice(0, 6).join(", ")
              : "полей нет"
          }
        />
        <DiagnosticCard
          title="Логи гостей"
          value={diagnostics.guestLogs.total}
          details={
            guestLogTypes.length > 0
              ? guestLogTypes
              : "выключены или событий нет"
          }
          tone={
            diagnostics.guestLogs.invalidDates > 0 ||
            diagnostics.guestLogs.withoutGuestId > 0
              ? "danger"
              : "neutral"
          }
        />
        <DiagnosticCard
          title="Ошибки endpoints"
          value={endpointErrors.length}
          details={
            endpointErrors.length > 0
              ? endpointErrors.map(([key]) => key).slice(0, 3).join(", ")
              : "ошибок нет"
          }
          tone={endpointErrors.length > 0 ? "danger" : "neutral"}
        />
      </div>
      {endpointErrors.length > 0 ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
          <p className="font-semibold">Детали endpoint-ошибок</p>
          <div className="mt-2 space-y-2">
            {endpointErrors.slice(0, 5).map(([endpoint, message]) => (
              <div
                key={endpoint}
                className="grid gap-1 sm:grid-cols-[11rem_minmax(0,1fr)]"
              >
                <span className="font-semibold text-red-900 dark:text-red-50">
                  {endpoint}
                </span>
                <span className="break-words text-red-800/90 dark:text-red-100/80">
                  {compactEndpointError(message)}
                </span>
              </div>
            ))}
          </div>
          {endpointErrors.length > 5 ? (
            <p className="mt-2 text-red-800/80 dark:text-red-100/70">
              Показаны первые 5 ошибок из {endpointErrors.length}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatTypeCounts(typeCounts: Record<string, number>) {
  return Object.entries(typeCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([type, count]) => `${type}: ${count}`)
    .join(", ");
}

function compactEndpointError(message: string) {
  return message.length > 360 ? `${message.slice(0, 360)}...` : message;
}

function DiagnosticCard({
  title,
  value,
  details,
  tone = "neutral",
}: {
  title: string;
  value: number;
  details: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={[
        "rounded-md border bg-white px-3 py-2 dark:bg-zinc-950",
        tone === "danger"
          ? "border-red-200 dark:border-red-900/70"
          : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-zinc-500" title={details}>
        {details}
      </p>
    </div>
  );
}

function SyncHistory({ jobs }: { jobs: LangameSettings["syncJobs"] }) {
  const latestJobs = getLatestSyncJobsByDomain(jobs);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">История синхронизаций</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Последние запуски товарной части Langame и файлы расхождений.
        </p>
      </div>

      {latestJobs.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {latestJobs.map((job) => (
            <div key={job.id} className="px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-950 dark:text-zinc-50">
                    {job.domain}
                  </p>
                  <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                    {formatDateTime(job.startedAt)}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    job.status === "SUCCESS"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700",
                  ].join(" ")}
                >
                  {job.status === "SUCCESS" ? "Успешно" : "Ошибка"}
                </span>
              </div>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                {job.errorMessage ??
                  `Клубов: ${job.storesCount}, товаров: ${job.productsCount}, остатков: ${job.inventoryCount}, продаж: ${job.salesCount}, расхождений: ${job.discrepancyCount}`}
              </p>
              {job.hasDiscrepancyLog ? (
                <a
                  href={`/api/integrations/langame/sync-jobs/${job.id}/discrepancy-log`}
                  className="mt-2 inline-flex text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                >
                  Скачать файл расхождений
                </a>
              ) : null}
            </div>
          ))}
          {jobs.length > latestJobs.length ? (
            <p className="px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400">
              Показан последний запуск по каждому источнику. Повторные ошибки
              по тем же доменам скрыты, чтобы история не дублировалась.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Синхронизаций пока не было.
        </p>
      )}
    </div>
  );
}

function GuestSyncHistory({ status }: { status: GuestSyncStatus | null }) {
  const runs = status?.recentRuns ?? [];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">
          История гостевой синхронизации
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Последние foundation-runs по источникам: гости, сессии, транзакции и
          ошибки endpoints.
        </p>
      </div>

      {runs.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {runs.map((run) => {
            const endpointErrorCount = Object.keys(
              run.diagnostics.endpointErrors,
            ).length;

            return (
              <div
                key={`${run.domain}-${run.startedAt}`}
                className="px-5 py-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      {run.domain}
                    </p>
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                      {formatDateTime(run.startedAt)}
                      {run.dateFrom && run.dateTo
                        ? ` · период ${formatDateLabel(run.dateFrom)} - ${formatDateLabel(run.dateTo)}`
                        : ""}
                    </p>
                  </div>
                  <span className={statusBadgeClass(run.status)}>
                    {syncStatusLabel(run.status)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <CompactRunMetric label="Гостей" value={run.guestsCount} />
                  <CompactRunMetric label="Сессий" value={run.sessionsCount} />
                  <CompactRunMetric
                    label="Транзакций"
                    value={run.transactionsCount}
                  />
                  <CompactRunMetric
                    label="Ошибок endpoints"
                    tone={endpointErrorCount > 0 ? "danger" : "neutral"}
                    value={endpointErrorCount}
                  />
                </div>

                {run.errorMessage ? (
                  <p className="mt-3 break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
                    {compactEndpointError(run.errorMessage)}
                  </p>
                ) : endpointErrorCount > 0 ? (
                  <p className="mt-3 truncate text-xs text-amber-700 dark:text-amber-300">
                    Endpoint-ошибки:{" "}
                    {Object.keys(run.diagnostics.endpointErrors)
                      .slice(0, 3)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          История гостевой синхронизации пока не загружена.
        </p>
      )}
    </div>
  );
}

type EndpointAvailability = "available" | "missing" | "unchecked";

function EndpointFreshnessCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={[
        "rounded-md border bg-zinc-50 px-3 py-3 text-sm dark:bg-zinc-900/50",
        tone === "warning"
          ? "border-amber-200 dark:border-amber-900/70"
          : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function buildEndpointProfileHealth(
  settings: LangameSettings,
): EndpointProfileHealth[] {
  const candidatesByKey = new Map(
    (settings.endpointSnapshotCandidates ?? []).map((candidate) => [
      candidate.endpointKey,
      candidate,
    ]),
  );
  const activeSourceCount = settings.sources.filter(
    (source) => source.isActive,
  ).length;

  return endpointProfileOptions.map((endpoint) => {
    const candidate = candidatesByKey.get(endpoint.key);
    const checkedCount = candidate?.checkedSourcesCount ?? 0;
    const expectedCount = Math.max(
      candidate?.activeSourcesCount ?? activeSourceCount,
      checkedCount,
    );

    return {
      endpoint,
      status: mapEndpointSnapshotCandidateStatus(candidate?.status),
      checkedCount,
      expectedCount,
      successCount: candidate?.successfulSourcesCount ?? 0,
      errorCount: candidate?.failedSourcesCount ?? 0,
      latestCheckedAt: candidate?.latestCheckedAt ?? null,
      rowCount: candidate?.rowCount ?? 0,
      nextAction:
        candidate?.nextAction ??
        "Запустить ручное профилирование endpoint в /sync.",
    };
  });
}

function mapEndpointSnapshotCandidateStatus(
  status?: LangameSettings["endpointSnapshotCandidates"][number]["status"],
): EndpointProfileHealthStatus {
  if (status === "READY") {
    return "ready";
  }

  if (status === "PARTIAL") {
    return "partial";
  }

  if (status === "STALE") {
    return "stale";
  }

  if (status === "FAILED") {
    return "failed";
  }

  return "unchecked";
}

function endpointSnapshotCandidateStatusLabel(
  status: LangameSettings["endpointSnapshotCandidates"][number]["status"],
) {
  if (status === "READY") {
    return "готов к snapshot";
  }

  if (status === "PARTIAL") {
    return "частично проверен";
  }

  if (status === "STALE") {
    return "профиль устарел";
  }

  if (status === "FAILED") {
    return "есть ошибка";
  }

  return "не профилировался";
}

function endpointProfileHealthBadgeClass(status: EndpointProfileHealthStatus) {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-medium";

  if (status === "ready") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`;
  }

  if (status === "partial" || status === "stale") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200`;
  }

  if (status === "failed") {
    return `${base} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
}

function endpointProfileHealthLabel(status: EndpointProfileHealthStatus) {
  if (status === "ready") {
    return "готов";
  }

  if (status === "partial") {
    return "частично";
  }

  if (status === "stale") {
    return "устарел";
  }

  if (status === "failed") {
    return "ошибка";
  }

  return "не проверен";
}

function endpointProfileHealthDetail(profile: EndpointProfileHealth) {
  if (profile.status === "unchecked") {
    return "Production-профиля пока нет. Выберите endpoint и запустите ручную проверку.";
  }

  const expectedCount = profile.expectedCount || profile.checkedCount;
  const checkedAt = profile.latestCheckedAt
    ? formatDateTime(profile.latestCheckedAt)
    : "без даты";
  const sourceText = `источники: ${profile.successCount}/${expectedCount}`;
  const rowsText = `строк: ${profile.rowCount}`;

  if (profile.status === "failed") {
    return `${sourceText}, ошибок: ${profile.errorCount}, ${checkedAt}`;
  }

  if (profile.status === "partial") {
    return `${sourceText}, ошибок: ${profile.errorCount}, ${rowsText}, ${checkedAt}`;
  }

  if (profile.status === "stale") {
    return `${sourceText}, ${rowsText}, старше 24 часов - нужна перепроверка`;
  }

  return `${sourceText}, ${rowsText}, ${checkedAt}`;
}

function getAvailableRouteKeys(diagnostics: RouteDiagnosticsResult | null) {
  const keys = new Set<string>();

  diagnostics?.sources.forEach((source) => {
    if (source.status !== "SUCCESS") {
      return;
    }

    source.routes.forEach((route) => {
      const method = route.method?.toUpperCase();

      if ((method !== "GET" && method !== "POST") || !route.path) {
        return;
      }

      keys.add(routeKey(method, route.path));
    });
  });

  return keys;
}

function getEndpointAvailability(
  endpoint: EndpointMapItem,
  availableRouteKeys: Set<string>,
  diagnostics: RouteDiagnosticsResult | null,
): EndpointAvailability {
  if (!diagnostics) {
    return "unchecked";
  }

  return availableRouteKeys.has(routeKey(endpoint.method, endpoint.path))
    ? "available"
    : "missing";
}

function routeKey(method: EndpointMethod, path: string) {
  return `${method}:${normalizeRoutePath(path)}`;
}

function normalizeRoutePath(path: string) {
  const normalized = path
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/public_api/i, "")
    .replace(/\{([^}:]+):[^}]+\}/g, "{$1}");

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function endpointStatusBadgeClass(status: EndpointUsageStatus) {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-medium";

  if (status === "IN_USE") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`;
  }

  if (status === "NEEDS_PARAMETERS") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200`;
  }

  if (status === "WRITE_DECISION") {
    return `${base} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
}

function availabilityBadgeClass(availability: EndpointAvailability) {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-medium";

  if (availability === "available") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`;
  }

  if (availability === "missing") {
    return `${base} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
}

function availabilityLabel(availability: EndpointAvailability) {
  if (availability === "available") {
    return "доступен";
  }

  if (availability === "missing") {
    return "не найден";
  }

  return "не проверен";
}

function serviceSourceStatusLabel(status: ServiceDiagnosticsSource["status"]) {
  if (status === "SUCCESS") {
    return "OK";
  }

  if (status === "PARTIAL") {
    return "Частично";
  }

  return "Ошибка";
}

function serviceSourceStatusClass(status: ServiceDiagnosticsSource["status"]) {
  const base = "rounded-full px-2.5 py-1 text-xs font-medium";

  if (status === "SUCCESS") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`;
  }

  if (status === "PARTIAL") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200`;
  }

  return `${base} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200`;
}

function getLatestSyncJobsByDomain(jobs: LangameSettings["syncJobs"]) {
  const byDomain = new Map<string, LangameSettings["syncJobs"][number]>();

  jobs.forEach((job) => {
    if (!byDomain.has(job.domain)) {
      byDomain.set(job.domain, job);
    }
  });

  return Array.from(byDomain.values());
}

function getSourceSyncHealth(settings: LangameSettings): SourceSyncHealth[] {
  const latestJobsByDomain = new Map(
    getLatestSyncJobsByDomain(settings.syncJobs).map((job) => [job.domain, job]),
  );

  return settings.sources
    .filter((source) => source.isActive)
    .map((source) => {
      const latestJob = latestJobsByDomain.get(source.domain) ?? null;
      const status = latestJob?.status ?? (source.lastSyncedAt ? "SUCCESS" : "IDLE");

      return {
        id: source.id,
        domain: source.domain,
        name: source.name,
        status,
        lastSyncedAt: source.lastSyncedAt,
        errorMessage:
          latestJob?.status === "FAILED" ? latestJob.errorMessage : null,
        latestJob,
      };
    });
}

function getSyncJobTime(job: LangameSyncJob) {
  return job.finishedAt ?? job.startedAt;
}

function sourceStatusLabel(value: SourceSyncHealth["status"]) {
  if (value === "IDLE") {
    return "Нет запуска";
  }

  return syncStatusLabel(value);
}

function statusTone(value: string): "neutral" | "danger" | "warning" {
  if (value === "FAILED") {
    return "danger";
  }

  if (value === "RUNNING" || value === "IDLE") {
    return "warning";
  }

  return "neutral";
}

function statusBadgeClass(value: string) {
  const base = "rounded-full px-2.5 py-1 text-xs font-medium";

  if (value === "SUCCESS") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`;
  }

  if (value === "FAILED") {
    return `${base} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200`;
  }

  if (value === "RUNNING") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
}

function SyncHealthMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "danger" | "warning";
}) {
  return (
    <div
      className={[
        "rounded-md border bg-zinc-50 px-3 py-2 dark:bg-zinc-900/50",
        tone === "danger"
          ? "border-red-200 dark:border-red-900/70"
          : tone === "warning"
            ? "border-amber-200 dark:border-amber-900/70"
            : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function CompactRunMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={[
        "rounded-md border bg-zinc-50 px-3 py-2 dark:bg-zinc-900/50",
        tone === "danger"
          ? "border-red-200 dark:border-red-900/70"
          : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p
        className={[
          "mt-1 font-semibold tabular-nums",
          tone === "danger"
            ? "text-red-700 dark:text-red-300"
            : "text-zinc-950 dark:text-zinc-50",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

async function waitForGuestSyncCompletion() {
  await sleep(guestSyncPollIntervalMs);

  for (let attempt = 0; attempt < guestSyncPollAttempts; attempt += 1) {
    const syncStatus = await fetchGuestSyncStatus();

    if (syncStatus && !syncStatus.running) {
      return syncStatus;
    }

    await sleep(guestSyncPollIntervalMs);
  }

  return null;
}

async function syncAssortmentData(dateFrom: string, dateTo: string) {
  const response = await fetch("/api/integrations/langame/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateFrom,
      dateTo,
      mode: "BACKFILL",
    }),
  });
  const data = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(data));
  }

  return data as SyncResult;
}

async function syncGuestFoundation(
  dateFrom: string,
  dateTo: string,
  includeGuestLogs: boolean,
) {
  const response = await fetch(
    "/api/integrations/langame/guests/foundation/sync/start",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateFrom,
        dateTo,
        includeGuestLogs,
      }),
    },
  );
  const data = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(data));
  }

  return waitForGuestSyncCompletion();
}

async function fetchGuestSyncStatus() {
  const response = await fetch(
    "/api/integrations/langame/guests/foundation/sync/status",
    { cache: "no-store" },
  );

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<GuestSyncStatus>;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function syncStepLabel(value: SyncStepStatus) {
  if (value === "running") {
    return "идет";
  }

  if (value === "success") {
    return "готово";
  }

  if (value === "error") {
    return "ошибка";
  }

  return "ожидает";
}

function syncStatusLabel(value: string) {
  if (value === "SUCCESS") {
    return "Успешно";
  }

  if (value === "FAILED") {
    return "Ошибка";
  }

  if (value === "RUNNING") {
    return "Выполняется";
  }

  return value;
}

function getTodayInputValue() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function shiftDateInput(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
