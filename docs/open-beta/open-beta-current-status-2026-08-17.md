# LeetPlus open beta — текущее состояние на 17.08.2026

| Поле                 | Состояние                                          |
| -------------------- | -------------------------------------------------- |
| Release decision     | `NO-GO` для внешнего доступа                       |
| Production           | не изменён                                         |
| Текущая сеть         | один Tenant, четыре Store; не изменена             |
| Первый внешний пилот | отдельный `Tenant B/Store B1`                      |
| Offline/USB key      | исключён из beta critical path                     |
| Owner onboarding     | email-bound invite, пользователь сам задаёт пароль |

## Что уже реализовано

Первый внешний клуб создаётся как отдельный tenant общей SaaS-платформы, а не
как отдельная база и не как пользователь текущей сети. Его владелец получает
`OWNER + NETWORK`, после чего создаёт пользователей и роли только своей сети и
подключает Langame credentials своих Store.

Локально реализованы обе части founder-operator admission:

1. `FOUNDER_OPERATOR_BETA_GO_V1` — short-lived persisted решение Platform
   Admin, exact-bound к release, tenant shell, profile revisions, trial и stop
   conditions;
2. `FOUNDER_OPERATOR_BETA_ACTIVATION_V2` — одна `SERIALIZABLE` transaction,
   которая повторно проверяет shell/GO, создаёт dormant owner aggregate,
   активирует tenant на 30 дней, consume GO и выпускает только связанный
   encrypted outbox `HOLD→PENDING`.

HTTP route существует, но default mode — `DISABLED`. Отдельный application
pool и least-privilege runtime assertion реализованы; `PUBLIC EXECUTE` отозван.
Production runtime role/secret/grant не создавались. Поэтому code presence не
открывает production-доступ.

На полном локальном Nest/Web/PostgreSQL контуре дополнительно принят первый
browser/store-scope срез Gate 1MT. Владелец синтетической сети открыл
геймификацию, ассортимент/товары, сотрудников, регламенты, базу знаний,
коммуникации и users/roles. Пользователь с доступом к одному Store видел только
разрешённый клуб; прямой URL с ID второго Store не расширил scope. Новые
сотрудники теперь создаются UI только через обязательное email-bound
приглашение и задают пароль сами. Локальный запрос реально создал приглашение
только в разрешённый Store; preview/accept затем создал сотрудника с
`STORES` scope и тем же единственным Store, пароль был задан самим
получателем.

## Принятое локальное evidence

- Prisma validate/generate и API/database typecheck — `PASS`;
- focused config/admin/GO/activation — `4 suites / 65 tests PASS`;
- identity-mail/onboarding — `18 suites / 477 tests PASS`;
- identity-mail и PostgreSQL focused ESLint — `PASS`;
- clean PostgreSQL 16 deploy `183` migrations — `PASS`;
- real PostgreSQL v2 activation/replay/immutability — `1/1 PASS`;
- результат: `ACTIVATED → REPLAYED`, tenant `ACTIVE/OWNER_INVITED`, trial 30
  дней, один `OWNER/NETWORK` invite, один `PENDING` outbox, `User=0` до accept;
- email и secret material отсутствуют в API response;
- disposable test database удалена без residue.
- restricted runtime role имеет ровно один effective `SECURITY DEFINER`;
  owner/superuser, `INHERIT` drift и `PUBLIC EXECUTE` drift блокируются.
- exact SHA `8cce1408dda7c32bd1f3a367d32f2caabefddcbe` принят GitHub CI
  [run 32038312056](https://github.com/boozik3412/leetplus/actions/runs/32038312056)
  как `3/3 SUCCESS`; release artifact `9291522690`, digest
  `sha256:54cc505b22e5980ad747e0eef45fc46f5ab138e847e2859241909fdd145b57f1`;
- invite-only Web successor `15b9e3ac878f01e04c76efc3942d4d0cfe87d7a1`:
  `pilot BFF 4/4`, `users/roles BFF 5/5`, Web typecheck, full Web lint без
  errors и локальный browser/API scenario — `PASS`; exact-SHA GitHub CI
  [run 32040816369](https://github.com/boozik3412/leetplus/actions/runs/32040816369)
  attempt 2 — `3/3 SUCCESS`, artifact `9292006557`, digest
  `sha256:edb072f72b97924440dc4b8f8f36ea61b04e543a030f80e84f8a84859561b06a`;
- подробное browser evidence:
  [Gate 1MT local browser evidence](./gate-1mt-local-browser-evidence-2026-08-17.md).
- канонический merged SHA `eb46d587b12a79e34ef271db3fc8ac65a91a0d8a`
  содержит `origin/main` без отставания и принят exact-SHA push CI
  [run 32043177732](https://github.com/boozik3412/leetplus/actions/runs/32043177732)
  как `3/3 SUCCESS`; artifact `9292418006`, digest
  `sha256:eb5b7ac2cfeeab9912ed0dcf91d2b22a089661bb4fb4d3c1cc79fe8149acfce9`.
- документационный baseline `171bb8fb5ffe57dbb3b881e3ea4e22753e4ed9a7`
  принят push/PR CI `3/3 SUCCESS`; release artifact `9292569673`, digest
  `sha256:c4bcec5fdd195a3f59512ab55edde61268ddb44edc234c7a19d994ce18a9c9e9`;
- read-only restored-copy preflight реализован локально: exact actual
  artifact/backup SHA-256, loopback/non-5432 target, live system/database/migration
  identity, runtime-role absence, zero other sessions и explicit outbound-off
  declarations; focused `6/6 PASS`.
  Synthetic PostgreSQL 16.14 run на `55439` вернул `READY`, после чего test DB и
  файлы удалены, кластер остановлен. Live production backup/isolated restored
  target и скачанный CI artifact не использовались, поэтому gate ещё не
  выполнен.
- implementation SHA `9caa3e49a03e4b04156689aa6d8ef0d8f4ffebe6` принят push CI
  `32053402516` и PR CI `32053406454` как `3/3 SUCCESS`; release artifact
  `9295786786`, digest
  `sha256:e8cf5a0e062089fc709054c74e754de92e579bc0e6ce195ec6aa5aadf2526704`;
- activation-role controller реализован: raw password заменяется локально
  рассчитанным SCRAM verifier, modes `plan/apply/check/rollback` exact-bound к
  fresh preflight/manifest/operation ID и сохраняют recovery receipt. Unit
  `6/6`; synthetic PostgreSQL lifecycle прошёл
  `PLAN→APPLIED→ATTESTED→APPLY_RECONCILED→ROLLED_BACK→ROLLBACK_RECONCILED` с
  восстановлением исходного PUBLIC ACL и zero role/database/file residue.
  SHA `032bacbf…` принят push CI `32059938202` и PR CI `32059941436` как
  `3/3 SUCCESS`; artifact `9298073553`, digest `sha256:137acecc…a8b`;
- 18.08 direct network acceptance реализован и принят на одноразовом PG16.13:
  exact `hostssl+scram`, TLS 1.3 peer verification, successful role login,
  wrong-secret `28P01`, other-database/plaintext `28000`, direct table read
  `42501`, identical pre/post role attestation. Evidence digest
  `5674b09f…dd7b`; затем role rollback и zero process/port/temp residue.
  Implementation SHA `821b2fbd62a098141664ca4c1b3970125e05eeff` принят
  push CI `32065667436` и PR CI `32065674292` как `3/3 SUCCESS`; artifact
  `9300127232`, digest `sha256:f2cca9b5…d1e41`. Это synthetic engineering
  evidence; PgBouncer/dedicated pool и live API ещё не приняты.
- 18.08 начат следующий runtime-слой: отдельный activation Prisma pool теперь
  fresh-attest'ит exact session role/database/TLS внутри каждой транзакции, а
  production `ACTIVE` требует `sslmode=verify-full`. PostgreSQL fixture
  вызывает production `AdminController` по HTTP и затем проверяет replay и
  zero residue. Exact SHA `5199563561683ae2d9fce4c08aa5d991cf6d2fe3`
  принят push CI `32068262701` и PR CI `32068266758` attempt `2` как
  `3/3 SUCCESS`; artifact `9301062934`, digest `sha256:ed1db27f…16e7`.
  In-process HTTP/PG pool gate закрыт; полный artifact child-process gate ещё
  открыт.
- Runnable-artifact слой принят: release tar содержит package manifests,
  operational founder scripts и web public assets, исключает `.next/dev`,
  cache, symlink и `node_modules`; CI до upload доказал frozen offline
  production install, Prisma generate и runtime resolution. Exact SHA
  `90a94f1bd729424751db156fb17fa2a318995a59` принят push CI `32075030815`
  и PR CI `32075035388` как `3/3 SUCCESS`; artifact `9303394475`, размер
  `28 419 842` bytes, digest `sha256:b73c932f…d5fd`.
- Реализован следующий synthetic gate: отдельный CI job скачивает exact
  artifact, повторно проверяет внешний/внутренний SHA-256, гидратирует только
  production dependencies, поднимает disposable PostgreSQL и реальный
  `apps/api/dist/main.js`. Через JWT/guards он обязан выполнить
  `provision→GO→ACTIVATED→REPLAYED`, проверить readiness/DB и удалить database и
  role без residue. Exact SHA `0c721f4de5891689e9e344b89c64b5b72e6a8ce7`
  принят push CI `32078882449` и PR CI `32078886786` как `4/4 SUCCESS`;
  artifact `9304656653`, размер `28 421 509` bytes, digest
  `sha256:5dc17d356030d480fdae5cbae3e97d0329c23b77e9032be019f2ef4336915700`.
  Фактический результат child process: `SHELL_PROVISIONED→ISSUED→ACTIVATED→REPLAYED`,
  tenant `ACTIVE/OWNER_INVITED`, database residue `0`, role residue `0`.

## Что блокирует выдачу доступа

1. Clean SHA/CI artifact, read-only preflight, activation-role controller,
   direct HBA/TLS/SCRAM, dedicated pool/API и downloaded artifact child-process
   acceptance приняты. Immutable production backup/isolated restored target и
   production PgBouncer/session-drain acceptance ещё не выполнены.
2. Не выполнен production-like restored-copy apply/replay/rollback с backup и
   readiness evidence.
3. Production SMTP/worker ещё не принят real-send canary; отсутствует финальный
   `SENT` barrier и полная reissue/revoke/suspend/accept acceptance.
4. Gate 1MT имеет локальный browser/store-scope partial pass, но полная
   production-like A/B matrix, jobs/Telegram/files/SSE и Gate 2 для текущей
   сети из четырёх клубов не закрыты.
5. Production deploy, `FOUNDER_OPERATOR_BETA_MODE=ACTIVE`, внешний tenant и
   реальный tester invite не выполнялись.

## Полный путь до первого внешнего тестера

```text
clean SHA + CI artifact [DONE]
  → live backup + isolated target + read-only preflight
  → execute-only runtime role/grant/attestation
  → [DONE synthetic] direct HBA/TLS/SCRAM
  → [DONE synthetic] dedicated pool + in-process HTTP/PG
  → [DONE synthetic] downloaded artifact API child process
  → restored-copy apply/replay/rollback + backup/readiness
  → SMTP canary + SENT/revoke/accept evidence
  → Gate 1MT browser/store-scope
  → Gate 2 current Tenant A/A1..A4
  → production deploy in PREPARE
  → create Tenant B/Store B1 + persisted GO
  → controlled ACTIVE activation
  → owner email invite and self-set password
  → day-0 monitoring and rollback window
```

Временный пароль `123456`, ручное создание `User`, добавление тестера в текущий
Tenant A и public signup запрещены. CURRENT198–202/USB остаются post-beta
hardening и не блокируют этот путь.
