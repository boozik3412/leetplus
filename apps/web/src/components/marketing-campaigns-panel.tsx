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
} from "@/lib/marketing";
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
};

export function MarketingCampaignsPanel({
  campaigns,
  audiences,
  users,
  promoBundles,
  stores,
}: {
  campaigns: MarketingCampaign[];
  audiences: GuestAudience[];
  users: GuestCrmUser[];
  promoBundles: MarketingPromoBundle[];
  stores: Store[];
}) {
  const [rows, setRows] = useState(campaigns);
  const [savedPromoBundles, setSavedPromoBundles] = useState(promoBundles);
  const [form, setForm] = useState<CampaignFormState>(emptyForm);
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

function PromoMechanicsBuilder({
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
  const bundleNotePreview = buildPromoBundleNote(bundleDraft, bundleEconomics);
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
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

        <div
          id="bundle"
          className="scroll-mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                Промо-набор
              </p>
              <h3 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">
                Конструктор комбо-набора
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Соберите оффер по шагам: выберите тип, настройте две части,
                проверьте экономику и сохраните набор в каталог.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Сохранение
              </p>
              <p className="mt-1">
                Кнопка появится ниже, после коммерческой проверки.
              </p>
            </div>
          </div>
          <p className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            Настройте состав и экономику набора, затем перенесите расчет в
            каталог комбо-наборов. После сохранения он подставится в форму
            кампании, а позже сможет использоваться в ассортименте и учете услуг.
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

          <PromoBundleVerdictCard
            verdict={bundleVerdict}
            notePreview={bundleNotePreview}
            bundleApplyNotice={bundleApplyNotice}
            isSavingBundle={isSavingBundle}
            onApplyBundle={onApplyBundle}
          />
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
}: {
  bundle: MarketingPromoBundle;
  isActive: boolean;
  onLoadAsBasis: () => void;
  onUse: () => void;
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
          Выбрать
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

function PromoBundleVerdictCard({
  verdict,
  notePreview,
  bundleApplyNotice,
  isSavingBundle,
  onApplyBundle,
}: {
  verdict: PromoBundleVerdict;
  notePreview: string;
  bundleApplyNotice: boolean;
  isSavingBundle: boolean;
  onApplyBundle: () => void | Promise<void>;
}) {
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
    : verdict.tone === "ready"
      ? "Создать и сохранить промо-набор"
      : verdict.tone === "warning"
        ? "Сохранить после ручной проверки"
        : "Исправьте расчет";
  const nextStepText = bundleApplyNotice
    ? "Набор сохранен в каталог и уже связан с формой кампании."
    : verdict.tone === "ready"
      ? "Экономика прошла проверку. Сохраните набор в каталог и привяжите его к черновику кампании."
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
              text="Расчет, механика и ссылка на набор перенесутся в форму кампании для выбора группы, периода и ответственного."
            />
            <NextStepItem
              title="Ассортимент и учет"
              text="Позже этот же набор можно будет использовать в ассортименте, услугах и товарном учете без пересборки с нуля."
            />
          </div>
        </div>
      </div>
      <p className="mx-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
        {bundleApplyNotice
          ? "Промо-набор уже перенесен в форму кампании. Проверьте группу, период, ответственного и сохраните черновик."
          : "После проверки создайте промо-набор: он сохранится как отдельный элемент каталога, сможет быть привязан к кампании и позднее использоваться в ассортименте, товарах и услугах."}
      </p>
      <details className="m-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-950 dark:text-white">
          Что попадет в заметку кампании
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
      title: "Набор пока нельзя запускать",
      description:
        "Заполните состав и цену набора, чтобы кампания не ушла в CRM с нулевой ценой.",
      checks: [
        "Добавьте стоимость игры, бара или сервиса.",
        "Промо-цена должна быть больше 0 руб.",
        "После правки нажмите «Перенести в кампанию».",
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
      title: "Можно запускать после проверки условий",
      description:
        "Экономика не блокирует кампанию, но перед задачей в CRM нужно проверить себестоимость, минимальный чек и размер скидки.",
      checks,
    };
  }

  return {
    tone: "ready",
    title: "Набор готов к кампании",
    description:
      "Цена, лимит, срок, маржа и антифрод выглядят достаточно понятно для ручного запуска через CRM-задачу.",
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

function promoBundleToDraft(bundle: MarketingPromoBundle): PromoBundleDraft {
  const config = isRecord(bundle.mechanicConfig) ? bundle.mechanicConfig : {};
  const bundleType = resolvePromoBundleType(
    optionalText(config.bundleType, bundle.bundleType),
  );
  const option = getPromoBundleTypeOption(bundleType);
  const composition = isRecord(config.composition) ? config.composition : {};
  const bundleValues = isRecord(config.bundle) ? config.bundle : {};

  return {
    ...emptyBundleDraft,
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
  };
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

function buildPromoBundleNote(
  draft: PromoBundleDraft,
  economics: PromoBundleEconomics,
) {
  const bundleType = getPromoBundleTypeOption(draft.bundleType);
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
    }, фиксировать контакт и факт использования в CRM.`,
  ].join(" ");
}

function buildPromoBundleConfig(
  draft: PromoBundleDraft,
  economics: PromoBundleEconomics,
  verdict: PromoBundleVerdict,
): MarketingMechanicConfig {
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
    return data.message ?? "Не удалось сохранить кампанию";
  } catch {
    return "Не удалось сохранить кампанию";
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
