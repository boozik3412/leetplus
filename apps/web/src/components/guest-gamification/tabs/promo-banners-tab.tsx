"use client";

import type {
  PromoBannerForm,
  PromoBannerNotice,
  RuleTemplateType,
  PromoBannerUsageSummary,
  PromoBannerUsageInfo,
} from "../shared/types";
import type {
  GuestGamePromoCard,
  GuestGameStatus,
} from "@/lib/guest-gamification";
import type { Store } from "@/lib/stores";
import {
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from "react";
import {
  buildPromoBannerUsage,
  promoCardMetadata,
  metadataString,
  compactStoreNames,
  renderPromoBannerImage,
  clampPromoBannerScale,
  clampPromoBannerOffset,
  promoBannerIsInActivePeriod,
} from "../shared/promo-banner";
import {
  RulesLayout,
  StatusSelect,
  StoreSelect,
  RuleCard,
} from "../shared/rule-fields";
import {
  primaryButtonClass,
  fieldClass,
  smallButtonClass,
  PROMO_BANNER_DISPLAY_LIMIT,
  statusLabels,
} from "../shared/constants";
import { FormSection, Field } from "../shared/ui";
import { trackingId, formatDate, storeScopeLabel } from "../shared/helpers";

export type PromoBannerDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
};

export const promoTargetOptions = [
  { value: "", label: "Главный экран" },
  { value: "lootboxes", label: "Лутбоксы" },
  { value: "missions", label: "Задания" },
  { value: "battlePass", label: "Battle Pass" },
  { value: "rewards", label: "Кошелек наград" },
];

export function PromoBannersTab({
  form,
  setForm,
  promoCards,
  stores,
  editingId,
  notice,
  isFormOpen,
  onSave,
  onEdit,
  onCreateNew,
  onReset,
  onStatus,
  onDelete,
  saving,
  canManage,
}: {
  form: PromoBannerForm;
  setForm: (form: PromoBannerForm) => void;
  promoCards: GuestGamePromoCard[];
  stores: Store[];
  editingId: string | null;
  notice: PromoBannerNotice | null;
  isFormOpen: boolean;
  onSave: () => Promise<void>;
  onEdit: (promoCard: GuestGamePromoCard) => void;
  onCreateNew: () => void;
  onReset: () => void;
  onStatus: (
    type: RuleTemplateType,
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  onDelete: (type: RuleTemplateType, id: string, name: string) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const promoBannerUsage = useMemo(
    () => buildPromoBannerUsage(promoCards, stores),
    [promoCards, stores],
  );
  const activePromoCards = promoCards.filter(
    (promoCard) => promoCard.status === "ACTIVE",
  ).length;
  const promoTitle = form.title.trim();
  const formTitle =
    editingId && promoTitle
      ? `Редактирование промо баннера "${promoTitle}"`
      : editingId
        ? "Редактирование промо баннера"
        : "Настройка промо баннера";

  return (
    <RulesLayout
      canManage={canManage}
      formTitle={formTitle}
      formAction={
        !isFormOpen ? (
          <button
            type="button"
            className={`${primaryButtonClass} sm:min-w-52`}
            onClick={onCreateNew}
          >
            Создать новый промо баннер
          </button>
        ) : undefined
      }
      form={
        isFormOpen ? (
          <div className="space-y-4">
            {notice ? <PromoBannerNoticeBox notice={notice} /> : null}
            <FormSection title="Основное">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.6fr)]">
                <Field label="Название">
                  <input
                    className={fieldClass}
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                  />
                </Field>
                <Field label="Статус">
                  <StatusSelect
                    value={form.status}
                    onChange={(status) => setForm({ ...form, status })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Лейбл">
                  <input
                    className={fieldClass}
                    value={form.label}
                    onChange={(event) =>
                      setForm({ ...form, label: event.target.value })
                    }
                  />
                </Field>
                <Field label="Тег">
                  <input
                    className={fieldClass}
                    value={form.tag}
                    onChange={(event) =>
                      setForm({ ...form, tag: event.target.value })
                    }
                  />
                </Field>
                <Field label="Приоритет">
                  <input
                    className={fieldClass}
                    type="number"
                    value={form.priority}
                    onChange={(event) =>
                      setForm({ ...form, priority: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Описание">
                <textarea
                  className={`${fieldClass} min-h-20`}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </Field>
            </FormSection>

            <FormSection title="Предпросмотр карточки банера">
              <PromoBannerImageEditor form={form} setForm={setForm} />
            </FormSection>

            <FormSection title="Показ и действие">
              <StoreSelect
                stores={stores}
                value={form.storeIds}
                onChange={(storeIds) => setForm({ ...form, storeIds })}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Начало">
                  <input
                    className={fieldClass}
                    type="datetime-local"
                    value={form.periodFrom}
                    onChange={(event) =>
                      setForm({ ...form, periodFrom: event.target.value })
                    }
                  />
                </Field>
                <Field label="Окончание">
                  <input
                    className={fieldClass}
                    type="datetime-local"
                    value={form.periodTo}
                    onChange={(event) =>
                      setForm({ ...form, periodTo: event.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Куда ведет">
                  <select
                    className={fieldClass}
                    value={form.targetAnchor}
                    onChange={(event) =>
                      setForm({ ...form, targetAnchor: event.target.value })
                    }
                  >
                    {promoTargetOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Текст действия">
                  <input
                    className={fieldClass}
                    value={form.actionLabel}
                    onChange={(event) =>
                      setForm({ ...form, actionLabel: event.target.value })
                    }
                  />
                </Field>
                <Field label="Внешняя ссылка">
                  <input
                    className={fieldClass}
                    placeholder="https://example.com/promo или ts3server://1337community"
                    type="text"
                    value={form.actionUrl}
                    onChange={(event) =>
                      setForm({ ...form, actionUrl: event.target.value })
                    }
                  />
                </Field>
              </div>
            </FormSection>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                className={`${primaryButtonClass} sm:min-w-44`}
                disabled={saving === "promoBanner"}
                onClick={onSave}
              >
                {editingId ? "Сохранить" : "Создать промо баннер"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={onReset}
                >
                  Сбросить выбор
                </button>
              ) : null}
            </div>
          </div>
        ) : null
      }
      listTitle="Созданные промо баннеры"
      listSummary={
        <div className="space-y-3">
          {!isFormOpen && notice ? (
            <PromoBannerNoticeBox notice={notice} />
          ) : null}
          <PromoBannerLimitSummary
            activeCount={activePromoCards}
            totalCount={promoCards.length}
            usage={promoBannerUsage}
          />
        </div>
      }
      items={promoCards}
      layout="stacked"
      renderItem={(item) => {
        const metadata = promoCardMetadata(item);
        const imageUrl = metadataString(metadata, "imageUrl");
        const actionUrl = metadataString(metadata, "actionUrl");
        const usageInfo = promoBannerUsage.byCardId.get(item.id);

        return (
          <RuleCard
            key={item.id}
            eyebrow="Сохраненный баннер"
            trackingId={trackingId("BAN", item.id)}
            title={item.title}
            status={item.status}
            subtitle={`${item.label ?? "Промо"} · ${
              item.description ?? "без описания"
            }`}
            meta={[
              ...promoBannerUsageMeta(item, promoBannerUsage, stores),
              item.tag ?? "без тега",
              `приоритет ${item.priority}`,
              formatDate(item.periodTo) || "без срока",
            ]}
            details={
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[88px_minmax(0,1fr)]">
                  <PromoBannerThumbnail
                    imageUrl={imageUrl}
                    title={item.title}
                  />
                  <div className="min-w-0 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    <p>
                      Формат: 9:16
                      {imageUrl
                        ? " · изображение загружено"
                        : " · без изображения"}
                    </p>
                    <p>
                      Действие:{" "}
                      {metadataString(metadata, "actionLabel") ??
                        promoTargetLabel(item.targetAnchor)}
                    </p>
                    <p>Ссылка: {actionUrl ?? "не указана"}</p>
                  </div>
                </div>
                <PromoBannerVisibilityDetails usageInfo={usageInfo} />
              </div>
            }
            onEdit={() => onEdit(item)}
            onStatus={(status) => onStatus("promo-cards", item.id, status)}
            saving={saving === `promo-cards-${item.id}`}
            onDelete={() => onDelete("promo-cards", item.id, item.title)}
            deleteSaving={saving === `promo-cards-delete-${item.id}`}
            canManage={canManage}
          />
        );
      }}
    />
  );
}

export function PromoBannerNoticeBox({ notice }: { notice: PromoBannerNotice }) {
  const className =
    notice.tone === "error"
      ? "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
      : "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100";

  return <div className={className}>{notice.message}</div>;
}

export function PromoBannerLimitSummary({
  usage,
  activeCount,
  totalCount,
}: {
  usage: PromoBannerUsageSummary;
  activeCount: number;
  totalCount: number;
}) {
  const overloadedStores = usage.stores.filter(
    (store) => store.overflowCount > 0,
  );

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-3 text-sm text-cyan-950 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold">
            В игровом модуле показывается до {PROMO_BANNER_DISPLAY_LIMIT}{" "}
            промо-баннеров на клуб.
          </p>
          <p className="mt-1 text-xs leading-5 text-cyan-800/80 dark:text-cyan-100/80">
            Сейчас показывается {usage.visibleCardIds.size} из {activeCount}{" "}
            активных правил. Всего создано {totalCount}.
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-cyan-800 shadow-sm dark:bg-cyan-950 dark:text-cyan-100">
          лимит {PROMO_BANNER_DISPLAY_LIMIT}
        </span>
      </div>
      {overloadedStores.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {overloadedStores.slice(0, 4).map((store) => (
            <div
              key={store.storeId}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <span className="font-bold">{store.storeName}</span>:{" "}
              {store.visibleCount} показывается, {store.overflowCount} сверх
              лимита.
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-cyan-800/80 dark:text-cyan-100/80">
          Превышений по клубам нет: все активные баннеры, подходящие по датам,
          входят в доступные слоты.
        </p>
      )}
    </div>
  );
}

export function PromoBannerVisibilityDetails({
  usageInfo,
}: {
  usageInfo: PromoBannerUsageInfo | undefined;
}) {
  if (!usageInfo?.overflowStoreNames.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
      Не показывается для {compactStoreNames(usageInfo.overflowStoreNames)}: в
      игровом модуле уже заняты {PROMO_BANNER_DISPLAY_LIMIT} слота более
      приоритетными или более новыми баннерами.
    </div>
  );
}

export function PromoBannerImageEditor({
  form,
  setForm,
}: {
  form: PromoBannerForm;
  setForm: (form: PromoBannerForm) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSnapshot, setEditorSnapshot] = useState<PromoBannerForm | null>(
    null,
  );
  const [dragState, setDragState] = useState<PromoBannerDragState | null>(null);
  const source = form.imageSource || form.imageUrl;
  const scale = Number(form.imageScale) || 1;
  const offsetX = Number(form.imageOffsetX) || 0;
  const offsetY = Number(form.imageOffsetY) || 0;

  function handleFile(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageSource =
        typeof reader.result === "string" ? reader.result : "";
      setForm({
        ...form,
        imageSource,
        imageUrl: "",
        imageScale: "1",
        imageOffsetX: "0",
        imageOffsetY: "0",
      });
    };
    reader.readAsDataURL(file);
  }

  function openEditor() {
    if (!source) {
      return;
    }

    setEditorSnapshot(form);

    if (!form.imageSource) {
      setForm({
        ...form,
        imageSource: source,
        imageScale: "1",
        imageOffsetX: "0",
        imageOffsetY: "0",
      });
    }

    setEditorOpen(true);
  }

  function closeEditor() {
    if (editorSnapshot) {
      setForm(editorSnapshot);
      setEditorSnapshot(null);
    }

    setEditorOpen(false);
  }

  async function applyCrop(closeEditor = false) {
    const imageUrl = await renderPromoBannerImage(form);
    setForm({
      ...form,
      imageUrl,
      imageSource: "",
    });
    setEditorSnapshot(null);

    if (closeEditor) {
      setEditorOpen(false);
    }
  }

  function updateScale(nextScale: number) {
    setForm({
      ...form,
      imageScale: formatPromoBannerNumber(clampPromoBannerScale(nextScale)),
    });
  }

  function resetCrop() {
    setForm({
      ...form,
      imageScale: "1",
      imageOffsetX: "0",
      imageOffsetY: "0",
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!source) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX,
      offsetY,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const nextOffsetX = clampPromoBannerOffset(
      dragState.offsetX +
        ((event.clientX - dragState.startX) / rect.width) * 100,
    );
    const nextOffsetY = clampPromoBannerOffset(
      dragState.offsetY +
        ((event.clientY - dragState.startY) / rect.height) * 100,
    );

    setForm({
      ...form,
      imageOffsetX: formatPromoBannerNumber(nextOffsetX),
      imageOffsetY: formatPromoBannerNumber(nextOffsetY),
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragState?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setDragState(null);
    }
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="mx-auto w-[240px] max-w-full">
          <PromoBannerCardPreview
            form={form}
            source={source}
            onEdit={source ? openEditor : undefined}
          />
        </div>
        <div className="space-y-3">
          <Field label="Изображение">
            <input
              className={fieldClass}
              type="file"
              accept="image/*"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {source ? (
              <button
                type="button"
                className={smallButtonClass}
                onClick={() =>
                  setForm({
                    ...form,
                    imageUrl: "",
                    imageSource: "",
                  })
                }
              >
                Убрать изображение
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {editorOpen && source ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-4xl rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
                  Редактирование кадра
                </p>
                <h3 className="text-lg font-bold text-zinc-950 dark:text-white">
                  {form.title || "Промо баннер"}
                </h3>
              </div>
              <button
                type="button"
                className={smallButtonClass}
                onClick={closeEditor}
              >
                Закрыть
              </button>
            </div>

            <div className="mt-4 flex justify-center">
              <div
                className={[
                  "relative touch-none select-none overflow-hidden rounded-lg",
                  dragState ? "cursor-grabbing" : "cursor-grab",
                ].join(" ")}
                onPointerCancel={handlePointerEnd}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                style={{
                  width:
                    "min(420px, calc((100vh - 180px) * 0.5625), calc(100vw - 48px))",
                }}
              >
                <PromoBannerCardPreview form={form} source={source} />
                <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-cyan-300/90 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950" />
                <div
                  className="absolute inset-x-3 bottom-3 rounded-lg border border-white/20 bg-black/70 p-2 text-white shadow-lg backdrop-blur"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-lg font-bold transition hover:bg-white/20"
                      onClick={() => updateScale(scale - 0.1)}
                    >
                      -
                    </button>
                    <input
                      aria-label="Масштаб кадра"
                      className="min-w-0 flex-1 accent-cyan-300"
                      max="3"
                      min="1"
                      step="0.01"
                      type="range"
                      value={form.imageScale}
                      onChange={(event) =>
                        updateScale(Number(event.target.value))
                      }
                    />
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-lg font-bold transition hover:bg-white/20"
                      onClick={() => updateScale(scale + 0.1)}
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold transition hover:bg-white/10"
                      onClick={resetCrop}
                    >
                      Сбросить кадр
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-zinc-950 transition hover:bg-cyan-200"
                      onClick={() => applyCrop(true)}
                    >
                      Готово
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function PromoBannerCardPreview({
  form,
  source,
  onEdit,
}: {
  form: PromoBannerForm;
  source: string;
  onEdit?: () => void;
}) {
  const title = form.title.trim() || "Название баннера";
  const label = form.label.trim() || "Акция";
  const description = form.description.trim() || "Короткое описание баннера.";
  const tag = form.tag.trim() || statusLabels[form.status];
  const priority = Number(form.priority);
  const isFeatured = Number.isFinite(priority) && priority <= 0;
  const accent = isFeatured ? "208, 170, 108" : "131, 228, 236";
  const canTransformImage = Boolean(form.imageSource);
  const scale = clampPromoBannerScale(Number(form.imageScale) || 1);
  const offsetX = clampPromoBannerOffset(Number(form.imageOffsetX) || 0);
  const offsetY = clampPromoBannerOffset(Number(form.imageOffsetY) || 0);
  const titleStyle = promoBannerPreviewTitleStyle(title);
  const baseBackground = isFeatured
    ? "linear-gradient(180deg, rgba(208, 170, 108, 0.17), transparent 36%), rgba(7, 12, 16, 0.86)"
    : "linear-gradient(180deg, rgba(131, 228, 236, 0.11), transparent 34%), rgba(5, 11, 14, 0.82)";
  const textureBackground = source
    ? `linear-gradient(180deg, rgba(3, 7, 9, 0.08), rgba(3, 7, 9, 0.66)), linear-gradient(135deg, transparent 0 34%, rgba(${accent}, 0.12) 34% 35%, transparent 35% 100%)`
    : isFeatured
      ? "radial-gradient(circle at 70% 18%, rgba(208, 170, 108, 0.2), transparent 24%), linear-gradient(135deg, transparent 0 38%, rgba(208, 170, 108, 0.15) 38% 39%, transparent 39% 100%)"
      : "linear-gradient(135deg, transparent 0 34%, rgba(131, 228, 236, 0.12) 34% 35%, transparent 35% 100%), radial-gradient(circle at 72% 18%, rgba(131, 228, 236, 0.16), transparent 24%)";

  return (
    <div
      className="relative aspect-[9/16] overflow-hidden rounded-lg border border-[#c4e0e12e] text-[#f4fbfb] shadow-sm"
      style={{ background: baseBackground }}
    >
      {source ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
          src={source}
          style={
            canTransformImage
              ? {
                  transformOrigin: "center",
                  transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`,
                }
              : undefined
          }
        />
      ) : (
        <div className="absolute inset-0" />
      )}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: textureBackground }}
      />
      <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between p-[18px]">
        <span>
          <span className="block text-[9px] font-[820] uppercase tracking-[0.14em] text-[#7f9294]">
            {label}
          </span>
          <span
            className="mt-[18px] block font-[780] text-[#f4fbfb]"
            style={titleStyle}
          >
            {title}
          </span>
          <span className="mt-2.5 block text-xs leading-[1.45] text-[#a8b9ba]">
            {description}
          </span>
        </span>
        <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#c4e0e124] px-2.5 py-2 text-[9px] font-[860] uppercase tracking-[0.12em] text-[#83e4ec]">
          {tag}
        </span>
      </div>
      {onEdit ? (
        <button
          type="button"
          className="absolute right-2 top-2 z-20 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-950 shadow-sm transition hover:bg-cyan-100"
          onClick={onEdit}
        >
          Редактировать
        </button>
      ) : null}
    </div>
  );
}

export function promoBannerPreviewTitleStyle(title: string): CSSProperties {
  const size = promoBannerPreviewTitleSize(title);

  return {
    fontSize: `${size}px`,
    lineHeight: size <= 18 ? 1.08 : 1.05,
    overflowWrap: "anywhere",
  };
}

export function promoBannerPreviewTitleSize(title: string) {
  const letterCount = Array.from(title).filter((char) =>
    /[\p{L}\p{N}]/u.test(char),
  ).length;

  if (letterCount >= 30) {
    return 16;
  }

  if (letterCount >= 24) {
    return 17;
  }

  if (letterCount >= 20) {
    return 19;
  }

  if (letterCount >= 16) {
    return 21;
  }

  return 24;
}

export function formatPromoBannerNumber(value: number) {
  return String(Math.round(value * 100) / 100);
}

export function PromoBannerThumbnail({
  imageUrl,
  title,
}: {
  imageUrl: string | null;
  title: string;
}) {
  return (
    <div className="aspect-[9/16] w-[72px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={title}
          className="h-full w-full object-cover"
          src={imageUrl}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-[11px] font-bold text-zinc-400">
          9:16
        </div>
      )}
    </div>
  );
}

export function promoBannerUsageMeta(
  promoCard: GuestGamePromoCard,
  usage: PromoBannerUsageSummary,
  stores: Store[],
) {
  const scope = storeScopeLabel(promoCard.storeIds, stores);

  if (promoCard.status !== "ACTIVE") {
    return [scope, "не показывается: статус"];
  }

  if (!promoBannerIsInActivePeriod(promoCard)) {
    return [scope, "не показывается: вне периода"];
  }

  const info = usage.byCardId.get(promoCard.id);

  if (!info) {
    return [scope, "не показывается"];
  }

  const meta: string[] = [];

  if (info.visibleStoreNames.length) {
    meta.push(`показывается: ${compactStoreNames(info.visibleStoreNames)}`);
  }

  if (info.overflowStoreNames.length) {
    meta.push(`сверх лимита: ${compactStoreNames(info.overflowStoreNames)}`);
  }

  return meta.length ? meta : [scope, "не показывается"];
}

export function promoTargetLabel(targetAnchor: string | null) {
  return (
    promoTargetOptions.find((option) => option.value === (targetAnchor ?? ""))
      ?.label ?? "Главный экран"
  );
}
