# CURRENT202 V2: single-founder global platform bootstrap

> Решение 17.08.2026: этот контур остаётся `DENY-ONLY` и перенесён в post-beta
> security hardening. USB/offline key не является условием первого внешнего
> tenant. Актуальный beta-onboarding successor описан в
> [founder-operator-beta-go.md](./founder-operator-beta-go.md). Исторические
> acceptance evidence и запрет фиктивного enrollment сохраняются.

| Поле                                       | Значение                                      |
| ------------------------------------------ | --------------------------------------------- |
| Статус                                     | `ENGINEERING_ACCEPTED / DENY-ONLY / NO-GO`    |
| Дата                                       | 14.08.2026                                    |
| Режим                                      | один founder, один зашифрованный USB-носитель |
| Scope ключа                                | глобальная платформа LeetPlus                 |
| Tenant rollout policy                      | вне key evidence; отдельный `SHARED BETA GO`  |
| Production / текущие четыре клуба / tester | не изменялись                                 |

Исторический CURRENT202 V1 engineering acceptance: exact SHA
`77bb66b38207dcc0882d98021593182c4e1777f4`,
[GitHub CI 31783338350](https://github.com/boozik3412/leetplus/actions/runs/31783338350)
`3/3 SUCCESS`. SHA-bound release artifact
`leetplus-release-77bb66b38207dcc0882d98021593182c4e1777f4`, id `9212779648`,
digest
`sha256:3e0d8e0d48a5822ee7f828adf54d71d4e030095e89a37496342c67d8702e9807`.

V1 остаётся только историческим deny-only evidence и новым verifier не
принимается.

CURRENT202 V2 engineering acceptance: exact SHA
`c2b7b370627d79e75f0afbd41dbfe0cf04a5cb6b`,
[GitHub CI 31790021275](https://github.com/boozik3412/leetplus/actions/runs/31790021275)
`3/3 SUCCESS`. SHA-bound release artifact
`leetplus-release-c2b7b370627d79e75f0afbd41dbfe0cf04a5cb6b`, id
`9215344140`, digest
`sha256:8e7b70c5fd252841f409d9efb311018ea5c796e7adb61083872529cafdddb504`.

CURRENT202 — честное внутреннее bootstrap-исключение, когда основатель
является единственным членом команды. Оно не изображает двух независимых людей
и не ослабляет стандартный CURRENT201 для внутренней ротации platform root.
Клиенты в этой церемонии не участвуют.

Один platform key не равен одной сети. Он является глобальным внутренним trust
anchor LeetPlus. Внешние tenants подключаются обычным owner email invite и не
получают private key, флешку или signing CLI. Canary-политика первого tenant
хранится в отдельном launch GO, а не в platform bootstrap evidence.

## Зафиксированное решение

Founder принимает точный текст риска:

```text
I_ACCEPT_SINGLE_FOUNDER_CONTROL_RISK_FOR_GLOBAL_PLATFORM_BOOTSTRAP
```

Verified evidence криптографически связывает одного и того же `founderId` как:

- `releaseOwnerId` — человек, который принимает решение о выпуске;
- `rollbackOwnerId` — человек, который обязан остановить пилот и выполнить
  rollback при срабатывании stop condition.

Это операционные идентификаторы в подписанном evidence, а не роли пользователя
LeetPlus. Для bootstrap используется постоянный неперсональный alias
`founder-primary`. В приложении он сам по себе не выдаёт capabilities.

Контракт фиксирует без возможности расширить поля:

- `platformScope = GLOBAL`;
- `customerKeyCeremonyRequired = false`;
- `additionalTenantKeyCeremonyRequired = false`;
- `routineTenantOnboardingRequiresRootAccess = false`;
- `tenantRolloutPolicyEmbedded = false`;
- `sharedBetaGoRequired = true`;
- `encryptedRemovableMediaCount = 1`;
- `physicalKeySeparationSatisfied = false`;
- `organizationalIndependenceSatisfied = false`;
- `currentNetworkMutationAllowed = false`;
- `outboundInitiallyEnabled = false`;
- `publicSignupAllowed = false`;
- обязательный cooling-off — ровно 12 часов;
- окно подписи после cooling-off — не более 24 часов.

V2 payload и receipt вообще не содержат `pilotTenantLimit`, `pilotStoreLimit`,
`pilotDurationSeconds`, `secondExternalTenantAllowed` или
`scaleBeyondPilotAllowed`. Любое их добавление отклоняется exact-record
проверкой.

CURRENT202 разрешает только initial `ENROLL` в пустой CURRENT198 registry.
Rotate/revoke и второй root по founder-exception запрещены. Для внутренней
ротации применяется CURRENT201. Подключение второго tenant не является
ротацией: после review ему выпускается отдельный tenant GO с тем же глобальным
platform trust и обычным owner invite.

## Результат V2 successor

CURRENT202 V2 реализует требуемый successor:

- явно подписывает `platformScope = GLOBAL`;
- фиксирует `customerKeyCeremonyRequired = false` и
  `additionalTenantKeyCeremonyRequired = false`;
- переносит ограничения первого tenant/store/trial из platform key evidence в
  отдельный `SHARED BETA GO`;
- сохраняет запрет public signup, initial outbound и изменения текущей сети до
  отдельных launch decisions.

Contract domain изменён с `CURRENT202_V1` на
`LANGAME_RUNTIME_TRUST_FOUNDER_GLOBAL_PLATFORM_BOOTSTRAP_CURRENT202_V2`,
поэтому V1 signature/receipt нельзя переиспользовать. Exact-SHA CI принят, но
до отдельного production root enrollment GO использовать V2 для registry apply
нельзя.

## Одна флешка

Обычная флешка подходит как внутренний переносной bootstrap/recovery-носитель
LeetPlus при одновременном выполнении всех условий:

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
Это принятый single-point-of-failure раннего запуска. Он не переносится на
клиентов. Дополнительные носители и независимый reviewer обязательны перед
внутренней ротацией root и по мере роста команды, но не перед каждым новым
tenant.

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
keyCustodyPlanDigest   = b7bcb48f5cd009ffc375b8575c8f0024ae8c840231027c5f27386eeaa3a18843
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
pnpm --filter database langame-runtime-trust:prepare-founder-global-bootstrap -- --help
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
  `packages/database/trust-evidence/langame-current198-bootstrap-founder-global-current202.json`.

Ровно один evidence-путь может присутствовать в HEAD: CURRENT201 или
CURRENT202 V2. Legacy V1 path остаётся в deny-list: его единоличное присутствие
отклоняется V2 verifier, а одновременное присутствие с V2/CURRENT201 считается
ambiguous и останавливает transition gate.
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
