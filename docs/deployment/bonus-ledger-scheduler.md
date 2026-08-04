# Bonus ledger scheduler для геймификации

> Актуальный контракт от 30.07.2026: этот scheduler доставляет legacy non-claim rewards и обычные claim-required rewards только после своевременного явного claim гостя. `GuestGamificationPipelineSchedulerService` автоматически фиксирует квалификацию Battle Pass/заданий/check-in/event, но не начисляет бонус и не обходит 30-дневный кошелёк. Completion ACK не является claim; завершённые и ожидающие результаты остаются доступны через reward wallet/history.

Этот runbook включает API-side scheduler `GuestBonusLedgerSchedulerService`, который без админского клика вызывает защищенный контур `POST /guests/gamification/scheduled/bonus-ledger/dispatch`. Scheduler работает внутри `leetplus-api.service`, поэтому отдельный systemd unit не нужен.

Bonus ledger не оценивает условия миссии, Battle Pass, лутбокса или чекина. LIVE, последовательный Ledger fallback и supplemental-контур сходятся до него в единые immutable event/intent/effect/wallet записи; дальше действует один claim gate и один контур доставки.

## Что делает scheduler

- на каждом tick проходит по активным tenant или по заданному scope;
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
SYNC_SERVICE_TOKEN="<service-token>"
LANGAME_BONUS_ACCRUAL_ENABLED="false"
LANGAME_BONUS_ACCRUAL_PATH="/master_api/guests/balance/phone"
LANGAME_BONUS_ACCRUAL_REWARD_TYPES="BONUS,BONUS_POINTS,BONUS_BALANCE,LOYALTY_BONUS"

GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED="true"
GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN="true"
GUEST_GAME_BONUS_LEDGER_SCHEDULER_INTERVAL_MS="300000"
GUEST_GAME_BONUS_LEDGER_SCHEDULER_LIMIT="1"
GUEST_GAME_BONUS_LEDGER_SCHEDULER_QUEUE_APPROVED_REWARDS="true"
GUEST_GAME_BONUS_LEDGER_SCHEDULER_TENANT_SLUG="<tenant-slug>"
GUEST_GAME_BONUS_LEDGER_SCHEDULER_REWARD_TYPES="BONUS,BONUS_POINTS,BONUS_BALANCE,LOYALTY_BONUS"
```

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
- `GUEST_GAME_BONUS_LEDGER_SCHEDULER_QUEUE_APPROVED_REWARDS=true` не отменяет claim gate: один `APPROVED` недостаточен для reward с `claimRequired=true`.
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
2. Оставить `GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=true`, `LANGAME_BONUS_ACCRUAL_ENABLED=false`, `LIMIT=1`, `TENANT_SLUG` только для пилотной сети.
3. Перезапустить API:

```bash
sudo systemctl restart leetplus-api.service
sudo journalctl -u leetplus-api.service -n 100 --no-pager
```

4. В Guest Game Hub открыть `Готовность интеграций -> Автозапуск bonus ledger`. В runtime-деталях должны появиться последний запуск, результат и отсутствие overlap-skip ошибок.
5. Для canary включить `LANGAME_BONUS_ACCRUAL_ENABLED=true`, оставить `GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=true` и сначала выполнить ручной canary live dispatch из пилотного runbook Guest Game Hub. Ручной путь обязан пройти тот же claim gate; он не может отправить `WAITING_CLAIM`. Это проверяет ровно одну запись и не даёт scheduler случайно забрать лишний batch.
6. После успешной сверки canary поставить `GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=false`, оставить `LIMIT=1` на первый tick и снова проверить Guest Game Hub: confirmed ledger, wallet `CLAIMED`, `GuestBonusBalanceCurrent` и свежий `GuestBonusBalanceSnapshot`.
7. После production-наблюдения увеличить `LIMIT` и убрать tenant scope только если все подключенные клубы имеют согласованные правила, Langame-ключи и политику бонусов.

Для рабочего production-контура после canary рекомендуется `INTERVAL_MS=30000` и `LIMIT=50`: явный claim всё равно будит worker сразу, а 30-секундный tick подхватывает запись после рестарта или кратковременного overlap.

## Откат

- Мгновенно остановить автономную обработку: `GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED=false`, затем `sudo systemctl restart leetplus-api.service`.
- Оставить scheduler для наблюдения, но запретить запись: `GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=true`.
- Запретить сам Langame write, даже если scheduler включен: `LANGAME_BONUS_ACCRUAL_ENABLED=false`.
- До принятого claim `WAITING_CLAIM` можно безопасно закрыть истечением wallet item. После принятия claim нельзя вручную отменять или менять связанный reward, пока `PROCESSING/FAILED` не завершён подтверждённо. `RECONCILIATION_REQUIRED` не возвращать в обычный retry.

## Проверка после запуска

- Readiness `BONUS_LEDGER_SCHEDULER` должен стать `READY` только при `GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=false` и `LANGAME_BONUS_ACCRUAL_ENABLED=true`.
- Runtime-детали должны показывать агрегаты, а не персональные данные.
- Canary считается готовым только после confirmed положительной `bonus_balance` операции, wallet `CLAIMED` и сверки `balanceAfter` с последующим Langame snapshot.
- Fault-injection `внешний write применился, ответ потерян` должен доказать: состояние `RECONCILIATION_REQUIRED`, отсутствие `nextAttemptAt` и отсутствие второго POST на следующем scheduler tick.
