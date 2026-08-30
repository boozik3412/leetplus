# Автономный bonus-ledger worker для геймификации

## Текущий production-контракт (30.08.2026)

- Входящее пополнение для условий заданий обрабатывается отдельным tenant-scoped `LEDGER_SUPPLEMENTAL` только как `BALANCE_TOPUP`; наличие игровой сессии не требуется.
- Автономный reward materializer включён для tenant `demo` и последовательно обрабатывает immutable intent, затем effect. Он не выполняет внешний Langame write.
- Bonus-ledger scheduler и Langame write gate разрешают все поддерживаемые балансные награды: `BONUS`, `BONUS_POINTS`, `BONUS_BALANCE`, `LOYALTY_BONUS` отправляются как `bonus_balance`; `BALANCE`, `MONEY_BALANCE`, `CASH_BALANCE`, `DEPOSIT`, `WALLET_BALANCE`, `LANGAME_BALANCE` — как `balance`.
- `BALANCE_WRITE_OFF` и `BONUS_TOPUP` могут присутствовать в activity ledger для диагностики, но не являются доступными типами условия mission v2. Их нельзя добавлять в supplemental allow-list до появления отдельного versioned evaluator-контракта.
- Все контуры остаются tenant-scoped, используют claim/idempotency, а неоднозначный внешний POST переводится в `RECONCILIATION_REQUIRED` без автоматического повтора.
- Модалка задания и `/game/rewards` являются двумя UI-входами к одному exact wallet claim. Один wallet item не может поставить две ledger-записи; повторный claim возвращает уже достигнутый результат. Отдельная защита прогресса запрещает старому completed fact создать новый reward cycle после последующего snapshot.

> Актуальный контракт от 30.07.2026: этот scheduler доставляет legacy non-claim rewards и обычные claim-required rewards только после своевременного явного claim гостя. `GuestGamificationPipelineSchedulerService` автоматически фиксирует квалификацию Battle Pass/заданий/check-in/event, но не начисляет бонус и не обходит 30-дневный кошелёк. Completion ACK не является claim; завершённые и ожидающие результаты остаются доступны через reward wallet/history.

Production не запускает `GuestBonusLedgerSchedulerService` внутри blue/green API:
оба API slot остаются активны одновременно, поэтому встроенный scheduler создавал
бы два независимых владельца очереди. Доставка выполняется отдельным
`leetplus-bonus-ledger-worker.timer`. Один oneshot worker каждые 30 секунд
разрешает фактически активный nginx slot, проверяет его immutable release SHA и
запускает CLI именно из этого release. systemd не допускает overlap одного
oneshot unit, а database claim/idempotency остаются второй exactly-once границей.

Worker использует отдельный минимальный secret set из
`/etc/leetplus/bonus-ledger-worker.env`; он не загружает широкий API runtime
profile, не регистрирует HTTP controllers и не входит в public guest process.
Смена blue/green slot не требует второго worker: следующий tick автоматически
возьмёт новый active release.

Bonus ledger не оценивает условия миссии, Battle Pass, лутбокса или чекина. LIVE, последовательный Ledger fallback и supplemental-контур сходятся до него в единые immutable event/intent/effect/wallet записи; дальше действует один claim gate и один контур доставки.

## Что делает scheduler

- на каждом tick проходит по активным tenant или по заданному scope;
- tenant-wide tick выбирает записи разных клубов без единого aggregate
  `storeId`, но не расширяет runtime identity: перед каждым Langame write
  worker повторно требует exact `TENANT_STORE_SYSTEM` для `entry.storeId`;
  запись без клуба возвращается в безопасное blocked/pending состояние;
- corporate/manual dispatch без exact `storeId` остаётся fail-closed и не
  использует tenant-wide worker bypass;
- ставит в bonus ledger только разрешённые reward: legacy `claimRequired=false` либо claim-required reward с зафиксированным `deliveryRequestedAt < claimExpiresAt`;
- для claim-required reward требует связанный wallet item `PROCESSING` или безопасно повторяемый `FAILED`; один статус `APPROVED` больше не разрешает доставку;
- claim-ит готовые ledger-записи и отправляет бонусы в Langame через `POST /master_api/guests/balance/phone`;
- пропускает пересекающиеся запуски и пишет только агрегаты: tenant, queued, confirmed, failed, blocked, skipped;
- после явного guest claim получает немедленный wake-up; несколько одновременных claim объединяются в один дополнительный безопасный запуск, а interval остаётся резервным контуром;
- не логирует raw phone, токены, `langameRequest`, `langameResponse` или полный Langame payload.

До гостевого claim effect имеет состояние `WAITING_CLAIM`, reward не попадает в dispatcher, а код/claim payload не раскрывается. После принятия claim история показывает `DELIVERY_PROCESSING`. Закрытие completion-модалки — read-only ACK и не меняет эту границу.

## Env на VDS

Минимальные переменные:

```env
DATABASE_URL="<runtime database url>"
APP_ENCRYPTION_KEY="<runtime application key>"
INTEGRATION_ENCRYPTION_KEY="<runtime integration key>"
LANGAME_BONUS_ACCRUAL_ENABLED="true"
LANGAME_BONUS_ACCRUAL_PATH="/master_api/guests/balance/phone"
LANGAME_BONUS_ACCRUAL_REWARD_TYPES="BONUS,BONUS_POINTS,BONUS_BALANCE,LOYALTY_BONUS"

GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED="false"
GUEST_BONUS_LEDGER_WORKER_ENABLED="true"
GUEST_BONUS_LEDGER_WORKER_TENANT_SLUG="<tenant-slug>"
GUEST_BONUS_LEDGER_WORKER_DRY_RUN="true"
GUEST_BONUS_LEDGER_WORKER_CANARY="true"
GUEST_BONUS_LEDGER_WORKER_LIMIT="1"
GUEST_BONUS_LEDGER_WORKER_QUEUE_APPROVED_REWARDS="true"
GUEST_BONUS_LEDGER_WORKER_REWARD_TYPES="BONUS,BONUS_POINTS,BONUS_BALANCE,LOYALTY_BONUS"
# Только для контролируемой canary одной существующей записи:
# GUEST_BONUS_LEDGER_WORKER_REWARD_ID="<uuid>"
```

Одновременно задаётся ровно один `TENANT_ID` или `TENANT_SLUG`. Live tick
fail-closed требует `WORKER_ENABLED=true`, `DRY_RUN=false` и
`LANGAME_BONUS_ACCRUAL_ENABLED=true`. `CANARY=true` всегда принудительно
ограничивает batch одной записью; exact `REWARD_ID` запрещён вне canary.

## Связь с игровым pipeline

Для автоматической квалификации активных Battle Pass и заданий дополнительно используется API-side scheduler внутри `leetplus-api.service`:

```env
# Пустое значение: в production scheduler включается автоматически при заданном SYNC_SERVICE_TOKEN.
GUEST_GAME_PIPELINE_SCHEDULER_ENABLED=""
GUEST_GAME_PIPELINE_SCHEDULER_INTERVAL_MS="15000"
GUEST_GAME_PIPELINE_SCHEDULER_LIMIT="30"
GUEST_GAME_PIPELINE_SCHEDULER_TENANT_ID=""
GUEST_GAME_PIPELINE_SCHEDULER_TENANT_SLUG=""
```

- `GUEST_GAME_PIPELINE_SCHEDULER_ENABLED=true|false` явно переопределяет production default.
- `GUEST_BONUS_LEDGER_WORKER_QUEUE_APPROVED_REWARDS=true` не отменяет claim gate: один `APPROVED` недостаточен для reward с `claimRequired=true`.
- Scheduler запускает `runSnapshotPipelineScheduled`, принимает только подготовленные факты и не допускает параллельных tick-ов.
- При обработке используются только активные правила. Черновик с совпадающими условиями не должен подавлять активное правило.
- Профиль допускается к прогрессу только после первого trusted `APP_OPEN`, сохранённого в `GuestGameProfile.gameActivatedAt`. Исторические факты до этой границы не создают wallet item.
- Ordinary reward и event XP квалифицируются в разные 30-дневные item. XP не применяется, reward не dispatch-ится, пока гость явно не выполнит claim соответствующего item.
- Для scheduler и `APP_OPEN` включен `suppressLootBoxRewards`: лутбокс может стать доступным, но приз выбирается и выдается только после ручного открытия гостем.
- `claim-all` освобождает только обычные `PENDING/FAILED` item. Он не открывает lootbox entitlement и не переводит его из `AVAILABLE/OPENING`.
- После своевременного claim `queueAndDispatchApprovedReward` может передать ordinary reward в существующий ledger dispatcher. Принятый до deadline `PROCESSING/FAILED` item переживает 30-дневную границу; непринятый `PENDING` на границе истекает и больше не доставляется.
- Исторические уже подтверждённые/доставленные rewards и применённый XP не backfill-ятся как pending.

`LANGAME_BONUS_ACCRUAL_ENABLED=false` оставляет Langame write выключенным даже при запущенном scheduler. Для денежного баланса (`type=balance`) reward types включаются отдельно после тестов и согласования экономики.

## Ошибки и exactly-once граница

- Перед внешним write worker повторно проверяет reward, своевременный claim, wallet item и ledger. Административная отмена или семантическое изменение claim-required reward блокируется, пока wallet находится в `PROCESSING/FAILED`.
- Ошибка, доказанно возникшая до отправки внешнего запроса, может перейти в `FAILED` и безопасно повториться по существующей идемпотентности.
- Если внешний запрос уже был отправлен, но ответ потерян, истёк timeout или результат `5xx` неоднозначен, нельзя утверждать, что баланс не изменился. Ledger переводится в `RECONCILIATION_REQUIRED` без `nextAttemptAt`, wallet остаётся `PROCESSING`, а scheduler и guest retry не выполняют второй POST.
- Оператор сначала сверяет канонический результат с последующим Langame snapshot/журналом. Только подтверждённая процедура reconciliation может завершить delivery или создать явную компенсацию; обычный retry в этой ветке запрещён.

## Безопасный запуск

1. Проверить в Guest Game Hub, что `Langame write API` видит активный tenant-источник Langame и что пилотный scope имеет ровно одну готовую ledger-запись в runbook preflight. Для claim-required reward дополнительно проверить своевременный `deliveryRequestedAt` и wallet `PROCESSING/FAILED`.
2. Создать `/etc/leetplus/bonus-ledger-worker.env` как
   `root:leetplus-api-runtime 0640`, оставить `DRY_RUN=true`, `CANARY=true`,
   `LIMIT=1`, exact tenant и exact `REWARD_ID` одной non-staff записи.
3. Проверить unit и выполнить dry-run без включения timer:

```bash
sudo systemd-analyze verify /etc/systemd/system/leetplus-bonus-ledger-worker.service /etc/systemd/system/leetplus-bonus-ledger-worker.timer
sudo systemctl start leetplus-bonus-ledger-worker.service
sudo journalctl -u leetplus-bonus-ledger-worker.service -n 100 --no-pager
```

4. Для live canary поставить `DRY_RUN=false`, сохранив `CANARY=true`, `LIMIT=1`
   и exact `REWARD_ID`; запустить service один раз. Проверить одну
   `CONFIRMED` ledger-запись, reward `PAID`, wallet `CLAIMED`, balance before/
   after и последующий Langame snapshot.
5. Удалить `REWARD_ID`, поставить `CANARY=false`, задать bounded `LIMIT=50`,
   ещё раз вручную запустить service и проверить агрегаты. Staff/test profile
   при выключенном staff override должен перейти в безопасную отмену без
   внешнего Langame write.
6. Только после успешной сверки включить автономный контур:

```bash
sudo systemctl enable --now leetplus-bonus-ledger-worker.timer
systemctl list-timers leetplus-bonus-ledger-worker.timer --no-pager
```

7. После blue/green cutover проверить, что runner разрешает новый active SHA,
   timer остаётся единственным владельцем и claimed pending backlog дренируется
   без `FAILED`/`RECONCILIATION_REQUIRED`.

Для рабочего production-контура timer фиксирован на 30 секунд, а рекомендуемый
`LIMIT=50`. Tick подхватывает запись после рестарта; безопасные pre-dispatch
ошибки используют существующие bounded retries. Неоднозначный provider result
по-прежнему останавливается в `RECONCILIATION_REQUIRED` и никогда не
повторяется автоматически.

## Откат

- Мгновенно остановить автономную обработку: `sudo systemctl disable --now leetplus-bonus-ledger-worker.timer`.
- Оставить worker для наблюдения, но запретить запись: `GUEST_BONUS_LEDGER_WORKER_DRY_RUN=true`; затем запускать oneshot вручную.
- Запретить сам Langame write, даже если scheduler включен: `LANGAME_BONUS_ACCRUAL_ENABLED=false`.
- До принятого claim `WAITING_CLAIM` можно безопасно закрыть истечением wallet item. После принятия claim нельзя вручную отменять или менять связанный reward, пока `PROCESSING/FAILED` не завершён подтверждённо. `RECONCILIATION_REQUIRED` не возвращать в обычный retry.

## Проверка после запуска

- `leetplus-bonus-ledger-worker.timer` должен быть `active (waiting)`, последний
  `leetplus-bonus-ledger-worker.service` — завершаться успешно, а journal —
  содержать только агрегаты без телефонов, токенов и provider payload.
- В обоих blue/green API встроенный bonus-ledger scheduler остаётся выключен.
- Canary считается готовым только после confirmed положительной `bonus_balance` операции, wallet `CLAIMED` и сверки `balanceAfter` с последующим Langame snapshot.
- Fault-injection `внешний write применился, ответ потерян` должен доказать: состояние `RECONCILIATION_REQUIRED`, отсутствие `nextAttemptAt` и отсутствие второго POST на следующем scheduler tick.
