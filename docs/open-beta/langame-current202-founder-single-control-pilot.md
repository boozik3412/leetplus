# CURRENT202: single-founder pilot exception

| Поле                                       | Значение                                      |
| ------------------------------------------ | --------------------------------------------- |
| Статус                                     | `ENGINEERING_ACCEPTED / DENY-ONLY / NO-GO`    |
| Дата                                       | 14.08.2026                                    |
| Режим                                      | один founder, один зашифрованный USB-носитель |
| Предел                                     | один внешний `Tenant`, один `Store`, 30 дней  |
| Production / текущие четыре клуба / tester | не изменялись                                 |

Engineering acceptance: exact SHA
`77bb66b38207dcc0882d98021593182c4e1777f4`,
[GitHub CI 31783338350](https://github.com/boozik3412/leetplus/actions/runs/31783338350)
`3/3 SUCCESS`. SHA-bound release artifact
`leetplus-release-77bb66b38207dcc0882d98021593182c4e1777f4`, id `9212779648`,
digest
`sha256:3e0d8e0d48a5822ee7f828adf54d71d4e030095e89a37496342c67d8702e9807`.

CURRENT202 — честное исключение для первого закрытого пилота, когда основатель
является единственным членом команды. Оно не изображает двух независимых людей
и не ослабляет стандартный CURRENT201: при масштабировании основным путём
остаётся двухконтрольная церемония.

## Зафиксированное решение

Founder принимает точный текст риска:

```text
I_ACCEPT_SINGLE_FOUNDER_CONTROL_RISK_FOR_ONE_30_DAY_PILOT
```

Verified evidence криптографически связывает одного и того же `founderId` как:

- `releaseOwnerId` — человек, который принимает решение о выпуске;
- `rollbackOwnerId` — человек, который обязан остановить пилот и выполнить
  rollback при срабатывании stop condition.

Это операционные идентификаторы в подписанном evidence, а не роли пользователя
LeetPlus. Для первого пилота используется постоянный неперсональный alias
`founder-primary`. В приложении он сам по себе не выдаёт capabilities.

Контракт фиксирует без возможности расширить поля:

- `encryptedRemovableMediaCount = 1`;
- `physicalKeySeparationSatisfied = false`;
- `organizationalIndependenceSatisfied = false`;
- `pilotTenantLimit = 1`, `pilotStoreLimit = 1`;
- `pilotDurationSeconds = 2592000`;
- `currentNetworkMutationAllowed = false`;
- `outboundInitiallyEnabled = false`;
- `publicSignupAllowed = false`;
- `secondExternalTenantAllowed = false`;
- `scaleBeyondPilotAllowed = false`;
- обязательный cooling-off — ровно 12 часов;
- окно подписи после cooling-off — не более 24 часов.

CURRENT202 разрешает только initial `ENROLL` в пустой CURRENT198 registry.
Rotate/revoke и второй root по founder-exception запрещены. Для них применяется
CURRENT201 либо отдельный будущий successor с независимыми участниками.

## Одна флешка

Обычная флешка подходит для первого закрытого пилота как переносной ключевой
носитель при одновременном выполнении всех условий:

1. Весь носитель зашифрован средствами ОС; пароль не хранится на флешке, в
   репозитории, `.env`, облачной синхронизации или переписке.
2. На носителе находятся два отдельных зашифрованных Ed25519 private-key файла:
   bootstrap root и founder approval. Физически они не независимы — этот факт
   явно записан в CURRENT202.
3. Public `.pem`, signing payload и detached `.sig` можно переносить на рабочую
   машину. Private-key файлы с носителя не копируются.
4. Флешка подключается только на время подписи, после чего безопасно
   отключается и хранится отдельно от production-хоста.
5. Потеря, повреждение или подозрение на компрометацию носителя немедленно
   останавливает релиз, ротацию и выдачу нового доступа. Обхода контроля нет.

Отсутствие второго носителя означает отсутствие физической резервной копии.
Это принятый single-point-of-failure только для одного пилота. До второго
внешнего tenant обязательны независимый reviewer, раздельные ключи/носители и
проверенная recovery-процедура.

Private keys нельзя добавлять в Git. Канонический evidence-файл содержит только
public SPKI, payload, detached signature и digests.

## Порядок работы founder

### 1. Подготовить носитель

1. Очистить флешку, включить полнодисковое шифрование и задать уникальную
   passphrase.
2. Создать каталог `LeetPlus-Key-Ceremony` без облачной синхронизации.
3. На доверенной offline-машине создать два Ed25519 keypair. Private части
   остаются только в зашифрованном контейнере флешки; public части экспортируются
   как canonical SPKI PEM.
4. Записать на бумаге label носителя, дату создания и public fingerprints — без
   private material и passphrase.

### 2. Назначить release/rollback owner

Во всех CURRENT202 аргументах использовать одно точное значение:

```text
--founder-id founder-primary
--release-owner-id founder-primary
--rollback-owner-id founder-primary
```

Установить три SHA-256 digest:

- `keyCustodyPlanDigest` — digest утверждённого плана хранения одной флешки;
- `restoredCopyPlanDigest` — digest утверждённого плана изолированного restore;
- `rollbackPlanDigest` — digest точного rollback/stop-condition runbook.

Канонические исходники планов:

- [key custody](./founder-pilot-key-custody-plan.md);
- [isolated restored copy](./founder-pilot-restored-copy-plan.md);
- [stop and rollback](./founder-pilot-rollback-plan.md).

SHA-256 текущих exact bytes:

```text
keyCustodyPlanDigest   = 9edcf4f17eeef3f33edbc7282e4637b525c83bc286a7f8f7bd68cafdd6160d2c
restoredCopyPlanDigest = cc8f19cd45ac46d2de3679bc9f99a7f3c4e20be5e3033d8d7e3b07f5d3423312
rollbackPlanDigest     = 157597d98a13b67cb32414d828065c49adf78538b8efd21f68ccc8cd26690e59
```

Перед церемонией founder повторно вычисляет hashes из clean accepted SHA. При
любом расхождении evidence не подписывается.

Так назначение становится частью подписанного founder payload. Простого текста
в задаче или приложения роли недостаточно.

### 3. Подготовить evidence

Сначала получить полную справку:

```powershell
pnpm --filter database langame-runtime-trust:prepare-founder-pilot -- --help
```

В `prepare` передаются CURRENT200 ENROLL-поля, public root, public founder key,
три owner ID, три plan digest, exact risk acceptance, `preparedAt`,
`eligibleAt = preparedAt + 12h` и `expiresAt <= eligibleAt + 24h`.

CLI возвращает deny-only packet и `founderPayloadCanonicalJson`. Его сохраняют
byte-for-byte, проверяют digests и только после истечения 12 часов подписывают
founder private key на offline-машине. В `verify` передаётся detached canonical
base64url signature. CLI private keys не читает.

### 4. Reviewed CURRENT198 transition

Тот же commit должен содержать:

- exact `candidateCanonicalJson` в
  `packages/database/scripts/langame-runtime-trust-bootstrap-registry-current198.mjs`;
- полный canonical verified receipt с завершающим LF в
  `packages/database/trust-evidence/langame-current198-bootstrap-founder-current202.json`.

Ровно один evidence-путь может присутствовать в HEAD: CURRENT201 или
CURRENT202. Одновременное присутствие обоих останавливает transition gate.
Gate повторно проверяет подпись, CURRENT200 operation, candidate, cooling-off,
expiry, clean HEAD bytes и каждого Git parent.

## Изолированная копия production backup

Код и runbook готовы только к планированию; фактический restore не выполнялся,
потому что в репозитории нет production backup, credentials и назначенного
изолированного PostgreSQL target. Эти секреты нельзя передавать через Git или
эту задачу.

Перед выполнением restore founder обязан предоставить вне репозитория:

1. неизменяемый backup и его checksum;
2. отдельный PostgreSQL target без маршрута к production и без production
   service credentials;
3. одноразовые restore credentials;
4. подтверждение запрета outbound workers, SMTP, Telegram и Langame calls;
5. RPO/RTO, rollback runbook и срок удаления тестовой копии.

После этого выполняются restore → migration/readiness → production-like
role/grant rehearsal → apply/repeat/rollback → zero-diff → удаление credentials
и доказательство нулевого residue. До принятого отчёта owner route остаётся
`503`, а внешний доступ — `NO-GO`.

## Что CURRENT202 не разрешает

Даже verified receipt всегда возвращает `authorization=false`, `canApply=false`,
`canEnrollProductionRoots=false`, `productionExecutionAllowed=false`,
`productionRootEnrolled=false`, `ownerRouteActivationAllowed=false`,
`sharedBetaAccess=false` и `testAccessAuthorized=false`.

Следующие отдельные этапы остаются обязательными: принять registry transition,
production-origin CURRENT196–199 registration, выполнить restored-copy
rehearsal, применить runtime roles/grants, получить Gate 1MT/Gate 2 и только
после этого выпустить отдельный persisted `SHARED BETA GO`.
