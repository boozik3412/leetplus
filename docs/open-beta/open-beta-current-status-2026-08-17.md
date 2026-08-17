# LeetPlus open beta — текущее состояние на 17.08.2026

| Поле | Состояние |
| --- | --- |
| Release decision | `NO-GO` для внешнего доступа |
| Production | не изменён |
| Текущая сеть | один Tenant, четыре Store; не изменена |
| Первый внешний пилот | отдельный `Tenant B/Store B1` |
| Offline/USB key | исключён из beta critical path |
| Owner onboarding | email-bound invite, пользователь сам задаёт пароль |

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

## Что блокирует выдачу доступа

1. Текущий рабочий diff ещё не собран в clean exact SHA и не принят CI
   artifact.
2. Код dedicated pool/live role attestation готов, но production role/password/
   grant ещё не созданы и не приняты на restored-copy; обычные application
   roles намеренно не имеют `EXECUTE`.
3. Не выполнен production-like restored-copy apply/replay/rollback с backup и
   readiness evidence.
4. Production SMTP/worker ещё не принят real-send canary; отсутствует финальный
   `SENT` barrier и полная reissue/revoke/suspend/accept acceptance.
5. Gate 1MT browser/store-scope и Gate 2 для текущей сети из четырёх клубов не
   закрыты.
6. Production deploy, `FOUNDER_OPERATOR_BETA_MODE=ACTIVE`, внешний tenant и
   реальный tester invite не выполнялись.

## Полный путь до первого внешнего тестера

```text
clean SHA + CI artifact
  → execute-only runtime role/grant/attestation
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
