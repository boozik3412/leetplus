# Гости, CRM и игровая проекция

Дата контракта: 30.09.2026. Читать перед изменением дашборда гостей
(`/guests`), карточки гостя (`/guests/[id]`), CRM-сигналов и связки модуля
гостей с игровым модулем.

## 1. Где что живёт

| Слой | Место | Роль |
| --- | --- | --- |
| Чистые расчёты | `apps/api/src/guests/guest-insights.ts` | KPI, сравнение периодов, RFM/churn-распределение, сигналы, рекомендованное действие, поведение, очередь CRM. Без Prisma, покрыто `guest-insights.spec.ts`. |
| Игровая проекция | `apps/api/src/guests/guest-game-insights.service.ts` | Read-only чтение `GuestGameProfile` и связанных таблиц по `Guest.id`. Только Prisma; не импортирует игровой модуль. |
| Сборка ответа | `apps/api/src/guests/guests.service.ts` (`getSummary`, `getGuests`, `getGuest`) | Строки гостей получают `gameProfile` и `recommendedAction`; summary получает `comparison`, `kpi`, `health`, `crmQueue`, `gamification`, `attention`, `actions`; detail — `crmTasks`, `contactEvents`, `behavior`, `gamification`. |
| Web-типы и подписи | `apps/web/src/lib/guests.ts`, `apps/web/src/lib/guest-insights.ts` | Зеркало API-типов, русские подписи, тона бейджей, ссылки. Тест: `pnpm --filter web test:guest-insights`. |
| Экраны | `apps/web/src/app/(app)/guests/page.tsx`, `apps/web/src/app/(app)/guests/[id]/page.tsx`, `apps/web/src/components/guest-*.tsx` | Дашборд и карточка «гость 360». |

Маршруты API не менялись: `GET /guests/summary`, `GET /guests`,
`GET /guests/:id`, `GET /guests/export` только расширили ответ. Новые
query-параметры списка: `gameStatus`, `churnRisk`, `rfm`, `consent`, `signal`;
новые сортировки: `level`, `pendingRewards`, `gameActivity`. Сохранённые
фильтры и группы (`GuestAudience`) принимают те же ключи.

## 2. Связка гость ↔ игровой модуль

- Ключ связи: `GuestGameProfile.guestId` (`@@unique([tenantId, guestId])`).
  Профили без `guestId` (телефон не сопоставлен с базой Langame) в строки
  гостей не попадают, но считаются в `gamification.profiles.unlinked`.
- Право доступа: игровые поля отдаются, если пользователь — platform admin,
  OWNER или имеет `view_guest_gamification` (`GuestsService.canViewGameInsights`).
  Иначе `gameProfile = null`, `gamification = { available: false, reason: 'NO_CAPABILITY' }`,
  `gameAccess = 'NO_CAPABILITY'`, а фильтры/сигналы, зависящие от игры,
  возвращают пустой результат. Маршруты остаются под `view_guests`, поэтому
  манифест `pilot-http-surface-manifest.ts` не менялся.
- ПДн: проекция не читает `phoneEncrypted`, `telegramIdentity`, `maxIdentity`
  как значения — только булевы флаги каналов и статус согласия.
- Доверенные источники игровой активности те же, что в статистике игры:
  `LANGAME`, `API_IMPORT`, `SYSTEM`, `CHECK_IN`; события до `gameActivatedAt`
  не учитываются; профили `isStaffTest` исключаются из воронки и эффекта.

### Поля `gameProfile` (строка гостя)

| Поле | Определение |
| --- | --- |
| `level`, `xp`, `xpToNextLevel` | Уровень и XP профиля; шаг уровня 500 XP (`levelFromXp`). |
| `engagement` | `ACTIVE` — доверенное событие за последние 14 дней периода; `IDLE` — активирован, но событий 14+ дней; `NOT_ACTIVATED` — нет trusted `APP_OPEN`; `PROFILE_INACTIVE` — статус профиля не `ACTIVE`. |
| `pendingRewards`, `rewardsExpiringSoon`, `nearestRewardExpiresAt` | Wallet-item со статусом `PENDING`/`FAILED` и неистёкшим сроком; «сгорает» — срок в ближайшие 7 дней. |
| `rewardsQualifiedInPeriod`, `rewardsPaidInPeriod`, `rewardsPaidTotal` | `GuestGameReward` по `qualifiedAt` (без `CANCELED`) и `PAID` по `paidAt`. |
| `bonusConfirmedInPeriod`, `bonusConfirmedTotal`, `bonusPendingAmount` | Bonus ledger `EARN` · `GAMIFICATION`; подтверждённые по `confirmedAt`, pending = `PENDING`/`PROCESSING`/`RECONCILIATION_REQUIRED`. |
| `gameEventsInPeriod`, `lastGameActivityAt` | Доверенные события профиля. |

### Блок «Игровой модуль в клиентской базе» (summary.gamification)

- Воронка: гости выборки → в игре (без staff-test) → активировали →
  играли в периоде → получили награду → бонусы подтверждены в Langame.
- Эффект: сравнение активных в периоде гостей с профилем и без него
  (повторные, дни визитов, сессии, деньги, бар, доля риска). Это корреляция:
  контрольной группы и attribution window нет, и UI это пишет явно.
- `topPlayers` — шесть строк по уровню/XP.

## 3. Сигналы дашборда

Предикаты общие для дашборда и списка: `matchesGuestSignal` в
`guest-insights.ts`; фильтр `signal=<ключ>` открывает ровно тех же гостей,
а «Создать задачу» снимает группу `POST /guests/audiences` с теми же фильтрами
и вешает на неё задачу `POST /guests/audiences/:id/tasks`.

| Сигнал | Условие | Куда ведёт | Действие |
| --- | --- | --- | --- |
| `VIP_AT_RISK` | RFM CHAMPION/LOYAL или CRM VIP, риск оттока HIGH/MEDIUM, не DO_NOT_CONTACT | список `signal=VIP_AT_RISK` | задача «вернуть VIP» |
| `NEW_WITHOUT_SECOND_VISIT` | сегмент `new`, ≤1 дня активности, регистрация ≥7 дней назад | список | задача «второй визит» |
| `BONUS_WITHOUT_ACTIVITY` | `bonusLoad.status = RISK` | список, сорт. по бонусам | задача «напомнить о бонусах» |
| `REWARDS_WAITING_CLAIM` | `gameProfile.pendingRewards > 0` | список | задача «напомнить о награде» |
| `REWARDS_EXPIRING` | `gameProfile.rewardsExpiringSoon > 0` | список | открыть список |
| `PLAYERS_GONE_IDLE` | engagement `IDLE` и сегмент active/repeat/new | список | Guest Game Hub, задания |
| `ACTIVE_NOT_REGISTERED` | сегмент `repeat`, профиля нет | список | задача «пригласить в игру» |
| `CONSENT_MISSING_VALUABLE` | VIP по RFM/CRM и согласие `UNKNOWN` | список | задача «получить согласие» |
| `CRM_FOLLOWUPS_DUE` | `nextContactAt` ≤ сегодня, не DO_NOT_CONTACT | список | открыть список |
| `CRM_TASKS_OVERDUE` | активные задачи с `dueAt` в прошлом (tenant) | `/guests/crm/tasks` | открыть задачи |
| `UNLINKED_GAME_PROFILES` | профили без `guestId`, не staff-test | `/gamification/log` | проверить привязки |

Порядок «Что сделать сегодня»: просроченные задачи → плановые контакты →
сигналы по тону (CRITICAL → WARNING → OPPORTUNITY → INFO). Пороги (14 дней,
7 дней, 30 дней) — те же, что уже используют сегменты, retention и кошелёк;
новых коэффициентов нет.

## 4. KPI и сравнение периодов

| Показатель | Формула |
| --- | --- |
| Выручка гостей | пополнения (`Σ|amount|`) + покупки бара за период |
| ARPU | выручка / активные гости (active + repeat + new) |
| Средний чек | выручка / (пополнения + продажи бара) |
| Частота визитов | Σ дней с визитами активных гостей / активные гости |
| Доля покупателей бара | активные гости с `barRevenue > 0` / активные гости |
| Вернувшиеся | есть активность в периоде и предыдущая активность ≥30 дней раньше (или первая выручка ≥30 дней до начала периода при отсутствии активности в 60-дневном окне) |
| Деньги под риском / потеряно | Σ `churnRisk.valueAtRisk` по HIGH+MEDIUM / по LOST |
| Сравнение | предыдущий период той же длины, `buildGuestMetrics(..., { lite: true })` (без LTV и бонусных снимков); сегменты внутри закрытого периода считаются с обрезкой активности по его концу |

Ограничение сохранено: `getSummary`/`getGuests` жёстко держат окно в 3 месяца
до `dateTo` (коммит 20f23c79), поэтому сравнение — это предыдущие 3 месяца.

## 5. Рекомендуемое действие (строка и карточка)

Порядок правил `recommendGuestAction`: ручной `nextAction` → `DO_NOT_CONTACT` →
риск HIGH или сегмент risk → lost → new без второго дня → есть награды к
получению → repeat/active без профиля → RFM CHAMPION/LOYAL → quiet → наблюдать.

## 6. Карточка гостя

`GET /guests/:id` дополнительно отдаёт: `crmTasks` (20, активные первыми),
`contactEvents` (20), `behavior` (любимый клуб/день/час по стартам сессий за
90 дней, UTC), `gamification` (профиль, кошелёк, награды, ledger, события,
итоги) и `gameAccess`. Быстрые действия в карточке используют существующие
`POST /guests/crm/tasks` и `POST /guests/crm/contact-events`
(`manage_communications`, NETWORK scope).

## 7. Известные ограничения и следующие шаги

- Heatmap, поведение и сегменты считаются в UTC; клубные часовые пояса не
  применяются.
- Группы (`GuestAudience`) остаются снимком на момент создания.
- Денежные балансы гостей (`GuestBalanceSnapshot`) в дашборд не входят.
- Retention по клубам, cohort-retention по месяцам и ROI бонусов не считаются.
- Эффект игры — сравнение когорт без контрольной группы; причинность не
  заявляется.

## 8. Проверка

```bash
pnpm --filter api exec jest --runInBand --runTestsByPath src/guests/guest-insights.spec.ts src/guests/guest-game-insights.service.spec.ts src/guests/guests.service.spec.ts src/tenancy/pilot-crm-communications-boundary.spec.ts src/runtime/runtime-boundary.spec.ts
pnpm --filter api exec tsc --noEmit -p tsconfig.build.json
pnpm --filter web test:guest-insights
pnpm --filter web typecheck
```
