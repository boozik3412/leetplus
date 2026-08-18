# Founder owner delivery — canonical CURRENT185

Статус: `LOCAL ENGINEERING PASS / EXACT-SHA CI PENDING / PRODUCTION NO-GO`.

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

Strict TLS fixture доказывает настоящий SMTP transport boundary. Полный owner
lifecycle использует deterministic provider seam, чтобы доказать state machine
и accept без отправки внешнего письма. Вместе они не считаются production SMTP
canary.

## Что этот checkpoint не разрешает

Он не применял migration к production, не создавал production worker/runtime
roles, не включал outbound, не создавал новый tenant и не отправлял письмо
внешнему тестеру. Текущий Tenant A с четырьмя Store не изменён.

## Следующий operational gate

1. Принять exact commit в GitHub CI и получить SHA-bound artifact.
2. На изолированной restored copy production backup применить exact artifact,
   повторить readiness, worker enrollment, `SENT`, accept и rollback/restore.
3. Подготовить production backup и recovery point.
4. Развернуть exact artifact/migration, создать и аттестовать least-privilege
   runtime/worker roles, настроить production encryption и trusted SMTP.
5. Выполнить один controlled canary, затем создать отдельный
   `Tenant B/Store B1` и отправить mailbox-bound OWNER invite.
6. После accept проверить tenant/store/module isolation и оставить outbound
   включённым только для явно разрешённого pilot tenant.

USB/offline key ceremony остаётся post-beta security hardening и не блокирует
этот первый controlled pilot.
