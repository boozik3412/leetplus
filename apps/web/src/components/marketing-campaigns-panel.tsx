"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { GuestAudience, GuestCrmUser } from "@/lib/guests";
import type {
  MarketingCampaign,
  MarketingCampaignGoal,
  MarketingCampaignStatus,
  MarketingMechanicConfig,
  MarketingPromoBundle,
  MarketingPromoBundleStructure,
  MarketingPromoBundleLaunch,
  MarketingPromoBundleLaunchStatus,
} from "@/lib/marketing";
import type { Product } from "@/lib/products";
import type { Store } from "@/lib/stores";

type CampaignFormState = {
  goal: MarketingCampaignGoal;
  name: string;
  audienceId: string;
  storeId: string;
  ownerUserId: string;
  channel: string;
  mechanic: string;
  mechanicConfig: MarketingMechanicConfig | null;
  promoBundleId: string;
  periodFrom: string;
  periodTo: string;
  dueAt: string;
  budget: string;
  note: string;
};

type PromoBundleLaunchFormState = {
  promoBundleId: string;
  scope: "NETWORK" | "STORES";
  storeIds: string[];
  periodFrom: string;
  periodTo: string;
  maxUses: string;
  note: string;
};

type PromoMechanicTemplate = {
  id: string;
  title: string;
  goal: MarketingCampaignGoal;
  mechanic: string;
  channel: string;
  name: string;
  budget: string;
  description: string;
  tradeoff: string;
  audienceHint: string;
  primaryKpi: string;
  controlPoint: string;
  risk: string;
  note: string;
};

type PromoBundleType =
  | "game_product"
  | "game_bonus"
  | "product_product"
  | "balance_bonus";

type PromoBundlePart = "first" | "second";

type PromoBundleAccountingKind = "PRODUCT" | "SERVICE" | "BONUS" | "MANUAL";

type PromoBundleWriteOffRule = "ON_REDEEM" | "ON_SALE" | "MANUAL";

type PromoBundleDraft = {
  bundleType: PromoBundleType;
  gameItem: string;
  barItems: string;
  serviceItems: string;
  gamePrice: string;
  barPrice: string;
  servicePrice: string;
  discount: string;
  cost: string;
  expectedUses: string;
  minSpend: string;
  validityDays: string;
  onePerGuest: boolean;
  requiresApproval: boolean;
  noStacking: boolean;
  firstAccountingKind: PromoBundleAccountingKind;
  firstAccountingProductId: string;
  firstAccountingReference: string;
  secondAccountingKind: PromoBundleAccountingKind;
  secondAccountingProductId: string;
  secondAccountingReference: string;
  writeOffRule: PromoBundleWriteOffRule;
  accountingNote: string;
};

type PromoBundleTypeOption = {
  id: PromoBundleType;
  title: string;
  description: string;
  firstLabel: string;
  secondLabel: string;
  firstDefault: string;
  secondDefault: string;
  firstPlaceholder: string;
  secondPlaceholder: string;
  firstPriceLabel: string;
  secondPriceLabel: string;
  firstHint: string;
  secondHint: string;
  firstFilters: string[];
  secondFilters: string[];
  recommendation: string;
};

type PromoBundleEconomics = {
  basePrice: number;
  promoPrice: number;
  expectedUses: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number | null;
  discountBudget: number;
};

type PromoBundleVerdict = {
  tone: "ready" | "warning" | "blocked";
  title: string;
  description: string;
  checks: string[];
};

type CampaignStatusFilter = "ALL" | "ACTIVE" | MarketingCampaignStatus;

type CampaignReadinessItem = {
  label: string;
  done: boolean;
  issue: string;
};

type CampaignReadiness = {
  done: number;
  total: number;
  percent: number;
  tone: "ready" | "warning" | "blocked";
  firstIssue: string | null;
  items: CampaignReadinessItem[];
};

const goalOptions: Array<{ value: MarketingCampaignGoal; label: string }> = [
  { value: "RETURN_GUESTS", label: "Вернуть гостей" },
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "WEAK_HOURS", label: "Заполнить тихие часы" },
  { value: "BAR_GROWTH", label: "Вырастить бар" },
  { value: "EVENT_PROMO", label: "Событие или бронь" },
  { value: "PROMO_BUNDLE", label: "Промо-набор" },
];

const statusOptions: Array<{ value: MarketingCampaignStatus; label: string }> = [
  { value: "DRAFT", label: "Черновик" },
  { value: "PLANNED", label: "Запланирована" },
  { value: "RUNNING", label: "В работе" },
  { value: "FINISHED", label: "Завершена" },
  { value: "CANCELED", label: "Отменена" },
];

const promoBundleLaunchStatusOptions: Array<{
  value: MarketingPromoBundleLaunchStatus;
  label: string;
}> = [
  { value: "ACTIVE", label: "Активен" },
  { value: "PAUSED", label: "Пауза" },
  { value: "FINISHED", label: "Завершен" },
  { value: "CANCELED", label: "Отменен" },
];

const campaignStatusFilters: Array<{
  value: CampaignStatusFilter;
  label: string;
}> = [
  { value: "ALL", label: "Все" },
  { value: "ACTIVE", label: "Активные" },
  { value: "DRAFT", label: "Черновики" },
  { value: "PLANNED", label: "План" },
  { value: "RUNNING", label: "В работе" },
  { value: "FINISHED", label: "Завершены" },
  { value: "CANCELED", label: "Отменены" },
];

const channelOptions = [
  "CRM-задача",
  "Звонок",
  "Мессенджер",
  "Объявление в клубе",
  "Соцсети",
  "Будущая рассылка",
];

const mechanicOptions = [
  "Персональное предложение",
  "Промо-набор",
  "Событие",
  "Турнир",
  "Купон",
  "Миссия",
  "Реферальная механика",
];

const promoMechanicTemplates: PromoMechanicTemplate[] = [
  {
    id: "second-visit",
    title: "Второй визит",
    goal: "REPEAT_VISIT",
    mechanic: "Персональное предложение",
    channel: "CRM-задача",
    name: "Вернуть новых гостей на второй визит",
    budget: "0",
    description: "Для новых гостей, которые еще не сформировали привычку.",
    tradeoff:
      "Поднимает retention, но важно не давать скидку тем, кто и так вернется.",
    audienceHint: "Новые гости без второго визита или с одной короткой сессией.",
    primaryKpi: "повторный визит, визиты, выручка после контакта",
    controlPoint: "зафиксировать контакт, дату ответа и факт повторного визита",
    risk: "скидка может уйти гостям, которые вернулись бы без оффера",
    note:
      "Цель: второй визит. Оффер мягкий: персональный повод вернуться, без автоматического бонуса. Ограничения: один контакт на гостя, фиксировать исход и дату визита.",
  },
  {
    id: "weak-hours",
    title: "Тихие часы",
    goal: "WEAK_HOURS",
    mechanic: "Купон",
    channel: "Объявление в клубе",
    name: "Оффер на тихие часы",
    budget: "0",
    description: "Для времени, где есть свободная емкость ПК и зала.",
    tradeoff:
      "Может дать загрузку, но не должен каннибализировать пиковые часы.",
    audienceHint: "Гости с гибким временем визита и клубы/часы с низкой загрузкой.",
    primaryKpi: "загрузка, игровые часы, визиты в слабый период",
    controlPoint: "проверить клуб, день недели, время действия и прирост часов",
    risk: "оффер может перенести обычный спрос из пика в скидочный период",
    note:
      "Цель: заполнить тихие часы. Правило: действует только в оговоренный период и клубы. Контроль: не применять в пиковые часы, фиксировать использования в CRM.",
  },
  {
    id: "bar-combo",
    title: "Бар-комбо",
    goal: "BAR_GROWTH",
    mechanic: "Промо-набор",
    channel: "CRM-задача",
    name: "Промо-набор для роста бара",
    budget: "0",
    description: "Для гостей с низкой долей бара и командных визитов.",
    tradeoff:
      "Важно проверить маржу: набор должен растить чек, а не раздавать скидку.",
    audienceHint: "Активные гости с низкой долей бара, компании и TOP-гости.",
    primaryKpi: "бар, средний чек, общая выручка, маржа набора",
    controlPoint: "сверить состав, себестоимость, цену и барную выручку после запуска",
    risk: "слабая маржа или скидка без роста общего чека",
    note:
      "Цель: рост бара. Предложить комбо: игровое время + бар/кальян/сервис. Ограничения: один набор на гостя, ручное подтверждение администратором, отслеживать бар и общую выручку.",
  },
  {
    id: "event",
    title: "Мероприятие",
    goal: "EVENT_PROMO",
    mechanic: "Событие",
    channel: "Мессенджер",
    name: "Привлечь гостей на мероприятие",
    budget: "0",
    description: "Для турниров, дней рождения, брони клуба и командных событий.",
    tradeoff:
      "Нужна ясная вместимость, ответственный и фиксация броней.",
    audienceHint: "Командные гости, лиды на бронь, участники событий и активные группы.",
    primaryKpi: "брони, явка, выручка события, бар",
    controlPoint: "назначить ответственного, лимит мест и журнал ответов",
    risk: "переполнение, неявка или отсутствие фиксации брони в CRM",
    note:
      "Цель: мероприятие или бронь. Проверить дату, клуб, вместимость и канал. Контроль: каждый ответ гостя фиксировать в CRM, брони и отказы отдельно.",
  },
  {
    id: "birthday-booking",
    title: "День рождения / бронь",
    goal: "EVENT_PROMO",
    mechanic: "Персональное предложение",
    channel: "Звонок",
    name: "Лид на день рождения или бронь клуба",
    budget: "0",
    description: "Для ручных заявок, когда гостя еще нет в Langame или нужна бронь.",
    tradeoff:
      "Высокий чек, но нужна быстрая фиксация лида, ответственный и следующий контакт.",
    audienceHint: "Ручные CRM-лиды, родители, компании и гости без регистрации в Langame.",
    primaryKpi: "лид -> бронь, сумма брони, следующий контакт",
    controlPoint: "сохранить телефон, дату, клуб, количество гостей и дедлайн звонка",
    risk: "лид потеряется до регистрации или не сопоставится с гостем по телефону",
    note:
      "Цель: день рождения, мероприятие или бронь клуба. Зафиксировать контакт, желаемую дату, клуб, количество гостей и следующий шаг. После регистрации в Langame сопоставить по телефону.",
  },
  {
    id: "tournament",
    title: "Турнир",
    goal: "WEAK_HOURS",
    mechanic: "Турнир",
    channel: "Соцсети",
    name: "Турнир для загрузки клуба",
    budget: "0",
    description: "Для слабых дней, клубов или часов с низкой загрузкой.",
    tradeoff:
      "Дает инфоповод и трафик, но требует лимита мест, правил участия и контроля бара.",
    audienceHint: "Активные гости, команды, соцсети и клубы со свободной емкостью.",
    primaryKpi: "регистрации, явка, игровые часы, бар, повторный визит",
    controlPoint: "зафиксировать правила, лимит мест, ответственного и фактическую явку",
    risk: "инфоповод без явки или без роста бара и повторных визитов",
    note:
      "Цель: турнир и загрузка слабого периода. Указать клуб, дату, лимит мест, правила участия и ответственного. Контроль: регистрации, явка, игровая выручка, бар и повторные визиты.",
  },
  {
    id: "referral",
    title: "Приведи друга",
    goal: "REPEAT_VISIT",
    mechanic: "Реферальная механика",
    channel: "CRM-задача",
    name: "Реферальная механика для повторного визита",
    budget: "0",
    description: "Для активных гостей, которые могут привести нового игрока.",
    tradeoff:
      "Может привести новых гостей, но нужна ручная проверка, чтобы не раздать выгоду самому себе.",
    audienceHint: "Лояльные гости, команды и гости с частыми визитами.",
    primaryKpi: "новые гости, повторные визиты, подтвержденные рекомендации",
    controlPoint: "проверить телефон приглашенного, первый визит и связь с рекомендателем",
    risk: "саморефералы, дубли телефонов и выгода без нового гостя",
    note:
      "Цель: повторный визит и новый гость через рекомендацию. Правило: выгода только после фактического визита приглашенного гостя. Контроль: телефон приглашенного, дата визита, клуб и ответственный.",
  },
  {
    id: "vip-top",
    title: "VIP / TOP гости",
    goal: "BAR_GROWTH",
    mechanic: "Персональное предложение",
    channel: "Мессенджер",
    name: "Персональный оффер для TOP гостей",
    budget: "0",
    description: "Для гостей с высоким оборотом, командных визитов и потенциала бара.",
    tradeoff:
      "Нужно не снижать маржу без причины: оффер должен развивать чек, бар или бронирование.",
    audienceHint: "TOP-гости по деньгам, частоте визитов, командам и броням.",
    primaryKpi: "выручка на гостя, бар, бронь, повторный визит",
    controlPoint: "зафиксировать персональный повод, ответ и изменение чека",
    risk: "персональная скидка без роста поведения или маржи",
    note:
      "Цель: развить TOP гостя. Предложить персональный повод: бронь, бар-комбо, турнир или командный визит. Контроль: контакт, ответ, визит, общий чек и бар.",
  },
];

const emptyForm: CampaignFormState = {
  goal: "RETURN_GUESTS",
  name: "",
  audienceId: "",
  storeId: "",
  ownerUserId: "",
  channel: "CRM-задача",
  mechanic: "Персональное предложение",
  mechanicConfig: null,
  promoBundleId: "",
  periodFrom: "",
  periodTo: "",
  dueAt: "",
  budget: "",
  note: "",
};

const emptyPromoBundleLaunchForm: PromoBundleLaunchFormState = {
  promoBundleId: "",
  scope: "NETWORK",
  storeIds: [],
  periodFrom: "",
  periodTo: "",
  maxUses: "",
  note: "",
};

const promoBundleTypeOptions: PromoBundleTypeOption[] = [
  {
    id: "game_product",
    title: "Игровое время + товар",
    description: "Классическое комбо: гость покупает игру и получает понятную позицию бара.",
    firstLabel: "Игровое время",
    secondLabel: "Товар",
    firstDefault: "Игровое время или пакет часов",
    secondDefault: "Напиток + снек",
    firstPlaceholder: "Например: 2 часа игры",
    secondPlaceholder: "Например: напиток + снек",
    firstPriceLabel: "Игра, руб",
    secondPriceLabel: "Товар, руб",
    firstHint: "Выберите пакет часов, тариф или бронь, который будет основной частью оффера.",
    secondHint: "Подберите товар или барный комплект, который усиливает чек и понятен гостю.",
    firstFilters: ["тихие часы", "будни", "вечер", "бронь", "пакет часов"],
    secondFilters: ["напитки", "снеки", "высокая маржа", "популярное", "низкий OOS"],
    recommendation:
      "Подходит, когда нужно увеличить барную выручку без сложной бонусной логики.",
  },
  {
    id: "game_bonus",
    title: "Игровое время + бонусы",
    description: "Оффер на повторный визит: игровое время сейчас и бонус на следующий контакт.",
    firstLabel: "Игровое время",
    secondLabel: "Бонус",
    firstDefault: "Игровое время в будни",
    secondDefault: "Бонус на следующий визит",
    firstPlaceholder: "Например: 3 часа в будни",
    secondPlaceholder: "Например: +30 минут на следующий визит",
    firstPriceLabel: "Игра, руб",
    secondPriceLabel: "Бонус, руб",
    firstHint: "Основной пакет игрового времени, который гость покупает или получает по акции.",
    secondHint: "Бонусная часть: минуты, рубли, купон или условная выгода на следующий визит.",
    firstFilters: ["будни", "утро", "день", "ночной пакет", "новички"],
    secondFilters: ["следующий визит", "минуты", "баланс", "купон", "персонально"],
    recommendation:
      "Подходит для реактивации и повторного визита, когда важнее вернуть гостя, чем продать товар.",
  },
  {
    id: "product_product",
    title: "Товар + товар",
    description: "Барный набор: первый товар продается, второй усиливает ценность предложения.",
    firstLabel: "Первый товар",
    secondLabel: "Второй товар",
    firstDefault: "Основной товар",
    secondDefault: "Дополнительный товар",
    firstPlaceholder: "Например: энергетик",
    secondPlaceholder: "Например: снек со скидкой",
    firstPriceLabel: "Товар 1, руб",
    secondPriceLabel: "Товар 2, руб",
    firstHint: "Основной товар набора: лучше брать позицию с хорошим спросом или ролью якоря.",
    secondHint: "Дополнительный товар: подарок, скидочная позиция или товар для роста среднего чека.",
    firstFilters: ["топ продаж", "напитки", "еда", "высокий спрос", "маржинальное"],
    secondFilters: ["допродажа", "снек", "подарок", "залежался", "высокая маржа"],
    recommendation:
      "Подходит для роста бара, распродажи запасов и управления средним чеком.",
  },
  {
    id: "balance_bonus",
    title: "Пополнение баланса + бонусы",
    description: "Гость пополняет баланс, а бонус стимулирует использовать деньги в клубе.",
    firstLabel: "Пополнение баланса",
    secondLabel: "Бонус",
    firstDefault: "Пополнение баланса от 1000 руб",
    secondDefault: "Бонус за пополнение",
    firstPlaceholder: "Например: пополнение от 1000 руб",
    secondPlaceholder: "Например: +100 руб бонусами",
    firstPriceLabel: "Пополнение, руб",
    secondPriceLabel: "Бонус, руб",
    firstHint: "Минимальное пополнение баланса, после которого гость получает бонус.",
    secondHint: "Бонусная часть: рубли, минуты, товар или персональная выгода.",
    firstFilters: ["от 500 руб", "от 1000 руб", "онлайн", "касса клуба", "постоянные"],
    secondFilters: ["бонусы", "минуты", "товар", "следующий визит", "ручная проверка"],
    recommendation:
      "Подходит для роста предоплаты, но важно контролировать, где потом списывается баланс.",
  },
];

const emptyBundleDraft: PromoBundleDraft = {
  bundleType: "game_product",
  gameItem: "Игровое время или пакет часов",
  barItems: "Напиток + снек",
  serviceItems: "",
  gamePrice: "500",
  barPrice: "350",
  servicePrice: "0",
  discount: "150",
  cost: "220",
  expectedUses: "30",
  minSpend: "0",
  validityDays: "7",
  onePerGuest: true,
  requiresApproval: true,
  noStacking: true,
  firstAccountingKind: "SERVICE",
  firstAccountingProductId: "",
  firstAccountingReference: "",
  secondAccountingKind: "PRODUCT",
  secondAccountingProductId: "",
  secondAccountingReference: "",
  writeOffRule: "ON_REDEEM",
  accountingNote: "",
};

const bundleFieldHints = {
  gameItem:
    "Что именно получает гость в игровой части: часы, пакет времени, тариф или бронь места.",
  barItems:
    "Какие позиции бара входят в набор: напитки, снеки, комбо или конкретные товары.",
  serviceItems:
    "Дополнительная часть оффера: кальян, бронь зоны, сервис или другая услуга. Можно оставить пустым.",
  gamePrice:
    "Стоимость игровой части внутри набора: часы, пакет времени или тариф, который входит в оффер.",
  barPrice:
    "Плановая стоимость товаров бара в наборе: напитки, снеки или готовый барный комплект.",
  servicePrice:
    "Дополнительная услуга в наборе: кальян, бронь, сервисный сбор или другой платный элемент.",
  discount:
    "Сумма выгоды для гостя. Она вычитается из полной цены набора и формирует скидочный бюджет.",
  cost:
    "Оценочная себестоимость одного использования набора. Нужна для проверки маржи перед запуском.",
  expectedUses:
    "Максимальное число использований набора в кампании. По нему считается плановая выручка и бюджет скидки.",
  minSpend:
    "Минимальный чек, при котором можно применить набор. Если не нужен, оставьте 0.",
  validityDays:
    "Сколько дней действует предложение после запуска или контакта с гостем.",
  accountingReference:
    "Внутренний код услуги, бонусной операции или ручная подсказка для администратора, если это не товар из ассортимента.",
  writeOffRule:
    "Когда учитывать расход по набору: при фактическом использовании, при продаже или только после ручной сверки.",
};

const accountingKindOptions: Array<{
  value: PromoBundleAccountingKind;
  label: string;
}> = [
  { value: "PRODUCT", label: "Товар из ассортимента" },
  { value: "SERVICE", label: "Услуга / игровое время" },
  { value: "BONUS", label: "Бонусная операция" },
  { value: "MANUAL", label: "Ручной учет" },
];

const writeOffRuleOptions: Array<{
  value: PromoBundleWriteOffRule;
  label: string;
  description: string;
}> = [
  {
    value: "ON_REDEEM",
    label: "При использовании",
    description: "Расход фиксируется, когда гость реально использовал набор.",
  },
  {
    value: "ON_SALE",
    label: "При продаже",
    description: "Расход относится на момент продажи набора.",
  },
  {
    value: "MANUAL",
    label: "Ручная сверка",
    description: "Администратор сверяет выдачу и списание отдельно.",
  },
];

export function MarketingCampaignsPanel({
  campaigns,
  audiences,
  users,
  promoBundles,
  promoBundleLaunches,
  stores,
}: {
  campaigns: MarketingCampaign[];
  audiences: GuestAudience[];
  users: GuestCrmUser[];
  promoBundles: MarketingPromoBundle[];
  promoBundleLaunches: MarketingPromoBundleLaunch[];
  stores: Store[];
}) {
  const [rows, setRows] = useState(campaigns);
  const [savedPromoBundles, setSavedPromoBundles] = useState(promoBundles);
  const [promoLaunchRows, setPromoLaunchRows] = useState(promoBundleLaunches);
  const [form, setForm] = useState<CampaignFormState>(emptyForm);
  const [launchForm, setLaunchForm] = useState<PromoBundleLaunchFormState>({
    ...emptyPromoBundleLaunchForm,
    promoBundleId: promoBundles[0]?.id ?? "",
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    promoMechanicTemplates[0]?.id ?? "",
  );
  const [bundleDraft, setBundleDraft] =
    useState<PromoBundleDraft>(emptyBundleDraft);
  const [bundleApplyNotice, setBundleApplyNotice] = useState(false);
  const [bundleCatalogNotice, setBundleCatalogNotice] = useState<string | null>(
    null,
  );
  const [lastCreatedCampaign, setLastCreatedCampaign] =
    useState<MarketingCampaign | null>(null);
  const [isSavingBundle, setIsSavingBundle] = useState(false);
  const [isCreatingLaunch, setIsCreatingLaunch] = useState(false);
  const [pendingLaunchId, setPendingLaunchId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingTaskCampaignId, setPendingTaskCampaignId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<CampaignStatusFilter>("ACTIVE");
  const selectedTemplate =
    promoMechanicTemplates.find((template) => template.id === selectedTemplateId) ??
    promoMechanicTemplates[0];
  const bundleEconomics = useMemo(
    () => buildPromoBundleEconomics(bundleDraft),
    [bundleDraft],
  );
  const bundleVerdict = useMemo(
    () => buildPromoBundleVerdict(bundleDraft, bundleEconomics),
    [bundleDraft, bundleEconomics],
  );

  const summary = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter(
        (row) => row.status === "PLANNED" || row.status === "RUNNING",
      ).length,
      drafts: rows.filter((row) => row.status === "DRAFT").length,
    }),
    [rows],
  );
  const campaignCounts = useMemo(
    () =>
      Object.fromEntries(
        campaignStatusFilters.map((filter) => [
          filter.value,
          rows.filter((row) => campaignMatchesFilter(row, filter.value)).length,
        ]),
      ) as Record<CampaignStatusFilter, number>,
    [rows],
  );
  const visibleRows = useMemo(
    () => rows.filter((row) => campaignMatchesFilter(row, statusFilter)),
    [rows, statusFilter],
  );
  const selectedAudience =
    audiences.find((audience) => audience.id === form.audienceId) ?? null;
  const selectedFormPromoBundle =
    savedPromoBundles.find((bundle) => bundle.id === form.promoBundleId) ?? null;
  const selectedLaunchPromoBundle =
    savedPromoBundles.find((bundle) => bundle.id === launchForm.promoBundleId) ??
    null;
  const campaignDraftSteps = useMemo(
    () => buildCampaignDraftSteps(form),
    [form],
  );

  useEffect(() => {
    function normalizeCurrentHash() {
      const normalizedHash = normalizeMarketingHash(window.location.hash);

      if (normalizedHash !== window.location.hash) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}${normalizedHash}`,
        );
        window.requestAnimationFrame(() => {
          scrollToMarketingSection(normalizedHash.slice(1));
        });
      }
    }

    normalizeCurrentHash();
    window.addEventListener("hashchange", normalizeCurrentHash);

    return () => {
      window.removeEventListener("hashchange", normalizeCurrentHash);
    };
  }, []);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/marketing/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleanPayload(form)),
    });

    if (!response.ok) {
      setError(await readError(response));
      setIsSubmitting(false);
      return;
    }

    const campaign = (await response.json()) as MarketingCampaign;
    setRows((current) => [campaign, ...current]);
    setLastCreatedCampaign(campaign);
    setStatusFilter(campaign.status === "DRAFT" ? "DRAFT" : "ACTIVE");
    setForm(emptyForm);
    setBundleApplyNotice(false);
    setBundleCatalogNotice(null);
    setIsSubmitting(false);
    window.requestAnimationFrame(() => {
      document
        .getElementById("campaign-list")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function applyTemplate(template: PromoMechanicTemplate) {
    setBundleApplyNotice(false);
    setBundleCatalogNotice(null);
    setForm((current) => ({
      ...current,
      goal: template.goal,
      name: template.name,
      channel: template.channel,
      mechanic: template.mechanic,
      mechanicConfig: buildMechanicTemplateConfig(template),
      promoBundleId: "",
      budget: template.budget,
      note: buildMechanicTemplateNote(template),
    }));
  }

  async function applyBundleDraft() {
    if (bundleVerdict.tone === "blocked" || isSavingBundle) {
      return;
    }

    setIsSavingBundle(true);
    setError(null);
    const note = buildPromoBundleNote(bundleDraft, bundleEconomics);
    const bundleType = getPromoBundleTypeOption(bundleDraft.bundleType);
    const mechanicConfig = buildPromoBundleConfig(
      bundleDraft,
      bundleEconomics,
      bundleVerdict,
    );
    const response = await fetch("/api/marketing/promo-bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Комбо: ${bundleType.title}`,
        bundleType: bundleDraft.bundleType,
        mechanicConfig,
        note,
      }),
    });

    if (!response.ok) {
      setError(await readError(response));
      setIsSavingBundle(false);
      return;
    }

    const promoBundle = (await response.json()) as MarketingPromoBundle;
    setSavedPromoBundles((current) => [
      promoBundle,
      ...current.filter((item) => item.id !== promoBundle.id),
    ]);

    setForm((current) => ({
      ...current,
      goal: "PROMO_BUNDLE",
      name: promoBundle.name,
      channel: "CRM-задача",
      mechanic: bundleType.title,
      mechanicConfig: {
        ...mechanicConfig,
        promoBundleId: promoBundle.id,
      },
      promoBundleId: promoBundle.id,
      budget: String(Math.round(bundleEconomics.discountBudget)),
      note,
    }));
    setLaunchForm((current) => ({
      ...current,
      promoBundleId: promoBundle.id,
      maxUses: current.maxUses || bundleDraft.expectedUses,
    }));
    setBundleApplyNotice(true);
    setBundleCatalogNotice(
      "Комбо-набор сохранен в каталоге и перенесен в форму кампании.",
    );
    setIsSavingBundle(false);
    window.requestAnimationFrame(() => {
      scrollToMarketingSection("campaign-form");
    });
  }

  function applyExistingPromoBundle(promoBundle: MarketingPromoBundle) {
    const draft = promoBundleToDraft(promoBundle);
    const economics = buildPromoBundleEconomics(draft);
    const verdict = buildPromoBundleVerdict(draft, economics);
    const note = promoBundle.note ?? buildPromoBundleNote(draft, economics);
    const bundleType = getPromoBundleTypeOption(draft.bundleType);
    const mechanicConfig = isRecord(promoBundle.mechanicConfig)
      ? {
          ...promoBundle.mechanicConfig,
          promoBundleId: promoBundle.id,
        }
      : {
          ...buildPromoBundleConfig(draft, economics, verdict),
          promoBundleId: promoBundle.id,
        };

    setBundleDraft(draft);
    setForm((current) => ({
      ...current,
      goal: "PROMO_BUNDLE",
      name: promoBundle.name,
      channel: "CRM-задача",
      mechanic: bundleType.title,
      mechanicConfig,
      promoBundleId: promoBundle.id,
      budget: String(Math.round(economics.discountBudget)),
      note,
    }));
    setLaunchForm((current) => ({
      ...current,
      promoBundleId: promoBundle.id,
      maxUses: current.maxUses || draft.expectedUses,
    }));
    setBundleApplyNotice(true);
    setBundleCatalogNotice(
      "Существующий комбо-набор связан с формой кампании.",
    );
    window.requestAnimationFrame(() => {
      scrollToMarketingSection("campaign-form");
    });
  }

  async function updateStatus(
    campaign: MarketingCampaign,
    status: MarketingCampaignStatus,
  ) {
    const previousRows = rows;
    setRows((current) =>
      current.map((row) => (row.id === campaign.id ? { ...row, status } : row)),
    );
    setError(null);

    const response = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setRows(previousRows);
      setError(await readError(response));
      return;
    }

    const updated = (await response.json()) as MarketingCampaign;
    setRows((current) =>
      current.map((row) => (row.id === updated.id ? updated : row)),
    );
  }

  async function createPromoBundleLaunch(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!launchForm.promoBundleId) {
      setError("Сначала выберите сохраненный промо-набор");
      return;
    }

    if (launchForm.scope === "STORES" && launchForm.storeIds.length === 0) {
      setError("Выберите клубы или оставьте запуск на всю сеть");
      return;
    }

    setIsCreatingLaunch(true);
    setError(null);

    const response = await fetch("/api/marketing/promo-bundle-launches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promoBundleId: launchForm.promoBundleId,
        storeIds: launchForm.scope === "NETWORK" ? [] : launchForm.storeIds,
        periodFrom: launchForm.periodFrom || null,
        periodTo: launchForm.periodTo || null,
        maxUses: launchForm.maxUses || null,
        note: launchForm.note || null,
      }),
    });

    if (!response.ok) {
      setError(await readError(response));
      setIsCreatingLaunch(false);
      return;
    }

    const launch = (await response.json()) as MarketingPromoBundleLaunch;
    setPromoLaunchRows((current) => [
      launch,
      ...current.filter((item) => item.id !== launch.id),
    ]);
    setLaunchForm((current) => ({
      ...emptyPromoBundleLaunchForm,
      promoBundleId: launch.promoBundle.id,
      maxUses: current.maxUses,
    }));
    setIsCreatingLaunch(false);
    window.requestAnimationFrame(() => {
      scrollToMarketingSection("bundle-launches");
    });
  }

  async function updatePromoBundleLaunchStatus(
    launch: MarketingPromoBundleLaunch,
    status: MarketingPromoBundleLaunchStatus,
  ) {
    const previousRows = promoLaunchRows;
    setPendingLaunchId(launch.id);
    setPromoLaunchRows((current) =>
      current.map((row) => (row.id === launch.id ? { ...row, status } : row)),
    );
    setError(null);

    const response = await fetch(
      `/api/marketing/promo-bundle-launches/${launch.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );

    if (!response.ok) {
      setPromoLaunchRows(previousRows);
      setError(await readError(response));
      setPendingLaunchId(null);
      return;
    }

    const updated = (await response.json()) as MarketingPromoBundleLaunch;
    setPromoLaunchRows((current) =>
      current.map((row) => (row.id === updated.id ? updated : row)),
    );
    setPendingLaunchId(null);
  }

  async function createCrmTask(campaign: MarketingCampaign) {
    setPendingTaskCampaignId(campaign.id);
    setError(null);

    const response = await fetch(
      `/api/marketing/campaigns/${campaign.id}/crm-task`,
      { method: "POST" },
    );

    if (!response.ok) {
      setError(await readError(response));
      setPendingTaskCampaignId(null);
      return;
    }

    const updated = (await response.json()) as MarketingCampaign;
    setRows((current) =>
      current.map((row) => (row.id === updated.id ? updated : row)),
    );
    setPendingTaskCampaignId(null);
  }

  return (
    <section
      id="campaigns"
      className="mt-6 scroll-mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="grid gap-4 border-b border-zinc-200 p-6 dark:border-zinc-800 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-500">
            Кампании
          </p>
          <h2 className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
            Черновики и ручной запуск
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Сохраните цель, группу, канал, ответственного и срок. Это пока
            управленческий план без автоматических бонусов и рассылок в Langame.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MetricPill label="Всего" value={summary.total} />
          <MetricPill label="Активные" value={summary.active} />
          <MetricPill label="Черновики" value={summary.drafts} />
        </div>
      </div>

      <PromoMechanicsBuilder
        selectedTemplate={selectedTemplate}
        selectedTemplateId={selectedTemplateId}
        promoBundles={savedPromoBundles}
        bundleDraft={bundleDraft}
        bundleEconomics={bundleEconomics}
        bundleVerdict={bundleVerdict}
        bundleCatalogNotice={bundleCatalogNotice}
        isSavingBundle={isSavingBundle}
        onSelectTemplate={setSelectedTemplateId}
        onApplyTemplate={applyTemplate}
        bundleApplyNotice={bundleApplyNotice}
        onBundleDraftChange={(draft) => {
          setBundleApplyNotice(false);
          setBundleCatalogNotice(null);
          setBundleDraft(draft);
        }}
        onUsePromoBundle={applyExistingPromoBundle}
        onApplyBundle={applyBundleDraft}
      />

      <PromoBundleStandaloneLaunchPanel
        launches={promoLaunchRows}
        launchForm={launchForm}
        selectedPromoBundle={selectedLaunchPromoBundle}
        promoBundles={savedPromoBundles}
        stores={stores}
        isCreatingLaunch={isCreatingLaunch}
        pendingLaunchId={pendingLaunchId}
        onLaunchFormChange={setLaunchForm}
        onCreateLaunch={createPromoBundleLaunch}
        onUpdateLaunchStatus={updatePromoBundleLaunchStatus}
      />

      <form
        id="campaign-form"
        onSubmit={createCampaign}
        className="grid gap-4 border-b border-zinc-200 p-4 dark:border-zinc-800 lg:grid-cols-12"
      >
        <CampaignDraftHandoff
          form={form}
          selectedAudience={selectedAudience}
          selectedPromoBundle={selectedFormPromoBundle}
          steps={campaignDraftSteps}
          isSubmitting={isSubmitting}
          onBackToBundle={() => scrollToMarketingSection("bundle")}
        />

        <Field label="Цель" className="lg:col-span-3">
          <select
            value={form.goal}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                goal: event.target.value as MarketingCampaignGoal,
                mechanicConfig: null,
                promoBundleId: "",
              }))
            }
            className={fieldClassName}
          >
            {goalOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Название" className="lg:col-span-4">
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Например: Вернуть гостей в риске на выходные"
            className={fieldClassName}
          />
        </Field>

        <Field label="Группа" className="lg:col-span-3">
          <select
            value={form.audienceId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                audienceId: event.target.value,
              }))
            }
            className={fieldClassName}
          >
            <option value="">Без группы</option>
            {audiences.map((audience) => (
              <option key={audience.id} value={audience.id}>
                {audience.name} · {audience.guestsCount} гостей
              </option>
            ))}
          </select>
        </Field>

        <Field label="Клуб" className="lg:col-span-2">
          <select
            value={form.storeId}
            onChange={(event) =>
              setForm((current) => ({ ...current, storeId: event.target.value }))
            }
            className={fieldClassName}
          >
            <option value="">Вся сеть</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </Field>

        <CampaignGroupRoute
          selectedAudience={selectedAudience}
          audiencesCount={audiences.length}
        />

        <Field label="Канал" className="lg:col-span-3">
          <select
            value={form.channel}
            onChange={(event) =>
              setForm((current) => ({ ...current, channel: event.target.value }))
            }
            className={fieldClassName}
          >
            {channelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Механика" className="lg:col-span-3">
          <select
            value={form.mechanic}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                mechanic: event.target.value,
                mechanicConfig: null,
              }))
            }
            className={fieldClassName}
          >
            {mechanicOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Ответственный" className="lg:col-span-3">
          <select
            value={form.ownerUserId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                ownerUserId: event.target.value,
              }))
            }
            className={fieldClassName}
          >
            <option value="">Не назначен</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Дедлайн" className="lg:col-span-3">
          <input
            type="date"
            value={form.dueAt}
            onChange={(event) =>
              setForm((current) => ({ ...current, dueAt: event.target.value }))
            }
            className={fieldClassName}
          />
        </Field>

        <Field label="Период с" className="lg:col-span-2">
          <input
            type="date"
            value={form.periodFrom}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                periodFrom: event.target.value,
              }))
            }
            className={fieldClassName}
          />
        </Field>

        <Field label="Период по" className="lg:col-span-2">
          <input
            type="date"
            value={form.periodTo}
            onChange={(event) =>
              setForm((current) => ({ ...current, periodTo: event.target.value }))
            }
            className={fieldClassName}
          />
        </Field>

        <Field label="Бюджет, руб" className="lg:col-span-2">
          <input
            inputMode="decimal"
            value={form.budget}
            onChange={(event) =>
              setForm((current) => ({ ...current, budget: event.target.value }))
            }
            placeholder="0"
            className={fieldClassName}
          />
        </Field>

        <Field label="Заметка" className="lg:col-span-4">
          <input
            value={form.note}
            onChange={(event) =>
              setForm((current) => ({ ...current, note: event.target.value }))
            }
            placeholder="Что предложить и как проверить результат"
            className={fieldClassName}
          />
        </Field>

        <div className="flex items-end lg:col-span-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-11 w-full rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Сохраняем..." : "Создать"}
          </button>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 lg:col-span-12">
            {error}
          </p>
        ) : null}
      </form>

      <section
        id="campaign-list"
        className="scroll-mt-6 border-t border-zinc-200 dark:border-zinc-800"
      >
        {lastCreatedCampaign ? (
          <div className="border-b border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                  Черновик создан
                </p>
                <p className="mt-1 text-sm leading-6 text-emerald-900 dark:text-emerald-100">
                  {lastCreatedCampaign.name} появился в списке черновиков.
                  Откройте карточку, чтобы проверить план, создать CRM-задачу и
                  потом смотреть эффект.
                </p>
              </div>
              <Link
                href={`/marketing/campaigns/${lastCreatedCampaign.id}`}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
              >
                Открыть кампанию
              </Link>
            </div>
          </div>
        ) : null}
        <div className="space-y-4 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-wide text-emerald-500">
              Рабочий список
            </p>
            <h3 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">
              Кампании по статусам
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              На общем экране показываем только контрольные поля и следующий
              шаг. План, контакты, эффект и экспорт открываются в карточке
              кампании.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {campaignStatusFilters.map((filter) => {
              const isActive = statusFilter === filter.value;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={[
                    "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                    isActive
                      ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10",
                  ].join(" ")}
                >
                  <span>{filter.label}</span>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-xs",
                      isActive
                        ? "bg-zinc-950/10"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400",
                    ].join(" ")}
                  >
                    {campaignCounts[filter.value]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.length === 0 ? (
            <div className="p-6 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Кампаний пока нет. Создайте первый черновик из цели, группы и
              канала, чтобы команда понимала, что запускать и как потом
              контролировать эффект.
            </div>
          ) : visibleRows.length > 0 ? (
            visibleRows.map((campaign) => {
              const readiness = buildCampaignReadiness(campaign);

              return (
                <article
                  key={campaign.id}
                  className="grid gap-4 p-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-900/40 xl:grid-cols-[minmax(0,1fr)_320px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={campaignStatusClass(campaign.status)}>
                        {statusLabel(campaign.status)}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {goalLabel(campaign.goal)}
                      </span>
                    </div>
                    <h4 className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">
                      {campaign.name}
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {campaignNextAction(campaign)}
                    </p>
                    <CampaignReadinessBar readiness={readiness} />
                    <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <CompactInfo
                        label="Группа"
                        value={campaign.audience?.name ?? "не выбрана"}
                      />
                      <CompactInfo
                        label="Клуб"
                        value={storeLabel(campaign.storeIds, stores)}
                      />
                      <CompactInfo
                        label="Ответственный"
                        value={campaign.owner?.displayName ?? "не назначен"}
                      />
                      <CompactInfo
                        label="Дедлайн"
                        value={formatDate(campaign.dueAt)}
                      />
                      <CompactInfo
                        label="Канал"
                        value={campaign.channel ?? "не выбран"}
                      />
                      <CompactInfo
                        label="Механика"
                        value={campaign.mechanic ?? "не выбрана"}
                      />
                      <CompactInfo
                        label="Сценарий"
                        value={campaignMechanicConfigLabel(
                          campaign.mechanicConfig,
                        )}
                      />
                      {campaign.promoBundle ? (
                        <CompactInfo
                          label="Комбо-набор"
                          value={campaign.promoBundle.name}
                        />
                      ) : null}
                      <CompactInfo
                        label="Бюджет"
                        value={formatRubles(campaign.budget)}
                      />
                      <CompactInfo
                        label="Контакт"
                        value={contactCoverageLabel(campaign)}
                      />
                    </dl>
                  </div>

                  <div className="flex min-w-0 flex-col gap-2 xl:items-stretch">
                    <select
                      value={campaign.status}
                      onChange={(event) =>
                        updateStatus(
                          campaign,
                          event.target.value as MarketingCampaignStatus,
                        )
                      }
                      className="min-h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Link
                      href={`/marketing/campaigns/${campaign.id}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
                    >
                      Открыть кампанию
                    </Link>
                    {campaign.crmTask ? (
                      <Link
                        href="/guests/crm/tasks"
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-500/40 px-4 text-sm font-semibold text-emerald-500 transition hover:bg-emerald-500/10"
                      >
                        Открыть CRM-задачу
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => createCrmTask(campaign)}
                        disabled={pendingTaskCampaignId === campaign.id}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pendingTaskCampaignId === campaign.id
                          ? "Создаем..."
                          : "Создать CRM-задачу"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="p-6 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              В выбранном статусе кампаний нет. Можно переключить фильтр или
              создать новый черновик выше.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

export function MarketingPromoBundlesWorkspace({
  promoBundles,
  promoBundleLaunches = [],
  productOptions = [],
  stores = [],
}: {
  promoBundles: MarketingPromoBundle[];
  promoBundleLaunches?: MarketingPromoBundleLaunch[];
  productOptions?: Product[];
  stores?: Store[];
}) {
  const [savedPromoBundles, setSavedPromoBundles] = useState(promoBundles);
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(
    promoBundles[0]?.id ?? null,
  );
  const [bundleDraft, setBundleDraft] =
    useState<PromoBundleDraft>(
      promoBundles[0] ? promoBundleToDraft(promoBundles[0]) : emptyBundleDraft,
    );
  const [bundleCatalogNotice, setBundleCatalogNotice] = useState<string | null>(
    null,
  );
  const [isSavingBundle, setIsSavingBundle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedBundle =
    savedPromoBundles.find((bundle) => bundle.id === selectedBundleId) ?? null;
  const isEditingBundle = Boolean(selectedBundle);
  const bundleEconomics = useMemo(
    () => buildPromoBundleEconomics(bundleDraft),
    [bundleDraft],
  );
  const bundleVerdict = useMemo(
    () => buildPromoBundleVerdict(bundleDraft, bundleEconomics),
    [bundleDraft, bundleEconomics],
  );

  async function saveBundleDraft() {
    if (bundleVerdict.tone === "blocked" || isSavingBundle) {
      return;
    }

    setIsSavingBundle(true);
    setError(null);
    const note = buildPromoBundleNote(
      bundleDraft,
      bundleEconomics,
      productOptions,
    );
    const bundleType = getPromoBundleTypeOption(bundleDraft.bundleType);
    const mechanicConfig = buildPromoBundleConfig(
      bundleDraft,
      bundleEconomics,
      bundleVerdict,
      productOptions,
    );
    const endpoint = selectedBundle
      ? `/api/marketing/promo-bundles/${selectedBundle.id}`
      : "/api/marketing/promo-bundles";
    const response = await fetch(endpoint, {
      method: selectedBundle ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selectedBundle?.name ?? `Комбо: ${bundleType.title}`,
        bundleType: bundleDraft.bundleType,
        mechanicConfig,
        note,
      }),
    });

    if (!response.ok) {
      setError(await readError(response));
      setIsSavingBundle(false);
      return;
    }

    const promoBundle = (await response.json()) as MarketingPromoBundle;
    setSavedPromoBundles((current) => [
      promoBundle,
      ...current.filter((item) => item.id !== promoBundle.id),
    ]);
    setSelectedBundleId(promoBundle.id);
    setBundleCatalogNotice(
      selectedBundle
        ? "Изменения сохранены в существующем промо-наборе."
        : "Промо-набор сохранен в каталоге.",
    );
    setIsSavingBundle(false);
  }

  function selectExistingPromoBundle(promoBundle: MarketingPromoBundle) {
    const draft = promoBundleToDraft(promoBundle);

    setBundleDraft(draft);
    setSelectedBundleId(promoBundle.id);
    setBundleCatalogNotice(
      "Набор загружен в конструктор. Внесите правки и сохраните изменения.",
    );
    window.requestAnimationFrame(() => {
      scrollToMarketingSection("promo-bundle-builder");
    });
  }

  function createNewBundleDraft() {
    setSelectedBundleId(null);
    setBundleDraft(emptyBundleDraft);
    setBundleCatalogNotice("Создается новый промо-набор.");
    setError(null);
    window.requestAnimationFrame(() => {
      scrollToMarketingSection("promo-bundle-builder");
    });
  }

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-4 border-b border-zinc-200 p-6 dark:border-zinc-800 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-500">
            Промо-наборы
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-zinc-950 dark:text-white md:text-4xl">
            Конструктор промо-наборов
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Соберите состав, цену, скидку и ограничения набора. Существующие
            наборы можно открыть из каталога, поправить и сохранить без создания
            кампании.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 text-center">
          <MetricPill label="Наборов" value={savedPromoBundles.length} />
        </div>
      </div>

      {error ? (
        <p className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <PromoBundlesCatalogPanel
        promoBundles={savedPromoBundles}
        promoBundleLaunches={promoBundleLaunches}
        stores={stores}
        selectedBundleId={selectedBundleId}
        onEditBundle={selectExistingPromoBundle}
        onCreateNew={createNewBundleDraft}
      />

      <PromoMechanicsBuilder
        mode="catalog"
        showCatalogChooser={false}
        productOptions={productOptions}
        bundleActionLabel={
          isEditingBundle ? "Сохранить изменения" : "Создать промо-набор"
        }
        selectedTemplate={promoMechanicTemplates[0]}
        selectedTemplateId={promoMechanicTemplates[0]?.id ?? ""}
        promoBundles={savedPromoBundles}
        bundleDraft={bundleDraft}
        bundleEconomics={bundleEconomics}
        bundleVerdict={bundleVerdict}
        bundleCatalogNotice={bundleCatalogNotice}
        isSavingBundle={isSavingBundle}
        onSelectTemplate={() => undefined}
        onApplyTemplate={() => undefined}
        bundleApplyNotice={Boolean(bundleCatalogNotice)}
        onBundleDraftChange={(draft) => {
          setBundleCatalogNotice(null);
          setBundleDraft(draft);
        }}
        onUsePromoBundle={selectExistingPromoBundle}
        onApplyBundle={saveBundleDraft}
      />
    </section>
  );
}

function PromoBundlesCatalogPanel({
  promoBundles,
  promoBundleLaunches,
  stores,
  selectedBundleId,
  onEditBundle,
  onCreateNew,
}: {
  promoBundles: MarketingPromoBundle[];
  promoBundleLaunches: MarketingPromoBundleLaunch[];
  stores: Store[];
  selectedBundleId: string | null;
  onEditBundle: (bundle: MarketingPromoBundle) => void;
  onCreateNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const filteredBundles = useMemo(() => {
    if (!normalizedQuery) {
      return promoBundles;
    }

    return promoBundles.filter((bundle) =>
      [
        bundle.name,
        promoBundleTypeLabel(bundle.bundleType),
        bundle.note ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, promoBundles]);

  return (
    <section className="border-b border-zinc-200 p-4 dark:border-zinc-800">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Каталог
            </p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">
              Существующие промо-наборы
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Откройте набор для правки или начните новый. В каталоге нет групп
              гостей, задач и кампаний.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            Новый набор
          </button>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названию, типу или заметке"
          className="mt-4 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:hover:border-zinc-600"
        />

        <div className="mt-3 grid gap-2">
          {filteredBundles.length > 0 ? (
            filteredBundles.map((bundle) => (
              <PromoBundleCatalogRow
                key={bundle.id}
                bundle={bundle}
                isActive={bundle.id === selectedBundleId}
                onEdit={() => onEditBundle(bundle)}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-sm leading-6 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              {promoBundles.length === 0
                ? "Сохраненных промо-наборов пока нет. Создайте первый в конструкторе ниже."
                : "По этому запросу наборов не найдено."}
            </div>
          )}
        </div>

        <PromoBundlesAccountingReport
          promoBundles={filteredBundles}
          promoBundleLaunches={promoBundleLaunches}
          stores={stores}
          onEditBundle={onEditBundle}
        />
      </div>
    </section>
  );
}

function PromoBundlesAccountingReport({
  promoBundles,
  promoBundleLaunches,
  stores,
  onEditBundle,
}: {
  promoBundles: MarketingPromoBundle[];
  promoBundleLaunches: MarketingPromoBundleLaunch[];
  stores: Store[];
  onEditBundle: (bundle: MarketingPromoBundle) => void;
}) {
  const activeLaunches = promoBundleLaunches.filter(
    (launch) => launch.status === "ACTIVE",
  );
  const rows = promoBundles.map((bundle) => {
    const structure = promoBundleStructureFromBundle(bundle);
    const launches = activeLaunches.filter(
      (launch) => launch.promoBundle.id === bundle.id,
    );

    return { bundle, structure, launches };
  });
  const readyCount = rows.filter(
    (row) => row.structure.accounting.readiness === "READY",
  ).length;
  const needsAccountingCount = rows.filter(
    (row) => row.structure.accounting.readiness === "NEEDS_ACCOUNTING",
  ).length;
  const productLinkCount = rows.reduce((sum, row) => {
    const refs = [
      row.structure.accounting.firstRef,
      row.structure.accounting.secondRef,
    ];

    return (
      sum +
      refs.filter((ref) => ref.kind === "PRODUCT" && Boolean(ref.productId))
        .length
    );
  }, 0);
  const manualWriteOffCount = rows.filter(
    (row) => row.structure.accounting.writeOffRule === "MANUAL",
  ).length;

  if (promoBundles.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
            Учет и списание
          </p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">
            Операционная сводка по наборам
          </h3>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Здесь видно, какие наборы готовы к ручному учету, какие товары или
          услуги нужно списывать и где остались незаполненные привязки.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <PromoBundleAccountingMetric label="Готовы" value={readyCount} />
        <PromoBundleAccountingMetric
          label="Нужен учет"
          value={needsAccountingCount}
        />
        <PromoBundleAccountingMetric label="Товарных связей" value={productLinkCount} />
        <PromoBundleAccountingMetric
          label="Ручная сверка"
          value={manualWriteOffCount}
        />
      </div>

      <div className="mt-3 grid gap-2">
        {rows.map((row) => (
          <PromoBundleAccountingRow
            key={row.bundle.id}
            bundle={row.bundle}
            structure={row.structure}
            launches={row.launches}
            stores={stores}
            onEdit={() => onEditBundle(row.bundle)}
          />
        ))}
      </div>
    </div>
  );
}

function PromoBundleAccountingMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-lg font-semibold text-zinc-950 dark:text-white">
        {formatNumber(value)}
      </p>
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
    </div>
  );
}

function PromoBundleAccountingRow({
  bundle,
  structure,
  launches,
  stores,
  onEdit,
}: {
  bundle: MarketingPromoBundle;
  structure: MarketingPromoBundleStructure;
  launches: MarketingPromoBundleLaunch[];
  stores: Store[];
  onEdit: () => void;
}) {
  const isReady = structure.accounting.readiness === "READY";
  const refs = [
    `${structure.composition.firstLabel}: ${structure.accounting.firstRef.label}`,
    `${structure.composition.secondLabel}: ${structure.accounting.secondRef.label}`,
  ];
  const launchLabel = promoBundleOperationalLaunchLabel(launches, stores);

  return (
    <article className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.38fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
            {bundle.name}
          </h4>
          <span
            className={[
              "rounded-full border px-2 py-0.5 text-xs font-semibold",
              isReady
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            ].join(" ")}
          >
            {structure.accounting.label}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          {refs.join(" · ")}
        </p>
      </div>
      <div className="grid gap-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">
          {structure.accounting.writeOffLabel}
        </span>
        <span>{launchLabel}</span>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
      >
        Открыть
      </button>
    </article>
  );
}

function PromoBundleCatalogRow({
  bundle,
  isActive,
  onEdit,
}: {
  bundle: MarketingPromoBundle;
  isActive: boolean;
  onEdit: () => void;
}) {
  const structure = promoBundleStructureFromBundle(bundle);
  const margin =
    structure.pricing.marginPercent === null
      ? "маржа не рассчитана"
      : `маржа ${formatPercent(structure.pricing.marginPercent)}`;

  return (
    <article
      className={[
        "grid gap-3 rounded-lg border p-3 transition md:grid-cols-[minmax(0,1fr)_auto] md:items-center",
        isActive
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
          : "border-zinc-200 bg-white hover:border-emerald-400/70 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-500/60",
      ].join(" ")}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
            {bundle.name}
          </h3>
          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            {promoBundleTypeLabel(bundle.bundleType)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          {structure.composition.summary}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          <span>{formatRubles(structure.pricing.promoPrice)}</span>
          <span>{margin}</span>
          <span>{formatNumber(structure.limits.expectedUses)} исп.</span>
          <span>{structure.accounting.label}</span>
          <span>обновлен {formatDate(bundle.updatedAt)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
      >
        Редактировать
      </button>
    </article>
  );
}

function PromoMechanicsBuilder({
  mode = "campaign",
  showCatalogChooser = true,
  bundleActionLabel,
  productOptions = [],
  selectedTemplate,
  selectedTemplateId,
  promoBundles,
  bundleDraft,
  bundleEconomics,
  bundleVerdict,
  bundleCatalogNotice,
  bundleApplyNotice,
  isSavingBundle,
  onSelectTemplate,
  onApplyTemplate,
  onBundleDraftChange,
  onUsePromoBundle,
  onApplyBundle,
}: {
  mode?: "campaign" | "catalog";
  showCatalogChooser?: boolean;
  bundleActionLabel?: string;
  productOptions?: Product[];
  selectedTemplate: PromoMechanicTemplate;
  selectedTemplateId: string;
  promoBundles: MarketingPromoBundle[];
  bundleDraft: PromoBundleDraft;
  bundleEconomics: PromoBundleEconomics;
  bundleVerdict: PromoBundleVerdict;
  bundleCatalogNotice: string | null;
  bundleApplyNotice: boolean;
  isSavingBundle: boolean;
  onSelectTemplate: (id: string) => void;
  onApplyTemplate: (template: PromoMechanicTemplate) => void;
  onBundleDraftChange: (draft: PromoBundleDraft) => void;
  onUsePromoBundle: (bundle: MarketingPromoBundle) => void;
  onApplyBundle: () => void | Promise<void>;
}) {
  const isCatalogMode = mode === "catalog";
  const bundleNotePreview = buildPromoBundleNote(
    bundleDraft,
    bundleEconomics,
    productOptions,
  );
  const bundleStructure = promoBundleStructureFromDraft(
    bundleDraft,
    bundleEconomics,
    productOptions,
  );
  const [activeBundlePart, setActiveBundlePart] =
    useState<PromoBundlePart>("first");
  const [isBundleCatalogOpen, setIsBundleCatalogOpen] = useState(false);
  const [bundleCatalogSearch, setBundleCatalogSearch] = useState("");
  const [selectedPromoBundleId, setSelectedPromoBundleId] = useState(
    promoBundles[0]?.id ?? "",
  );
  const bundleCatalogRef = useRef<HTMLDivElement>(null);
  const bundleType = getPromoBundleTypeOption(bundleDraft.bundleType);
  const selectedPromoBundle =
    promoBundles.find((bundle) => bundle.id === selectedPromoBundleId) ??
    promoBundles[0] ??
    null;
  const bundleCatalogQuery = bundleCatalogSearch.trim().toLocaleLowerCase("ru-RU");
  const filteredPromoBundles = useMemo(() => {
    if (!bundleCatalogQuery) {
      return promoBundles;
    }

    return promoBundles.filter((bundle) =>
      [
        bundle.name,
        promoBundleTypeLabel(bundle.bundleType),
        bundle.note ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(bundleCatalogQuery),
    );
  }, [bundleCatalogQuery, promoBundles]);
  const activePartLabel =
    activeBundlePart === "first"
      ? bundleType.firstLabel
      : bundleType.secondLabel;
  const activePartValue =
    activeBundlePart === "first" ? bundleDraft.gameItem : bundleDraft.barItems;
  const activePartFilters =
    activeBundlePart === "first"
      ? bundleType.firstFilters
      : bundleType.secondFilters;
  const activePartHint =
    activeBundlePart === "first" ? bundleType.firstHint : bundleType.secondHint;
  const activePriceHint =
    activeBundlePart === "first"
      ? `Стоимость части "${bundleType.firstLabel}" без скидки. Нужна только для расчета цены, бюджета и маржи.`
      : `Стоимость части "${bundleType.secondLabel}" без скидки. Нужна только для расчета цены, бюджета и маржи.`;

  useEffect(() => {
    if (!isBundleCatalogOpen) {
      return;
    }

    function closeOnOutsideClick(event: PointerEvent) {
      if (
        bundleCatalogRef.current &&
        !bundleCatalogRef.current.contains(event.target as Node)
      ) {
        setIsBundleCatalogOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsBundleCatalogOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isBundleCatalogOpen]);

  function updateActivePartText(value: string) {
    onBundleDraftChange(
      activeBundlePart === "first"
        ? { ...bundleDraft, gameItem: value }
        : { ...bundleDraft, barItems: value },
    );
  }

  function updateActivePartPrice(value: string) {
    onBundleDraftChange(
      activeBundlePart === "first"
        ? { ...bundleDraft, gamePrice: value }
        : { ...bundleDraft, barPrice: value },
    );
  }

  function applyPartFilter(filter: string) {
    const current = activePartValue.trim();
    const next = current.includes(filter)
      ? current
      : current
        ? `${current}; ${filter}`
        : filter;

    updateActivePartText(next);
  }

  function loadPromoBundleAsBasis(promoBundle: MarketingPromoBundle) {
    setSelectedPromoBundleId(promoBundle.id);
    setIsBundleCatalogOpen(false);
    setActiveBundlePart("first");
    onBundleDraftChange(promoBundleToDraft(promoBundle));
  }

  function selectPromoBundleFromCatalog(promoBundle: MarketingPromoBundle) {
    setSelectedPromoBundleId(promoBundle.id);
    setIsBundleCatalogOpen(false);
    setActiveBundlePart("first");
    onUsePromoBundle(promoBundle);
  }

  return (
    <section className="border-b border-zinc-200 p-4 dark:border-zinc-800">
      <div
        className={
          isCatalogMode
            ? "grid gap-4"
            : "grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]"
        }
      >
        {isCatalogMode ? null : (
          <div
          id="mechanics"
          className="scroll-mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                Механики
              </p>
              <h3 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">
                Быстрый сценарий
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Выберите тип промо, чтобы форма кампании заполнилась понятной
                целью, каналом, механикой и управленческой заметкой.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onApplyTemplate(selectedTemplate)}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Применить
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {promoMechanicTemplates.map((template) => {
              const isActive = template.id === selectedTemplateId;

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onSelectTemplate(template.id)}
                  className={`min-h-24 rounded-lg border p-3 text-left transition ${
                    isActive
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 bg-white hover:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950"
                  }`}
                >
                  <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                    {template.title}
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                    {template.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-semibold text-zinc-950 dark:text-white">
              {selectedTemplate.title}: {selectedTemplate.mechanic}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {selectedTemplate.tradeoff}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <MechanicDecisionItem
                label="Кому"
                value={selectedTemplate.audienceHint}
              />
              <MechanicDecisionItem
                label="KPI"
                value={selectedTemplate.primaryKpi}
              />
              <MechanicDecisionItem
                label="Контроль"
                value={selectedTemplate.controlPoint}
              />
              <MechanicDecisionItem label="Риск" value={selectedTemplate.risk} />
            </div>
          </div>
        </div>
        )}

        <div
          id={isCatalogMode ? "promo-bundle-builder" : "bundle"}
          className="scroll-mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                Промо-набор
              </p>
              <h3 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">
                {isCatalogMode
                  ? "Создание промо-набора"
                  : "Конструктор комбо-набора"}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {isCatalogMode
                  ? "Соберите оффер как самостоятельный каталожный набор: тип, две части, экономика, лимиты и условия применения."
                  : "Соберите оффер по шагам: выберите тип, настройте две части, проверьте экономику и сохраните набор в каталог."}
              </p>
            </div>
            {isCatalogMode ? null : (
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Сохранение
                </p>
                <p className="mt-1">
                  Кнопка появится ниже, после коммерческой проверки.
                </p>
              </div>
            )}
          </div>
          <p className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            {isCatalogMode
              ? "Настройте состав и экономику без выбора группы гостей. После сохранения набор появится в каталоге, его можно будет открыть для правки и позже использовать в кампании, ассортименте и учете услуг."
              : "Настройте состав и экономику набора, затем перенесите расчет в каталог комбо-наборов. После сохранения он подставится в форму кампании, а позже сможет использоваться в ассортименте и учете услуг."}
          </p>
          {bundleApplyNotice ? (
            <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold leading-6 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-200">
              {bundleCatalogNotice ??
                "Промо-набор перенесен в форму кампании выше."}
            </p>
          ) : null}

          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                  Шаг 1
                </p>
                <h4 className="mt-1 text-base font-semibold text-zinc-950 dark:text-white">
                  Выберите вид комбо-набора
                </h4>
              </div>
              <p className="max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                От типа зависит, какие две части вы собираете и какие фильтры
                подбора показываются ниже.
              </p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {promoBundleTypeOptions.map((option) => {
              const isActive = option.id === bundleDraft.bundleType;

              return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setActiveBundlePart("first");
                      onBundleDraftChange({
                        ...bundleDraft,
                        bundleType: option.id,
                        gameItem: option.firstDefault,
                        barItems: option.secondDefault,
                        ...defaultAccountingForBundleType(option.id),
                      });
                    }}
                    className={[
                      "min-h-24 rounded-lg border p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30",
                      isActive
                        ? "border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-500/10"
                        : "border-zinc-200 bg-zinc-50 hover:border-emerald-400 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-900/80",
                    ].join(" ")}
                  >
                    <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                      {option.title}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {showCatalogChooser ? (
              <div ref={bundleCatalogRef} className="relative mt-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 transition duration-200 hover:border-emerald-400/60 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-500/50 dark:hover:bg-zinc-900/80">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Каталог промо-наборов
                    </p>
                    <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                      {formatBundleCount(promoBundles.length)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
                    {selectedPromoBundle
                      ? `Выбран: ${selectedPromoBundle.name}`
                      : isCatalogMode
                        ? "Готовые наборы можно выбрать для запуска или взять как основу нового набора."
                        : "Готовые наборы можно быстро подставить в кампанию или взять как основу."}
                  </p>
                </div>
                <button
                  type="button"
                  aria-expanded={isBundleCatalogOpen}
                  onClick={() => setIsBundleCatalogOpen((isOpen) => !isOpen)}
                  className="group inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-400 hover:text-emerald-600 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
                >
                  Открыть каталог
                  <DisclosureChevron isOpen={isBundleCatalogOpen} />
                </button>
              </div>

              {isBundleCatalogOpen ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-black/40 sm:w-[560px] sm:max-w-[calc(100vw-8rem)]">
                  <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                          Сохраненные промо-наборы
                        </p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                          Каталог живет отдельно от кампаний и позже подойдет
                          для ассортимента и учета услуг.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsBundleCatalogOpen(false)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-500 transition hover:border-emerald-400 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
                        aria-label="Закрыть каталог промо-наборов"
                      >
                        ×
                      </button>
                    </div>
                    <input
                      value={bundleCatalogSearch}
                      onChange={(event) =>
                        setBundleCatalogSearch(event.target.value)
                      }
                      placeholder="Поиск по названию, типу или заметке"
                      className="mt-3 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 hover:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:hover:border-zinc-600 dark:hover:bg-zinc-950"
                    />
                  </div>
                  <div className="max-h-96 overflow-y-auto p-2">
                    {filteredPromoBundles.length > 0 ? (
                      <div className="grid gap-2">
                        {filteredPromoBundles.map((bundle) => (
                          <PromoBundleCatalogItem
                            key={bundle.id}
                            bundle={bundle}
                            isActive={bundle.id === selectedPromoBundle?.id}
                            onLoadAsBasis={() => loadPromoBundleAsBasis(bundle)}
                            onUse={() => selectPromoBundleFromCatalog(bundle)}
                            useLabel={
                              isCatalogMode ? "Выбрать для запуска" : undefined
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-sm leading-6 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                        {promoBundles.length === 0
                          ? "Сохраненных наборов пока нет. Создайте первый после коммерческой проверки ниже."
                          : "По этому запросу наборов не найдено."}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.25fr)] lg:items-stretch">
            <div className="h-full rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                Шаг 2
              </p>
              <h4 className="mt-1 text-base font-semibold text-zinc-950 dark:text-white">
                Соберите две части
              </h4>
              <div className="mt-3 grid gap-2">
                <PromoBundlePartCard
                  label={bundleType.firstLabel}
                  value={bundleDraft.gameItem}
                  amount={bundleDraft.gamePrice}
                  isActive={activeBundlePart === "first"}
                  onClick={() => setActiveBundlePart("first")}
                />
                <PromoBundlePartCard
                  label={bundleType.secondLabel}
                  value={bundleDraft.barItems}
                  amount={bundleDraft.barPrice}
                  isActive={activeBundlePart === "second"}
                  onClick={() => setActiveBundlePart("second")}
                />
              </div>
            </div>

            <div className="h-full rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)] md:items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                    Шаг 3
                  </p>
                  <h4 className="mt-1 text-base font-semibold text-zinc-950 dark:text-white">
                    Уточните состав и цену
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    Сейчас редактируется: {activePartLabel}. {activePartHint}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                  Слева опишите, что получает гость. Справа укажите стоимость
                  этой части в рублях для расчета цены, скидки и маржи.
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
                <TextDraftField
                  label={`Что входит: ${activePartLabel}`}
                  tooltip={
                    activeBundlePart === "first"
                      ? bundleType.firstHint
                      : bundleType.secondHint
                  }
                  value={activePartValue}
                  placeholder={
                    activeBundlePart === "first"
                      ? bundleType.firstPlaceholder
                      : bundleType.secondPlaceholder
                  }
                  onChange={updateActivePartText}
                />
                <NumericDraftField
                  label="Стоимость, руб"
                  tooltip={activePriceHint}
                  value={
                    activeBundlePart === "first"
                      ? bundleDraft.gamePrice
                      : bundleDraft.barPrice
                  }
                  onChange={updateActivePartPrice}
                />
              </div>
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Фильтры подбора
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Нажмите, чтобы добавить критерий в состав.
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activePartFilters.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => applyPartFilter(filter)}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                  Шаг 4
                </p>
                <h4 className="mt-1 text-base font-semibold text-zinc-950 dark:text-white">
                  Расчет экономики
                </h4>
              </div>
              <p className="max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {bundleType.recommendation}
              </p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <NumericDraftField
                label="Скидка, руб"
                tooltip={bundleFieldHints.discount}
                value={bundleDraft.discount}
                onChange={(value) =>
                  onBundleDraftChange({ ...bundleDraft, discount: value })
                }
              />
              <NumericDraftField
                label="Себестоимость, руб"
                tooltip={bundleFieldHints.cost}
                value={bundleDraft.cost}
                onChange={(value) =>
                  onBundleDraftChange({ ...bundleDraft, cost: value })
                }
              />
              <NumericDraftField
                label="Лимит, шт"
                tooltip={bundleFieldHints.expectedUses}
                value={bundleDraft.expectedUses}
                onChange={(value) =>
                  onBundleDraftChange({ ...bundleDraft, expectedUses: value })
                }
              />
              <NumericDraftField
                label="Мин. чек, руб"
                tooltip={bundleFieldHints.minSpend}
                value={bundleDraft.minSpend}
                onChange={(value) =>
                  onBundleDraftChange({ ...bundleDraft, minSpend: value })
                }
              />
              <NumericDraftField
                label="Срок, дней"
                tooltip={bundleFieldHints.validityDays}
                value={bundleDraft.validityDays}
                onChange={(value) =>
                  onBundleDraftChange({ ...bundleDraft, validityDays: value })
                }
              />
              <TextDraftField
                label="Доп. условие"
                tooltip={bundleFieldHints.serviceItems}
                value={bundleDraft.serviceItems}
                placeholder="Например: только будни или ручная выдача"
                onChange={(value) =>
                  onBundleDraftChange({ ...bundleDraft, serviceItems: value })
                }
              />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Лимиты и антифрод
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <ToggleDraftField
                label="Один на гостя"
                checked={bundleDraft.onePerGuest}
                onChange={(checked) =>
                  onBundleDraftChange({
                    ...bundleDraft,
                    onePerGuest: checked,
                  })
                }
              />
              <ToggleDraftField
                label="Ручное подтверждение"
                checked={bundleDraft.requiresApproval}
                onChange={(checked) =>
                  onBundleDraftChange({
                    ...bundleDraft,
                    requiresApproval: checked,
                  })
                }
              />
              <ToggleDraftField
                label="Не суммировать скидки"
                checked={bundleDraft.noStacking}
                onChange={(checked) =>
                  onBundleDraftChange({
                    ...bundleDraft,
                    noStacking: checked,
                  })
                }
              />
            </div>
          </div>

          <PromoBundleAccountingPanel
            bundleType={bundleType}
            draft={bundleDraft}
            productOptions={productOptions}
            onChange={onBundleDraftChange}
          />

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <PromoMetric
              label="Цена"
              value={formatRubles(bundleEconomics.promoPrice)}
            />
            <PromoMetric
              label="Выручка"
              value={formatRubles(bundleEconomics.revenue)}
            />
            <PromoMetric
              label="Маржа"
              value={
                bundleEconomics.marginPercent === null
                  ? "нет данных"
                  : `${formatPercent(bundleEconomics.marginPercent)}`
              }
            />
            <PromoMetric
              label="Бюджет"
              value={formatRubles(bundleEconomics.discountBudget)}
            />
            <PromoMetric
              label="Мин. чек"
              value={formatRubles(parseMoney(bundleDraft.minSpend))}
            />
            <PromoMetric
              label="Срок"
              value={`${formatNumber(Math.round(parseMoney(bundleDraft.validityDays)))} дн.`}
            />
          </div>

          <PromoBundleStructureStrip structure={bundleStructure} />

          <PromoBundleVerdictCard
            verdict={bundleVerdict}
            notePreview={bundleNotePreview}
            bundleApplyNotice={bundleApplyNotice}
            isSavingBundle={isSavingBundle}
            onApplyBundle={onApplyBundle}
            mode={mode}
            actionLabelOverride={bundleActionLabel}
          />
        </div>
      </div>
    </section>
  );
}

function PromoBundleAccountingPanel({
  bundleType,
  draft,
  productOptions,
  onChange,
}: {
  bundleType: PromoBundleTypeOption;
  draft: PromoBundleDraft;
  productOptions: Product[];
  onChange: (draft: PromoBundleDraft) => void;
}) {
  const sortedProducts = useMemo(
    () =>
      [...productOptions].sort((left, right) => {
        if (left.isOperationalActive !== right.isOperationalActive) {
          return left.isOperationalActive ? -1 : 1;
        }

        return left.name.localeCompare(right.name, "ru-RU");
      }),
    [productOptions],
  );
  const selectedWriteOffRule =
    writeOffRuleOptions.find((option) => option.value === draft.writeOffRule) ??
    writeOffRuleOptions[0];

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Учетные привязки
          </p>
          <h4 className="mt-1 text-base font-semibold text-zinc-950 dark:text-white">
            Свяжите части набора с товаром, услугой или бонусом
          </h4>
        </div>
        <p className="max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Эти поля не запускают автоматическое списание в Langame, но сохраняют
          понятную основу для будущего учета товаров и услуг.
        </p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <PromoBundleAccountingPart
          title={bundleType.firstLabel}
          kind={draft.firstAccountingKind}
          productId={draft.firstAccountingProductId}
          reference={draft.firstAccountingReference}
          productOptions={sortedProducts}
          onKindChange={(kind) =>
            onChange({
              ...draft,
              firstAccountingKind: kind,
              firstAccountingProductId: "",
              firstAccountingReference: "",
            })
          }
          onProductIdChange={(productId) =>
            onChange({ ...draft, firstAccountingProductId: productId })
          }
          onReferenceChange={(reference) =>
            onChange({ ...draft, firstAccountingReference: reference })
          }
        />
        <PromoBundleAccountingPart
          title={bundleType.secondLabel}
          kind={draft.secondAccountingKind}
          productId={draft.secondAccountingProductId}
          reference={draft.secondAccountingReference}
          productOptions={sortedProducts}
          onKindChange={(kind) =>
            onChange({
              ...draft,
              secondAccountingKind: kind,
              secondAccountingProductId: "",
              secondAccountingReference: "",
            })
          }
          onProductIdChange={(productId) =>
            onChange({ ...draft, secondAccountingProductId: productId })
          }
          onReferenceChange={(reference) =>
            onChange({ ...draft, secondAccountingReference: reference })
          }
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,0.45fr)_minmax(0,1fr)]">
        <label className="block space-y-1">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Правило списания
            <FieldTooltip text={bundleFieldHints.writeOffRule} />
          </span>
          <select
            value={draft.writeOffRule}
            onChange={(event) =>
              onChange({
                ...draft,
                writeOffRule: event.target.value as PromoBundleWriteOffRule,
              })
            }
            className={fieldClassName}
          >
            {writeOffRuleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {selectedWriteOffRule.description}
          </span>
        </label>
        <TextDraftField
          label="Комментарий для учета"
          value={draft.accountingNote}
          placeholder="Например: списать напиток по факту выдачи, игровое время сверить по смене"
          onChange={(accountingNote) => onChange({ ...draft, accountingNote })}
        />
      </div>
    </div>
  );
}

function PromoBundleAccountingPart({
  title,
  kind,
  productId,
  reference,
  productOptions,
  onKindChange,
  onProductIdChange,
  onReferenceChange,
}: {
  title: string;
  kind: PromoBundleAccountingKind;
  productId: string;
  reference: string;
  productOptions: Product[];
  onKindChange: (kind: PromoBundleAccountingKind) => void;
  onProductIdChange: (productId: string) => void;
  onReferenceChange: (reference: string) => void;
}) {
  const isProduct = kind === "PRODUCT";

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
      <p className="text-sm font-semibold text-zinc-950 dark:text-white">
        {title}
      </p>
      <div className="mt-3 grid gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Тип привязки
          </span>
          <select
            value={kind}
            onChange={(event) =>
              onKindChange(event.target.value as PromoBundleAccountingKind)
            }
            className={fieldClassName}
          >
            {accountingKindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {isProduct ? (
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Товар
            </span>
            <select
              value={productId}
              onChange={(event) => onProductIdChange(event.target.value)}
              className={fieldClassName}
            >
              <option value="">Выберите товар</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {productAccountingLabel(product)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <TextDraftField
            label={accountingReferenceLabel(kind)}
            tooltip={bundleFieldHints.accountingReference}
            value={reference}
            placeholder={accountingReferencePlaceholder(kind)}
            onChange={onReferenceChange}
          />
        )}
      </div>
    </div>
  );
}

function PromoBundleStandaloneLaunchPanel({
  launches,
  launchForm,
  selectedPromoBundle,
  promoBundles,
  stores,
  isCreatingLaunch,
  pendingLaunchId,
  onLaunchFormChange,
  onCreateLaunch,
  onUpdateLaunchStatus,
}: {
  launches: MarketingPromoBundleLaunch[];
  launchForm: PromoBundleLaunchFormState;
  selectedPromoBundle: MarketingPromoBundle | null;
  promoBundles: MarketingPromoBundle[];
  stores: Store[];
  isCreatingLaunch: boolean;
  pendingLaunchId: string | null;
  onLaunchFormChange: (next: PromoBundleLaunchFormState) => void;
  onCreateLaunch: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onUpdateLaunchStatus: (
    launch: MarketingPromoBundleLaunch,
    status: MarketingPromoBundleLaunchStatus,
  ) => void | Promise<void>;
}) {
  const activeLaunches = launches.filter((launch) => launch.status === "ACTIVE");
  const selectedDraft = selectedPromoBundle
    ? promoBundleToDraft(selectedPromoBundle)
    : null;
  const selectedEconomics = selectedDraft
    ? buildPromoBundleEconomics(selectedDraft)
    : null;
  const canCreate =
    Boolean(launchForm.promoBundleId) &&
    (launchForm.scope === "NETWORK" || launchForm.storeIds.length > 0);

  function selectPromoBundle(id: string) {
    const bundle = promoBundles.find((item) => item.id === id);
    const draft = bundle ? promoBundleToDraft(bundle) : null;

    onLaunchFormChange({
      ...launchForm,
      promoBundleId: id,
      maxUses: launchForm.maxUses || draft?.expectedUses || "",
    });
  }

  function setScope(scope: PromoBundleLaunchFormState["scope"]) {
    onLaunchFormChange({
      ...launchForm,
      scope,
      storeIds: scope === "NETWORK" ? [] : launchForm.storeIds,
    });
  }

  function toggleStore(storeId: string) {
    const isSelected = launchForm.storeIds.includes(storeId);
    const storeIds = isSelected
      ? launchForm.storeIds.filter((id) => id !== storeId)
      : [...launchForm.storeIds, storeId];

    onLaunchFormChange({
      ...launchForm,
      scope: "STORES",
      storeIds,
    });
  }

  return (
    <section
      id="bundle-launches"
      className="scroll-mt-6 border-b border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                Запуск без кампании
              </p>
              <h3 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">
                Отдельный промо-набор для сети или клубов
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Используйте сохраненный набор как клубный оффер без группы гостей,
                CRM-задачи и карточки кампании. Он остается в каталоге, а запуск
                фиксирует область действия, период, лимит и инструкцию для
                администраторов.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <MetricPill label="Запусков" value={launches.length} />
              <MetricPill label="Активные" value={activeLaunches.length} />
            </div>
          </div>

          <form onSubmit={onCreateLaunch} className="mt-4 grid gap-3">
            <Field label="Промо-набор">
              <select
                value={launchForm.promoBundleId}
                onChange={(event) => selectPromoBundle(event.target.value)}
                className={fieldClassName}
              >
                <option value="">Выберите набор из каталога</option>
                {promoBundles.map((bundle) => (
                  <option key={bundle.id} value={bundle.id}>
                    {bundle.name} · {promoBundleTypeLabel(bundle.bundleType)}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.52fr)]">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Область действия
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setScope("NETWORK")}
                    className={launchScopeButtonClass(
                      launchForm.scope === "NETWORK",
                    )}
                  >
                    Вся сеть
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("STORES")}
                    className={launchScopeButtonClass(
                      launchForm.scope === "STORES",
                    )}
                  >
                    Выбрать клубы
                  </button>
                </div>
                {launchForm.scope === "STORES" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stores.map((store) => {
                      const isSelected = launchForm.storeIds.includes(store.id);

                      return (
                        <button
                          key={store.id}
                          type="button"
                          onClick={() => toggleStore(store.id)}
                          className={[
                            "rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-sm",
                            isSelected
                              ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300",
                          ].join(" ")}
                        >
                          {store.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                    Набор будет считаться доступным для всей сети. Если нужны
                    исключения, переключите на выбор клубов.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Быстрая проверка
                </p>
                <dl className="mt-2 grid gap-2 text-sm">
                  <CompactInfo
                    label="Набор"
                    value={selectedPromoBundle?.name ?? "не выбран"}
                  />
                  <CompactInfo
                    label="Клубы"
                    value={
                      launchForm.scope === "NETWORK"
                        ? "Вся сеть"
                        : storeLabel(launchForm.storeIds, stores)
                    }
                  />
                  <CompactInfo
                    label="Цена"
                    value={
                      selectedEconomics
                        ? formatRubles(selectedEconomics.promoPrice)
                        : "не задан"
                    }
                  />
                </dl>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Период с">
                <input
                  type="date"
                  value={launchForm.periodFrom}
                  onChange={(event) =>
                    onLaunchFormChange({
                      ...launchForm,
                      periodFrom: event.target.value,
                    })
                  }
                  className={fieldClassName}
                />
              </Field>
              <Field label="Период по">
                <input
                  type="date"
                  value={launchForm.periodTo}
                  onChange={(event) =>
                    onLaunchFormChange({
                      ...launchForm,
                      periodTo: event.target.value,
                    })
                  }
                  className={fieldClassName}
                />
              </Field>
              <Field label="Лимит, шт">
                <input
                  inputMode="numeric"
                  value={launchForm.maxUses}
                  onChange={(event) =>
                    onLaunchFormChange({
                      ...launchForm,
                      maxUses: event.target.value,
                    })
                  }
                  placeholder="Без лимита"
                  className={fieldClassName}
                />
              </Field>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={!canCreate || isCreatingLaunch}
                  className={[
                    "min-h-11 w-full rounded-xl px-4 text-sm font-semibold transition",
                    canCreate && !isCreatingLaunch
                      ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                      : "cursor-not-allowed border border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600",
                  ].join(" ")}
                >
                  {isCreatingLaunch ? "Запускаем..." : "Запустить набор"}
                </button>
              </div>
            </div>

            <Field label="Инструкция для запуска">
              <input
                value={launchForm.note}
                onChange={(event) =>
                  onLaunchFormChange({
                    ...launchForm,
                    note: event.target.value,
                  })
                }
                placeholder="Например: объявить на кассе, применять вручную, отмечать факт использования"
                className={fieldClassName}
              />
            </Field>
          </form>
        </div>

        <div className="min-w-0 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Текущие отдельные запуски
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Это не кампании: здесь нет группы гостей и CRM-задачи. Запуск
              показывает, где набор можно применять и в каком статусе он сейчас.
            </p>
          </div>
          <div className="max-h-[520px] divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
            {launches.length > 0 ? (
              launches.map((launch) => (
                <article key={launch.id} className="grid gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={promoBundleLaunchStatusClass(launch.status)}>
                        {promoBundleLaunchStatusLabel(launch.status)}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {promoBundleTypeLabel(launch.promoBundle.bundleType)}
                      </span>
                    </div>
                    <h4 className="mt-2 truncate text-base font-semibold text-zinc-950 dark:text-white">
                      {launch.promoBundle.name}
                    </h4>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <CompactInfo
                        label="Клубы"
                        value={storeLabel(launch.storeIds, stores)}
                      />
                      <CompactInfo
                        label="Период"
                        value={launchPeriodLabel(launch)}
                      />
                      <CompactInfo
                        label="Лимит"
                        value={
                          launch.maxUses
                            ? `${formatNumber(launch.maxUses)} шт`
                            : "без лимита"
                        }
                      />
                      <CompactInfo
                        label="Создан"
                        value={formatDate(launch.createdAt)}
                      />
                    </dl>
                    {launch.note ? (
                      <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
                        {launch.note}
                      </p>
                    ) : null}
                  </div>
                  <select
                    value={launch.status}
                    disabled={pendingLaunchId === launch.id}
                    onChange={(event) =>
                      onUpdateLaunchStatus(
                        launch,
                        event.target.value as MarketingPromoBundleLaunchStatus,
                      )
                    }
                    className="min-h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    {promoBundleLaunchStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </article>
              ))
            ) : (
              <div className="p-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Самостоятельных запусков пока нет. Сохраните промо-набор в
                каталоге, выберите сеть или клубы и запустите его без кампании.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PromoBundlePartCard({
  label,
  value,
  amount,
  isActive,
  onClick,
}: {
  label: string;
  value: string;
  amount: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30",
        isActive
          ? "border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-500/10"
          : "border-zinc-200 bg-zinc-50 hover:border-emerald-400 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-900/80",
      ].join(" ")}
    >
      <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="mt-1 block text-sm font-semibold leading-5 text-zinc-950 dark:text-white">
        Состав: {value.trim() || "не выбрано"}
      </span>
      <span className="mt-2 block text-sm text-zinc-600 dark:text-zinc-300">
        Стоимость: {formatRubles(parseMoney(amount))}
      </span>
    </button>
  );
}

function PromoBundleCatalogItem({
  bundle,
  isActive,
  onLoadAsBasis,
  onUse,
  useLabel = "Выбрать",
}: {
  bundle: MarketingPromoBundle;
  isActive: boolean;
  onLoadAsBasis: () => void;
  onUse: () => void;
  useLabel?: string;
}) {
  const draft = promoBundleToDraft(bundle);
  const economics = buildPromoBundleEconomics(draft);
  const composition = [draft.gameItem, draft.barItems]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" + ");
  const margin =
    economics.marginPercent === null
      ? "маржа не рассчитана"
      : `маржа ${formatPercent(economics.marginPercent)}`;

  return (
    <div
      className={[
        "grid gap-3 rounded-lg border p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center",
        isActive
          ? "border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-500/10"
          : "border-zinc-200 bg-zinc-50 hover:border-emerald-400 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-900/80",
      ].join(" ")}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
            {bundle.name}
          </p>
          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            {promoBundleTypeLabel(draft.bundleType)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          {composition || "Состав набора не заполнен"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          <span>{formatRubles(economics.promoPrice)}</span>
          <span>{margin}</span>
          <span>{formatNumber(economics.expectedUses)} исп.</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <button
          type="button"
          onClick={onLoadAsBasis}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-400 hover:text-emerald-600 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
        >
          Как основу
        </button>
        <button
          type="button"
          onClick={onUse}
          className="inline-flex min-h-9 items-center justify-center rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        >
          {useLabel}
        </button>
      </div>
    </div>
  );
}

function NumericDraftField({
  label,
  tooltip,
  value,
  onChange,
}: {
  label: string;
  tooltip?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
        {tooltip ? <FieldTooltip text={tooltip} /> : null}
      </span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClassName}
      />
    </label>
  );
}

function DisclosureChevron({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={[
        "h-4 w-4 translate-y-px transition-transform duration-200",
        isOpen ? "rotate-180" : "",
      ].join(" ")}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function TextDraftField({
  label,
  tooltip,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  tooltip?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
        {tooltip ? <FieldTooltip text={tooltip} /> : null}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClassName}
      />
    </label>
  );
}

function FieldTooltip({ text }: { text: string }) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    placement: "top" | "bottom";
  } | null>(null);

  function showTooltip() {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 24);
    const margin = 12;
    const estimatedHeight = 128;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, margin),
      window.innerWidth - width - margin,
    );
    const hasSpaceBelow =
      rect.bottom + estimatedHeight + margin <= window.innerHeight;

    setPosition({
      left,
      top: hasSpaceBelow ? rect.bottom + 8 : Math.max(margin, rect.top - 8),
      placement: hasSpaceBelow ? "bottom" : "top",
    });
  }

  return (
    <span className="inline-flex">
      <span
        ref={triggerRef}
        tabIndex={0}
        title={text}
        aria-label={text}
        onFocus={showTooltip}
        onBlur={() => setPosition(null)}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setPosition(null)}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-zinc-300 text-[10px] font-bold leading-none text-zinc-500 outline-none transition hover:border-emerald-400 hover:text-emerald-500 focus:border-emerald-400 focus:text-emerald-500 dark:border-zinc-700 dark:text-zinc-400"
      >
        ?
      </span>
      {position
        ? createPortal(
            <span
              role="tooltip"
              style={{
                left: position.left,
                top: position.top,
                width: Math.min(280, window.innerWidth - 24),
                transform:
                  position.placement === "top"
                    ? "translateY(-100%)"
                    : undefined,
              }}
              className="pointer-events-none fixed z-[1000] rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs font-medium normal-case leading-5 tracking-normal text-zinc-700 shadow-xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

function ToggleDraftField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400/70 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-emerald-500"
      />
    </label>
  );
}

function MechanicDecisionItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-sm leading-5 text-zinc-700 dark:text-zinc-300">
        {value}
      </p>
    </div>
  );
}

function PromoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function PromoBundleStructureStrip({
  structure,
}: {
  structure: MarketingPromoBundleStructure;
}) {
  const missing =
    structure.accounting.missingFields.length > 0
      ? `Уточнить: ${structure.accounting.missingFields.join(", ")}`
      : structure.accounting.writeOffLabel;
  const accountingDetails = [
    structure.accounting.firstRef.label,
    structure.accounting.secondRef.label,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Паспорт набора
        </p>
        <span
          className={[
            "rounded-full border px-2.5 py-1 text-xs font-semibold",
            structure.accounting.readiness === "READY"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          ].join(" ")}
        >
          {structure.accounting.label}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <PromoBundlePassportItem
          label="Состав"
          value={structure.composition.summary}
        />
        <PromoBundlePassportItem
          label="Цена"
          value={`${formatRubles(structure.pricing.promoPrice)} из ${formatRubles(
            structure.pricing.basePrice,
          )}`}
        />
        <PromoBundlePassportItem
          label="Лимит"
          value={`${formatNumber(structure.limits.expectedUses)} исп. · ${formatNumber(
            structure.limits.validityDays,
          )} дн.`}
        />
        <PromoBundlePassportItem
          label="Учет"
          value={accountingDetails ? `${missing} · ${accountingDetails}` : missing}
        />
      </div>
    </div>
  );
}

function PromoBundlePassportItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function PromoBundleVerdictCard({
  verdict,
  notePreview,
  bundleApplyNotice,
  isSavingBundle,
  onApplyBundle,
  mode = "campaign",
  actionLabelOverride,
}: {
  verdict: PromoBundleVerdict;
  notePreview: string;
  bundleApplyNotice: boolean;
  isSavingBundle: boolean;
  onApplyBundle: () => void | Promise<void>;
  mode?: "campaign" | "catalog";
  actionLabelOverride?: string;
}) {
  const isCatalogMode = mode === "catalog";
  const toneClass =
    verdict.tone === "ready"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : verdict.tone === "blocked"
        ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  const canCreateBundle = verdict.tone !== "blocked";
  const statusLabel =
    verdict.tone === "ready"
      ? "Проверка пройдена"
      : verdict.tone === "blocked"
        ? "Есть блокер"
        : "Нужна ручная проверка";
  const actionLabel = isSavingBundle
    ? "Сохраняем..."
    : actionLabelOverride
      ? actionLabelOverride
    : verdict.tone === "ready"
      ? isCatalogMode
        ? "Создать промо-набор"
        : "Создать и сохранить промо-набор"
      : verdict.tone === "warning"
        ? "Сохранить после ручной проверки"
        : "Исправьте расчет";
  const nextStepText = bundleApplyNotice
    ? isCatalogMode
      ? "Набор сохранен в каталог и открыт в конструкторе."
      : "Набор сохранен в каталог и уже связан с формой кампании."
    : verdict.tone === "ready"
      ? isCatalogMode
        ? "Экономика прошла проверку. Сохраните набор в каталог или обновите выбранный набор."
        : "Экономика прошла проверку. Сохраните набор в каталог и привяжите его к черновику кампании."
      : verdict.tone === "warning"
        ? "Есть предупреждения. Сохранение доступно, но сначала проверьте условия и лимиты."
        : "Исправьте блокирующие ошибки, затем сохраните набор.";

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-4 border-b border-zinc-200 p-4 dark:border-zinc-800 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Коммерческая проверка
            </p>
            <span
              className={[
                "rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide",
                toneClass,
              ].join(" ")}
            >
              {statusLabel}
            </span>
          </div>
          <h4 className="mt-2 text-base font-semibold text-zinc-950 dark:text-white">
            {verdict.title}
          </h4>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {verdict.description}
          </p>
        </div>
        <div className="flex flex-col justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Действие после проверки
            </p>
            <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
              {nextStepText}
            </p>
          </div>
          <button
            type="button"
            onClick={onApplyBundle}
            disabled={!canCreateBundle || isSavingBundle}
            className={[
              "mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition",
              canCreateBundle && !isSavingBundle
                ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                : "cursor-not-allowed border border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600",
            ].join(" ")}
          >
            {actionLabel}
          </button>
        </div>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Что проверили
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {verdict.checks.map((check) => (
              <div
                key={check}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-5 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300"
              >
                {check}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Что будет дальше
          </p>
          <div className="mt-2 grid gap-2">
            <NextStepItem
              title="Каталог"
              text="Промо-набор сохранится как отдельная сущность и появится в списке готовых наборов."
            />
            <NextStepItem
              title="Кампания"
              text={
                isCatalogMode
                  ? "Если понадобится CRM-сценарий, этот же набор можно будет привязать к кампании без пересборки."
                  : "Расчет, механика и ссылка на набор перенесутся в форму кампании для выбора группы, периода и ответственного."
              }
            />
            <NextStepItem
              title={isCatalogMode ? "Повторное использование" : "Ассортимент и учет"}
              text={
                isCatalogMode
                  ? "Набор остается в каталоге: его можно открыть, поправить и затем использовать в кампании, ассортименте или учете услуг."
                  : "Позже этот же набор можно будет использовать в ассортименте, услугах и товарном учете без пересборки с нуля."
              }
            />
          </div>
        </div>
      </div>
      <p className="mx-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
        {bundleApplyNotice
          ? isCatalogMode
            ? "Промо-набор сохранен в каталог. Можно продолжать правку или выбрать другой набор."
            : "Промо-набор уже перенесен в форму кампании. Проверьте группу, период, ответственного и сохраните черновик."
          : "После проверки создайте промо-набор: он сохранится как отдельный элемент каталога, сможет быть привязан к кампании и позднее использоваться в ассортименте, товарах и услугах."}
      </p>
      <details className="m-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-950 dark:text-white">
          {isCatalogMode
            ? "Что сохранится в заметке набора"
            : "Что попадет в заметку кампании"}
        </summary>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {notePreview}
        </p>
      </details>
    </div>
  );
}

function NextStepItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70">
      <p className="text-sm font-semibold text-zinc-950 dark:text-white">
        {title}
      </p>
      <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
        {text}
      </p>
    </div>
  );
}

function CampaignDraftHandoff({
  form,
  selectedAudience,
  selectedPromoBundle,
  steps,
  isSubmitting,
  onBackToBundle,
}: {
  form: CampaignFormState;
  selectedAudience: GuestAudience | null;
  selectedPromoBundle: MarketingPromoBundle | null;
  steps: CampaignReadinessItem[];
  isSubmitting: boolean;
  onBackToBundle: () => void;
}) {
  const done = steps.filter((step) => step.done).length;
  const firstIssue = steps.find((step) => !step.done)?.issue ?? null;
  const isPromoBundleCampaign =
    form.goal === "PROMO_BUNDLE" || Boolean(selectedPromoBundle);
  const readinessClass =
    firstIssue === null
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return (
    <div className="grid gap-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10 lg:col-span-12 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
            Кампания из оффера
          </p>
          <span
            className={[
              "rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
              readinessClass,
            ].join(" ")}
          >
            Готовность {done}/{steps.length}
          </span>
        </div>
        <h3 className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">
          {selectedPromoBundle
            ? `Набор "${selectedPromoBundle.name}" готов к черновику`
            : isPromoBundleCampaign
              ? "Промо-набор подставлен в кампанию"
              : "Соберите черновик кампании"}
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700 dark:text-zinc-200">
          {isPromoBundleCampaign
            ? "Осталось выбрать группу, период, ответственного и сохранить черновик. После этого в карточке кампании можно создать CRM-задачу и контролировать эффект."
            : "Заполните ключевые поля, чтобы кампания стала рабочим планом: группа, канал, механика, срок и ответственный."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {steps.map((step) => (
            <DraftStepBadge key={step.label} step={step} />
          ))}
        </div>
        <dl className="mt-4 grid gap-2 text-sm md:grid-cols-3">
          <CompactInfo
            label="Группа"
            value={
              selectedAudience
                ? `${selectedAudience.name} · ${formatNumber(
                    selectedAudience.guestsCount,
                  )} гостей`
                : "не выбрана"
            }
          />
          <CompactInfo
            label="Период"
            value={
              form.periodFrom && form.periodTo
                ? `${formatDate(form.periodFrom)} - ${formatDate(form.periodTo)}`
                : "не задан"
            }
          />
          <CompactInfo
            label="Канал и механика"
            value={`${form.channel || "канал не выбран"} · ${
              form.mechanic || "механика не выбрана"
            }`}
          />
        </dl>
      </div>
      <div className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Следующий шаг
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {firstIssue
              ? `Заполните: ${firstIssue}.`
              : "Все базовые поля заполнены. Сохраните черновик и переходите к запуску."}
          </p>
        </div>
        <div className="mt-3 grid gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Сохраняем..." : "Сохранить черновик"}
          </button>
          <button
            type="button"
            onClick={onBackToBundle}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-emerald-500/70 dark:hover:bg-zinc-900"
          >
            Вернуться к набору
          </button>
          {!selectedAudience ? (
            <Link
              href="/guests/report#audiences"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-emerald-500/70 dark:hover:bg-zinc-900"
            >
              Создать группу
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DraftStepBadge({ step }: { step: CampaignReadinessItem }) {
  return (
    <span
      className={[
        "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold",
        step.done
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400",
      ].join(" ")}
    >
      {step.done ? "Готово: " : "Нужно: "}
      {step.label}
    </span>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={["block space-y-1", className].filter(Boolean).join(" ")}>
      <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function CampaignGroupRoute({
  selectedAudience,
  audiencesCount,
}: {
  selectedAudience: GuestAudience | null;
  audiencesCount: number;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60 lg:col-span-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
          Группа для кампании
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {selectedAudience
            ? `Выбрана группа "${selectedAudience.name}" на ${formatNumber(
                selectedAudience.guestsCount,
              )} гостей. Контакты, согласия и эффект будут считаться по ней.`
            : audiencesCount > 0
              ? "Выберите сохраненную группу выше или создайте новую из фильтров гостей, чтобы кампания считала охват и согласия."
              : "Сохраненных групп пока нет. Сначала соберите группу из фильтров гостей, затем вернитесь к запуску кампании."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/guests/report#audiences"
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
        >
          Создать из фильтров
        </Link>
        <Link
          href="/guests/crm"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400 hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-emerald-500/70 dark:hover:bg-zinc-950"
        >
          Открыть CRM-группы
        </Link>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-2xl font-bold text-zinc-950 dark:text-white">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
    </div>
  );
}

function CampaignReadinessBar({ readiness }: { readiness: CampaignReadiness }) {
  const barClass =
    readiness.tone === "ready"
      ? "bg-emerald-500"
      : readiness.tone === "blocked"
        ? "bg-red-400"
        : "bg-amber-400";

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Готовность: {readiness.done}/{readiness.total}
        </p>
        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          {readiness.firstIssue
            ? `Следующий шаг: ${readiness.firstIssue}`
            : "можно запускать и контролировать"}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={["h-full rounded-full", barClass].join(" ")}
          style={{ width: `${readiness.percent}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {readiness.items.map((item) => (
          <span
            key={item.label}
            className={[
              "rounded-full border px-2.5 py-1 text-xs font-semibold",
              item.done
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-zinc-300 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400",
            ].join(" ")}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 truncate font-semibold text-zinc-950 dark:text-white">
        {value}
      </dd>
    </div>
  );
}

function buildPromoBundleEconomics(
  draft: PromoBundleDraft,
): PromoBundleEconomics {
  const basePrice =
    parseMoney(draft.gamePrice) +
    parseMoney(draft.barPrice) +
    parseMoney(draft.servicePrice);
  const discount = parseMoney(draft.discount);
  const promoPrice = Math.max(0, basePrice - discount);
  const expectedUses = Math.max(0, Math.round(parseMoney(draft.expectedUses)));
  const revenue = promoPrice * expectedUses;
  const cost = parseMoney(draft.cost) * expectedUses;
  const margin = revenue - cost;
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : null;
  const discountBudget = discount * expectedUses;

  return {
    basePrice,
    promoPrice,
    expectedUses,
    revenue,
    cost,
    margin,
    marginPercent,
    discountBudget,
  };
}

function buildPromoBundleVerdict(
  draft: PromoBundleDraft,
  economics: PromoBundleEconomics,
): PromoBundleVerdict {
  const discount = parseMoney(draft.discount);
  const costPerUse = parseMoney(draft.cost);
  const minSpend = parseMoney(draft.minSpend);
  const validityDays = Math.round(parseMoney(draft.validityDays));
  const discountShare =
    economics.basePrice > 0 ? (discount / economics.basePrice) * 100 : 0;

  if (economics.basePrice <= 0 || economics.promoPrice <= 0) {
    return {
      tone: "blocked",
      title: "Набор пока нельзя сохранить",
      description:
        "Заполните состав и цену набора, чтобы оффер не сохранился с нулевой ценой.",
      checks: [
        "Добавьте стоимость игры, бара или сервиса.",
        "Промо-цена должна быть больше 0 руб.",
        "После правки сохраните набор в каталог.",
      ],
    };
  }

  if (economics.expectedUses <= 0) {
    return {
      tone: "blocked",
      title: "Нужен лимит использований",
      description:
        "Без лимита нельзя оценить бюджет скидки и контролировать расход механики.",
      checks: [
        "Укажите лимит в штуках.",
        "Оставьте «один на гостя», если акция персональная.",
        "Для дорогих наборов включите ручное подтверждение.",
      ],
    };
  }

  if (economics.margin < 0) {
    return {
      tone: "blocked",
      title: "Риск убыточной акции",
      description:
        "Оценочная маржа отрицательная. Перед запуском нужно поднять цену, снизить скидку или пересмотреть состав.",
      checks: [
        `Маржа: ${formatRubles(economics.margin)}.`,
        `Скидочный бюджет: ${formatRubles(economics.discountBudget)}.`,
        "Запускать только после ручного согласования.",
      ],
    };
  }

  const checks = [
    `Оценочная выручка: ${formatRubles(economics.revenue)} при лимите ${formatNumber(
      economics.expectedUses,
    )} шт.`,
    costPerUse > 0
      ? `Маржа: ${formatRubles(economics.margin)}${
          economics.marginPercent === null
            ? ""
            : ` (${formatPercent(economics.marginPercent)})`
        }.`
      : "Себестоимость не задана: маржа выглядит завышенной.",
    minSpend > 0
      ? `Минимальный чек: ${formatRubles(minSpend)}.`
      : "Минимальный чек не задан: проверьте, не размоет ли акция средний чек.",
    validityDays > 0
      ? `Срок действия: ${formatNumber(validityDays)} дн.`
      : "Срок действия не задан: ограничьте период вручную.",
  ];

  if (costPerUse <= 0 || minSpend <= 0 || discountShare > 35) {
    return {
      tone: "warning",
      title: "Можно сохранить после проверки условий",
      description:
        "Экономика не блокирует сохранение, но перед использованием нужно проверить себестоимость, минимальный чек и размер скидки.",
      checks,
    };
  }

  return {
    tone: "ready",
    title: "Набор готов к сохранению",
    description:
      "Цена, лимит, срок, маржа и антифрод выглядят достаточно понятно для ручного применения.",
    checks,
  };
}

function buildMechanicTemplateNote(template: PromoMechanicTemplate) {
  return [
    template.note,
    `Кому: ${template.audienceHint}.`,
    `KPI: ${template.primaryKpi}.`,
    `Контроль: ${template.controlPoint}.`,
    `Риск: ${template.risk}.`,
  ].join(" ");
}

function buildMechanicTemplateConfig(
  template: PromoMechanicTemplate,
): MarketingMechanicConfig {
  return {
    kind: "template",
    templateId: template.id,
    title: template.title,
    goal: template.goal,
    channel: template.channel,
    mechanic: template.mechanic,
    audienceHint: template.audienceHint,
    primaryKpi: template.primaryKpi,
    controlPoint: template.controlPoint,
    risk: template.risk,
  };
}

function getPromoBundleTypeOption(type: PromoBundleType) {
  return (
    promoBundleTypeOptions.find((option) => option.id === type) ??
    promoBundleTypeOptions[0]
  );
}

function promoBundleTypeLabel(type: string) {
  const option = promoBundleTypeOptions.find((item) => item.id === type);
  return option?.title ?? "Произвольный набор";
}

function defaultAccountingForBundleType(
  type: PromoBundleType,
): Pick<
  PromoBundleDraft,
  | "firstAccountingKind"
  | "firstAccountingProductId"
  | "firstAccountingReference"
  | "secondAccountingKind"
  | "secondAccountingProductId"
  | "secondAccountingReference"
> {
  if (type === "product_product") {
    return {
      firstAccountingKind: "PRODUCT",
      firstAccountingProductId: "",
      firstAccountingReference: "",
      secondAccountingKind: "PRODUCT",
      secondAccountingProductId: "",
      secondAccountingReference: "",
    };
  }

  if (type === "game_bonus" || type === "balance_bonus") {
    return {
      firstAccountingKind: "SERVICE",
      firstAccountingProductId: "",
      firstAccountingReference: "",
      secondAccountingKind: "BONUS",
      secondAccountingProductId: "",
      secondAccountingReference: "",
    };
  }

  return {
    firstAccountingKind: "SERVICE",
    firstAccountingProductId: "",
    firstAccountingReference: "",
    secondAccountingKind: "PRODUCT",
    secondAccountingProductId: "",
    secondAccountingReference: "",
  };
}

function productAccountingLabel(product: Product) {
  return [
    product.name,
    product.article ? `арт. ${product.article}` : null,
    product.category?.name ?? null,
    product.storeNames.length > 0 ? product.storeNames.slice(0, 2).join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function accountingReferenceLabel(kind: PromoBundleAccountingKind) {
  if (kind === "SERVICE") {
    return "Код услуги";
  }

  if (kind === "BONUS") {
    return "Код бонуса";
  }

  return "Ручная ссылка";
}

function accountingReferencePlaceholder(kind: PromoBundleAccountingKind) {
  if (kind === "SERVICE") {
    return "Например: пакет 5 часов, бронь, кальян";
  }

  if (kind === "BONUS") {
    return "Например: +100 бонусов или +60 минут";
  }

  return "Например: выдать администратором и сверить в конце смены";
}

function accountingKindLabel(kind: PromoBundleAccountingKind) {
  const labels: Record<PromoBundleAccountingKind, string> = {
    PRODUCT: "товар из ассортимента",
    SERVICE: "услуга / игровое время",
    BONUS: "бонусная операция",
    MANUAL: "ручной учет",
  };

  return labels[kind];
}

function writeOffRuleLabel(rule: PromoBundleWriteOffRule) {
  const labels: Record<PromoBundleWriteOffRule, string> = {
    ON_REDEEM: "списать при использовании",
    ON_SALE: "списать при продаже",
    MANUAL: "ручная сверка",
  };

  return labels[rule];
}

function promoBundleToDraft(bundle: MarketingPromoBundle): PromoBundleDraft {
  const config = isRecord(bundle.mechanicConfig) ? bundle.mechanicConfig : {};
  const bundleType = resolvePromoBundleType(
    optionalText(config.bundleType, bundle.bundleType),
  );
  const option = getPromoBundleTypeOption(bundleType);
  const composition = isRecord(config.composition) ? config.composition : {};
  const bundleValues = isRecord(config.bundle) ? config.bundle : {};
  const accounting = isRecord(config.accounting) ? config.accounting : {};
  const firstAccounting = isRecord(accounting.first) ? accounting.first : {};
  const secondAccounting = isRecord(accounting.second) ? accounting.second : {};
  const accountingDefaults = defaultAccountingForBundleType(bundleType);

  return {
    ...emptyBundleDraft,
    ...accountingDefaults,
    bundleType,
    gameItem: optionalText(composition.first, option.firstDefault),
    barItems: optionalText(composition.second, option.secondDefault),
    serviceItems: optionalText(composition.extraCondition, ""),
    gamePrice: optionalNumberString(bundleValues.gamePrice, emptyBundleDraft.gamePrice),
    barPrice: optionalNumberString(bundleValues.barPrice, emptyBundleDraft.barPrice),
    servicePrice: optionalNumberString(
      bundleValues.servicePrice,
      emptyBundleDraft.servicePrice,
    ),
    discount: optionalNumberString(bundleValues.discount, emptyBundleDraft.discount),
    cost: optionalNumberString(bundleValues.cost, emptyBundleDraft.cost),
    expectedUses: optionalNumberString(
      bundleValues.expectedUses,
      emptyBundleDraft.expectedUses,
    ),
    minSpend: optionalNumberString(bundleValues.minSpend, emptyBundleDraft.minSpend),
    validityDays: optionalNumberString(
      bundleValues.validityDays,
      emptyBundleDraft.validityDays,
    ),
    onePerGuest: optionalBoolean(
      bundleValues.onePerGuest,
      emptyBundleDraft.onePerGuest,
    ),
    requiresApproval: optionalBoolean(
      bundleValues.requiresApproval,
      emptyBundleDraft.requiresApproval,
    ),
    noStacking: optionalBoolean(
      bundleValues.noStacking,
      emptyBundleDraft.noStacking,
    ),
    firstAccountingKind: optionalAccountingKind(
      firstAccounting.kind,
      accountingDefaults.firstAccountingKind,
    ),
    firstAccountingProductId: optionalText(firstAccounting.productId, ""),
    firstAccountingReference: optionalText(firstAccounting.reference, ""),
    secondAccountingKind: optionalAccountingKind(
      secondAccounting.kind,
      accountingDefaults.secondAccountingKind,
    ),
    secondAccountingProductId: optionalText(secondAccounting.productId, ""),
    secondAccountingReference: optionalText(secondAccounting.reference, ""),
    writeOffRule: optionalWriteOffRule(
      accounting.writeOffRule,
      emptyBundleDraft.writeOffRule,
    ),
    accountingNote: optionalText(accounting.note, ""),
  };
}

function promoBundleStructureFromBundle(
  bundle: MarketingPromoBundle,
): MarketingPromoBundleStructure {
  if (bundle.structure) {
    return bundle.structure;
  }

  const draft = promoBundleToDraft(bundle);
  return promoBundleStructureFromDraft(draft, buildPromoBundleEconomics(draft));
}

function promoBundleStructureFromDraft(
  draft: PromoBundleDraft,
  economics: PromoBundleEconomics,
  productOptions: Product[] = [],
): MarketingPromoBundleStructure {
  const option = getPromoBundleTypeOption(draft.bundleType);
  const firstItem = draft.gameItem.trim() || null;
  const secondItem = draft.barItems.trim() || null;
  const extraCondition = draft.serviceItems.trim() || null;
  const costPerUse = parseMoney(draft.cost);
  const expectedUses = Math.max(0, Math.round(parseMoney(draft.expectedUses)));
  const minSpend = parseMoney(draft.minSpend);
  const validityDays = Math.max(0, Math.round(parseMoney(draft.validityDays)));
  const firstRef = buildAccountingRefFromDraft("first", draft, productOptions);
  const secondRef = buildAccountingRefFromDraft("second", draft, productOptions);
  const missingFields = [
    firstItem ? null : option.firstLabel,
    secondItem ? null : option.secondLabel,
    economics.basePrice > 0 && economics.promoPrice > 0 ? null : "цена набора",
    expectedUses > 0 ? null : "лимит использований",
    costPerUse > 0 ? null : "себестоимость",
    accountingRefReady(firstRef) ? null : `${option.firstLabel} в учете`,
    accountingRefReady(secondRef) ? null : `${option.secondLabel} в учете`,
  ].filter((item): item is string => Boolean(item));
  const readiness: MarketingPromoBundleStructure["accounting"]["readiness"] =
    !firstItem || !secondItem
      ? "NEEDS_COMPOSITION"
      : economics.basePrice <= 0 ||
          economics.promoPrice <= 0 ||
          expectedUses <= 0 ||
          costPerUse <= 0
        ? "NEEDS_ECONOMICS"
        : !accountingRefReady(firstRef) || !accountingRefReady(secondRef)
          ? "NEEDS_ACCOUNTING"
          : "READY";
  const label =
    readiness === "READY"
      ? "готов к ручному учету"
      : readiness === "NEEDS_COMPOSITION"
        ? "нужно уточнить состав"
        : readiness === "NEEDS_ECONOMICS"
          ? "нужно уточнить экономику"
          : "нужно уточнить учет";

  return {
    composition: {
      typeLabel: option.title,
      firstLabel: option.firstLabel,
      firstItem,
      secondLabel: option.secondLabel,
      secondItem,
      extraCondition,
      summary: [firstItem, secondItem].filter(Boolean).join(" + ") || "состав не задан",
    },
    pricing: {
      basePrice: economics.basePrice,
      promoPrice: economics.promoPrice,
      discount: parseMoney(draft.discount),
      costPerUse,
      expectedRevenue: economics.revenue,
      expectedCost: economics.cost,
      margin: economics.margin,
      marginPercent: economics.marginPercent,
    },
    limits: {
      expectedUses,
      minSpend,
      validityDays,
      onePerGuest: draft.onePerGuest,
      requiresApproval: draft.requiresApproval,
      noStacking: draft.noStacking,
    },
    accounting: {
      readiness,
      label,
      missingFields,
      nextFields: [
        "ID товара или услуги для первой части",
        "ID товара, услуги или бонусной операции для второй части",
        "правило списания себестоимости при использовании набора",
      ],
      firstRef,
      secondRef,
      writeOffRule: draft.writeOffRule,
      writeOffLabel: writeOffRuleLabel(draft.writeOffRule),
      note: draft.accountingNote.trim() || null,
    },
  };
}

function buildAccountingRefFromDraft(
  part: PromoBundlePart,
  draft: PromoBundleDraft,
  productOptions: Product[],
): MarketingPromoBundleStructure["accounting"]["firstRef"] {
  const kind =
    part === "first" ? draft.firstAccountingKind : draft.secondAccountingKind;
  const productId =
    part === "first"
      ? draft.firstAccountingProductId.trim()
      : draft.secondAccountingProductId.trim();
  const reference =
    part === "first"
      ? draft.firstAccountingReference.trim()
      : draft.secondAccountingReference.trim();
  const product = productOptions.find((item) => item.id === productId);

  if (kind === "PRODUCT") {
    return {
      kind,
      productId: productId || null,
      reference: null,
      label: product
        ? productAccountingLabel(product)
        : productId
          ? `товар ${productId}`
          : "товар не выбран",
    };
  }

  return {
    kind,
    productId: null,
    reference: reference || null,
    label: reference || accountingKindLabel(kind),
  };
}

function accountingRefReady(
  ref: MarketingPromoBundleStructure["accounting"]["firstRef"],
) {
  return ref.kind === "PRODUCT" ? Boolean(ref.productId) : Boolean(ref.reference);
}

function resolvePromoBundleType(value: unknown): PromoBundleType {
  if (
    typeof value === "string" &&
    promoBundleTypeOptions.some((option) => option.id === value)
  ) {
    return value as PromoBundleType;
  }

  return "game_product";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function optionalNumberString(value: unknown, fallback: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return fallback;
}

function optionalBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function optionalAccountingKind(
  value: unknown,
  fallback: PromoBundleAccountingKind,
) {
  return accountingKindOptions.some((option) => option.value === value)
    ? (value as PromoBundleAccountingKind)
    : fallback;
}

function optionalWriteOffRule(value: unknown, fallback: PromoBundleWriteOffRule) {
  return writeOffRuleOptions.some((option) => option.value === value)
    ? (value as PromoBundleWriteOffRule)
    : fallback;
}

function buildPromoBundleNote(
  draft: PromoBundleDraft,
  economics: PromoBundleEconomics,
  productOptions: Product[] = [],
) {
  const bundleType = getPromoBundleTypeOption(draft.bundleType);
  const structure = promoBundleStructureFromDraft(
    draft,
    economics,
    productOptions,
  );
  const composition = [
    `${bundleType.firstLabel.toLowerCase()}: ${
      draft.gameItem.trim() || "не указано"
    }`,
    `${bundleType.secondLabel.toLowerCase()}: ${
      draft.barItems.trim() || "не указано"
    }`,
    draft.serviceItems.trim()
      ? `доп. условие: ${draft.serviceItems.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  return [
    "Цель: промо-набор с понятным составом, экономикой и измеримым эффектом.",
    `Тип комбо: ${bundleType.title}.`,
    `Состав комбо: ${composition}.`,
    `Расчет: ${bundleType.firstPriceLabel.toLowerCase()} ${formatRubles(
      parseMoney(draft.gamePrice),
    )}, ${bundleType.secondPriceLabel.toLowerCase()} ${formatRubles(
      parseMoney(draft.barPrice),
    )}.`,
    `Цена набора: ${formatRubles(economics.promoPrice)} вместо ${formatRubles(
      economics.basePrice,
    )}. Скидка: ${formatRubles(parseMoney(draft.discount))}.`,
    `Лимит: ${formatNumber(economics.expectedUses)} использований. Оценка выручки: ${formatRubles(
      economics.revenue,
    )}; маржа: ${formatRubles(economics.margin)}${
      economics.marginPercent === null
        ? ""
        : ` (${formatPercent(economics.marginPercent)})`
    }.`,
    `Минимальный чек: ${formatRubles(
      parseMoney(draft.minSpend),
    )}. Срок действия: ${formatNumber(
      Math.round(parseMoney(draft.validityDays)),
    )} дней.`,
    `Ограничения: ${
      draft.onePerGuest ? "один набор на гостя" : "повторное использование разрешено"
    }, только выбранные клубы и период, ${
      draft.requiresApproval
        ? "ручное подтверждение администратором обязательно"
        : "без обязательного ручного подтверждения"
    }.`,
    `Антифрод: ${
      draft.noStacking
        ? "не суммировать с другими скидками"
        : "допускается суммирование только по ручному решению"
    }, фиксировать факт использования в журнале запуска или CRM, если набор привязан к кампании.`,
    `Учет: ${structure.composition.firstLabel.toLowerCase()} - ${
      structure.accounting.firstRef.label
    }; ${structure.composition.secondLabel.toLowerCase()} - ${
      structure.accounting.secondRef.label
    }; ${structure.accounting.writeOffLabel}${
      structure.accounting.note ? `. ${structure.accounting.note}` : ""
    }.`,
  ].join(" ");
}

function buildPromoBundleConfig(
  draft: PromoBundleDraft,
  economics: PromoBundleEconomics,
  verdict: PromoBundleVerdict,
  productOptions: Product[] = [],
): MarketingMechanicConfig {
  const structure = promoBundleStructureFromDraft(
    draft,
    economics,
    productOptions,
  );

  return {
    kind: "promo_bundle",
    bundleType: draft.bundleType,
    composition: {
      first: draft.gameItem.trim(),
      second: draft.barItems.trim(),
      extraCondition: draft.serviceItems.trim(),
    },
    bundle: {
      gamePrice: parseMoney(draft.gamePrice),
      barPrice: parseMoney(draft.barPrice),
      servicePrice: parseMoney(draft.servicePrice),
      discount: parseMoney(draft.discount),
      cost: parseMoney(draft.cost),
      expectedUses: Math.round(parseMoney(draft.expectedUses)),
      minSpend: parseMoney(draft.minSpend),
      validityDays: Math.round(parseMoney(draft.validityDays)),
      onePerGuest: draft.onePerGuest,
      requiresApproval: draft.requiresApproval,
      noStacking: draft.noStacking,
    },
    accounting: {
      first: structure.accounting.firstRef,
      second: structure.accounting.secondRef,
      writeOffRule: structure.accounting.writeOffRule,
      writeOffLabel: structure.accounting.writeOffLabel,
      note: structure.accounting.note,
    },
    economics,
    verdict: {
      tone: verdict.tone,
      title: verdict.title,
      checks: verdict.checks,
    },
  };
}

function cleanPayload(form: CampaignFormState) {
  return {
    ...form,
    audienceId: form.audienceId || null,
    storeIds: form.storeId ? [form.storeId] : [],
    ownerUserId: form.ownerUserId || null,
    promoBundleId: form.promoBundleId || null,
    periodFrom: form.periodFrom || null,
    periodTo: form.periodTo || null,
    dueAt: form.dueAt || null,
    budget: form.budget || null,
    name: form.name || null,
    mechanicConfig: form.mechanicConfig,
    note: form.note || null,
  };
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? "Не удалось сохранить изменения";
  } catch {
    return "Не удалось сохранить изменения";
  }
}

function campaignMatchesFilter(
  campaign: MarketingCampaign,
  filter: CampaignStatusFilter,
) {
  if (filter === "ALL") {
    return true;
  }

  if (filter === "ACTIVE") {
    return campaign.status === "PLANNED" || campaign.status === "RUNNING";
  }

  return campaign.status === filter;
}

function campaignMechanicConfigLabel(config: MarketingMechanicConfig | null) {
  if (!config) {
    return "заметка";
  }

  if (config.kind === "promo_bundle") {
    const type = config.bundleType;

    if (
      typeof type === "string" &&
      promoBundleTypeOptions.some((option) => option.id === type)
    ) {
      return getPromoBundleTypeOption(type as PromoBundleType).title;
    }

    return "промо-набор";
  }

  if (config.kind === "template" && typeof config.title === "string") {
    return config.title;
  }

  return "структурная механика";
}

function goalLabel(goal: MarketingCampaignGoal) {
  return goalOptions.find((option) => option.value === goal)?.label ?? goal;
}

function statusLabel(status: MarketingCampaignStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function promoBundleLaunchStatusLabel(
  status: MarketingPromoBundleLaunchStatus,
) {
  return (
    promoBundleLaunchStatusOptions.find((option) => option.value === status)
      ?.label ?? status
  );
}

function campaignStatusClass(status: MarketingCampaignStatus) {
  const base =
    "inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide";

  if (status === "RUNNING") {
    return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300`;
  }

  if (status === "PLANNED") {
    return `${base} bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300`;
  }

  if (status === "DRAFT") {
    return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
  }

  if (status === "FINISHED") {
    return `${base} bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300`;
  }

  return `${base} bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300`;
}

function promoBundleLaunchStatusClass(
  status: MarketingPromoBundleLaunchStatus,
) {
  const base =
    "inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide";

  if (status === "ACTIVE") {
    return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300`;
  }

  if (status === "PAUSED") {
    return `${base} bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300`;
  }

  if (status === "FINISHED") {
    return `${base} bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300`;
  }

  return `${base} bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300`;
}

function launchScopeButtonClass(isActive: boolean) {
  return [
    "inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30",
    isActive
      ? "border-emerald-500 bg-emerald-500 text-zinc-950"
      : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300",
  ].join(" ");
}

function launchPeriodLabel(launch: MarketingPromoBundleLaunch) {
  if (!launch.periodFrom && !launch.periodTo) {
    return "без срока";
  }

  return `${formatDate(launch.periodFrom)} - ${formatDate(launch.periodTo)}`;
}

function promoBundleOperationalLaunchLabel(
  launches: MarketingPromoBundleLaunch[],
  stores: Store[],
) {
  if (launches.length === 0) {
    return "активных запусков нет";
  }

  const [firstLaunch] = launches;
  const moreLaunches =
    launches.length > 1 ? `, еще ${formatNumber(launches.length - 1)}` : "";

  return `${storeLabel(firstLaunch.storeIds, stores)}, ${launchPeriodLabel(
    firstLaunch,
  )}${moreLaunches}`;
}

function campaignNextAction(campaign: MarketingCampaign) {
  if (!campaign.audience) {
    return "Сначала выберите группу гостей, иначе кампания не сможет посчитать охват и согласия.";
  }

  if (!campaign.owner) {
    return "Назначьте ответственного, чтобы контакт и контроль не зависли без владельца.";
  }

  if (!campaign.crmTask && campaign.status !== "FINISHED") {
    return "Создайте CRM-задачу, чтобы кампания превратилась из плана в действие.";
  }

  if (campaign.status === "DRAFT") {
    return "Проверьте механику, сроки и согласия, затем переведите кампанию в план.";
  }

  if (campaign.status === "PLANNED") {
    return "Кампания готова к запуску: проверьте канал, дедлайн и переведите в работу.";
  }

  if (campaign.status === "RUNNING") {
    return "Контролируйте контакты и фиксируйте результат, чтобы потом увидеть эффект.";
  }

  if (campaign.status === "FINISHED") {
    return "Откройте карточку кампании и проверьте эффект по визитам, выручке и бару.";
  }

  return "Кампания отменена. При необходимости верните ее в черновик или создайте новый сценарий.";
}

function buildCampaignDraftSteps(
  form: CampaignFormState,
): CampaignReadinessItem[] {
  const needsPromoBundle = form.goal === "PROMO_BUNDLE";

  return [
    {
      label: "Оффер",
      done: needsPromoBundle ? Boolean(form.promoBundleId) : Boolean(form.mechanic),
      issue: needsPromoBundle
        ? "сохраните или выберите промо-набор"
        : "выберите механику",
    },
    {
      label: "Группа",
      done: Boolean(form.audienceId),
      issue: "выберите группу гостей",
    },
    {
      label: "Период",
      done: Boolean(form.periodFrom && form.periodTo),
      issue: "задайте период действия",
    },
    {
      label: "Ответственный",
      done: Boolean(form.ownerUserId && form.dueAt),
      issue: "назначьте ответственного и дедлайн",
    },
    {
      label: "Канал",
      done: Boolean(form.channel),
      issue: "выберите канал исполнения",
    },
  ];
}

function buildCampaignReadiness(campaign: MarketingCampaign): CampaignReadiness {
  const coverage = campaign.consentCoverage;
  const hasGroup = Boolean(campaign.audience && coverage.targetTotal > 0);
  const hasChannel = Boolean(campaign.channel);
  const hasMechanic = Boolean(campaign.mechanic);
  const hasOwnerAndDue = Boolean(campaign.owner && campaign.dueAt);
  const hasContactAccess =
    hasGroup &&
    (!coverage.requiresPhoneConsent ||
      (coverage.contactable > 0 && coverage.targetTotal > 0));
  const items: CampaignReadinessItem[] = [
    {
      label: "Группа",
      done: hasGroup,
      issue: "выберите группу",
    },
    {
      label: "Канал",
      done: hasChannel,
      issue: "выберите канал",
    },
    {
      label: "Механика",
      done: hasMechanic,
      issue: "добавьте механику",
    },
    {
      label: "Контакт",
      done: hasContactAccess,
      issue:
        coverage.requiresPhoneConsent && coverage.exclusionReason
          ? `проверьте согласия: ${coverage.exclusionReason}`
          : "проверьте доступность контакта",
    },
    {
      label: "Ответственный",
      done: hasOwnerAndDue,
      issue: "назначьте ответственного и срок",
    },
    {
      label: "CRM-задача",
      done: Boolean(campaign.crmTask),
      issue: "создайте CRM-задачу",
    },
  ];
  const done = items.filter((item) => item.done).length;
  const firstIssue = items.find((item) => !item.done)?.issue ?? null;

  return {
    done,
    total: items.length,
    percent: Math.round((done / items.length) * 100),
    tone: !hasGroup || !hasContactAccess ? "blocked" : done === items.length ? "ready" : "warning",
    firstIssue,
    items,
  };
}

function contactCoverageLabel(campaign: MarketingCampaign) {
  const coverage = campaign.consentCoverage;
  const targetTotal = coverage?.targetTotal ?? 0;

  if (targetTotal <= 0) {
    return "нет группы";
  }

  if (!coverage.requiresPhoneConsent) {
    return `${targetTotal} гостей, без рассылки`;
  }

  if (coverage.excluded > 0) {
    return `${coverage.contactable} из ${targetTotal}, исключено ${coverage.excluded}`;
  }

  return `${coverage.contactable} из ${targetTotal}`;
}

function scrollToMarketingSection(id: string) {
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function normalizeMarketingHash(hash: string) {
  if (!hash.includes("#", 1)) {
    return hash;
  }

  const knownSectionIds = new Set([
    "goals",
    "mechanics",
    "bundle",
    "bundle-launches",
    "campaigns",
    "campaign-form",
    "campaign-list",
  ]);
  const sections = hash.slice(1).split("#").filter(Boolean);
  const normalizedSection = [...sections]
    .reverse()
    .find((section) => knownSectionIds.has(section));

  return normalizedSection ? `#${normalizedSection}` : hash;
}

function formatDate(value: string | null) {
  if (!value) {
    return "не задан";
  }

  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function formatRubles(value: number | null) {
  if (value === null) {
    return "не задан";
  }

  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    value,
  )} руб`;
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBundleCount(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const suffix =
    lastTwo >= 11 && lastTwo <= 14
      ? "наборов"
      : last === 1
        ? "набор"
        : last >= 2 && last <= 4
          ? "набора"
          : "наборов";

  return `${formatNumber(count)} ${suffix}`;
}

function parseMoney(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function storeLabel(storeIds: string[], stores: Store[]) {
  if (storeIds.length === 0) {
    return "Вся сеть";
  }

  const names = storeIds
    .map((id) => stores.find((store) => store.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return names.length > 0 ? names.join(", ") : `${storeIds.length} клуб`;
}

const fieldClassName =
  "min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition duration-200 hover:border-zinc-300 hover:bg-zinc-50 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:hover:border-zinc-700 dark:hover:bg-zinc-900";
