# Точечное восстановление наград по support ticket

Этот runbook применяется только когда support-аудит доказал пропущенный кейс
на exact activity fact. Это не универсальная компенсация и не способ выдать
гостю желаемый приз вручную.

## Граница допуска

Control-plane endpoints доступны только platform admin с явно выбранным tenant
context:

- `POST /admin/guest-gamification/support-reward-recovery/preview`;
- `POST /admin/guest-gamification/support-reward-recovery/apply`.

Preview принимает номер открытого тикета и от одного до пяти уникальных пар
`factId + ruleKind + ruleId`. Он не пишет данные. Для каждой пары сервис заново
проверяет tenant, гостя, активный игровой профиль и клуб, границу активации,
exact/active source fact, завершённый hourly replay и единственность физической
сессии.

Допустимы только два результата:

- standalone `LOOT_BOX` по типизированному старту сессии;
- `MISSION` по exact play-time fact, если награда миссии — автоматический
  `LOOT_BOX_ENTITLEMENT` с нулевой суммой.

В обоих случаях правило должно быть единственным подходящим активным правилом
`LIVE_WITH_LEDGER_FALLBACK`, иметь `maxPendingRewards=1` и актуальную версию.
Для миссии дополнительно закрепляется активный reward-template lootbox.
`SEASON`/Battle Pass, прямой бонус, открытие кейса, выбор приза и Langame write
в этом контуре запрещены.

## Preview и apply

Preview возвращает canonical SHA-256 digest, точное число действий, allowlist
правил и ожидаемые эффекты. Перед apply оператор обязан независимо подтвердить:

- `availableLootBoxEntitlements` совпадает с доказанным числом кейсов;
- `directBonusAmount=0`;
- `battlePassRewards=0`;
- XP совпадает только с XP выбранной миссии.

Apply требует без изменений вернуть `expectedActionCount`, `expectedDigest`,
полный `allowedRuleIds` и строку
`confirmation=APPLY_SUPPORT_REWARD_RECOVERY`. Любой drift факта, правила,
reward-template, digest или allowlist останавливает выполнение.

Каждое действие сначала в одной `SERIALIZABLE` транзакции блокирует и повторно
проверяет открытый ticket, профиль, гостя, клуб, exact fact и версии правила,
после чего атомарно создаёт pristine canonical event с нулевыми эффектами,
exact operator receipt и audit record. Закрытие тикета или любой drift до этой
транзакции оставляют zero-write по event/receipt/audit и всем материальным
таблицам. Затем применяется ровно одно правило через exact reconciliation.
После применения обязательны один `AVAILABLE` case,
отсутствие bonus-ledger и обычных wallet items, отсутствие Battle Pass и только
настроенный XP. Немедленный повтор должен дать zero-diff.

Действия применяются последовательно. При сетевой ошибке или частичном ответе
нельзя расширять план или повторять его вслепую: сначала сверяется audit event,
canonical events, entitlements, rewards, XP postings и bonus ledger. Новый
preview выполняется только для доказанно оставшихся действий.

## Stop conditions

Apply не выполняется, если preview показывает лишнее правило, иной XP,
положительную денежную сумму, Battle Pass, больше ожидаемого числа кейсов,
старый факт до активации или уже существующий материальный эффект. Тикет можно
закрывать только после postcondition-запроса и проверки состояния в гостевом
портале; сам кейс остаётся неоткрытым, а возможный приз появляется только после
действия гостя по обычным правилам.
