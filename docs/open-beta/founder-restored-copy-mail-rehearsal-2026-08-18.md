# Founder pilot: restored-copy mail rehearsal — 18.08.2026

## Решение

`PASS` для trusted TLS SMTP transport, CURRENT185 mail-worker `SENT` boundary,
protected one-tenant mail enrollment и полного founder OWNER onboarding на
disposable клонах clean production-backup copy.

Это не production SMTP send и не разрешение внешнего доступа. Production,
текущий Tenant A с четырьмя Store и mailbox внешнего тестера не изменялись.

## Входные данные

| Evidence                   | Значение                                                           |
| -------------------------- | ------------------------------------------------------------------ |
| Release SHA                | `3f325acc2428b1e3c3797075b218efeb454fae91`                         |
| Downloaded artifact ID     | `9321380247`                                                       |
| Downloaded archive SHA-256 | `adb75120f35ca54bbd80924f467c78296d425f3c94de86f437998b9046b5b7f4` |
| Clean template             | isolated CURRENT185 production-backup copy                         |
| Applied / rolled back      | `185 / 4`                                                          |
| Unfinished migrations      | `0`                                                                |
| Applied manifest digest    | `8d68d15ad0fb85b2e80b5987b5d190d9b79845ed9db3ba31ba2417c6f6685d51` |
| Restored-copy evidence     | `51efd85cdaf2baec1d81439ab296d2412f94373eea7d31f6521412e15d049cd0` |

Оба сценария разрешают restored-copy mode только при одновременном выполнении
всех условий: `NODE_ENV != production`, exact `127.0.0.1`, explicit non-5432
port, database name `leetplus_restored_*`, exact совпадение отдельного template
environment и отсутствие других сессий template. Mutation выполняется только
в случайно названной disposable database; source template не открывается для
application writes.

## Trusted TLS SMTP worker

`identity-mail-worker.pg.integration-spec.ts` создал disposable clone и
одноразовую least-privilege worker role, затем поднял loopback SMTP server с
отдельным test CA и обязательной TLS peer verification.

Результат: `1/1 PASS`, `173.653 s`.

Приняты одновременно:

- worker не имеет прямого чтения `IdentityMailOutbox`;
- exact CURRENT185/count/release/role/OID runtime attestation;
- одно сообщение принято SMTP и завершено `PENDING → SENT`;
- ciphertext уничтожен после terminal success;
- повреждённый envelope дал pre-provider `RETRY` без SMTP effect;
- lost response после provider marker дал `RECONCILIATION_REQUIRED` без blind
  resend;
- SMTP получил ровно два сообщения: accepted и intentionally ambiguous;
- disposable database и worker role удалены, residue `0 / 0`.

SMTP fixture использует настоящий TLS transport и SMTP protocol, но не является
внешним production provider и не отправляет письмо реальному пользователю.

## Protected founder workflow

`founder-operator-beta-activation-v2.pg.integration-spec.ts` на отдельном
disposable clone выполнил:

```text
tenant shell
  → persisted founder GO
  → atomic activation/replay
  → OWNER/NETWORK HOLD→PENDING
  → founder mail enrollment plan/apply/check
  → least-privilege worker SENT
  → preview/accept with self-set password
  → enrollment disable
  → cleanup
```

Результат: `1/1 PASS`, `55.262 s`.

Workflow подтвердил один `OWNER/NETWORK`, tenant lifecycle
`ACTIVE/OWNER_INVITED → ONBOARDING`, claim `INVITE → USER`, уничтожение
ciphertext, отсутствие plaintext identity в receipt и exact one-tenant
enrollment policy. Provider в этом сценарии deterministic; реальный TLS SMTP
transport отдельно доказан предыдущим сценарием на том же release и template.

## Fail-closed наблюдения

Два предварительных запуска не засчитаны как acceptance, но подтвердили
операционные fences:

1. exact HBA deny от activation-role network gate запретил fixed role доступ к
   другой disposable database;
2. mail-enrollment controller отклонил owner connection при `ssl=on` с
   `LOOPBACK_PLAINTEXT_CONNECTION_REQUIRED`.

После каждого отказа cleanup подтвердил ноль disposable databases и roles.
Для функционального owner workflow изолированный кластер временно вернули в
baseline `ssl=off`; после успешного теста восстановлены `ssl=on` и три exact
activation-role HBA rules.

## Финальный postflight

```text
ssl=on
disposable database residue=0
worker role residue=0
activation role residue=0
exact activation HBA rules=3
restored-copy preflight=READY
```

Database/worker/SMTP/encryption secrets не выводились и не сохранялись в Git.

## Что осталось до внешнего OWNER invite

1. Закрыть полную Gate 1MT A/B/browser/background matrix и Gate 2 для текущей
   сети A1–A4.
2. Подготовить production `PREPARE`: новый recovery point, exact artifact,
   runtime/activation/mail-worker roles, TLS/SMTP secrets, monitoring и
   rollback owner.
3. Выполнить один controlled production SMTP canary без создания внешнего
   tenant, затем отдельный `PRODUCTION DEPLOY GO`.
4. Только после стабильного cutover создать Tenant B/Store B1, сохранить
   persisted founder GO и отправить mailbox-bound OWNER invite.
