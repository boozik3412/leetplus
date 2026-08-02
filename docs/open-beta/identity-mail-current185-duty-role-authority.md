# CURRENT185: exact duty-role grants и signed manifest boundary

| Поле | Значение |
| --- | --- |
| Статус | `DORMANT_POLICY_AND_VERIFIER / NOT_DEPLOYABLE` |
| Grants contract | `IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_V1` |
| Grants profile | `IDENTITY_MAIL_DUTY_GRANTS_PG16_V1` |
| Manifest contract | `IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V1` |
| Trust domain | `LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_AUTHORITY_V1` |
| Предшественник | `CURRENT184/184` |
| Application boundary | `IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_V1` |
| Production roots | пусты |
| SQL / роли / grants / runtime wiring | отсутствуют |

## Что реализовано

Этот slice фиксирует проверяемое описание двух database duty roles и отдельный
Ed25519-signed manifest, который в будущем свяжет это описание с конкретной
БД, deployment marker и application release. Он ничего не применяет к БД и не
разрешает enrollment.

Grants-каталог принимает только exact data-only snapshot и строит frozen
детерминированную проекцию. В digest входят:

- database name/OID/identity digest и точная identity владельца БД;
- отдельные `NOLOGIN` schema owner, `LOGIN` enrollment coordinator и `LOGIN`
  worker-v2 с точными role OID и безопасными атрибутами;
- schema `public`, её OID и точный schema owner;
- шесть `SECURITY DEFINER` routines, включая OID каждой `pg_proc`, owner,
  signature, language, volatility, parallel safety, return type и `search_path`;
- один coordinator RPC
  `identity_mail_tenant_enrollment_drive_command_v2(TEXT, TEXT, TEXT, TEXT)`;
- пять worker-v2 RPC CURRENT184;
- точные grantor/grantee/OID/grant-option для routine, database и schema ACL;
- точные effective privileges и пустые membership, role/database settings,
  default ACL и unexpected ownership surfaces.

Drop/recreate роли, schema или routine с тем же именем меняет OID и digest.
Порядок строк каталога digest не меняет; duplicate, sparse, oversized,
accessor, inherited, symbol, transparent/revoked Proxy и extra-key inputs
отклоняются fail closed.

`USAGE ON SCHEMA public TO PUBLIC` пока зафиксирован намеренно как существующая
зависимость shared `public` schema. Он не даёт `EXECUTE`: для всех шести duty
RPC PUBLIC и любой лишний grantee запрещены. Переход на отдельную schema будет
новым versioned profile, а не незаметным изменением этого контракта.

## Signed manifest

Manifest использует отдельный purpose-bound Ed25519 trust domain. Production
registry заморожен и пуст; caller или environment не могут подставить root.
Synthetic roots допустимы только в явно подтверждённом loopback CI и получают
отдельный неперсистируемый `WeakSet` brand.

Подпись связывает:

- manifest id/revision и ограниченное окно действия;
- database name/OID/identity digest;
- coordinator и worker role name/OID;
- exact grants profile/digest;
- deployment marker id/digest и independently acquired actual-context digest;
- CURRENT184 migration count/head/checksum/full manifest digest;
- CURRENT185 coordinator contract, release SHA и SHA-256 application artifact;
- `authorization=false`, `canMutate=false`, `canSend=false`.

Только результат `PINNED`-проверки exact module instance получает persistable
brand и доступ к frozen normalized payload. Plain object, clone, synthetic или
cross-module brand не подходят. Timestamp values проверяются как canonical
scalar до digest traversal; signature заранее ограничена exact 86-character
canonical base64url Ed25519 encoding. Revoked Proxy преобразуется в typed
PII-free contract error.

## Evidence

- grants catalog: `12/12 PASS`;
- signed manifest: `16/16 PASS`;
- combined boundary: `28/28 PASS`;
- manifest test заново вычисляет digest нормализованной цепочки 184 миграций,
  CURRENT184 head checksum и SHA-256 coordinator artifact;
- independent reviews: `PASS`, P0/P1 отсутствуют;
- обязательные package и GitHub Actions gates добавлены, но exact remote run
  для этого slice фиксируется только после push его неизменного commit.

Golden digest `c187b912e5618dcc46b384c91356f0ac8553cbfba7d7269bd1a4719cb9944484`
относится только к synthetic test fixture. Это не production grants digest и
не разрешение на применение ролей.

## Versioning и следующий slice

Manifest V1 честно pin-ит уже принятый CURRENT185 coordinator artifact
`4b8f6087c286bfd3c3a9073ba1fe446331a58d87583831ca9d93d6aaa38709d6`
на release `5ee3228931f92d282f82a3607117f3955b973962`. Будущий manifest-bound
authority/bridge V2 является новым application boundary. Перед runtime apply
нужен successor manifest contract/profile, pin-ящий точные V2 artifact и
release; V1 нельзя считать разрешением для ещё не существующего V2 кода.

Следующая последовательность:

1. отдельный enrollment command authority V2 с новым domain/profile и
   `dutyRoleBinding` в proposal и signed envelope;
2. pure composition `PINNED command + PINNED successor manifest + one normalized
   grants snapshot`, без повторного чтения hostile input;
3. owner-only immutable evidence importer без runtime grant;
4. отдельный four-text coordinator driver, который после tenant lock повторно
   проверяет active manifest, `SESSION_USER` name/OID и свежий grants digest;
5. phaseful `BEGIN_DRAIN / WAIT_ZERO_INFLIGHT / FINALIZE / TERMINAL_REPLAY`,
   отдельная signed rollback command и lost-response replay;
6. PostgreSQL concurrency/ACL acceptance, runtime attestation и только затем
   production-like apply/rollback/zero-diff rehearsal.

До выполнения этих этапов production остаётся `CURRENT179/179`, внешний клуб,
tester account/invite, SMTP и runtime grants не создаются.
