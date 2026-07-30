# Signed shared-beta admission provenance

| Поле | Значение |
| --- | --- |
| Версия | 1.3 |
| Дата | 30.07.2026 |
| Backlog | `BETA-IAM-004H` |
| Contract | `SIGNED_ADMISSION_PROVENANCE_ASSERT_V1` |
| Schema target | migration 172 / `CURRENT_172` |
| Статус | `ENGINEERING_ACCEPTED` |
| Implementation SHA | `12d574166bffe860205b128dd9d092f4f54514fc` |
| GitHub CI | `30509157338` / run `#53` / `3/3 PASS` |
| Release decision | `NO-GO`; production, outbound и tester account не изменяются |

## 1. Назначение

Этот checkpoint добавляет persisted provenance для будущего решения
`SHARED BETA GO`. Он доказывает целостность и authority подписанных claims о:

- release SHA и artifact;
- environment и PostgreSQL database identity;
- schema head/count и policy manifest;
- claimed shell/provisioning evidence digest;
- initial OWNER identity locator/claim revision;
- tenant execution/profile revisions;
- полному six-module beta profile;
- трём обязательным, действующим и подписанным gate attestations.

Checkpoint не активирует tenant и не делает delivery sendable. Он создаёт,
проверяет и отзывает admission authority, но не потребляет его.

Граница доказательства принципиальна: migration 172 сопоставляет между собой
подписанные и persisted значения, но не получает независимо фактический
контекст текущего процесса/кластера. Поэтому `004H` не является доказательством
того, что claimed `databaseIdentityDigest`, release SHA или environment
соответствуют именно БД и artifact, где выполняется assert. Физический клон БД
с теми же корректно подписанными claims этим checkpoint не отличим.

До любого issue/consume будущий `BETA-IAM-004I` обязан внутри защищённого
activation path получить фактические `current_database()`, database OID/system
identifier и deployed release/environment/schema/artifact/policy marker,
вычислить отдельный domain-separated actual-context binding и сопоставить его
с подписанными claims. HMAC или переданное вызывающим кодом значение не является
независимым authority.

Та же граница действует для `shellEvidenceDigest`: в `004H` это только
подписанный claimed digest. Migration 172 не перечитывает `Store`, bootstrap
OWNER override или provisioning audit/receipt и поэтому не доказывает
фактическую полноту shell. До issue и повторно до consume будущий `004I` обязан
под блокировками независимо перечитать `Tenant`, ровно один ожидаемый inactive
`Store`, exact OWNER override с capability digest, provisioning audit/receipt и
ровно шесть entitlement rows, затем пересчитать domain-separated actual-shell
digest и hard-match сопоставить его с подписанным claim.

## 2. Почему `HOLD→PENDING` не входит

Migration 171 намеренно допускает только outbox `HOLD`. Dormant issue replay
тоже требует, чтобы связанный outbox оставался `HOLD`.

Standalone release недопустим, потому что он может создать отправляемую запись
для tenant, который всё ещё находится в
`PILOT/SUSPENDED/PROVISIONING`, без trial и без принятого activation state.

Переход должен появиться только в будущем
`ACTIVATE_AND_RELEASE_OWNER_INVITE_V1`, где одна транзакция:

1. блокирует activation request/replay;
2. выпускает dormant OWNER invite ровно одним issue RPC;
3. блокирует и повторно проверяет tenant/admission/gates/profile;
4. запускает trial;
5. переводит tenant в `ACTIVE/OWNER_INVITED`;
6. CAS-потребляет admission decision;
7. переводит ровно связанный outbox `HOLD→PENDING`;
8. сохраняет immutable PII-free activation receipt/audit.

Универсальный standalone outbox-release RPC запрещён.

## 3. Persisted authority

### 3.1. `ReleaseGateAttestation`

Attestation представляет один результат защищённого gate. Разрешены ровно:

1. `MODULE_POLICY_ENFORCED`;
2. `EMAIL_INVITE_WORKFLOW_VERIFIED`;
3. `POSTGRESQL_RELEASE_REHEARSAL_VERIFIED`.

Signed immutable payload связывает:

- gate code и contract version;
- `releaseSha`;
- `environment`;
- `artifactDigest`;
- `schemaHead` и `migrationCount`;
- `policyManifestDigest`;
- `signingKeyId`, purpose/profile и provenance key version;
- `passedAt` и `validUntil`.

`signatureAlgorithm=Ed25519`, canonical payload digest, public-key fingerprint
и signature находятся в проверяемом envelope и сохраняются в отдельных typed
columns. Они не являются полями самого signed payload. Importer вычисляет digest
из единственного immutable snapshot payload, проверяет Ed25519 и только затем
передаёт owner-only persistence primitive.

Revocation хранится как отдельное monotonic состояние/CAS и не переписывает
signed payload.

### 3.2. `TenantAdmissionDecision`

Decision имеет hard-coded `GO` и связывает:

- `tenantId`;
- `workflowLocator`;
- `reservationSubjectId`;
- `expectedClaimRevision`;
- claimed shell/provisioning evidence digest;
- `expectedExecutionRevision`;
- `expectedEntitlementProfileRevision`;
- deterministic six-module `profileDigest`;
- release/environment/schema/artifact/policy binding;
- `databaseIdentityDigest`;
- `gateSetVersion` и `gateSetDigest`;
- idempotency `requestId/requestDigest`;
- собственный Ed25519 provenance envelope с persisted signature metadata;
- `approvedAt` и `validUntil`;
- monotonic `stateRevision`, `revokedAt`, `consumedAt`.

В migration 172 `consumedAt` обязан оставаться `NULL`. Переход
`AVAILABLE→CONSUMED` резервируется за будущим activation writer.

### 3.3. `TenantAdmissionDecisionGate`

Link relation содержит ровно три строки на decision:

- primary key `(decisionId, gateCode)`;
- composite reference `(attestationId, gateCode)`;
- immutable trigger;
- deterministic `gateSetDigest`, рассчитанный по отсортированным gate code,
  attestation ID и signed payload digest.

Нельзя заменить attestation одного типа другим, добавить четвёртый gate или
пропустить обязательный gate.

## 4. Signature authority

Используется отдельный purpose/profile:

- purpose: `SHARED_BETA_TENANT_ADMISSION`;
- profile: `SHARED_BETA_ADMISSION_V1`;
- algorithm: Ed25519;
- registry: отдельный pinned public-root registry.

Запрещено переиспользовать:

- staff-task signing root;
- JWT/session/referral secrets;
- identity HMAC;
- mail AES-GCM key;
- integration credentials.

Production registry первоначально пуст. Поэтому production-like import/create
обязан завершаться fail-closed до persisted decision. Synthetic fixtures
допустимы только в явно подтверждённой loopback CI database и не являются
Gate 1MT/Gate 2 evidence.

## 5. Sealed database boundary

Планируемые owner-only primitives:

- deterministic six-module profile digest;
- signed attestation import/create/revoke;
- signed tenant admission decision create/revoke;
- PII-free exact admission assert.

Каждый `SECURITY DEFINER` primitive использует
`SET search_path = pg_catalog`, schema-qualified objects и exact input checks.

На migration exit:

- PUBLIC не имеет `EXECUTE` на новых functions;
- application runtime не имеет `EXECUTE` на новых functions;
- PUBLIC/application не имеют table- или column-level privileges на новых
  relations;
- application runtime allowlist остаётся ровно семь ранее принятых RPC;
- issue HOLD RPC и admission RPC остаются `EXCLUDED_PENDING`.

## 6. Exact admission assert

Assert принимает только несекретные correlation/binding values и возвращает
PII-free stable receipt. Перед успехом он повторно проверяет:

- decision существует, `AVAILABLE`, не expired и не revoked;
- exact tenant/locator и исходная signed reservation subject/claim revision;
- lifecycle subset tenant остаётся `PILOT/SUSPENDED/PROVISIONING`, trial не
  запущен, а execution/profile revisions не изменились;
- execution/profile revisions не изменились;
- persisted six-module profile полный, current и соответствует digest;
- заявленные release/environment/schema/artifact/policy/database значения
  согласованы между decision, gates и аргументами assert;
- ровно три gate links присутствуют;
- каждая attestation действительна, не revoked, не expired и имеет ожидаемый
  gate code;
- persisted purpose/profile/key/algorithm/payload-digest metadata остаются
  exact и immutable относительно принятого importer envelope;
- gate-set digest совпадает.

SQL assert не выполняет Ed25519 verify и не пересчитывает canonical JSON digest.
Эта криптографическая проверка выполняется до owner-only persistence
fail-closed importer’ом. SQL опирается на sealed immutable/check-bound rows и
повторно проверяет текущие tenant/identity/gate/profile bindings.

Исходная подпись всегда остаётся связанной с reservation, но текущая identity
может находиться ровно в одной из двух допустимых форм:

1. `RESERVATION` — current `IdentityEmailClaim.subjectId/revision` точно равны
   signed `reservationSubjectId/expectedClaimRevision`;
2. `ISSUED_HOLD` — immutable `IdentityOwnerInviteIssueCommand` доказывает тот же
   tenant, locator и исходную reservation subject/revision, current claim
   указывает на command invite/revision, а exact live `OWNER/NETWORK`
   `UserInvite` и связанный encrypted outbox существуют, не приняты, не
   отозваны, не expired и outbox всё ещё находится в `HOLD`.

Вторая ветка нужна для обязательного порядка будущего `004I`:
`issue once → persisted-GO recheck → consume/release`. Она не меняет signed
identity binding и не позволяет подставить другой invite/command/outbox.
Claim, invite и outbox блокируются так, чтобы их non-key state не мог измениться
между проверкой и возвратом receipt; immutable command читается только как
доказательство перехода.

Любой stale/missing/extra/duplicate/mismatch возвращает stable generic denial.
Email, token, token hash, ciphertext, signing material и raw database identity
не возвращаются и не попадают в audit/log.

Receipt всегда содержит `identityState`; для `ISSUED_HOLD` дополнительно
возвращаются только `issueCommandId`, `inviteId` и `outboxId`. Это PII-free
correlation, а не secret-bearing delivery payload.

Assert в `004H` не утверждает соответствие этих claims фактической текущей БД
или deployed artifact. Такая проверка является обязательным входным инвариантом
`004I`, а не скрытым свойством Ed25519-подписи.

Assert также не утверждает, что фактически существуют ровно один inactive
`Store`, ожидаемый OWNER override или provisioning audit/receipt:
`shellEvidenceDigest` остаётся signed claim. `004I` обязан под блокировками
перечитать и domain-separated пересчитать actual shell до issue и повторно
перед consume; несовпадение запрещает issue/activation/release.

## 7. Lock order

Migration 172 не активирует tenant и не потребляет decision. Для будущего
потребителя фиксируется единый порядок:

```text
activation request advisory lock
→ activation replay lookup
→ independently acquire actual DB/release/environment/schema/artifact/policy
→ Tenant FOR NO KEY UPDATE
→ Store, OWNER override, provisioning audit/receipt and entitlements
  in canonical order; exact actual-shell recomputation
→ issue RPC
  → issue request advisory lock
  → locator discovery
  → canonical email advisory lock
  → IdentityEmailClaim FOR UPDATE
→ TenantAdmissionDecision FOR UPDATE
→ IdentityEmailClaim FOR UPDATE
→ при ISSUED_HOLD: immutable issue command
→ UserInvite FOR UPDATE
→ IdentityMailOutbox FOR UPDATE
→ gate links ORDER BY gateCode
→ gate attestations ORDER BY gateCode, id
→ entitlement rows ORDER BY module
→ re-read actual DB/release and exact shell; recompute both bindings
→ activation/outbox/decision writes
```

Gate/decision revocation не должна брать gate row перед tenant row. Поведение
revocation уже после activation и automatic suspend является отдельным
milestone.

## 8. Сквозной crypto/PostgreSQL contract

Отдельная real-PostgreSQL fixture выполняет:

```text
seal
→ begin short transaction
→ exactly one identity_owner_invite_issue_hold_v1 RPC
→ commit
→ read persisted outbox as migration owner
→ reconstruct exact AAD
→ open
```

Обязательные assertions:

- recovered token соответствует persisted `tokenHash`;
- reconstructed AAD совпадает byte-for-byte;
- wrong environment отклоняется;
- changed tenant/locator/invite/outbox/request/token-hash binding отклоняется;
- ciphertext/tag tamper отклоняется;
- issue RPC вызван ровно один раз;
- receipt/audit/log projection не содержат raw email, token, token hash или
  ciphertext;
- fixture требует explicit confirmation, PostgreSQL 16, loopback и dedicated
  `*_ci` source;
- source database не мигрируется и не используется для fixture DML;
- generated databases/roles/temp files удаляются в `finally`.

## 9. Acceptance evidence

Engineering checkpoint может быть принят только при одновременном выполнении:

1. clean `172/172` и populated `171→172`;
2. exact three-gate positive path;
3. missing/extra/duplicate/wrong-type gate rejection;
4. signature/key/purpose и подмена любого подписанного
   release/environment/schema/database claim отклоняются;
5. tenant/locator/subject/claim/execution/profile revision rejection;
6. expired/revoked/stale decision rejection;
7. profile boolean/window/digest drift rejection;
8. idempotent same-request replay и request-digest collision rejection;
9. hostile TABLE/FUNCTION/TYPE default ACL rollback/retry и отдельный
   column-ACL event-trigger injection rollback/retry;
10. zero application/PUBLIC privileges на новых relations/columns/functions;
11. runtime allowlist ровно `7`;
12. production root registry empty и production-like path fail-closed;
13. сквозной AES-GCM/PostgreSQL fixture;
14. exact release artifact verification;
15. полный local CI-equivalent и GitHub CI `3/3 PASS` exact SHA;
16. independent security review без P0/P1/P2.

Принятое exact-head evidence:

- migration SHA-256:
  `58f0ee03e49f64fe7a21562fc5c64f8741a270cafba2232ce99b732e9ea99bb0`;
- generated catalog file SHA-256:
  `4acc8b734c5de0990c09866bb7884fda67741b03a8b51278792c263167942685`;
- canonical catalog snapshot digest:
  `3f53d6aac9f48445e6bef5cbbdcdb6a4a21bc8f253ea59d3056be040e026eb3b`;
- catalog: `3` relations, `64` columns, `28` constraints, `14` indexes,
  `9` functions, `1` enum type / `3` labels, `3` user triggers и `16`
  referential triggers;
- local PostgreSQL 16: clean `172/172`, populated `171→172`, hostile
  TABLE/FUNCTION/TYPE/COLUMN ACL rollback/retry, create/issue/claim/revoke races,
  runtime allowlist `7`, zero generated database/role residue — `PASS`;
- separate API crypto/PostgreSQL integration `1/1 PASS`;
- ordinary `git archive`: `172/172`, migration и generated catalog
  byte-for-byte LF-stable;
- local application CI-equivalent: database TAP `240/240`, API full
  `2020 PASS + 2 todo`, web build `205/205`;
- independent security и CI-wiring review: P0/P1/P2=`0`;
- exact implementation
  `12d574166bffe860205b128dd9d092f4f54514fc`, GitHub CI
  [`30509157338`](https://github.com/boozik3412/leetplus/actions/runs/30509157338)
  (`run #53`) — `3/3 PASS`.

Принятие этого списка подтверждает только signed-claim provenance. Actual
current-context и actual-shell acquisition/recomputation/match остаются
отдельными незакрытыми критериями `BETA-IAM-004I`; без них issue, activation и
delivery запрещены.

## 10. Явно вне scope

В `BETA-IAM-004H` не входят:

- `PENDING` outbox enum/state;
- `HOLD→PENDING`;
- SMTP, mail worker, decrypt/lease/claim/retry;
- tenant activation/suspend/trial mutation;
- admission consumption;
- independently acquired actual DB/release/environment/schema/artifact/policy
  context и его domain-separated match;
- actual-shell proof: locked re-read ровно одного inactive `Store`, exact OWNER
  override/capability digest, provisioning audit/receipt и six-row entitlement
  state с domain-separated recomputation;
- HTTP controller/module/provider registration;
- production public-root enrollment;
- production-like acquisition/GO;
- production deployment;
- tester tenant/account/invite.

Даже принятый engineering checkpoint не разрешает выдать тестовый доступ.
Для этого по-прежнему нужны production-like evidence, Gate 1MT, Gate 2,
atomic `BETA-IAM-004I`, verified delivery и explicit `SHARED BETA GO`.
