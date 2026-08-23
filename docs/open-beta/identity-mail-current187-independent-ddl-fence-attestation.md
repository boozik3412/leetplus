# CURRENT187-D: независимая attestation технического DDL fence

Дата фиксации: 05.08.2026.

Статус: `IMPLEMENTED / DENY-ONLY / SYNTHETIC-CI-ONLY / NONCANONICAL / NOT_DEPLOYABLE`.

Этот slice не изменяет production, текущую сеть `Tenant A/A1..A4`, внешний
tester, tenant, account, password или invite. Он не выдаёт тестовый доступ и
не исполняет SQL/DDL.

## Задача

CURRENT187-C умеет получить полный read-only snapshot PostgreSQL-кластера, но
получает DDL fence только как `DECLARED_UNVERIFIED`. CURRENT187-D вводит
отдельную Ed25519 authority, которая подтверждает ровно тот fence, под которым
были получены конкретный acquisition и финальный snapshot.

Authority отделена от application admission и scanner:

- отдельные `purpose`, `profile` и `trustDomain`;
- отдельный signing key и проверка, что его fingerprint не совпадает с
  application authority либо scanner binding;
- production root registry frozen-empty и не имеет runtime setter, env/config
  enrollment path;
- synthetic roots принимаются только в exact `NODE_ENV=test`, `environment=ci`,
  loopback и БД с суффиксом `_ci|_test`;
- verifier не импортирует PostgreSQL, Prisma, Nest, filesystem, network,
  provider или SMTP-клиент.

## Что подписывается

Canonical payload связывает одной подписью:

- `acquisitionDigest` исходного branded CURRENT187-C receipt;
- `clusterIdentityDigest`, expected и final database-universe digests;
- digest и timestamp финального catalog snapshot;
- `inventoryPlanDigest`;
- fence evidence/state digests, epoch и точное validity window;
- application-authority fingerprint и scanner-role binding digest;
- release SHA, immutable artifact digest, attestor artifact digest;
- release-policy identifier и digest;
- UUID operation, SHA-256 nonce, issue time и максимум двухминутный expiry.

Fence window ограничен 30 минутами, expected/final universe обязаны совпадать,
а подпись должна быть выпущена не позднее 30 секунд после финального snapshot.

Payload/envelope/root/context являются exact data-only records. Extra/missing
key, getter, proxy, symbol, custom prototype, неканонический timestamp,
zero-digest, fingerprint/key mismatch или изменённая подпись отклоняются.

## Replay и lost response

Synthetic verifier создаётся как ограниченная process-local session:

- byte-exact повтор того же envelope возвращает тот же immutable receipt;
- тот же `operationId` либо `nonce` с другим envelope отклоняется;
- кеш ограничен 1024 envelope и при переполнении fail-closed;
- повтор после expiry отклоняется даже при наличии кеша.

Это не persisted one-time consumption. Receipt честно сохраняет
`persistedConsumptionVerified=false`. Межпроцессный replay, revocation и
lost-response recovery должны быть закрыты отдельным append-only PostgreSQL
ledger до production enrollment/deploy GO.

## Интеграция B/C

Новый receipt нельзя заменить caller boolean.

1. CURRENT187-C возвращает branded acquisition с
   `externalDdlFenceAttested=false`.
2. Независимый verifier проверяет signature, expiry, root, exact binding и
   выдаёт WeakSet-branded deny-only receipt.
3. Planner принимает только этот brand и сравнивает acquisition, cluster,
   universe, final snapshot, plan и fence поля byte-exact.
4. C создаёт новый immutable receipt с predecessor
   `preAttestationAcquisitionDigest`; исходный acquisition не изменяется.
5. Только у нового B/C receipt значение `externalDdlFenceAttested=true`.

Даже после успешной attestation неизменно:

```text
authorization=false
canApply=false
canMutate=false
canSend=false
testAccessAuthorized=false
sharedBetaAccess=false
productionRootEnrolled=false
persistedConsumptionVerified=false
```

## Проверки

Локальный gate:

```bash
pnpm --filter database check:identity-mail-ddl-fence-attestation-current187
```

Hostile matrix проверяет happy path, exact replay, operation/nonce conflict,
acquisition/final-snapshot/universe/fence/release/policy mutation, expiry,
future/overlong envelope, inactive root, remote/production/system-DB context,
purpose confusion, application/scanner key alias, exact-shape attacks,
brand loss у clone, secret-free receipt и отсутствие I/O. CURRENT187-C gate
дополнительно проверяет полный путь `acquire -> sign/verify -> attach`.

## Что остаётся до Engineering Green

CURRENT187-D закрывает только независимую техническую подпись fence evidence.
Он не доказывает persisted replay/revocation, HBA/TLS/pooler/service-account
mapping, hostile concurrent topology, production root enrollment, runtime
grants/attestation, provider mark/complete lost-response, apply/rollback/
zero-diff rehearsal или `SHARED BETA GO`.

До закрытия этих gates внешний тестовый доступ остаётся `NO-GO`.
