# Founder owner delivery — canonical CURRENT185

Статус: `EXACT-SHA CI ACCEPTED / PRODUCTION NO-GO`.

## Зачем нужен checkpoint

Founder activation и owner invite reissue сдвинули канонический Prisma head
дальше исторического CURRENT179. Active identity-mail worker намеренно
fail-closed проверял старый head и поэтому не мог доставить новое приглашение
на актуальной схеме. Без исправления owner invite оставался бы `PENDING`, а
preview/accept обязан был блокироваться до `SENT`.

## Реализация

Forward-only migration
`20260818020000_identity_mail_delivery_current_head_v1`:

- принимает только точный preterminal manifest из `184` canonical migrations;
- сохраняет существующие delivery RPC и их семантику;
- перепривязывает только `identity_mail_delivery_worker_assert_v1` к head из
  `185` migrations;
- сохраняет `PUBLIC EXECUTE` отозванным;
- допускает только существующие tenant-enrolled least-privilege worker roles;
- проверяет точный source digest RPC и ACL до завершения migration.

Active repository, worker-enrollment CLI, runtime-function enrollment,
production startup receipt, release artifact provenance и связанные
fail-closed smoke tests используют тот же exact head/count.

В репозитории также существуют noncanonical proposal-кандидаты, в имени
которых встречается CURRENT185. Они не входят в Prisma canonical chain и не
являются этим migration checkpoint.

## Принято локально

- clean LF-normalized PostgreSQL deployment: `185 migrations PASS`;
- static migration/repository binding: `2/2 PASS`;
- strict trusted-TLS identity-mail worker: `1/1 PASS`;
- founder PostgreSQL lifecycle:
  `activate→revoke→reissue→replay→SENT→preview→accept`, `1/1 PASS`;
- owner result: один `User`, `OWNER/NETWORK`, tenant `ONBOARDING`, execution
  revision `2`, identity claim `USER`, ciphertext очищен;
- API typecheck, database typecheck и scoped lint: `PASS`;
- identity-mail focused: `18 suites / 485 tests PASS`;
- owner lifecycle focused: `2 suites / 18 tests PASS`;
- full API: `157 suites / 3144 passed / 2 todo`.

Implementation SHA `14193e5151cf5ba1118466facdaf4a8a4a4e0922` принят push CI
`32105326187` и PR CI `32105331954` как `4/4 SUCCESS`. SHA-bound artifact:
`9313186108`, `28 444 909` bytes,
`sha256:6d2747e7642f7ebd52714638bb229c0abd0c1b4fc221c2de3c09d04d2eb2fe09`.
Первый CI run выявил stale legacy-inventory function digest; исправление
перепривязало его к CURRENT185 и было отдельно принято реальным трехклоновым
PostgreSQL smoke с zero database/role residue.

Strict TLS fixture доказывает настоящий SMTP transport boundary. Полный owner
lifecycle использует deterministic provider seam, чтобы доказать state machine
и accept без отправки внешнего письма. Вместе они не считаются production SMTP
canary.

## Что этот checkpoint не разрешает

Он не применял migration к production, не создавал production worker/runtime
roles, не включал outbound, не создавал новый tenant и не отправлял письмо
внешнему тестеру. Текущий Tenant A с четырьмя Store не изменён.

## Следующий operational gate

1. `DONE`: production backup restore, CURRENT185 production-history migration,
   repeat, data zero-diff и activation-role TLS rollback.
2. Собрать и скачать новый SHA-bound artifact с принятым history controller.
3. На сохранённой restored copy повторить artifact-bound readiness и worker
   enrollment/`SENT`/accept/disable.
4. Перед production cutover подготовить новый recovery point, развернуть exact
   artifact/migration, создать и аттестовать least-privilege
   runtime/worker roles, настроить production encryption и trusted SMTP.
5. После Gate 1MT/2 выполнить один controlled canary, затем создать отдельный
   `Tenant B/Store B1` и отправить mailbox-bound OWNER invite.
6. После accept проверить tenant/store/module isolation и оставить outbound
   включённым только для явно разрешённого pilot tenant.

USB/offline key ceremony остаётся post-beta security hardening и не блокирует
этот первый controlled pilot.
