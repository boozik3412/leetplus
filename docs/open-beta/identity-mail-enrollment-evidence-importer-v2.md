# Enrollment evidence importer V2: sealed owner-only application boundary

| Поле | Значение |
| --- | --- |
| Статус | `DORMANT_APPLICATION_IMPORT_BOUNDARY / NOT_DEPLOYABLE` |
| Contract | `IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2` |
| Profile | `IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_PROFILE_V1` |
| Input | только exact-module manifest-bound composed brand |
| Future DB RPC | `identity_mail_tenant_enrollment_import_evidence_v2(TEXT, TEXT)` |
| Attempts | максимум `2`, только после branded lost-response |
| Production roots / SQL / credentials / DI / CLI | отсутствуют |

## Назначение границы

PostgreSQL не умеет проверить application `WeakSet` brand и две Ed25519
подписи. Поэтому raw JSON importer нельзя выдавать coordinator, worker или
обычному application runtime. Этот модуль является узким мостом между уже
принятой pure `PINNED command × PINNED Manifest V2 × exact grants`
композицией и будущим owner-only DB RPC.

Модуль сам не открывает соединение с БД и не содержит credential. Единственная
допустимая внешняя поверхность создаётся factory-функцией как process-local
capability с одним методом. Plain object, clone, synthetic/cross-module brand,
Proxy и произвольный handler object не могут попасть в вызов capability.

## Canonical import bundle

Только exact composed brand может создать immutable bundle. Domain-separated
digest покрывает canonical JSON со следующими данными:

- общий manifest-bound binding и его digest;
- exact frozen `69` command database arguments;
- canonical command proposal/envelope, обе command digests и Ed25519 evidence;
- canonical Manifest V2 payload, payload digest и Ed25519 evidence;
- exact normalized CURRENT185 grants projection;
- фиксированные contract/profile и
  `authorization=false`, `canMutate=false`, `canSend=false`.

В этих exact входных контрактах нет raw email, invite token, ciphertext,
provider payload, SMTP Message-ID или иных доставочных секретов. Bundle
ограничен `262144` UTF-8 bytes. Будущий RPC получает ровно два frozen TEXT
аргумента: `bundleCanonicalJson` и `bundleDigest`; identity-поля в gateway
request предназначены только для typed correlation и не расширяют SQL
signature.

## Replay и lost response

Первый успешный owner-only import возвращает `IMPORTED`. Exact повтор тех же
двух строк возвращает `IMPORT_REPLAY` и ссылается на исходный persisted import
через неизменные receipt digest, timestamp и transaction id. Same command,
request, envelope, manifest или bundle id с любым byte drift будущий SQL-layer
обязан отклонить конфликтом без изменений.

Повтор выполняется только после экземпляра module-branded lost-response error:

1. первый неизвестный исход повторяет тот же frozen request и те же две строки
   по ссылочной идентичности;
2. обычная ошибка до неизвестного исхода не повторяется;
3. lost response, затем любая вторая ошибка или второй lost response дают
   typed PII-free `AMBIGUOUS` с exact operation identity;
4. последующая отдельная reconciliation может безопасно повторить тот же
   persisted bundle.

Receipt обязан иметь exact versioned shape, совпадать по tenant/command/request,
authorization envelope, manifest, grants, binding и bundle digests, содержать
original import receipt reference и сохранять:

```text
canPersistEvidence=true
authorization=false
canMutate=false
canSend=false
candidateStatus=NOT_DEPLOYABLE
```

## Следующий PostgreSQL слой

Application boundary не доказывает DB ownership и не создаёт ledger. Следующий
candidate обязан:

1. version-expand CURRENT180 V1/52 command contract до отдельного V2/69
   evidence contract;
2. создать append-only Manifest V2 evidence и revocation ledger;
3. DB-enforced composite FK связать command с database/context, всеми 17 duty
   fields и exact manifest/grants/application identity;
4. выдать importer `EXECUTE` только exact DB owner, без grant coordinator,
   worker, app runtime или `PUBLIC`;
5. отдельно выдать enrollment coordinator только four-TEXT
   `drive_command_v2`, который не принимает JSON и под tenant lock повторно
   проверяет DB context, `SESSION_USER` name/OID, revocation и свежий grants
   digest.

## Evidence

- focused importer suite: `9/9 PASS`;
- composition + importer: `15/15 PASS`;
- module SHA-256:
  `4ccf736fe71d594ad444ca6a09eeeffdd1f669417084463516e9547a49bbef70`;
- test SHA-256:
  `522f1152339523c768b8d2ddce9631b6b2b63650e851872d8e636c0d5bcb9fb7`;
- independent post-fix review: `PASS`, P0/P1/P2 отсутствуют;
- package/CI gate добавлен; exact remote evidence фиксируется только после
  push неизменного commit.

## Что этот slice не разрешает

Этот модуль не импортирует данные в реальную БД, не создаёт роль/grant, не
активирует worker, не отправляет email и не является production admission.
Production остаётся `CURRENT179/179`; четыре текущих клуба остаются одной сетью
`Tenant A/Store A1..A4`, внешний tenant/tester account/invite не создаётся.
