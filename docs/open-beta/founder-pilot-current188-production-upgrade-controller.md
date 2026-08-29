# CURRENT_187 → CURRENT_188 production upgrade controller

Статус: **production candidate; effect только после отдельного exact-SHA GO**

Актуально на: **29.08.2026**

> Этот strict V3 controller остаётся каноническим для базы с единым
> checksum-pinned migration owner. Фактическая production-база 29.08.2026 имеет
> подтверждённую mixed-owner topology и поэтому правильно блокируется этим
> controller до effect. Для одного exact production перехода используется
> отдельный
> [legacy mixed-owner controller](./founder-pilot-current188-legacy-mixed-owner-upgrade-controller.md);
> он не ослабляет и не заменяет strict-контракт для других баз.

## Назначение

Controller переводит только фактически наблюдаемую production-history форму
`187 applied / 4 rolled back / 0 unfinished` с head
`20260820010000_guest_portal_telegram_update_ledger` в `CURRENT_188`. Единственный
разрешённый effect — `prisma migrate deploy` по материализованной immutable lane,
где новым migration directory является
`20260828190000_guest_support_bug_reports` с SHA-256
`c40d5eeb84cc980053af48b56385bf48882ee355aec718a442dab855ea33eb9b`.

Это не универсальный migration runner. Любое расхождение source identity,
истории, checksum, role topology, artifact digest, плана, подписи или времени
действия плана, active cutover или bridge runtime завершает команду
`BLOCKED_MANUAL` до effect.

## Обязательные свойства

- source и target migration manifests строятся из exact Prisma bytes admitted
  release artifact;
- artifact, release SHA и materialized-tree digest связаны production manifest;
- approval — detached Ed25519 signature короткоживущего exact plan digest;
- публичный ключ связан manifest, а его SPKI SHA-256 независимо передаётся через
  protected environment;
- `plan` разрешён только после accepted dual-slot bridge-cutover. Controller
  под root-owned blue/green lock проверяет latest receipt/index,
  `CONSUMED=false`, отсутствие cutover/slot-link pending intent, active nginx
  slot и отдельный rollback slot;
- active и rollback обязаны быть запущены, иметь разные slot identity и
  target-188 release provenance. Для каждого закрепляются exact release
  symlink, hydration и slot-link receipts, API/Web systemd unit + invocation,
  protected environment digests, Web build identity, exact SHA-256 bytes
  migration `c40d5eeb…` и loopback authenticated read-smoke. Active
  production-control generation обязана принадлежать тому же release SHA,
  который исполняет controller;
- оба source bridge slot обязаны быть `COMBINED`,
  `GUEST_BUG_REPORTING_MODE=OFF`,
  `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_187` и публиковать exact
  compatibility `CURRENT_187 -> CURRENT_188`. Cutover receipt обязан честно
  закреплять предыдущий target-188 release, а не старый CURRENT_187 artifact.
  Полная `DUAL_BRIDGE_N_MINUS_ONE` attestation вместе с database system
  identity входит в подписываемый plan;
- `apply` повторно берёт cutover lock, сверяет attestation byte-for-byte и
  удерживает lock до postcheck. Поэтому routing/cutover не может измениться
  между последней проверкой и schema effect;
- тот же runtime authority lock одновременно и в каноническом порядке удерживает
  `/run/leetplus-production-control/install.lock`; installed control generation,
  verifier и unit bytes нельзя заменить между финальной dual-slot attestation,
  DDL и post-effect проверкой;
- PostgreSQL advisory lock удерживается от повторной live-проверки до final
  postcheck;
- каждая effect phase записывается в exclusive append-only fsynced JSONL journal;
- ambiguous response повторяется не более одного раза и только если БД всё ещё
  находится в точном source state; partial state всегда блокируется;
- lost success восстанавливается только после полного exact `CURRENT_188`
  postcheck;
- final postcheck требует тот же accepted cutover, active и rollback release,
  receipts, invocations, production-control и authenticated smoke; оба slot
  должны показать live readiness `CURRENT_188/188` без compatibility evidence.
  Только database success недостаточен;
- postcheck проверяет migration history, runtime-role fingerprint, identity-mail
  worker digest, четыре support tables, два enum, весь список indexes/
  constraints и отсутствие PUBLIC table/function privileges.

## Команды

Исполняемые файлы берутся только из проверенного runtime release artifact:

```bash
node packages/database/scripts/founder-pilot-current188-production-upgrade.cli.mjs --help
```

Последовательность режимов:

1. `inventory` — read-only проверка source state;
2. `plan` — повторная read-only проверка database и уже активного bridge,
   удержание cutover lock на время snapshot и exclusive запись short-lived
   plan;
3. `approve` — подпись plan на доверенной operator-машине без подключения к БД;
4. `apply` — exact digest confirmation, independent key pin, lock, bounded
   deploy и durable phase journal;
5. `check` — exact final verification; повторный `apply` также обязан вернуть
   zero-effect recovered result.

Для всех DB-режимов кроме `approve` нужны:

```text
FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_DATABASE_URL=<loopback migration role URL with one exact SET ROLE>
FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRM=I_ACCEPT_EXACT_PRODUCTION_HISTORY_187_TO_188_V3
FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_APPROVAL_KEY_SPKI_SHA256=<independent pin>
```

Manifest и generated plan/approval/journal должны находиться в отдельном
root-controlled каталоге вне checkout и release tree. URL, private key и secrets
не входят в repository, artifact, stdout или journal.

## Rollout и rollback

Controller запускается только после backup + restored-copy lifecycle и
dual-slot cutover на два независимо admitted target-188 release artifact с
`GUEST_BUG_REPORTING_MODE=OFF`. До DDL controller повторно сверяет оба slot под
тем же lock. После успешного apply active и rollback bridge обязаны пройти
readiness уже на `188/188`; это проверяет сам controller до successful result.
Если postcheck не пройден, reporting LIVE не включается.

Старый `CURRENT_187` runtime удаляется из rollback authority до schema effect.
После upgrade HTTP rollback выполняется только на уже аттестованный rollback
bridge slot, который также подтвердил exact `CURRENT_188`. Schema rollback не
выполняется: миграция additive, а runtime kill switch отключает создание новых
обращений.

## Проверки admission

```bash
pnpm --filter database check:founder-pilot-current188-production-upgrade
pnpm --filter database test:integration:founder-pilot-current188-production-upgrade:pg
```

Вторая команда исполняется Full Release Admission на PostgreSQL 16 и проверяет
реальный `187 -> 188`, exact catalog, replay и cleanup изолированной БД/ролей.
Её in-process bridge fixture проверяет cryptographic plan binding, но не является
production attestation или способом обойти root-owned live checks CLI.
