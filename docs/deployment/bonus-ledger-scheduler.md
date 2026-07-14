# Bonus ledger scheduler для геймификации

> Актуальное дополнение от 14.07.2026: этот scheduler отвечает за доставку уже одобренных ledger-наград. Выполнение игровых правил и автоматическое создание наград Battle Pass/заданий выполняет отдельный `GuestGamificationPipelineSchedulerService`, описанный в `guest-gamification-live-rewards.md`.

Этот runbook включает API-side scheduler `GuestBonusLedgerSchedulerService`, который без админского клика вызывает защищенный контур `POST /guests/gamification/scheduled/bonus-ledger/dispatch`. Scheduler работает внутри `leetplus-api.service`, поэтому отдельный systemd unit не нужен.

## Что делает scheduler

- на каждом tick проходит по активным tenant или по заданному scope;
- при необходимости ставит `APPROVED` игровые награды в bonus ledger;
- claim-ит готовые ledger-записи и отправляет бонусы в Langame через `POST /master_api/guests/balance/phone`;
- пропускает пересекающиеся запуски и пишет только агрегаты: tenant, queued, confirmed, failed, blocked, skipped;
- не логирует raw phone, токены, `langameRequest`, `langameResponse` или полный Langame payload.

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

Для автоматического выполнения активных Battle Pass и заданий дополнительно используется API-side scheduler внутри `leetplus-api.service`:

```env
# Пустое значение: в production scheduler включается автоматически при заданном SYNC_SERVICE_TOKEN.
GUEST_GAME_PIPELINE_SCHEDULER_ENABLED=""
GUEST_GAME_PIPELINE_SCHEDULER_INTERVAL_MS="15000"
GUEST_GAME_PIPELINE_SCHEDULER_LIMIT="30"
GUEST_GAME_PIPELINE_SCHEDULER_TENANT_ID=""
GUEST_GAME_PIPELINE_SCHEDULER_TENANT_SLUG=""
```

- `GUEST_GAME_PIPELINE_SCHEDULER_ENABLED=true|false` явно переопределяет production default.
- Scheduler запускает `runSnapshotPipelineScheduled`, принимает только подготовленные факты и не допускает параллельных tick-ов.
- При обработке используются только активные правила. Черновик с совпадающими условиями не должен подавлять активное правило.
- Для scheduler и `APP_OPEN` включен `suppressLootBoxRewards`: лутбокс может стать доступным, но приз выбирается и выдается только после ручного открытия гостем.
- После создания одобренной автоматической награды `queueAndDispatchApprovedReward` передает ее в существующий ledger dispatcher. Безопасность доставки по-прежнему регулируют `LANGAME_BONUS_ACCRUAL_*` и этот runbook.

`LANGAME_BONUS_ACCRUAL_ENABLED=false` оставляет Langame write выключенным даже при запущенном scheduler. Для денежного баланса (`type=balance`) reward types включаются отдельно после тестов и согласования экономики.

## Безопасный запуск

1. Проверить в Guest Game Hub, что `Langame write API` видит активный tenant-источник Langame и что пилотный клуб 1337 имеет ровно одну готовую ledger-запись в runbook preflight.
2. Оставить `GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=true`, `LANGAME_BONUS_ACCRUAL_ENABLED=false`, `LIMIT=1`, `TENANT_SLUG` только для пилотной сети.
3. Перезапустить API:

```bash
sudo systemctl restart leetplus-api.service
sudo journalctl -u leetplus-api.service -n 100 --no-pager
```

4. В Guest Game Hub открыть `Готовность интеграций -> Автозапуск bonus ledger`. В runtime-деталях должны появиться последний запуск, результат и отсутствие overlap-skip ошибок.
5. Для canary включить `LANGAME_BONUS_ACCRUAL_ENABLED=true`, оставить `GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=true` и сначала выполнить ручной canary live dispatch из пилотного runbook Guest Game Hub. Это проверяет ровно одну запись и не дает scheduler случайно забрать лишний batch.
6. После успешной сверки canary поставить `GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=false`, оставить `LIMIT=1` на первый автоматический tick и снова проверить Guest Game Hub: confirmed ledger, `GuestBonusBalanceCurrent` и свежий `GuestBonusBalanceSnapshot`.
7. После production-наблюдения увеличить `LIMIT` и убрать tenant scope только если все подключенные клубы имеют согласованные правила, Langame-ключи и политику бонусов.

## Откат

- Мгновенно остановить автономную обработку: `GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED=false`, затем `sudo systemctl restart leetplus-api.service`.
- Оставить scheduler для наблюдения, но запретить запись: `GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=true`.
- Запретить сам Langame write, даже если scheduler включен: `LANGAME_BONUS_ACCRUAL_ENABLED=false`.
- Pending/failed/stale-processing ledger-записи отменять из Guest Game Hub через существующий cancel action; свежий `PROCESSING` lock backend не даст отменить до stale-window.

## Проверка после запуска

- Readiness `BONUS_LEDGER_SCHEDULER` должен стать `READY` только при `GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=false` и `LANGAME_BONUS_ACCRUAL_ENABLED=true`.
- Runtime-детали должны показывать агрегаты, а не персональные данные.
- Пилот 1337 считается готовым только после confirmed положительной `bonus_balance` операции и сверки `balanceAfter` с последующим Langame snapshot.
