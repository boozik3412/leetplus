# PROTECTED_INITIAL_OWNER_APPLICATION_COORDINATOR_V1

| Поле       | Значение                                                          |
| ---------- | ----------------------------------------------------------------- |
| Дата       | 05.08.2026                                                        |
| Backlog    | `BETA-IAM-004L`                                                   |
| Статус     | `DORMANT / UNIT-TESTED / NOT_REGISTERED / EXTERNAL_PILOT_NO-GO`   |
| Production | Не изменён; coordinator не подключён к Nest DI или HTTP execution |

Этот checkpoint реализует bounded application orchestration поверх уже
существующих shell provisioning и owner-only
`shared_beta_tenant_activate_v1`. Он не является разрешением создать реальный
`Tenant B`, аккаунт тестера или отправить письмо.

## 1. Граница authority

Coordinator не принимает `gatePassed=true`, raw signed envelope, public key или
произвольный набор gate claims. Единственный допустимый locator authority:

```json
{
  "authority": "PERSISTED_SIGNED_SHARED_BETA_GO_V1",
  "admissionDecisionId": "<canonical UUID>",
  "deploymentMarkerId": "<canonical UUID>"
}
```

Подписи проверяются до owner-only persistence соответствующими import
boundaries. Application coordinator передаёт только exact persisted IDs.
Database activation RPC повторно и под блокировками проверяет:

- текущий unrevoked deployment marker и marker-bound coordinator role name/OID;
- persisted signed admission decision, его validity и consumption state;
- exact release, artifact, environment, schema, migration, database identity и
  policy bindings;
- три release gates;
- tenant shell, OWNER reservation, entitlement и execution revisions;
- fresh Platform Admin authority.

Application не получает прямой `SELECT` к sealed admission, marker, claim,
invite или outbox relations.

## 2. Orchestration

В test-only execution mode coordinator:

1. fail-closed проверяет exact body, Platform Admin и typed confirmation;
2. idempotently создаёт или перечитывает `PILOT/SUSPENDED/PROVISIONING` shell
   через `SharedTenantProvisioningService`;
3. сверяет tenant ID/slug, execution/profile revisions, inactive Store, OWNER
   reservation и ровно шесть `read/write=ON, outbound=OFF` entitlements;
4. вычисляет canonical activation digest и deterministic issue request ID;
5. создаёт fresh candidate IDs и AES-256-GCM envelope в памяти;
6. через отдельный database driver выполняет ровно один
   `shared_beta_tenant_activate_v1` внутри короткой `SERIALIZABLE` transaction;
7. database atomically создаёт OWNER/NETWORK invite, encrypted `HOLD` outbox,
   активирует finite trial, consumes GO, переводит единственный outbox
   `HOLD→PENDING` и пишет PII-free audit;
8. после commit возвращается только allowlisted PII-free receipt;
9. ciphertext buffer обнуляется в `finally`.

SMTP/decrypt/provider call внутри transaction отсутствует.

## 3. Idempotency и lost response

Activation identity — `(tenantId, action, requestId)` плюс canonical logical
payload digest. Issue request ID детерминирован из tenant и activation request;
candidate aggregate IDs и secret не входят в logical digest.

Повтор полного application-вызова после уже состоявшегося commit сначала
пытается выполнить обычный shell replay. Если claim уже ожидаемо перешёл с
reservation revision `1` в issued-invite state, coordinator использует
отдельное read-only восстановление только exact digest-bound PII-free shell
receipt. Оно повторно берёт slug/tenant locks и проверяет fresh Platform Admin
authority, но не объявляет progressed claim допустимым: это по-прежнему может
сделать только database activation RPC, возвращающий persisted `REPLAYED`.

Для `40001`, `40P01`, lock/statement timeout и неоднозначных connection errors
разрешён максимум один повтор exact того же RPC с теми же request digests,
candidate IDs и ciphertext. Если первый commit состоялся, database возвращает
persisted `REPLAYED` receipt и игнорирует fresh candidate material.

После второй неоднозначной ошибки coordinator возвращает только
`SHARED_BETA_INITIAL_OWNER_ACTIVATION_RECONCILIATION_REQUIRED`. Blind reissue,
revoke или destructive cleanup запрещены: они могли бы отменить уже
закоммиченный invite после потерянного ответа.

## 4. Rollback и containment

Activation, invite, claim transition, trial, decision consumption, outbox
release и audit находятся внутри одного database RPC и одной transaction.
Любая deterministic ошибка откатывает весь activation aggregate. Если shell
был создан отдельной provisioning transaction, он остаётся безопасным:

```text
PILOT / SUSPENDED / PROVISIONING
Store inactive
trial NULL
outbound OFF
no released mail
```

Неоднозначный результат не считается rollback-доказательством и требует exact
replay/reconciliation.

## 5. Privacy boundary

Response, activation receipt и ошибки не содержат:

- raw или canonical email;
- raw token, token hash, URL или password;
- ciphertext, nonce или key material;
- raw signed envelope.

Coordinator не использует logger. Owner email существует только во входном
shell command и transient crypto binding. Email запрещён в reason/support
metadata. Driver получает ciphertext/hash, но не email.

## 6. Почему production остаётся выключен

- class не имеет `@Injectable()` и отсутствует в `AdminModule.providers`;
- policy имеет только `DORMANT_TEST_ONLY`, default `enabled=false`;
- `NODE_ENV=production` всегда отклоняется независимо от переданной policy;
- `POST /admin/shared-beta/tenants/:tenantId/activate` возвращает hard
  `503 SHARED_BETA_INITIAL_OWNER_COORDINATOR_DORMANT`;
- production trust root, runtime grant и connection pool не добавлены;
- реальный tenant, account, invite и SMTP side effect не создавались.

## 7. Оставшиеся launch blockers

1. Закрыть PostgreSQL acceptance `CURRENT186` и cluster/application admission
   `CURRENT187`.
2. Создать отдельный coordinator-role pool, signed name/OID binding, exact
   `EXECUTE` grant и runtime attestation; обычный app pool использовать нельзя.
3. Провести production-like apply/rollback/zero-diff и lost-response rehearsal.
4. Завершить provider mark/complete reconciliation, verified `SENT` barrier,
   protected reissue/revoke/suspend и browser/BFF privacy smoke.
5. Принять Gate 1MT, Gate 2 и отдельный persisted `SHARED BETA GO`.
6. Только после этого зарегистрировать service/route и выполнить real day-0
   provisioning первого внешнего tenant.

## 8. Local evidence

- coordinator/provisioning/controller Jest: `3 suites / 38 tests PASS`;
- extended identity-mail gate: `15 suites / 451 tests PASS`;
- focused API regression: `39 suites / 719 tests PASS`;
- targeted ESLint: `PASS`;
- API production typecheck и build: `PASS`.

Эти результаты являются локальным engineering evidence, а не production GO.
