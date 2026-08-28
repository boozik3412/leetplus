# CURRENT_187 → CURRENT_188 production upgrade controller

Статус: **production candidate; effect только после отдельного exact-SHA GO**

Актуально на: **28.08.2026**

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
действия плана завершает команду `BLOCKED_MANUAL` до effect.

## Обязательные свойства

- source и target migration manifests строятся из exact Prisma bytes admitted
  release artifact;
- artifact, release SHA и materialized-tree digest связаны production manifest;
- approval — detached Ed25519 signature короткоживущего exact plan digest;
- публичный ключ связан manifest, а его SPKI SHA-256 независимо передаётся через
  protected environment;
- PostgreSQL advisory lock удерживается от повторной live-проверки до final
  postcheck;
- каждая effect phase записывается в exclusive append-only fsynced JSONL journal;
- ambiguous response повторяется не более одного раза и только если БД всё ещё
  находится в точном source state; partial state всегда блокируется;
- lost success восстанавливается только после полного exact `CURRENT_188`
  postcheck;
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
2. `plan` — повторная read-only проверка и exclusive запись short-lived plan;
3. `approve` — подпись plan на доверенной operator-машине без подключения к БД;
4. `apply` — exact digest confirmation, independent key pin, lock, bounded
   deploy и durable phase journal;
5. `check` — exact final verification; повторный `apply` также обязан вернуть
   zero-effect recovered result.

Для всех DB-режимов кроме `approve` нужны:

```text
FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_DATABASE_URL=<loopback migration role URL with one exact SET ROLE>
FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRM=I_ACCEPT_EXACT_PRODUCTION_HISTORY_187_TO_188_V1
FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_APPROVAL_KEY_SPKI_SHA256=<independent pin>
```

Manifest и generated plan/approval/journal должны находиться в отдельном
root-controlled каталоге вне checkout и release tree. URL, private key и secrets
не входят в repository, artifact, stdout или journal.

## Rollout и rollback

Controller запускается только после backup + restored-copy lifecycle и первого
cutover на exact bridge slot с `GUEST_BUG_REPORTING_MODE=OFF`. После успешного
apply active bridge обязан пройти readiness уже на `188/188`; если этого нет,
второй slot и LIVE не запускаются.

После schema upgrade старый `CURRENT_187` runtime больше не является допустимым
rollback target. HTTP rollback выполняется на первый bridge slot того же SHA,
который уже подтвердил exact `CURRENT_188`. Schema rollback не выполняется:
миграция additive, а runtime kill switch отключает создание новых обращений.

## Проверки admission

```bash
pnpm --filter database check:founder-pilot-current188-production-upgrade
pnpm --filter database test:integration:founder-pilot-current188-production-upgrade:pg
```

Вторая команда исполняется Full Release Admission на PostgreSQL 16 и проверяет
реальный `187 -> 188`, exact catalog, replay и cleanup изолированной БД/ролей.
