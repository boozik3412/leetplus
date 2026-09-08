# Guest auth: инциденты canonical profile owner

Статус: **production repair deployed; поддержка выполняется без reward replay**

Актуально на: **08.09.2026**

Production baseline: exact
`def5174f16f49212dd21d243cda89dffeff7837f`, schema `CURRENT_190/190`, bridge
`OFF`. Документ применяется к ошибке игрового модуля после успешного
подтверждения телефона и выбора клуба, когда клиент показывает «Не удалось
открыть игру», а API fail-closed возвращает owner collision.

## Что исправлено

Есть два подтверждённых варианта одного класса проблемы:

1. Stale `profileId` или прямой `guestId` указывал на пустой legacy-профиль,
   хотя история, награды и entitlement принадлежали единственному canonical
   профилю с exact Langame identity link. Пример поддержки: `*6330`.
2. После успешного Callcheck registration искал существующий профиль только по
   одному literal phone hash. Эквивалентная RU-запись номера могла создать
   новый phone-only профиль, а выбор клуба возвращал старого Langame guest.
   Пример поддержки: `*3669`.

В production ровно один `ACTIVE` Langame guest owner в выбранном domain теперь
переиспользуется до создания профиля. Phone lookup использует варианты
`7/8/local 10 digits` только из уже подтверждённого зашифрованного телефона и
только внутри выбранного `externalDomain`. Два или больше кандидата дают `409`
до mutation, JWT, event или reward effect. Профиль `SUPERSEDED` не
реактивируется.

## Ответ пользователю

- Не предлагать регистрировать новый аккаунт.
- Не начислять компенсацию, XP, кейс, миссию или боевой пропуск вручную.
- Попросить заново открыть авторизацию и подтвердить телефон, если ошибка
  осталась в старой вкладке. Новый вход разрешит canonical owner; старый JWT
  может хранить `profileId`, выпущенный до repair.
- Если новый вход снова даёт ошибку, зафиксировать время, выбранный клуб и
  masked suffix телефона и передать на read-only диагностику. Полный телефон,
  OTP, токены и provider secrets в тикет или логи не копировать.

## Read-only диагностика

Masked suffix используется только как locator. Он не является доказательством
identity и не должен участвовать в mutation.

1. Найти все profile candidates по canonical server-side phone identity и
   проверить их `tenant`, `externalDomain`, status и identity links.
2. Определить единственный canonical `ACTIVE` owner истории. Если active owners
   больше одного или domain/tenant не совпадает, остановиться: автоматический
   repair запрещён.
3. Для предполагаемого дубля доказать отсутствие материальных effects:
   rewards, XP, entitlements, completion notifications, lootbox rewards,
   mission rewards, season/battle-pass rewards, wallet items, reward intents,
   deliveries и bonus-ledger entries должны быть нулевыми.
4. Отдельно сверить raw records, imported facts, OTP/challenge, sync jobs и
   исторические events. Их наличие не разрешает перенос или replay.
5. Сопоставить `SESSION_START` и zero-effect decisions с физическими facts.
   Несовпадение, ненулевой effect или новая активность после preview полностью
   блокируют repair.

## Допустимая граница repair

Repair выполняется только по отдельному exact preview, production GO, свежему
backup/restored-copy acceptance и неизменному digest. Допустимо:

- переназначить canonical профилю доказанный технический `SESSION_START` и
  только связанные zero-effect decisions, если preconditions это прямо
  разрешают;
- закрепить future-sync cursor ownership за canonical профилем;
- перевести доказанный пустой duplicate profile и его conflict-link в
  `SUPERSEDED`;
- записать отдельный audit с ticket/plan identity.

Запрещено переносить или повторно оценивать facts/raw, OTP, sync jobs,
исторические игровые достижения либо создавать XP, rewards, completion
notifications, lootbox/mission/season/battle-pass effects, wallet items,
intents, deliveries или bonus-ledger entries. Любой drift останавливает repair
до effect.

## Production evidence 08.09.2026

- PR #170; exact-main Fast CI `34226209000`, Full Release Admission
  `34226209023`, оба `SUCCESS`;
- rollout operation `9687947d-722c-45e9-8a72-999e433434ab`, terminal receipt
  SHA-256
  `4d2f6c32ed57736a01f7f389467313bba0e410ba444aee5d1629c33c284f540d`;
- fresh backup, off-host checksum и restored-copy acceptance завершены до
  cutover;
- `*6330` закрыт audit `SUPPORT_CANONICAL_PROFILE_OWNER_REPAIR`;
- ещё восемь phone-only split owners, включая `*3669`, закрыты audits
  `LP_SPLIT_OWNER_REPAIR_V1` и `LP_SPLIT_OWNER_REPAIR_V2`;
- всего погашено девять выявленных дублей; итоговый
  `remainingStructuralSplitOwners=0`;
- postcheck подтвердил отсутствие новых reward/XP/entitlement и остальных
  перечисленных material effects.

## Связанные документы

- [Runtime/security contours](../security/runtime-security-contours.md)
- [Open beta current status](../open-beta/open-beta-current-status-2026-08-17.md)
- [Langame sync production recovery](../deployment/langame-sync-production-recovery.md)

Source merge или этот документ сами по себе не разрешают следующий production
data repair.
