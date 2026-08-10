# LeetPlus open beta — текущее состояние на 07.08.2026

> Обновление 10.08.2026: Gate 0 закрыт exact synchronized SHA и зелёным
> SHA-bound CI artifact. Актуальное evidence вынесено в
> `gate-0-ci-artifact-2026-08-10.md`; остальные launch gates сохраняют `NO-GO`.
>
> Дополнение 10.08.2026: CURRENT187-F добавил stable signed policy binding
> foundation. Planner `16/16`, acquisition/binding `15/15`, DDL-fence authority
> `11/11`; exact SHA `b64abfe5…` принят CI `31391874407` как `3/3 SUCCESS`.
> Это не semantic allowlist и не production authority. Evidence:
> `identity-mail-current187-f-ci-evidence-2026-08-10.md`.
>
> CURRENT187-G добавил secret-free semantic risk facts
> для privileged roles, memberships, settings, ownership, current/default ACL,
> `PUBLIC`/grantable grants и effective privileges. Facts digest включён в
> signed-bound `clusterCatalogDigest`; exact-SHA CI `31397844858` на
> `3804792e…` — `3/3 SUCCESS`. На момент приёмки G allowlist/GO отсутствовали. Evidence:
> `identity-mail-current187-g-ci-evidence-2026-08-10.md`.
>
> CURRENT187-H локально добавил independently signed semantic allowlist и
> fail-closed evaluator. Четвёртый purpose связывает exact cluster/universe,
> review evidence, document и risk-facts digests; F теперь требует matched H
> receipt. Authority `13/13`, acquisition/risk/allowlist/policy `24/24`, DDL
> fence `11/11`, полный disposable rehearsal `163/163`. До exact-SHA CI H
> остаётся `PRE-GREEN / DENY-ONLY`; deploy/test-access GO не выдаётся.

## Итоговый вердикт

- Fail-closed runner/janitor, signed journal, materializer recovery и SQL
  semantic fingerprint приняты. Release lane перезаморожен поверх canonical
  head № 180; exact SHA `183270…` прошёл GitHub CI `3/3 SUCCESS`, включая
  PostgreSQL CURRENT183–187, worker/TLS SMTP и tenant/store security gates.
  Production-like restored-copy rehearsal остаётся отдельным следующим gate.
- Внешний invite-only тест пока имеет решение `NO-GO`.
- Production, текущий `Tenant A` с четырьмя `Store A1..A4` и будущий тестер не
  изменялись. Учётная запись для `gr1mmphone1@gmail.com` не создавалась, пароль
  `123456` не устанавливался и invite не отправлялся.
- Локальная приёмка release/runtime foundation не является production deploy
  authority и не разрешает ручное создание пользователя.

## Зафиксированная целевая модель

- Четыре текущих клуба — одна сеть: один `Tenant A`, четыре `Store A1..A4`.
- Первый внешний клуб должен быть отдельным `Tenant B/Store B1` в общем data
  plane, а не новой базой на каждого пользователя.
- OWNER получает mailbox-bound invite, сам задаёт пароль и затем управляет
  пользователями, ролями, клубами и Langame mapping только своей сети.
- Один общий web/API/worker/PostgreSQL/Telegram контур обслуживает несколько
  tenant. Различаются persisted tenant/store scope, entitlements, настройки и
  integration credentials.
- В первую когорту целиком входят геймификация, ассортимент/товары, сотрудники,
  коммуникации, пользователи/роли и необходимые integrations. Outbound effects
  включаются отдельно через `OFF → SHADOW → CANARY → LIVE`.

## Состояние текущей инженерной задачи

| Контур                           | Статус                             | Подтверждение                                                                                                              |
| -------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Planning state machine           | `ACCEPTED LOCALLY`                 | `33/33`                                                                                                                    |
| SQL semantic fingerprint         | `ACCEPTED LOCALLY`                 | `26/26`; schema/data/sequences, ACL, cluster role attributes, password-verifier hashes и memberships                       |
| Persistent coordinator           | `ACCEPTED LOCALLY`                 | `6/6`; внешний pinned Ed25519 trust root                                                                                   |
| Materializer/recovery            | `ACCEPTED LOCALLY`                 | `24/24`; bounded descriptor reads, exact tree/inode provenance, signed restart locator                                     |
| Signed journal                   | `ACCEPTED LOCALLY`                 | `24/24`; public-only verification, signed lifecycle, lost unlink/rmdir recovery                                            |
| Runtime adapter                  | `ACCEPTED LOCALLY`                 | `27/27`; pinned Node/Prisma/schema, isolated env, session lock, prior-run marker admission                                 |
| Runner/janitor                   | `ACCEPTED LOCALLY`                 | `14/14`; intent-before-effect, lost-response reconciliation, fail-closed crash cleanup                                     |
| CURRENT187-F policy binding      | `ENGINEERING ACCEPTED / DENY-ONLY` | stable role/current-ACL/default-ACL/catalog fingerprints; planner `16/16`, acquisition/binding `15/15`; exact-SHA CI `3/3` |
| CURRENT187-G semantic risk facts | `ENGINEERING ACCEPTED / DENY-ONLY` | secret-free counts/category digests по 12 surfaces; focused `7/7`; exact-SHA CI `3/3`; allowlist вынесен в H               |
| CURRENT187-H semantic allowlist  | `IMPLEMENTED LOCALLY / PRE-GREEN`  | independent signed exact allowlist + deny-only evaluator; focused `13/13`, `24/24`, `11/11`; rehearsal `163/163`           |
| Единый gate                      | `PASS`                             | `163/163`, `0` failures                                                                                                    |
| Независимая latest-byte проверка | `PASS`                             | `P0=0`, `P1=0` для этого rehearsal-контура                                                                                 |

Закрыты важные failure modes:

- crash recovery не удаляет filesystem evidence до подписанного
  `SOURCE_ZERO_DIFF_VERIFIED` и свежего совпадения source fingerprint;
- переименованная база текущего или предыдущего rehearsal run обнаруживается
  по exact ownership marker, даже если имя больше не соответствует derived
  шаблону;
- cluster-global `CREATE/ALTER ROLE` и `GRANT` не скрываются удалением target DB;
- lost response для DDL, deploy и advisory unlock проходит bounded
  reconciliation, а неоднозначность сохраняет evidence и блокирует продолжение;
- production recovery использует только public verifier, private coordinator
  key не требуется для read-only inspection.

## Предыдущее локальное PostgreSQL evidence

Это evidence было получено до синхронизации с новой upstream-миграцией и больше
не закрывает текущий release gate. Среда: PostgreSQL `16.13`, loopback
`127.0.0.1:55432`, исторический source `leetplus_current180_ci`, head
`20260731120000_identity_mail_delivery_release_head`, `179` finished и `0`
unfinished/rolled-back migrations.

| Attempt | Run token                          | Source fingerprint                                                 | Runner receipt                                                     | Результат                |
| ------: | ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------ |
|       1 | `05c5990b42918ec8e9d7fb26ad44089c` | `03e04ef19ad731c5eb4f66977a4572db4da655278b84dce00d7565075bb7357b` | `49f22f51e8bb72d716e50381dbbd52b08005c2525d7ea7ce2efe08cca2573d07` | `ZERO_DIFF_ZERO_RESIDUE` |
|       2 | `c5a0bc6fc2f2ede68d4326c7fd2b6be2` | `03e04ef19ad731c5eb4f66977a4572db4da655278b84dce00d7565075bb7357b` | `fd142b051b7eea56ff2683259adff14fb77c858d4d03ae964c95e85655119aee` | `ZERO_DIFF_ZERO_RESIDUE` |

Оба receipt подтверждают `targetAbsentVerified=true`,
`artifactRootAbsent=true`, `journalRootAbsent=true`. Отдельный postflight
подтвердил `0` target/marker databases и неизменный source `179/0`.
После postflight локальный rehearsal PostgreSQL штатно остановлен через
`pg_ctl -m fast`; endpoint больше не принимает соединения, data directory
сохранён для воспроизводимости.

Операционные оговорки:

- восемь pre-coordinator roots от 06.08 сохранены в default OS temp как legacy
  evidence; автоматическая очистка без утраченной in-memory provenance
  намеренно запрещена;
- в выделенном task temp остаётся один обычный, не-reparse и пустой каталог
  Prisma `jiti`; системный guard запретил его нерекурсивное удаление. Он не
  является signed artifact/journal residue.

## Состояние открытого теста в целом

Исполнимая часть специального backlog содержит `101` задачу P0:

| Статус P0       | Количество |
| --------------- | ---------: |
| `Готово`        |          8 |
| `В работе`      |         33 |
| `Запланировано` |         60 |

Дополнительно остаются `5` запланированных P1. Это не процент готовности
продукта: широкая функциональность уже существует, но задача считается launch-
ready только после canonical merge, production-like evidence, tenant/store
изоляции на всех путях и операционной приёмки.

### Release gates

| Gate                                     | Состояние     | Почему не закрыт                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate 0 — canonical source                | `PASS`        | Exact SHA `183270f6d7b26196844210fc428639945a081cd5`; latest `origin/main` влит `05a23cd9`, behind `0`; GitHub CI `31385942115` — `3/3 SUCCESS`; artifact `leetplus-release-183270…`, digest `sha256:1e28b8…a4966`. Подробное evidence: `gate-0-ci-artifact-2026-08-10.md`. |
| Gate 1 — safe platform                   | `NO-GO`       | Не завершены все P0 security/tenant/IAM; anonymous operational boundary, startup/secrets, PII/export и full two-tenant enforcement ещё не приняты как production release                                                                                                    |
| Gate 1MT — shared multi-tenant admission | `NO-GO`       | Из `294` HTTP handlers `54` ещё blocked; BFF CURRENT188–190 остаются dormant/unregistered; store-scope и background/browser matrix неполные                                                                                                                                 |
| Gate 2A — cutover текущей сети           | `NOT STARTED` | Нет production-like restore/apply/rollback evidence, change window и `CUTOVER GO`                                                                                                                                                                                           |
| Gate 2 — первый внешний invite           | `NOT STARTED` | `Tenant A/A1..A4` не переведён in place и не прошёл 7 суток stable internal alpha                                                                                                                                                                                           |
| Gate 3 — открытый заявочный тест         | `NOT STARTED` | Нужны две friendly-сети, 14 дней, отсутствие P0/P1 и принятые SLO/incident/offboarding evidence                                                                                                                                                                             |

### Что уже существует, но ещё не разрешено к production wiring

- shell provisioning, initial OWNER coordination, employee invites, Langame
  onboarding и guest persisted sessions реализованы как engineering candidates;
- CURRENT180–190 migration lane, CURRENT187 admission/DDL-fence evidence и
  CURRENT188–190 HTTP/BFF candidates остаются noncanonical/dormant;
- provider lost-response handling принят локально, но production runtime
  roles/grants/attestation и restored-snapshot rehearsal ещё обязательны;
- web build получает стабильный build ID из exact release SHA; CI собрал
  API/Web/Prisma bundle, нормализовал tar metadata, добавил per-file
  `SHA256SUMS` и опубликовал принятый SHA-bound artifact;
- основные assortment, gamification, staff и communications boundaries имеют
  значительное локальное покрытие, но полный API/BFF/files/export/jobs/SSE/
  Telegram/browser Gate 1MT не завершён.

## Критический путь до первого внешнего клуба

1. Принять CURRENT187-H exact-SHA CI и добавить persisted one-time semantic
   approval consumption/revocation/expiry/replay; затем закрыть infrastructure
   admission/provider recovery и exact production runtime
   roles/grants/attestation и выполнить reviewed canonical promotion
   CURRENT180–190.
2. Закрыть Gate 1MT по полному согласованному модульному scope: оставшиеся HTTP
   и BFF paths, files/exports/jobs/SSE/Telegram, users/roles и outbound fences.
3. На восстановленной production-like копии выполнить signed backup/restore,
   apply/repeat/rollback/emergency/zero-diff rehearsal и принять отдельные
   production root/deploy GO.
4. Выполнить controlled canary и in-place cutover `Tenant A/A1..A4`, закрыть
   anonymous operational demo boundary и сверить все четыре клуба.
5. Выдержать минимум семь стабильных суток internal alpha без launch P0/P1 и
   stop condition.
6. Принять отдельный persisted `SHARED BETA GO`; только после него штатный
   workflow создаёт `Tenant B/Store B1` и отправляет mailbox-bound OWNER invite.

## Прямой ответ по доступу

Тестовый доступ внешнему владельцу сейчас выдавать нельзя. Технически корректная
точка выдачи — после Gate 1MT, Gate 2 и persisted `SHARED BETA GO`. До этого
ручное создание `User`, временный общий tenant, пароль `123456` или подключение
внешнего Langame API к текущему tenant нарушат целевую изоляцию и не считаются
допустимым beta workflow.

Открытый заявочный тест наступает позже первого invite: только после двух
friendly-сетей, 14-дневного окна и выполнения Gate 3.

## Следующее действие разработки

Gate 0 закрыт exact SHA и воспроизводимым CI artifact. CURRENT187-F/G приняты
exact-SHA CI. CURRENT187-H локально реализовал независимо подписанный allowlist,
fail-closed facts evaluator и обязательную связь с F; все launch flags false,
полный disposable gate `163/163`. Ближайший этап — exact-SHA CI H и persisted
one-time consumption/revocation semantic approval, затем host/TLS/HBA/pooler
runtime admission и reviewed canonical promotion/restored-copy rehearsal.
