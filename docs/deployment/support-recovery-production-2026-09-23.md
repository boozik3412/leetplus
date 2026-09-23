# Support recovery — production checkpoint 23.09.2026

Это описание фактически выполненной операции, а не разрешение на повторный запуск.
Полный append-only журнал и неизменяемые квитанции находятся в
`deploy-evidence/support-recovery-production-f97-20260923/`.

## Приложение и фоновые задания

- По отдельному подтверждению владельца применён exact plan
  `5ce71fa23dfb3b77a8792156508f69e0fd2e7f31866e3c508eb465ba5ad69ca5`,
  operation `0821a551-6acf-46ae-a7c2-f88fd5d42760`. Native controller завершил
  все фазы, включая authenticated postcheck. Активен GREEN
  `f97af35d1f0b54a67f915a37a095336e4f9334f9`, generation 10;
  BLUE `3c3dc4ac4d1a73fdf9a1a6da5427212adfa9af80` оставлен rollback.
  Data release `399876b560b4ac611eae35ee425d99422fb140b9`, CURRENT191 и
  serving controller `02acca249783cf47c0a24897203d51a206e1c5b2`
  не менялись.
- Свежий зашифрованный backup SHA-256
  `e7ac8516faa3455d7f0de5a74083565bd9fd3467a4829e502a74eb4fdaff2e01`
  скопирован за пределы сервера и проверен по размеру и хешу. Green API
  `/health` и `/version`, nginx active pointer и authenticated postcheck PASS.
- Только два исходных timer — `leetplus-compose-daily.timer` и
  `leetplus-compose-bonus.timer` — кратко останавливались на время rollout,
  без убийства действующего worker. Они снова active/enabled с подписанными
  grant для f97/gen10. Обычный bonus worker завершился PASS. Daily остаётся
  запланированным на 23:30 UTC; его обычный запуск после rollout ещё не
  наблюдался. Read-only inventory нашёл у tenant `demo` три активных источника:
  `1337.langame.ru`, `443.langame.ru`, `46.langamepro.ru`. В коде daily
  запускается для tenant `demo`, а Langame sync обходит все его настроенные
  источники, не один клуб. Фактическое прохождение всех трёх сетей будет
  доказано только квитанцией следующего штатного daily run.

## Точечное восстановление

Три эффекта выполнены по отдельным свежим production preview, одному
одноразовому apply на тикет и немедленному native reconcile. Повторять apply
нельзя. Перед применением живая база показывала ноль целевых цепочек.

| Тикет | Подтверждённый результат |
| --- | --- |
| LP-BUG-DA592E20 | Один canonical event, один processed receipt, один `AVAILABLE` Weekend entitlement и один `PENDING` case-wallet item. Никакого бонуса или XP. |
| LP-BUG-C61EE785 | Один processed budget-refill exception receipt, один `AVAILABLE` Weekend entitlement и один `PENDING` case-wallet item. Никакого бонуса или XP. |
| LP-BUG-FE6BB642 | Отдельной выдачи нет: два проверенных исходных факта, ноль FE exception receipts, entitlements, wallets, intents и rewards после C61. |
| LP-BUG-571075E9 | Один step-3 intent, один `APPROVED` reward `BONUS_BALANCE` на 150.00 и один `PENDING` reward-wallet item; XP 0, bonus-ledger 0. |

Детальный read-only postcondition подтвердил, что у обоих кейсов
`LOOT_BOX/AVAILABLE`, `LOOT_BOX_ENTITLEMENT/PENDING`, пустой reward ID и
нулевой claim XP. Награда LP571 имеет `claimRequired=true`, `paidAt=null`:
150 бонусов **ещё не выплачены в баланс Langame**. Гость должен применить
обычное действие «Получить»; затем штатный bonus worker сможет провести
выплату. Ручного claim, вызова провайдера или повторного worker запуска
оператор не делал.

Изолированный support CLI получил только минимальный профиль БД и точно
закреплённый публичный PEM, работал в Docker-internal data network без
маршрута наружу. Этот однократный CLI-эффект не добавил C61 public key в
обычный API runtime и сам по себе не включает штатный admin endpoint для
последующих исключений.

Все четыре тикета пока `NEW`: backend-постусловие доказано, но естественный
вход гостя, видимость/открытие кейсов и получение 150 бонусов гостем ещё
не проверены. Не объявлять тикеты закрытыми или бонус выплаченным без этих
отдельных квитанций.
