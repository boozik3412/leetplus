"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GuestAudience } from "@/lib/guests";
import type {
  GuestGameLootBox,
  GuestGameMissionProductGroup,
  GuestGameMissionProductGroupCatalog,
  GuestGameMissionWizardDto,
  GuestGameMissionWizardLoadResult,
  GuestGameMissionWizardReadiness,
  GuestGameMissionWizardSaveResult,
  GuestGameMissionWizardTaskType,
} from "@/lib/guest-gamification";
import type { MarketingPromoBundle } from "@/lib/marketing";
import type { Product, ProductCatalog } from "@/lib/products";
import type { Store } from "@/lib/stores";
import {
  GuestMissionPreview,
  type GuestMissionPreviewData,
} from "@/components/guest-mission-preview";

type Step = "conditions" | "rewards" | "appearance";
type TaskType = GuestGameMissionWizardTaskType;
type RewardType = "LANGAME_BONUS" | "LOOTBOX" | "PROMOCODE" | "NONE";
type SelectedProduct = Pick<
  Product,
  "id" | "name" | "externalProductId" | "externalDomain"
>;

type WizardState = {
  name: string;
  taskType: TaskType;
  visibility: "VISIBLE" | "HIDDEN";
  audienceId: string;
  storeIds: string[];
  indefinite: boolean;
  periodFrom: string;
  periodTo: string;
  sessionType: "ANY" | "HOURLY" | "PACKAGE_OR_SUBSCRIPTION";
  target: number;
  windowDays: number;
  hours: string;
  weekdays: number[];
  minSessionMinutes: number;
  purchaseSource: "PRODUCT" | "CATEGORY";
  categoryCatalogSource: "LANGAME" | "LEETPLUS";
  productMatch: "ANY" | "ALL";
  amountMode: "NONE" | "SINGLE_MINIMUM" | "PERIOD_TOTAL";
  minimumAmount: number;
  totalAmount: number;
  topupMode: "SINGLE" | "COUNT" | "PERIOD_TOTAL";
  topupComparison: "EXACT" | "AT_LEAST";
  topupAmount: number;
  topupCount: number;
  checkInMode: "SINGLE" | "COUNT" | "PERIOD" | "STREAK";
  checkInCount: number;
  checkInDays: number;
  specificDayEnabled: boolean;
  specificTimeEnabled: boolean;
  periodicity: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  rewardType: RewardType;
  rewardAmount: number;
  rewardLabel: string;
  delivery: "AUTOMATIC" | "ADMIN_APPROVAL";
  lootBoxId: string;
  promoCodeId: string;
  xpEnabled: boolean;
  xpAmount: number;
  budgetUnlimited: boolean;
  budgetAmount: number;
  perGuestLimitUnlimited: boolean;
  perGuestLimit: number;
  totalRewardLimit: number;
  description: string;
  actionText: string;
  theme:
    | "CLASSIC"
    | "EMERALD"
    | "VIOLET"
    | "DARK"
    | "GOLD"
    | "BLACK_RED";
  icon: string;
  coverUrl: string;
};

const fieldClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:focus:ring-emerald-950";
const cardClass =
  "rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950";
const subsectionClass =
  "rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20";
const productCatalogCache = new Map<string, ProductCatalog>();
const productCatalogCacheLimit = 100;
const productGroupCatalogCache = new Map<
  string,
  GuestGameMissionProductGroupCatalog
>();

export function GuestMissionWizard({
  stores,
  audiences,
  lootBoxes,
  promoBundles,
  initialMissionId,
  initialTaskType,
}: {
  stores: Store[];
  audiences: GuestAudience[];
  lootBoxes: GuestGameLootBox[];
  promoBundles: MarketingPromoBundle[];
  initialMissionId?: string | null;
  initialTaskType?: TaskType;
}) {
  const [step, setStep] = useState<Step>("conditions");
  const [form, setForm] = useState<WizardState>(() =>
    initialState(stores, initialTaskType),
  );
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>(
    [],
  );
  const [productGroups, setProductGroups] = useState<
    GuestGameMissionProductGroup[]
  >([]);
  const [selectedProductGroups, setSelectedProductGroups] = useState<
    GuestGameMissionProductGroup[]
  >([]);
  const [productGroupWarnings, setProductGroupWarnings] = useState<string[]>(
    [],
  );
  const [loadingProductGroups, setLoadingProductGroups] = useState(false);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [productTotalPages, setProductTotalPages] = useState(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [loadingMission, setLoadingMission] = useState(
    Boolean(initialMissionId),
  );
  const [loadedMissionStatus, setLoadedMissionStatus] = useState<
    "DRAFT" | "ACTIVE" | null
  >(null);
  const [readiness, setReadiness] =
    useState<GuestGameMissionWizardReadiness | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [activated, setActivated] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const autosaveReady = useRef(false);

  const rewardLootBoxes = useMemo(
    () =>
      lootBoxes.filter(
        (box) =>
          box.status === "ACTIVE" &&
          (box.usageKind === "REWARD_TEMPLATE" || box.usageKind === "BOTH"),
      ),
    [lootBoxes],
  );
  const activePromos = useMemo(
    () => promoBundles.filter((promo) => promo.status === "ACTIVE"),
    [promoBundles],
  );
  const dto = useMemo(
    () =>
      buildWizardDto(
        form,
        selectedProducts,
        selectedProductGroups,
        rewardLootBoxes,
        activePromos,
      ),
    [
      activePromos,
      form,
      rewardLootBoxes,
      selectedProductGroups,
      selectedProducts,
    ],
  );
  const preview = useMemo(
    () =>
      buildPreview(
        form,
        selectedProducts,
        selectedProductGroups,
        rewardLootBoxes,
        activePromos,
      ),
    [
      activePromos,
      form,
      rewardLootBoxes,
      selectedProductGroups,
      selectedProducts,
    ],
  );

  useEffect(() => {
    if (!initialMissionId) return;

    const controller = new AbortController();
    const load = async () => {
      setLoadingMission(true);
      try {
        const response = await fetch(
          `/api/guests/gamification/missions/wizard/${encodeURIComponent(initialMissionId)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(await responseMessage(response));
        const loaded = (await response.json()) as GuestGameMissionWizardLoadResult;
        if (controller.signal.aborted) return;

        const hydrated = wizardStateFromDefinition(loaded.definition, stores);
        setForm(hydrated.form);
        setSelectedProducts(hydrated.products);
        setSelectedProductGroups(hydrated.productGroups);
        setDraftId(loaded.mission.id);
        setReadiness(loaded.readiness);
        setLoadedMissionStatus(
          loaded.mission.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
        );
        setActivated(false);
        autosaveReady.current = false;
        setMessage(
          loaded.mission.status === "ACTIVE"
            ? "Активное задание загружено. При первом сохранении оно станет черновиком и потребует повторной активации."
            : "Черновик загружен. После первого сохранения изменения будут сохраняться автоматически.",
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Не удалось загрузить задание для редактирования.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoadingMission(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [initialMissionId, stores]);

  useEffect(() => {
    if (loadingMission) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          "/api/guests/gamification/missions/wizard/readiness",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(dto),
            signal: controller.signal,
          },
        );
        if (response.ok) {
          setReadiness(
            (await response.json()) as GuestGameMissionWizardReadiness,
          );
        }
      } catch {
        // A readiness refresh is advisory; saving still reports a concrete error.
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [dto]);

  useEffect(() => {
    if (
      form.taskType !== "PRODUCT_PURCHASE" ||
      form.purchaseSource !== "CATEGORY" ||
      !form.storeIds.length
    ) {
      return;
    }
    const controller = new AbortController();
    const storeIds = [...form.storeIds].sort();
    const cacheKey = `${form.categoryCatalogSource}|${storeIds.join("|")}`;
    const load = async () => {
      setLoadingProductGroups(true);
      try {
        const cached = productGroupCatalogCache.get(cacheKey);
        const catalog =
          cached ??
          (await fetchProductGroupCatalog(
            storeIds,
            form.categoryCatalogSource,
            controller,
          ));
        if (!cached) productGroupCatalogCache.set(cacheKey, catalog);
        setProductGroups(catalog.groups);
        setProductGroupWarnings(catalog.warnings);
        setSelectedProductGroups((current) =>
          current
            .map(
              (selected) =>
                catalog.groups.find((group) => group.id === selected.id) ??
                selected,
            )
            .filter((selected) =>
              catalog.groups.some((group) => group.id === selected.id),
            ),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setProductGroups([]);
          setProductGroupWarnings([
            error instanceof Error
              ? error.message
              : `Не удалось загрузить категории ${form.categoryCatalogSource === "LANGAME" ? "Langame" : "LeetPlus"}.`,
          ]);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingProductGroups(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [
    form.categoryCatalogSource,
    form.purchaseSource,
    form.storeIds,
    form.taskType,
  ]);

  useEffect(() => {
    if (form.taskType !== "PRODUCT_PURCHASE" || search.trim().length < 3) {
      return;
    }
    if (form.purchaseSource !== "PRODUCT") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const params = new URLSearchParams({
        name: search.trim(),
        page: String(productPage),
        pageSize: "20",
      });
      form.storeIds.forEach((storeId) => params.append("storeId", storeId));
      const cacheKey = params.toString();
      try {
        const cached = productCatalogCache.get(cacheKey);
        if (cached) {
          setProducts(cached.items);
          setProductTotalPages(Math.max(1, cached.totalPages));
          if (productPage > Math.max(1, cached.totalPages)) {
            setProductPage(Math.max(1, cached.totalPages));
          }
          return;
        }
        const response = await fetch(`/api/products/catalog?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Поиск товаров недоступен");
        const catalog = (await response.json()) as ProductCatalog;
        cacheProductCatalog(cacheKey, catalog);
        setProducts(catalog.items);
        setProductTotalPages(Math.max(1, catalog.totalPages));
        if (productPage > Math.max(1, catalog.totalPages)) {
          setProductPage(Math.max(1, catalog.totalPages));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : "Ошибка поиска");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [form.purchaseSource, form.storeIds, form.taskType, productPage, search]);

  useEffect(() => {
    if (activated || !draftId || !autosaveReady.current) return;
    const timer = window.setTimeout(() => void saveDraft(true), 900);
    return () => window.clearTimeout(timer);
    // dto is the intentionally stable serialization of all editable fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activated, draftId, dto]);

  async function saveDraft(automatic = false) {
    if (!automatic) setMessage(null);
    setSaveState("saving");
    try {
      const response = await fetch(
        draftId
          ? `/api/guests/gamification/missions/wizard/${draftId}`
          : "/api/guests/gamification/missions/wizard",
        {
          method: draftId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(dto),
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const saved = (await response.json()) as GuestGameMissionWizardSaveResult;
      setDraftId(saved.mission.id);
      setLoadedMissionStatus("DRAFT");
      setReadiness(saved.readiness);
      setSaveState("saved");
      autosaveReady.current = true;
      if (!automatic)
        setMessage(
          "Черновик сохранён. Дальше изменения сохраняются автоматически.",
        );
    } catch (error) {
      setSaveState("error");
      setMessage(
        error instanceof Error ? error.message : "Не удалось сохранить",
      );
    }
  }

  async function activate() {
    if (!draftId) {
      await saveDraft(false);
      setMessage(
        "Черновик создан. Проверьте готовность и подтвердите активацию ещё раз.",
      );
      return;
    }
    if (
      !window.confirm(
        "Активировать задание? После этого оно попадёт в боевой контур.",
      )
    ) {
      return;
    }
    setSaveState("saving");
    const response = await fetch(
      `/api/guests/gamification/missions/wizard/${draftId}/activate`,
      { method: "POST" },
    );
    if (!response.ok) {
      setSaveState("error");
      setMessage(await responseMessage(response));
      return;
    }
    const saved = (await response.json()) as GuestGameMissionWizardSaveResult;
    setReadiness(saved.readiness);
    setSaveState("saved");
    setActivated(true);
    setMessage(null);
  }

  async function uploadCover(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Для обложки выберите изображение JPG, PNG или WebP.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/guest-game/media", {
        method: "POST",
        body,
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const asset = (await response.json()) as { url: string };
      setForm((current) => ({ ...current, coverUrl: asset.url }));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось загрузить обложку",
      );
    } finally {
      setUploading(false);
    }
  }

  function toggleProduct(product: SelectedProduct) {
    setSelectedProducts((current) =>
      current.some((item) => item.id === product.id)
        ? current.filter((item) => item.id !== product.id)
        : [...current, product],
    );
  }

  function toggleProductGroup(group: GuestGameMissionProductGroup) {
    setSelectedProductGroups((current) =>
      current.some((item) => item.id === group.id)
        ? current.filter((item) => item.id !== group.id)
        : [...current, group],
    );
  }

  return (
    <div className="pb-4">
      {loadingMission ? (
        <div className="mb-5 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          Загружаем задание в мастер…
        </div>
      ) : null}
      {loadedMissionStatus === "ACTIVE" ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Активное задание пока продолжает работать. Первое сохранение в мастере
          создаст его обновлённую черновую версию; затем потребуется отдельное
          подтверждение активации.
        </div>
      ) : null}
      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm md:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-950">
        <StepButton
          index="01"
          label="Условия"
          active={step === "conditions"}
          ready={Boolean(form.storeIds.length)}
          onClick={() => setStep("conditions")}
        />
        <StepButton
          index="02"
          label="Награды"
          active={step === "rewards"}
          ready={rewardReady(form)}
          onClick={() => setStep("rewards")}
        />
        <StepButton
          index="03"
          label="Внешнее оформление"
          active={step === "appearance"}
          ready={Boolean(form.name.trim())}
          onClick={() => setStep("appearance")}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="space-y-4">
          {step === "conditions" ? (
            <ConditionsStep
              form={form}
              setForm={setForm}
              stores={stores}
              audiences={audiences}
              search={search}
              setSearch={(value) => {
                setSearch(value);
                setProductPage(1);
              }}
              products={products}
              selectedProducts={selectedProducts}
              productGroups={productGroups}
              selectedProductGroups={selectedProductGroups}
              productGroupWarnings={productGroupWarnings}
              loadingProductGroups={loadingProductGroups}
              searching={searching}
              productPage={productPage}
              productTotalPages={productTotalPages}
              setProductPage={setProductPage}
              toggleProduct={toggleProduct}
              toggleProductGroup={toggleProductGroup}
              clearProducts={() => setSelectedProducts([])}
              clearProductGroups={() => setSelectedProductGroups([])}
            />
          ) : null}
          {step === "rewards" ? (
            <RewardsStep
              form={form}
              setForm={setForm}
              lootBoxes={rewardLootBoxes}
              promoBundles={activePromos}
            />
          ) : null}
          {step === "appearance" ? (
            <AppearanceStep
              form={form}
              setForm={setForm}
              uploading={uploading}
              uploadCover={uploadCover}
            />
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="font-black">Предпросмотр</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Компактная карточка и модальное окно обновляются в live-режиме.
              </p>
            </div>
            <GuestMissionPreview data={preview} />
          </div>
          <ReadinessCard readiness={readiness} />
        </aside>
      </div>

      <div
        aria-live="polite"
        className={`mt-5 rounded-xl border px-4 py-4 shadow-sm ${activated ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {activated ? (
            <div className="text-sm">
              <p className="font-bold text-emerald-700 underline decoration-2 underline-offset-4 dark:text-emerald-300">
                Задание активировано
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-800/80 dark:text-emerald-200/80">
                Задание {draftId?.slice(0, 8)} уже находится в боевом контуре.
                Мастер можно закрыть.
              </p>
            </div>
          ) : (
            <div className="text-sm">
              <p className="font-semibold">
                {draftId
                  ? `Черновик ${draftId.slice(0, 8)}`
                  : "Новый черновик"}
              </p>
              <p className="text-xs text-zinc-500">
                {message ?? saveLabel(saveState)}
              </p>
            </div>
          )}
          {activated ? (
            <Link
              href="/gamification?tab=missions"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              Перейти в раздел «Задания»
            </Link>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/gamification?tab=missions"
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold dark:border-zinc-800"
              >
                Закрыть
              </Link>
              <button
                type="button"
                onClick={() => void saveDraft(false)}
                disabled={saveState === "saving"}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700"
              >
                Сохранить черновик
              </button>
              <button
                type="button"
                onClick={() => void activate()}
                disabled={saveState === "saving" || readiness?.ready === false}
                className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-emerald-400 dark:text-zinc-950"
              >
                Подтвердить активацию
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConditionsStep(props: {
  form: WizardState;
  setForm: React.Dispatch<React.SetStateAction<WizardState>>;
  stores: Store[];
  audiences: GuestAudience[];
  search: string;
  setSearch: (value: string) => void;
  products: Product[];
  selectedProducts: SelectedProduct[];
  productGroups: GuestGameMissionProductGroup[];
  selectedProductGroups: GuestGameMissionProductGroup[];
  productGroupWarnings: string[];
  loadingProductGroups: boolean;
  searching: boolean;
  productPage: number;
  productTotalPages: number;
  setProductPage: (page: number) => void;
  toggleProduct: (product: SelectedProduct) => void;
  toggleProductGroup: (group: GuestGameMissionProductGroup) => void;
  clearProducts: () => void;
  clearProductGroups: () => void;
}) {
  const { form, setForm } = props;
  return (
    <>
      <section className={cardClass}>
        <SectionTitle
          title="Основные параметры"
          subtitle="Кому доступно задание и в какой период оно действует."
        />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Field label="Тип задания" required>
            <select
              className={fieldClass}
              value={form.taskType}
              onChange={(event) =>
                setForm((state) => ({
                  ...state,
                  taskType: event.target.value as TaskType,
                }))
              }
            >
              <option value="APP_OPEN">Вход в игровой модуль</option>
              <option value="PLAY_TIME">Игровое время</option>
              <option value="PRODUCT_PURCHASE">Покупка</option>
              <option value="BALANCE_TOPUP">Пополнение баланса</option>
              <option value="CHECK_IN">Чекин</option>
            </select>
          </Field>
          <Field label="Видимость">
            <select
              className={fieldClass}
              value={form.visibility}
              onChange={(event) =>
                setForm((state) => ({
                  ...state,
                  visibility: event.target.value as WizardState["visibility"],
                }))
              }
            >
              <option value="VISIBLE">Видимое</option>
              <option value="HIDDEN">Скрыто до события</option>
            </select>
          </Field>
          <Field label="Группа гостей">
            <select
              className={fieldClass}
              value={form.audienceId}
              onChange={(event) =>
                setForm((state) => ({
                  ...state,
                  audienceId: event.target.value,
                }))
              }
            >
              <option value="">Все гости</option>
              {props.audiences.map((audience) => (
                <option key={audience.id} value={audience.id}>
                  {audience.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Клубы" required>
            <div className="grid gap-2 sm:grid-cols-2">
              {props.stores.map((store) => {
                const active = form.storeIds.includes(store.id);
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() =>
                      setForm((state) => ({
                        ...state,
                        storeIds: active
                          ? state.storeIds.filter((id) => id !== store.id)
                          : [...state.storeIds, store.id],
                      }))
                    }
                    className={`rounded-lg border px-3 py-3 text-left text-sm font-semibold transition ${active ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" : "border-zinc-200 dark:border-zinc-800"}`}
                  >
                    {store.name}
                    <span className="float-right text-xs uppercase">
                      {active ? "Выбран" : "Выбрать"}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <span>
            <span className="block text-sm font-semibold">Бессрочно</span>
            <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
              Началом станет момент активации; дата окончания не устанавливается.
            </span>
          </span>
          <input
            type="checkbox"
            checked={form.indefinite}
            onChange={(event) =>
              setForm((state) => ({
                ...state,
                indefinite: event.target.checked,
              }))
            }
            className="h-5 w-5 shrink-0 accent-emerald-500"
          />
        </label>
        {!form.indefinite ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Начало" required>
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.periodFrom}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    periodFrom: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Окончание (необязательно)">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.periodTo}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    periodTo: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
        ) : null}
      </section>

      <section className={cardClass}>
        <SectionTitle
          title="Логика выполнения"
          subtitle={logicSubtitle(form.taskType)}
        />
        <div className="mt-5">
          {form.taskType === "APP_OPEN" ? <AppOpenLogic /> : null}
          {form.taskType === "PLAY_TIME" ? (
            <PlayTimeLogic form={form} setForm={setForm} />
          ) : null}
          {form.taskType === "PRODUCT_PURCHASE" ? (
            <PurchaseLogic {...props} />
          ) : null}
          {form.taskType === "BALANCE_TOPUP" ? (
            <TopupLogic form={form} setForm={setForm} stores={props.stores} />
          ) : null}
          {form.taskType === "CHECK_IN" ? (
            <CheckInLogic form={form} setForm={setForm} />
          ) : null}
        </div>
      </section>
    </>
  );
}

function AppOpenLogic() {
  return (
    <div className={subsectionClass}>
      <SubTitle>Вход в игровой модуль</SubTitle>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        Задание выполнится, когда гость откроет игровой модуль. Дополнительные
        настройки не требуются.
      </p>
    </div>
  );
}

function PlayTimeLogic({ form, setForm }: StateProps) {
  return (
    <div className="space-y-4">
      <div className={subsectionClass}>
        <SubTitle>Тип сессии</SubTitle>
        <ChoiceRow
          values={[
            { id: "ANY", label: "Любая" },
            { id: "HOURLY", label: "Почасовая" },
            { id: "PACKAGE_OR_SUBSCRIPTION", label: "Пакет или абонемент" },
          ]}
          value={form.sessionType}
          onChange={(value) =>
            setForm((state) => ({
              ...state,
              sessionType: value as WizardState["sessionType"],
            }))
          }
        />
      </div>
      <div className={subsectionClass}>
        <SubTitle>Метрика прогресса</SubTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Как считать">
            <select className={fieldClass} value="duration" disabled>
              <option>Минуты игры</option>
            </select>
          </Field>
          <NumberField
            label="Цель, минут"
            value={form.target}
            onChange={(target) => setForm((state) => ({ ...state, target }))}
          />
          <NumberField
            label="Минимум минут в сессии"
            value={form.minSessionMinutes}
            onChange={(minSessionMinutes) =>
              setForm((state) => ({ ...state, minSessionMinutes }))
            }
          />
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          <strong>События</strong> — технические факты игрового журнала, по
          которым растёт прогресс. Для игрового времени мастер сам использует
          старт/завершение сессии и не требует ручного выбора.
        </p>
      </div>
      <CommonSchedule form={form} setForm={setForm} />
      <DisabledDevelopment
        title="Точные тарифы Langame"
        text="Точные группа, период и тип тарифа будут доступны после появления надёжного структурированного справочника."
      />
    </div>
  );
}

function PurchaseLogic(props: Parameters<typeof ConditionsStep>[0]) {
  const { form, setForm } = props;
  return (
    <div className="space-y-4">
      <div className={subsectionClass}>
        <SubTitle>Что считается покупкой</SubTitle>
        <ChoiceRow
          values={[
            { id: "PRODUCT", label: "Конкретные товары" },
            { id: "CATEGORY", label: "Категории товаров" },
          ]}
          value={form.purchaseSource}
          onChange={(value) =>
            setForm((state) => ({
              ...state,
              purchaseSource: value as WizardState["purchaseSource"],
            }))
          }
        />
        <p className="mt-3 text-xs text-zinc-500">
          Учитываются только положительные покупки, привязанные к гостю. Отмены,
          возвраты и продажи без гостя не засчитываются.
        </p>
      </div>
      {form.purchaseSource === "PRODUCT" ? (
        <div className={subsectionClass}>
          <div className="flex items-center justify-between gap-3">
            <SubTitle>Товары выбранных клубов</SubTitle>
            <span className="text-xs font-bold text-emerald-700">
              Сохранено: {props.selectedProducts.length}
            </span>
          </div>
          <Field label="Поиск товаров">
            <input
              className={fieldClass}
              value={props.search}
              onChange={(event) => props.setSearch(event.target.value)}
              placeholder="Введите минимум 3 символа, например: арен"
            />
          </Field>
          <p className="mt-2 text-xs text-zinc-500">
            {props.search.trim().length < 3
              ? "Результаты появятся после третьего символа."
              : props.searching
                ? "Ищем товары…"
                : `Найдено: ${props.products.length}`}
          </p>
          {props.search.trim().length >= 3 && props.products.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {props.products.map((product) => {
                const checked = props.selectedProducts.some(
                  (item) => item.id === product.id,
                );
                return (
                  <label
                    key={product.id}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${checked ? "border-emerald-400 bg-emerald-100/50 dark:bg-emerald-950/30" : "border-zinc-200 dark:border-zinc-800"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => props.toggleProduct(product)}
                    />
                    <span>
                      <strong className="block text-sm">{product.name}</strong>
                      <span className="text-xs text-zinc-500">
                        {product.category?.name ?? "Без категории"} ·{" "}
                        {product.salePrice} ₽
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
          {props.search.trim().length >= 3 && props.productTotalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <button
                type="button"
                disabled={props.productPage <= 1 || props.searching}
                onClick={() => props.setProductPage(props.productPage - 1)}
                className="rounded-lg border border-zinc-200 px-3 py-2 font-bold disabled:opacity-40 dark:border-zinc-700"
              >
                Назад
              </button>
              <span className="text-zinc-500">
                Страница {props.productPage} из {props.productTotalPages}
              </span>
              <button
                type="button"
                disabled={
                  props.productPage >= props.productTotalPages ||
                  props.searching
                }
                onClick={() => props.setProductPage(props.productPage + 1)}
                className="rounded-lg border border-zinc-200 px-3 py-2 font-bold disabled:opacity-40 dark:border-zinc-700"
              >
                Дальше
              </button>
            </div>
          ) : null}
          <div className="mt-4 rounded-lg border border-emerald-200 bg-white/70 p-3 dark:border-emerald-900 dark:bg-zinc-950/40">
            <div className="flex items-center justify-between">
              <strong className="text-sm">Сохранённые товары</strong>
              <button
                type="button"
                onClick={props.clearProducts}
                className="text-xs font-bold text-red-600"
              >
                Очистить
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {props.selectedProducts.map((product) => (
                <span
                  key={product.id}
                  className="group inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs"
                >
                  {product.name}
                  <button
                    type="button"
                    onClick={() => props.toggleProduct(product)}
                    aria-label={`Удалить ${product.name}`}
                    className="font-black text-zinc-400 group-hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <CategoryPicker {...props} />
      )}
      <div className={subsectionClass}>
        <SubTitle>Как сопоставлять выбранное</SubTitle>
        <ChoiceRow
          values={[
            { id: "ANY", label: "Любой из выбранных" },
            { id: "ALL", label: "Все выбранные" },
          ]}
          value={form.productMatch}
          onChange={(value) =>
            setForm((state) => ({
              ...state,
              productMatch: value as WizardState["productMatch"],
            }))
          }
        />
        <p className="mt-2 text-xs text-zinc-500">
          Для варианта «Все выбранные»{" "}
          {form.purchaseSource === "CATEGORY"
            ? "достаточно купить хотя бы один товар из каждой выбранной категории"
            : "товары можно купить разными покупками"}{" "}
          в течение периода задания — один чек не требуется.
        </p>
      </div>
      <div className={subsectionClass}>
        <SubTitle>Сумма покупки</SubTitle>
        <ChoiceRow
          values={[
            { id: "NONE", label: "Без ограничения" },
            { id: "SINGLE_MINIMUM", label: "Одна покупка не менее" },
            { id: "PERIOD_TOTAL", label: "Накопленная сумма" },
          ]}
          value={form.amountMode}
          onChange={(value) =>
            setForm((state) => ({
              ...state,
              amountMode: value as WizardState["amountMode"],
            }))
          }
        />
        {form.amountMode === "SINGLE_MINIMUM" ? (
          <div className="mt-3">
            <NumberField
              label="Минимальная сумма покупки, ₽"
              value={form.minimumAmount}
              onChange={(minimumAmount) =>
                setForm((state) => ({ ...state, minimumAmount }))
              }
            />
          </div>
        ) : null}
        {form.amountMode === "PERIOD_TOTAL" ? (
          <div className="mt-3">
            <NumberField
              label="Накопленная сумма, ₽"
              value={form.totalAmount}
              onChange={(totalAmount) =>
                setForm((state) => ({ ...state, totalAmount }))
              }
            />
          </div>
        ) : null}
      </div>
      <CommonSchedule form={form} setForm={setForm} />
    </div>
  );
}

function CategoryPicker(props: Parameters<typeof ConditionsStep>[0]) {
  return (
    <div className={subsectionClass}>
      <div className="mb-4 rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
        <SubTitle>Источник категорий</SubTitle>
        <ChoiceRow
          values={[
            { id: "LANGAME", label: "Категории Langame" },
            { id: "LEETPLUS", label: "Категории LeetPlus" },
          ]}
          value={props.form.categoryCatalogSource}
          onChange={(value) => {
            props.clearProductGroups();
            props.setForm((state) => ({
              ...state,
              categoryCatalogSource:
                value as WizardState["categoryCatalogSource"],
            }));
          }}
        />
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          {props.form.categoryCatalogSource === "LANGAME"
            ? "Категории берутся из клубной конфигурации Langame и синхронизируются отдельно для каждого домена и клуба."
            : "Категории берутся из внутреннего справочника LeetPlus и назначений в карточках товаров."}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <SubTitle>Категории выбранных клубов</SubTitle>
          <p className="mt-1 text-xs text-zinc-500">
            {props.form.categoryCatalogSource === "LANGAME"
              ? "Категории объединяются по названию, но сохраняются с точными ID каждого домена и клуба."
              : "Используются внутренние ID категорий LeetPlus; они не смешиваются с группами Langame."}
          </p>
        </div>
        <span className="text-xs font-bold text-emerald-700">
          Выбрано: {props.selectedProductGroups.length}
        </span>
      </div>
      {props.productGroupWarnings.map((warning) => (
        <p
          key={warning}
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {warning}
        </p>
      ))}
      {props.loadingProductGroups ? (
        <p className="mt-4 text-sm text-zinc-500">Загружаем категории…</p>
      ) : props.productGroups.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {props.productGroups.map((group) => {
            const checked = props.selectedProductGroups.some(
              (selected) => selected.id === group.id,
            );
            return (
              <label
                key={group.id}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${checked ? "border-emerald-400 bg-emerald-100/50 dark:bg-emerald-950/30" : "border-zinc-200 bg-white/70 dark:border-zinc-800 dark:bg-zinc-950/40"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => props.toggleProductGroup(group)}
                />
                <span className="min-w-0">
                  <strong className="block text-sm">{group.name}</strong>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">
                    {group.productCount} товаров · {group.storeCount} клубов
                    <br />
                    {group.storeNames.join(", ")}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">
          Категории пока не синхронизированы для выбранных клубов.
        </p>
      )}
      <div className="mt-4 rounded-lg border border-emerald-200 bg-white/70 p-3 dark:border-emerald-900 dark:bg-zinc-950/40">
        <div className="flex items-center justify-between">
          <strong className="text-sm">Сохранённые категории</strong>
          <button
            type="button"
            onClick={props.clearProductGroups}
            className="text-xs font-bold text-red-600"
          >
            Очистить
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {props.selectedProductGroups.map((group) => (
            <span
              key={group.id}
              className="group inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs"
            >
              {group.name}
              <button
                type="button"
                onClick={() => props.toggleProductGroup(group)}
                aria-label={`Удалить ${group.name}`}
                className="font-black text-zinc-400 group-hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopupLogic({
  form,
  setForm,
  stores,
}: StateProps & { stores: Store[] }) {
  const domains = [
    ...new Set(
      stores
        .filter((store) => form.storeIds.includes(store.id))
        .map((store) => store.externalDomain)
        .filter(Boolean),
    ),
  ];
  return (
    <div className="space-y-4">
      <div className={subsectionClass}>
        <SubTitle>Сценарий пополнения</SubTitle>
        <CompactScenarios
          values={[
            {
              id: "SINGLE",
              label: "Одно пополнение",
              hint: "Одна успешная операция",
            },
            {
              id: "COUNT",
              label: "Несколько пополнений",
              hint: "Заданное количество операций",
            },
            {
              id: "PERIOD_TOTAL",
              label: "Сумма за период",
              hint: "Накопить общую сумму",
            },
          ]}
          value={form.topupMode}
          onChange={(value) =>
            setForm((state) => ({
              ...state,
              topupMode: value as WizardState["topupMode"],
            }))
          }
        />
      </div>
      <div className={subsectionClass}>
        <SubTitle>Условие пополнения</SubTitle>
        {form.topupMode !== "PERIOD_TOTAL" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Как сравнивать сумму">
              <select
                className={fieldClass}
                value={form.topupComparison}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    topupComparison: event.target
                      .value as WizardState["topupComparison"],
                  }))
                }
              >
                <option value="AT_LEAST">Не меньше указанной</option>
                <option value="EXACT">Ровно указанная</option>
              </select>
            </Field>
            <NumberField
              label="Сумма пополнения, ₽"
              value={form.topupAmount}
              onChange={(topupAmount) =>
                setForm((state) => ({ ...state, topupAmount }))
              }
            />
          </div>
        ) : (
          <NumberField
            label="Итоговая сумма пополнений, ₽"
            value={form.totalAmount}
            onChange={(totalAmount) =>
              setForm((state) => ({ ...state, totalAmount }))
            }
          />
        )}
        {form.topupMode === "COUNT" ? (
          <div className="mt-3">
            <NumberField
              label="Количество пополнений"
              value={form.topupCount}
              onChange={(topupCount) =>
                setForm((state) => ({ ...state, topupCount }))
              }
            />
          </div>
        ) : null}
      </div>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100">
        <strong>Условие работает внутри домена.</strong> Пополнение в любом
        клубе домена {domains.join(", ") || "выбранных клубов"} выполнит это
        задание независимо от конкретного клуба. Источник: игровой журнал,
        второй боевой слой.
      </div>
      <CommonSchedule form={form} setForm={setForm} />
    </div>
  );
}

function CheckInLogic({ form, setForm }: StateProps) {
  return (
    <div className="space-y-4">
      <div className={subsectionClass}>
        <SubTitle>Сценарий чекина</SubTitle>
        <CompactScenarios
          values={[
            { id: "SINGLE", label: "Один чекин", hint: "Одно посещение клуба" },
            { id: "COUNT", label: "Несколько", hint: "Общее количество" },
            { id: "PERIOD", label: "За период", hint: "Количество за окно" },
            { id: "STREAK", label: "Дни подряд", hint: "Непрерывная серия" },
          ]}
          value={form.checkInMode}
          onChange={(value) =>
            setForm((state) => ({
              ...state,
              checkInMode: value as WizardState["checkInMode"],
            }))
          }
        />
      </div>
      {form.checkInMode !== "SINGLE" ? (
        <div className={subsectionClass}>
          <NumberField
            label={
              form.checkInMode === "STREAK"
                ? "Количество дней подряд"
                : "Количество чекинов"
            }
            value={
              form.checkInMode === "STREAK"
                ? form.checkInDays
                : form.checkInCount
            }
            onChange={(value) =>
              setForm((state) =>
                form.checkInMode === "STREAK"
                  ? { ...state, checkInDays: value }
                  : { ...state, checkInCount: value },
              )
            }
          />
        </div>
      ) : null}
      <div className={subsectionClass}>
        <SubTitle>Когда засчитывать чекин</SubTitle>
        <Toggle
          label="Только в конкретные дни"
          checked={form.specificDayEnabled}
          onChange={(specificDayEnabled) =>
            setForm((state) => ({ ...state, specificDayEnabled }))
          }
        />
        {form.specificDayEnabled ? (
          <Weekdays
            value={form.weekdays}
            onChange={(weekdays) =>
              setForm((state) => ({ ...state, weekdays }))
            }
          />
        ) : null}
        <div className="mt-3">
          <Toggle
            label="Только в конкретное время"
            checked={form.specificTimeEnabled}
            onChange={(specificTimeEnabled) =>
              setForm((state) => ({ ...state, specificTimeEnabled }))
            }
          />
        </div>
        {form.specificTimeEnabled ? (
          <input
            className={`${fieldClass} mt-3`}
            value={form.hours}
            onChange={(event) =>
              setForm((state) => ({ ...state, hours: event.target.value }))
            }
            placeholder="09:00–21:00"
          />
        ) : null}
      </div>
      <CommonSchedule form={form} setForm={setForm} />
    </div>
  );
}

function CommonSchedule({ form, setForm }: StateProps) {
  return (
    <div className={subsectionClass}>
      <SubTitle>Ограничения и периодичность</SubTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Окно выполнения, дней"
          value={form.windowDays}
          onChange={(windowDays) =>
            setForm((state) => ({ ...state, windowDays }))
          }
        />
        <Field label="Периодичность повторной награды">
          <select
            className={fieldClass}
            value={form.periodicity}
            onChange={(event) =>
              setForm((state) => ({
                ...state,
                periodicity: event.target.value as WizardState["periodicity"],
              }))
            }
          >
            <option value="NONE">Без периодичности</option>
            <option value="DAILY">Раз в день</option>
            <option value="WEEKLY">Раз в неделю</option>
            <option value="MONTHLY">Раз в месяц</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

function RewardsStep({
  form,
  setForm,
  lootBoxes,
  promoBundles,
}: StateProps & {
  lootBoxes: GuestGameLootBox[];
  promoBundles: MarketingPromoBundle[];
}) {
  return (
    <>
      <section className={cardClass}>
        <SectionTitle
          title="Прогресс и XP"
          subtitle="XP хранится отдельно от основной награды."
        />
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/25">
          <strong className="text-sm">Что означает XP?</strong>
          <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Это очки опыта, которые продвигают гостя по уровням и по Battle
            Pass, если он настроен. XP не начисляются на баланс и не заменяют
            бонусы Langame.
          </p>
        </div>
        <div className="mt-4">
          <Toggle
            label="Не начислять XP"
            checked={!form.xpEnabled}
            onChange={(disabled) =>
              setForm((state) => ({ ...state, xpEnabled: !disabled }))
            }
          />
        </div>
        {form.xpEnabled ? (
          <div className="mt-4">
            <NumberField
              label="Количество XP"
              value={form.xpAmount}
              onChange={(xpAmount) =>
                setForm((state) => ({ ...state, xpAmount }))
              }
            />
          </div>
        ) : null}
      </section>
      <section className={cardClass}>
        <SectionTitle
          title="Основная награда"
          subtitle="Содержимое блока меняется в зависимости от типа награды."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Тип награды" required>
            <select
              className={fieldClass}
              value={form.rewardType}
              onChange={(event) =>
                setForm((state) => ({
                  ...state,
                  rewardType: event.target.value as RewardType,
                }))
              }
            >
              <option value="LANGAME_BONUS">Бонусы Langame</option>
              <option value="LOOTBOX">Лутбокс</option>
              <option value="PROMOCODE">Промокод</option>
              <option value="NONE">Без основной награды</option>
            </select>
          </Field>
          <Field label="Выдача награды">
            <select
              className={fieldClass}
              value={form.delivery}
              onChange={(event) =>
                setForm((state) => ({
                  ...state,
                  delivery: event.target.value as WizardState["delivery"],
                }))
              }
            >
              <option value="AUTOMATIC">Автоматически</option>
              <option value="ADMIN_APPROVAL">
                С подтверждением администратора
              </option>
            </select>
          </Field>
        </div>
        {form.rewardType === "LANGAME_BONUS" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Сумма бонусов"
              value={form.rewardAmount}
              onChange={(rewardAmount) =>
                setForm((state) => ({ ...state, rewardAmount }))
              }
            />
            <Field label="Название награды">
              <input
                className={fieldClass}
                value={form.rewardLabel}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    rewardLabel: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
        ) : null}
        {form.rewardType === "LOOTBOX" ? (
          <div className="mt-4">
            <Field label="Наградной лутбокс" required>
              <select
                className={fieldClass}
                value={form.lootBoxId}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    lootBoxId: event.target.value,
                  }))
                }
              >
                <option value="">Выберите опубликованный лутбокс</option>
                {lootBoxes.map((box) => (
                  <option key={box.id} value={box.id}>
                    {box.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                Выдаётся право на открытие. Случайный приз определяется только
                после ручного открытия гостем.
              </p>
              <Link
                href="/gamification?tab=lootBoxes"
                target="_blank"
                className="shrink-0 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-200"
              >
                Создать лутбокс для награды
              </Link>
            </div>
          </div>
        ) : null}
        {form.rewardType === "PROMOCODE" ? (
          <div className="mt-4">
            <Field label="Промокод" required>
              <select
                className={fieldClass}
                value={form.promoCodeId}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    promoCodeId: event.target.value,
                  }))
                }
              >
                <option value="">Выберите опубликованный промокод</option>
                {promoBundles.map((promo) => (
                  <option key={promo.id} value={promo.id}>
                    {promo.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="mt-3 text-right">
              <Link
                href="/marketing?tab=promoBundles"
                target="_blank"
                className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-200"
              >
                Создать промокод
              </Link>
            </div>
          </div>
        ) : null}
      </section>
      <section className={cardClass}>
        <SectionTitle
          title={
            form.rewardType === "LOOTBOX"
              ? "Лимиты выдачи лутбокса"
              : "Бюджет и лимиты"
          }
          subtitle="Ограничения применяются существующим reward и bonus-ledger контуром."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Toggle
            label={
              form.rewardType === "LOOTBOX"
                ? "Безлимитное количество лутбоксов"
                : "Безлимитный бюджет"
            }
            checked={form.budgetUnlimited}
            onChange={(budgetUnlimited) =>
              setForm((state) => ({ ...state, budgetUnlimited }))
            }
          />
          <Toggle
            label="Безлимит для гостя"
            checked={form.perGuestLimitUnlimited}
            onChange={(perGuestLimitUnlimited) =>
              setForm((state) => ({ ...state, perGuestLimitUnlimited }))
            }
          />
          {!form.budgetUnlimited ? (
            <NumberField
              label={
                form.rewardType === "LOOTBOX"
                  ? "Общий лимит выдач"
                  : "Общий бюджет"
              }
              value={form.budgetAmount}
              onChange={(budgetAmount) =>
                setForm((state) => ({ ...state, budgetAmount }))
              }
            />
          ) : null}
          {!form.perGuestLimitUnlimited ? (
            <NumberField
              label="Лимит на гостя"
              value={form.perGuestLimit}
              onChange={(perGuestLimit) =>
                setForm((state) => ({ ...state, perGuestLimit }))
              }
            />
          ) : null}
          {form.rewardType !== "LOOTBOX" ? (
            <NumberField
              label="Общий лимит успешных выдач"
              value={form.totalRewardLimit}
              onChange={(totalRewardLimit) =>
                setForm((state) => ({ ...state, totalRewardLimit }))
              }
            />
          ) : null}
        </div>
      </section>
    </>
  );
}

function AppearanceStep({
  form,
  setForm,
  uploading,
  uploadCover,
}: StateProps & {
  uploading: boolean;
  uploadCover: (file: File | null) => void;
}) {
  return (
    <>
      <section className={cardClass}>
        <SectionTitle
          title="Текст для гостя"
          subtitle="Содержание карточки и полного окна в игровом модуле."
        />
        <div className="mt-4 space-y-4">
          <Field label="Название задания" required>
            <input
              className={fieldClass}
              value={form.name}
              onChange={(event) =>
                setForm((state) => ({ ...state, name: event.target.value }))
              }
            />
          </Field>
          <Field label="Описание">
            <textarea
              className={`${fieldClass} min-h-28 resize-y`}
              value={form.description}
              onChange={(event) =>
                setForm((state) => ({
                  ...state,
                  description: event.target.value,
                }))
              }
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Текст действия">
              <input
                className={fieldClass}
                value={form.actionText}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    actionText: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Иконка">
              <select
                className={fieldClass}
                value={form.icon}
                onChange={(event) =>
                  setForm((state) => ({ ...state, icon: event.target.value }))
                }
              >
                <option>Игровой контроллер</option>
                <option>Подарок</option>
                <option>Молния</option>
                <option>Кубок</option>
              </select>
            </Field>
          </div>
        </div>
      </section>
      <section className={cardClass}>
        <SectionTitle
          title="Визуальный стиль"
          subtitle="Цель, XP и награда берутся из других шагов."
        />
        <div className="mt-4">
          <SubTitle>Цветовая тема</SubTitle>
          <ChoiceRow
            values={[
              { id: "CLASSIC", label: "Классическая" },
              { id: "EMERALD", label: "Изумрудная" },
              { id: "VIOLET", label: "Фиолетовая" },
              { id: "DARK", label: "Тёмная" },
              { id: "GOLD", label: "Золотая" },
              { id: "BLACK_RED", label: "Чёрно-красная" },
            ]}
            value={form.theme}
            onChange={(value) =>
              setForm((state) => ({
                ...state,
                theme: value as WizardState["theme"],
              }))
            }
          />
        </div>
        <div className="mt-5">
          <Field label="Обложка">
            <input
              className={fieldClass}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={(event) => uploadCover(event.target.files?.[0] ?? null)}
            />
            <p className="mt-2 text-xs text-zinc-500">
              JPG, PNG или WebP, до 2 МБ. Рекомендуемый размер 1200 × 640 px.
              Изображение используется в верхней части полного модального окна
              квеста; компактная карточка остаётся текстовой.
            </p>
            {form.coverUrl ? (
              <button
                type="button"
                onClick={() => setForm((state) => ({ ...state, coverUrl: "" }))}
                className="mt-2 text-xs font-bold text-red-600"
              >
                Удалить обложку
              </button>
            ) : null}
          </Field>
        </div>
      </section>
    </>
  );
}

function ReadinessCard({
  readiness,
}: {
  readiness: GuestGameMissionWizardReadiness | null;
}) {
  return (
    <div className={cardClass}>
      <h3 className="font-black">Готовность задания</h3>
      {readiness ? (
        <>
          <div className="mt-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <span
              className={`font-black ${readiness.source === "LIVE" ? "text-emerald-600" : "text-amber-600"}`}
            >
              {readiness.sourceLabel}
            </span>
            <p className="mt-1 text-xs text-zinc-500">
              Policy: {readiness.evaluationPolicy} · контракт v
              {readiness.definitionVersion}
            </p>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {readiness.blockers.map((blocker) => (
              <li key={blocker} className="text-red-700 dark:text-red-300">
                × {blocker}
              </li>
            ))}
            {readiness.warnings.map((warning) => (
              <li key={warning} className="text-amber-700 dark:text-amber-300">
                ! {warning}
              </li>
            ))}
            {readiness.ready ? (
              <li className="text-emerald-700 dark:text-emerald-300">
                ✓ Все обязательные условия заполнены
              </li>
            ) : null}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">Проверяем контракт…</p>
      )}
    </div>
  );
}

type StateProps = {
  form: WizardState;
  setForm: React.Dispatch<React.SetStateAction<WizardState>>;
};
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold">
      <span className="mb-1.5 block">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        className={fieldClass}
        type="number"
        min="0"
        value={value}
        onChange={(event) =>
          onChange(Math.max(0, Number(event.target.value) || 0))
        }
      />
    </Field>
  );
}
function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-black">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
    </div>
  );
}
function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
      {children}
    </h3>
  );
}
function ChoiceRow({
  values,
  value,
  onChange,
}: {
  values: Array<{ id: string; label: string; disabled?: boolean }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${value === item.id ? "border-emerald-500 bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
function CompactScenarios({
  values,
  value,
  onChange,
}: {
  values: Array<{ id: string; label: string; hint: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={`grid gap-2 ${values.length === 4 ? "lg:grid-cols-4" : "sm:grid-cols-3"}`}
    >
      {values.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`min-h-16 rounded-lg border px-3 py-2 text-left transition ${value === item.id ? "border-emerald-500 bg-emerald-100/70 dark:bg-emerald-950/40" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"}`}
        >
          <strong className="block text-sm">{item.label}</strong>
          <span className="mt-1 block text-[11px] leading-4 text-zinc-500">
            {item.hint}
          </span>
        </button>
      ))}
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-950">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-emerald-500"
      />
    </label>
  );
}
function Weekdays({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map((label, index) => (
        <button
          key={label}
          type="button"
          onClick={() =>
            onChange(
              value.includes(index)
                ? value.filter((item) => item !== index)
                : [...value, index],
            )
          }
          className={`rounded-lg border px-3 py-2 text-xs font-bold ${value.includes(index) ? "border-emerald-500 bg-emerald-100 dark:bg-emerald-950" : "border-zinc-200 dark:border-zinc-800"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function DisabledDevelopment({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-4 opacity-70 dark:border-zinc-700">
      <div className="flex items-center justify-between">
        <strong className="text-sm">{title}</strong>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black uppercase dark:bg-zinc-800">
          В разработке
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{text}</p>
    </div>
  );
}
function StepButton({
  index,
  label,
  active,
  ready,
  onClick,
}: {
  index: string;
  label: string;
  active: boolean;
  ready: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-20 items-center gap-3 rounded-lg px-4 text-left transition ${active ? "bg-emerald-50 ring-1 ring-emerald-300 dark:bg-emerald-950/30" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
    >
      <span
        className={`grid h-9 w-9 place-items-center rounded-lg text-xs font-black ${active ? "bg-emerald-500 text-white" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}
      >
        {index}
      </span>
      <span>
        <strong className="block">{label}</strong>
        <small className={ready ? "text-emerald-600" : "text-zinc-400"}>
          {ready ? "Заполнено" : "Нужно заполнить"}
        </small>
      </span>
    </button>
  );
}

function buildWizardDto(
  form: WizardState,
  products: SelectedProduct[],
  productGroups: GuestGameMissionProductGroup[],
  lootBoxes: GuestGameLootBox[],
  promos: MarketingPromoBundle[],
): GuestGameMissionWizardDto {
  const metric: Record<string, unknown> = {
    target: form.target,
    windowDays: form.windowDays,
  };
  const conditions: Record<string, unknown> = {
    metric,
    sessionType: form.sessionType,
    periodicity: form.periodicity,
  };
  if (form.taskType === "APP_OPEN")
    Object.assign(metric, {
      aggregation: "exists",
      target: 1,
      unit: "вход",
    });
  if (form.taskType === "PLAY_TIME")
    Object.assign(metric, {
      aggregation: "duration",
      unit: "минут",
      minSessionMinutes: form.minSessionMinutes,
    });
  if (form.taskType === "PRODUCT_PURCHASE")
    Object.assign(metric, {
      purchaseSource: form.purchaseSource,
      categoryCatalogSource:
        form.purchaseSource === "CATEGORY"
          ? form.categoryCatalogSource
          : undefined,
      productIds:
        form.purchaseSource === "PRODUCT"
          ? products.map((product) => product.id)
          : [],
      externalProductIds:
        form.purchaseSource === "PRODUCT"
          ? products
              .map((product) => product.externalProductId)
              .filter((id): id is string => Boolean(id))
          : [],
      productRefs:
        form.purchaseSource === "PRODUCT"
          ? products.map((product) => ({
              productId: product.id,
              externalProductId: product.externalProductId,
              externalDomain: product.externalDomain,
            }))
          : [],
      categoryIds:
        form.purchaseSource === "CATEGORY"
          ? productGroups.map((group) => group.id)
          : [],
      productMatch: form.productMatch,
      amountMode: form.amountMode,
      minSpendAmount:
        form.amountMode === "SINGLE_MINIMUM" ? form.minimumAmount : undefined,
      totalAmount: form.totalAmount,
      unit: "покупок",
    });
  if (form.taskType === "PRODUCT_PURCHASE") {
    conditions.purchaseSource = form.purchaseSource;
    if (form.purchaseSource === "CATEGORY") {
      conditions.categoryCatalogSource = form.categoryCatalogSource;
    }
  }
  if (form.taskType === "BALANCE_TOPUP")
    Object.assign(metric, {
      topupMode: form.topupMode,
      amountComparison: form.topupComparison,
      amount: form.topupAmount,
      count: form.topupCount,
      totalAmount: form.totalAmount,
      unit: form.topupMode === "PERIOD_TOTAL" ? "₽" : "пополнений",
    });
  if (form.taskType === "CHECK_IN")
    Object.assign(metric, {
      checkInMode: form.checkInMode,
      count: form.checkInCount,
      days: form.checkInDays,
      weekdays: form.specificDayEnabled ? form.weekdays : [],
      hours: form.specificTimeEnabled && form.hours ? [form.hours] : [],
      unit: form.checkInMode === "STREAK" ? "дней" : "чекинов",
    });
  const selectedLootBox = lootBoxes.find((item) => item.id === form.lootBoxId);
  const selectedPromo = promos.find((item) => item.id === form.promoCodeId);
  return {
    name: form.name,
    taskType: form.taskType,
    visibility: form.visibility,
    audienceId: form.audienceId || null,
    storeIds: form.storeIds,
    indefinite: form.indefinite,
    periodFrom: form.indefinite ? null : localInputToIso(form.periodFrom),
    periodTo: form.indefinite ? null : localInputToIso(form.periodTo),
    conditions,
    reward: {
      type: form.rewardType,
      amount: form.rewardAmount,
      label:
        form.rewardType === "LOOTBOX"
          ? selectedLootBox?.name
          : form.rewardType === "PROMOCODE"
            ? selectedPromo?.name
            : form.rewardLabel,
      delivery: form.delivery,
      lootBoxId: form.lootBoxId || null,
      promoCodeId: form.promoCodeId || null,
      xpEnabled: form.xpEnabled,
      xpAmount: form.xpAmount,
      budgetUnlimited: form.budgetUnlimited,
      budgetAmount: form.budgetAmount,
      perGuestLimitUnlimited: form.perGuestLimitUnlimited,
      perGuestLimit: form.perGuestLimit,
      totalRewardLimit: form.totalRewardLimit,
      periodicity: form.periodicity,
    },
    appearance: {
      description: form.description,
      actionText: form.actionText,
      theme: form.theme,
      icon: form.icon,
      coverUrl: form.coverUrl || null,
    },
    note: null,
  };
}

function buildPreview(
  form: WizardState,
  products: SelectedProduct[],
  productGroups: GuestGameMissionProductGroup[],
  lootBoxes: GuestGameLootBox[],
  promos: MarketingPromoBundle[],
): GuestMissionPreviewData {
  const reward =
    form.rewardType === "LANGAME_BONUS"
      ? `${form.rewardAmount} бонусов на баланс`
      : form.rewardType === "LOOTBOX"
        ? (lootBoxes.find((box) => box.id === form.lootBoxId)?.name ??
          "Наградной лутбокс")
        : form.rewardType === "PROMOCODE"
          ? (promos.find((promo) => promo.id === form.promoCodeId)?.name ??
            "Промокод")
          : "Без основной награды";
  const target =
    form.taskType === "APP_OPEN"
      ? 1
      : form.taskType === "PLAY_TIME"
      ? form.target
      : form.taskType === "BALANCE_TOPUP"
        ? form.topupMode === "PERIOD_TOTAL"
          ? form.totalAmount
          : form.topupMode === "COUNT"
            ? form.topupCount
            : 1
        : form.taskType === "CHECK_IN"
          ? form.checkInMode === "STREAK"
            ? form.checkInDays
            : form.checkInMode === "SINGLE"
              ? 1
              : form.checkInCount
          : form.productMatch === "ALL"
            ? Math.max(
                1,
                form.purchaseSource === "CATEGORY"
                  ? productGroups.length
                  : products.length,
              )
            : 1;
  const unit =
    form.taskType === "APP_OPEN"
      ? "вход"
      : form.taskType === "PLAY_TIME"
      ? "минут"
      : form.taskType === "PRODUCT_PURCHASE"
        ? "покупок"
        : form.taskType === "BALANCE_TOPUP"
          ? form.topupMode === "PERIOD_TOTAL"
            ? "₽"
            : "пополнений"
          : form.checkInMode === "STREAK"
            ? "дней"
            : "чекинов";
  return {
    title: form.name || "Новое задание",
    description: form.description || logicSubtitle(form.taskType),
    condition: previewCondition(form),
    reward,
    xp: form.xpEnabled ? form.xpAmount : 0,
    progressCurrent:
      form.taskType === "APP_OPEN"
        ? 0
        : Math.min(target, Math.round(target * 0.6)),
    progressTarget: target,
    progressUnit: unit,
    actionText: form.actionText,
    icon: form.icon,
    theme: form.theme,
    coverUrl: form.coverUrl,
    products:
      form.taskType === "PRODUCT_PURCHASE"
        ? form.purchaseSource === "CATEGORY"
          ? productGroups.map((group) => group.name)
          : products.map((product) => product.name)
        : [],
    productMode: form.productMatch,
    minimumAmount:
      form.amountMode === "SINGLE_MINIMUM" ? form.minimumAmount : null,
  };
}
function previewCondition(form: WizardState) {
  if (form.taskType === "APP_OPEN") return "Открыть игровой модуль";
  if (form.taskType === "PLAY_TIME") {
    const sessionRequirement =
      form.sessionType === "HOURLY"
        ? " с почасовым тарифом"
        : form.sessionType === "PACKAGE_OR_SUBSCRIPTION"
          ? " по пакету или абонементу"
          : "";
    const action =
      form.target === 60
        ? `Сыграть один час в игровой сессии${sessionRequirement}`
        : `Провести в игре ${form.target} минут${sessionRequirement}`;

    return `${action}${form.minSessionMinutes ? `, минимум ${form.minSessionMinutes} минут за сессию` : ""}`;
  }
  if (form.taskType === "PRODUCT_PURCHASE") {
    const productCondition =
      form.productMatch === "ALL"
        ? `Купить ${form.purchaseSource === "CATEGORY" ? "товар из каждой выбранной категории" : "все выбранные товары"}`
        : `Купить ${form.purchaseSource === "CATEGORY" ? "товар из любой выбранной категории" : "любой выбранный товар"}`;
    const amountCondition =
      form.amountMode === "SINGLE_MINIMUM"
        ? `одной покупкой не менее чем на ${form.minimumAmount} ₽`
        : form.amountMode === "PERIOD_TOTAL"
          ? `на общую сумму не менее ${form.totalAmount} ₽ за период`
          : null;

    return [productCondition, amountCondition].filter(Boolean).join(" · ");
  }
  if (form.taskType === "BALANCE_TOPUP")
    return form.topupMode === "PERIOD_TOTAL"
      ? `Пополнить баланс суммарно не менее чем на ${form.totalAmount} ₽`
      : form.topupMode === "COUNT"
        ? `Пополнить баланс ${form.topupCount} раз, каждый раз ${form.topupComparison === "EXACT" ? "ровно на" : "не менее чем на"} ${form.topupAmount} ₽`
        : `Пополнить баланс ${form.topupComparison === "EXACT" ? "ровно на" : "не менее чем на"} ${form.topupAmount} ₽`;
  return form.checkInMode === "STREAK"
    ? `Сделать чекин ${form.checkInDays} дней подряд`
    : form.checkInMode === "SINGLE"
      ? "Сделать чекин в клубе"
      : `Сделать ${form.checkInCount} чекинов`;
}
function logicSubtitle(taskType: TaskType) {
  return taskType === "APP_OPEN"
    ? "Условие выполняется при входе гостя в игровой модуль."
    : taskType === "PLAY_TIME"
    ? "Условие проверяется по игровым сессиям гостя."
    : taskType === "PRODUCT_PURCHASE"
      ? "Условие проверяется по положительным фактам покупок, привязанным к гостю."
      : taskType === "BALANCE_TOPUP"
        ? "Условие проверяется по успешным пополнениям из игрового журнала."
        : "Условие проверяется по успешным чекинам с календарём клуба.";
}
function rewardReady(form: WizardState) {
  return (
    form.rewardType === "NONE" ||
    form.rewardType === "LANGAME_BONUS" ||
    (form.rewardType === "LOOTBOX" && Boolean(form.lootBoxId)) ||
    (form.rewardType === "PROMOCODE" && Boolean(form.promoCodeId))
  );
}
function saveLabel(state: "idle" | "saving" | "saved" | "error") {
  return state === "saving"
    ? "Сохраняем…"
    : state === "saved"
      ? "Все изменения сохранены"
      : state === "error"
        ? "Есть ошибка сохранения"
        : "Автосохранение начнётся после первого сохранения";
}
function responseMessage(response: Response) {
  return response
    .json()
    .then((data: { message?: string | string[] }) =>
      Array.isArray(data.message)
        ? data.message.join(". ")
        : (data.message ?? `Ошибка ${response.status}`),
    )
    .catch(() => `Ошибка ${response.status}`);
}
function localInputToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function cacheProductCatalog(key: string, catalog: ProductCatalog) {
  if (productCatalogCache.size >= productCatalogCacheLimit) {
    const oldestKey = productCatalogCache.keys().next().value;
    if (oldestKey) productCatalogCache.delete(oldestKey);
  }
  productCatalogCache.set(key, catalog);
}

async function fetchProductGroupCatalog(
  storeIds: string[],
  source: WizardState["categoryCatalogSource"],
  controller: AbortController,
) {
  const params = new URLSearchParams();
  params.set("source", source);
  storeIds.forEach((storeId) => params.append("storeId", storeId));
  const response = await fetch(
    `/api/guests/gamification/missions/wizard/product-groups?${params}`,
    { signal: controller.signal },
  );
  if (!response.ok) {
    throw new Error(await responseMessage(response));
  }
  return response.json() as Promise<GuestGameMissionProductGroupCatalog>;
}

function wizardStateFromDefinition(
  definition: GuestGameMissionWizardDto,
  stores: Store[],
): {
  form: WizardState;
  products: SelectedProduct[];
  productGroups: GuestGameMissionProductGroup[];
} {
  const defaults = initialState(stores);
  const conditions = recordValue(definition.conditions);
  const metric = recordValue(conditions.metric);
  const reward = recordValue(definition.reward);
  const appearance = recordValue(definition.appearance);
  const taskType = wizardTaskType(definition.taskType, defaults.taskType);
  const weekdays = numberListValue(metric.weekdays);
  const hours = stringListValue(metric.hours);
  const productIds = stringListValue(metric.productIds);
  const externalProductIds = stringListValue(metric.externalProductIds);
  const productRefs = recordListValue(metric.productRefs);
  const categorySelections = recordListValue(metric.categorySelections);
  const categoryCatalogSource = enumValue(
    stringValue(conditions.categoryCatalogSource) ??
      stringValue(metric.categoryCatalogSource),
    ["LANGAME", "LEETPLUS"] as const,
    defaults.categoryCatalogSource,
  );
  const purchaseSource = enumValue(
    stringValue(conditions.purchaseSource) ?? stringValue(metric.purchaseSource),
    ["PRODUCT", "CATEGORY"] as const,
    defaults.purchaseSource,
  );
  const selectedProducts = productRefs.length
    ? productRefs
        .map((product, index) => {
          const id = stringValue(product.productId) ?? productIds[index];
          if (!id) return null;
          const externalProductId: string | null =
            stringValue(product.externalProductId) ??
            externalProductIds[index] ??
            null;
          return {
            id,
            name: stringValue(product.name) ?? "Выбранный товар",
            externalProductId,
            externalDomain: stringValue(product.externalDomain),
          } as SelectedProduct;
        })
        .filter((product): product is SelectedProduct => product !== null)
    : productIds.map((id, index) => ({
        id,
        name: "Выбранный товар",
        externalProductId: externalProductIds[index] ?? null,
        externalDomain: null,
      }));
  const selectedProductGroups = categorySelections.map((group) => ({
    id: stringValue(group.id) ?? "",
    source: categoryCatalogSource,
    name: stringValue(group.name) ?? "Выбранная категория",
    categoryIds: stringListValue(group.categoryIds),
    productCount: 0,
    storeCount: 0,
    storeNames: [],
    refs: recordListValue(group.refs)
      .map((ref) => {
        const externalDomain = stringValue(ref.externalDomain);
        const externalGroupId = stringValue(ref.externalGroupId);
        if (!externalDomain || !externalGroupId) return null;
        return {
          externalDomain,
          externalGroupId,
          productCount: numberValue(ref.productCount, 0),
          storeIds: stringListValue(ref.storeIds),
        };
      })
      .filter(
        (
          ref,
        ): ref is GuestGameMissionProductGroup["refs"][number] => ref !== null,
      ),
  })).filter((group) => Boolean(group.id));

  return {
    form: {
      ...defaults,
      name: definition.name || defaults.name,
      taskType,
      visibility:
        definition.visibility === "HIDDEN" ? "HIDDEN" : defaults.visibility,
      audienceId: definition.audienceId ?? "",
      storeIds:
        definition.storeIds.length > 0 ? definition.storeIds : defaults.storeIds,
      indefinite:
        definition.indefinite === true || conditions.indefinite === true,
      periodFrom: localInputFromIso(definition.periodFrom, defaults.periodFrom),
      periodTo: localInputFromIso(definition.periodTo, defaults.periodTo),
      sessionType: enumValue(
        stringValue(conditions.sessionType),
        ["ANY", "HOURLY", "PACKAGE_OR_SUBSCRIPTION"] as const,
        defaults.sessionType,
      ),
      target: numberValue(metric.target, defaults.target),
      windowDays: numberValue(metric.windowDays, defaults.windowDays),
      hours: stringValue(metric.hours) ?? hours[0] ?? defaults.hours,
      weekdays,
      minSessionMinutes: numberValue(
        metric.minSessionMinutes,
        defaults.minSessionMinutes,
      ),
      purchaseSource,
      categoryCatalogSource,
      productMatch: enumValue(
        stringValue(metric.productMatch),
        ["ANY", "ALL"] as const,
        defaults.productMatch,
      ),
      amountMode: enumValue(
        stringValue(metric.amountMode),
        ["NONE", "SINGLE_MINIMUM", "PERIOD_TOTAL"] as const,
        defaults.amountMode,
      ),
      minimumAmount: numberValue(metric.minSpendAmount, defaults.minimumAmount),
      totalAmount: numberValue(metric.totalAmount, defaults.totalAmount),
      topupMode: enumValue(
        stringValue(metric.topupMode),
        ["SINGLE", "COUNT", "PERIOD_TOTAL"] as const,
        defaults.topupMode,
      ),
      topupComparison: enumValue(
        stringValue(metric.amountComparison),
        ["EXACT", "AT_LEAST"] as const,
        defaults.topupComparison,
      ),
      topupAmount: numberValue(metric.amount, defaults.topupAmount),
      topupCount: numberValue(metric.count, defaults.topupCount),
      checkInMode: enumValue(
        stringValue(metric.checkInMode),
        ["SINGLE", "COUNT", "PERIOD", "STREAK"] as const,
        defaults.checkInMode,
      ),
      checkInCount: numberValue(metric.count, defaults.checkInCount),
      checkInDays: numberValue(metric.days, defaults.checkInDays),
      specificDayEnabled: weekdays.length > 0,
      specificTimeEnabled: hours.length > 0,
      periodicity: enumValue(
        stringValue(conditions.periodicity) ?? stringValue(reward.periodicity),
        ["NONE", "DAILY", "WEEKLY", "MONTHLY"] as const,
        defaults.periodicity,
      ),
      rewardType: wizardRewardTypeFromDefinition(reward.type),
      rewardAmount: numberValue(reward.amount, defaults.rewardAmount),
      rewardLabel: stringValue(reward.label) ?? defaults.rewardLabel,
      delivery:
        reward.delivery === "ADMIN_APPROVAL" ? "ADMIN_APPROVAL" : "AUTOMATIC",
      lootBoxId: stringValue(reward.lootBoxId) ?? "",
      promoCodeId: stringValue(reward.promoCodeId) ?? "",
      xpEnabled: reward.xpEnabled !== false,
      xpAmount: numberValue(reward.xpAmount, defaults.xpAmount),
      budgetUnlimited: reward.budgetUnlimited === true,
      budgetAmount: numberValue(reward.budgetAmount, defaults.budgetAmount),
      perGuestLimitUnlimited: reward.perGuestLimitUnlimited === true,
      perGuestLimit: numberValue(reward.perGuestLimit, defaults.perGuestLimit),
      totalRewardLimit: numberValue(
        reward.totalRewardLimit,
        defaults.totalRewardLimit,
      ),
      description: stringValue(appearance.description) ?? defaults.description,
      actionText: stringValue(appearance.actionText) ?? defaults.actionText,
      theme: enumValue(
        stringValue(appearance.theme),
        ["CLASSIC", "EMERALD", "VIOLET", "DARK", "GOLD", "BLACK_RED"] as const,
        defaults.theme,
      ),
      icon: stringValue(appearance.icon) ?? defaults.icon,
      coverUrl: stringValue(appearance.coverUrl) ?? "",
    },
    products: uniqueSelectedProducts(selectedProducts),
    productGroups: selectedProductGroups,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordListValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringListValue(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((item): item is string => Boolean(item))
    : [];
}

function numberListValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is number =>
          typeof item === "number" && Number.isFinite(item),
      )
    : [];
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function enumValue<T extends string>(
  value: string | null,
  values: readonly T[],
  fallback: T,
): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function wizardTaskType(value: string, fallback: TaskType) {
  return enumValue(
    value,
    ["APP_OPEN", "PLAY_TIME", "PRODUCT_PURCHASE", "BALANCE_TOPUP", "CHECK_IN"] as const,
    fallback,
  );
}

function wizardRewardTypeFromDefinition(value: unknown): RewardType {
  const normalized = stringValue(value)?.toUpperCase();
  if (
    normalized === "BONUS" ||
    normalized === "BONUS_BALANCE" ||
    normalized === "LANGAME_BONUS"
  ) {
    return "LANGAME_BONUS";
  }
  if (normalized === "LOOT_BOX_ENTITLEMENT" || normalized === "LOOTBOX") {
    return "LOOTBOX";
  }
  if (normalized === "PROMOCODE") return "PROMOCODE";
  return "NONE";
}

function localInputFromIso(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : localDateTime(date);
}

function uniqueSelectedProducts(products: SelectedProduct[]) {
  return products.filter(
    (product, index) =>
      product.id && products.findIndex((candidate) => candidate.id === product.id) === index,
  );
}

function initialState(
  stores: Store[],
  taskType: TaskType = "PLAY_TIME",
): WizardState {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    name: "Играй час — получай награду",
    taskType,
    visibility: "VISIBLE",
    audienceId: "",
    storeIds: stores[0] ? [stores[0].id] : [],
    indefinite: false,
    periodFrom: localDateTime(now),
    periodTo: localDateTime(end),
    sessionType: "ANY",
    target: 60,
    windowDays: 30,
    hours: "09:00-21:00",
    weekdays: [],
    minSessionMinutes: 60,
    purchaseSource: "PRODUCT",
    categoryCatalogSource: "LANGAME",
    productMatch: "ANY",
    amountMode: "NONE",
    minimumAmount: 200,
    totalAmount: 1000,
    topupMode: "SINGLE",
    topupComparison: "AT_LEAST",
    topupAmount: 500,
    topupCount: 3,
    checkInMode: "SINGLE",
    checkInCount: 5,
    checkInDays: 7,
    specificDayEnabled: false,
    specificTimeEnabled: false,
    periodicity: "NONE",
    rewardType: "LANGAME_BONUS",
    rewardAmount: 60,
    rewardLabel: "60 бонусов на баланс",
    delivery: "AUTOMATIC",
    lootBoxId: "",
    promoCodeId: "",
    xpEnabled: true,
    xpAmount: 60,
    budgetUnlimited: true,
    budgetAmount: 10000,
    perGuestLimitUnlimited: false,
    perGuestLimit: 1,
    totalRewardLimit: 1000,
    description: "Выполни условие задания и получи награду.",
    actionText: "Играть",
    theme: "CLASSIC",
    icon: "Игровой контроллер",
    coverUrl: "",
  };
}
