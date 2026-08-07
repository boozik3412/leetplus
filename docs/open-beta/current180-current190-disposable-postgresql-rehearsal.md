# CURRENT180–CURRENT190: disposable PostgreSQL rehearsal

## Статус

`LOCAL DISPOSABLE REHEARSAL ACCEPTED / PRODUCTION DENIED / SHARED BETA NO-GO`.

Этот контур предназначен только для воспроизводимой проверки объединённого
release `CURRENT180..CURRENT190` на отдельной одноразовой базе PostgreSQL 16.
Он не разрешает production deployment, изменение canonical migration chain,
создание внешнего tenant, учётной записи тестера или отправку OWNER invite.

Production и действующая сеть остаются без изменений:

- production head — `CURRENT179/179`;
- четыре действующих клуба — `Store A1..A4` одного `Tenant A`;
- будущий внешний клуб должен создаваться отдельно как `Tenant B/Store B1`;
- initial OWNER получает mailbox-bound activation и сам задаёт пароль;
- SMTP, Telegram и unattended Langame sync до отдельного GO остаются выключены.

## Задача rehearsal

Rehearsal должен доказать один полный управляемый цикл:

1. Зафиксировать exact source `leetplus_current179_ci` и доказать отсутствие
   незавершённых/rolled-back миграций, посторонних сессий и successor state.
2. Создать из source одноразовую закрытую базу с уникальным run token.
3. Привязать её `name + OID + owner + ownership marker` к одному запуску.
4. Материализовать exact immutable release artifact из `190` миграций.
5. Применить `CURRENT180..CURRENT190`, проверить точные Prisma receipts и
   semantic fingerprint.
6. Повторить deploy и доказать zero-diff.
7. Закрыть базу, вернуть временное имя, удалить только доказанно принадлежащий
   запуску объект и подтвердить отсутствие residue.
8. Повторно проверить, что source не изменился.

Любая неоднозначность переводит запуск в `BLOCKED`, `RECOVERY` или
`FAILED_CLEAN`; она не может быть преобразована в успех одним локальным
receipt или публично пересчитанным SHA-256.

## Слои и границы полномочий

| Слой                              | Текущее состояние                     | Что доказывает                                                                                                         | Чего не разрешает                                                           |
| --------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Release blocker/planner/refreeze  | Принят локально                       | exact source/candidate bytes, порядок и immutable proposal                                                             | assembly, DB access, deploy                                                 |
| In-memory assembler               | `21/21 PASS`                          | immutable 192-entry artifact: schema, lock, 190 migrations                                                             | filesystem materialization, process spawn, DB apply                         |
| Planning contract/state-machine   | `33/33 PASS`                          | exact local URL/env/GUC/prefix pins, lifecycle и fail-closed reconciliation                                            | process spawn, DB connection/mutation, deploy                               |
| Pure SQL contract                 | `26/26 PASS`                          | fixed read-only queries, exhaustive catalog/fingerprint scope и bounded DDL specs                                      | выполнение SQL или признание caller rows доказанными                        |
| Persistent coordinator trust root | `6/6 PASS`, scoped review P0/P1=`0`   | внешний Ed25519 root связывает authorization, run token, journal и artifact recovery                                   | DB/process/deploy authority; ключ сам по себе не разрешает effect           |
| System-temp materializer          | `24/24 PASS`, restart recovery принят | exact bounded reads, bytes/tree/inode provenance, signed locator и fresh one-shot runner receipt                       | process spawn, DB connection/apply или удаление неподтверждённого дерева    |
| Authenticated durable journal     | `24/24 PASS`, scoped review P0/P1=`0` | coordinator-anchored signed chain, public-only restart verification, discovery, cleanup и lost-response proof          | самостоятельное разрешение DDL/deploy                                       |
| Runtime adapter                   | `27/27 PASS`                          | pinned Node/Prisma/schema inode, isolated child env, source read-only, session lock и cleanup                          | эффект без fresh journal-bound runner request                               |
| Effectful runner/janitor          | `14/14 PASS`, crash path принят       | fresh intent перед effect, bounded reconciliation, exact lock receipt и `TARGET_ABSENT`-only signed filesystem cleanup | production, произвольный target или восстановление DB authority после crash |

Финальный независимый latest-byte аудит всего контура после PostgreSQL syntax
preflight: `P0=0`, `P1=0`.

## Закреплённая локальная среда

Разрешён только отдельный локальный rehearsal profile:

- PostgreSQL `16.x`;
- endpoint `127.0.0.1:55432`;
- source database `leetplus_current179_ci`;
- source/maintenance role `postgres` с подтверждённым owner parity;
- `NODE_ENV=test`;
- exact explicit confirmation из planning contract;
- никакого наследования ambient `DATABASE_URL`, `PG*`, secret env, `PATH`,
  shell или production discriminator.

Read-only preflight и два accepted run 07.08.2026 подтвердили PostgreSQL `16.13`, exact
`CURRENT179/179`, нулевые unfinished/rolled-back rows, нулевой successor state,
owner parity четырёх обязательных relations и
`identity_email_claim_lock_v1`. Это только входное доказательство и не является
разрешением на мутацию.

## Coordinator trust root

Journal signer больше не может самостоятельно объявить собственный origin
доверенным. Каждый запуск обязан получить binding от отдельного file-backed
Ed25519 coordinator. Binding одновременно содержит exact planning
authorization digest и journal run token, а coordinator anchors отдельно
подписывают journal root и materializer recovery manifest.

Ключи создаются только в новом каталоге вне repository и system temp; существующие
файлы никогда не перезаписываются. Приватный DER не печатается. На POSIX
приватный файл обязан быть закрыт для group/other. Команда локальной генерации:

```powershell
node packages/database/scripts/current180-current190-disposable-postgresql-rehearsal-coordinator-keygen.cli.mjs `
  --output-dir "C:\absolute\operator-owned\leetplus-rehearsal-coordinator" `
  --confirm generate-current180-current190-disposable-rehearsal-coordinator
```

Receipt содержит только пути, public SHA-256 и digest операции. Этот trust root
явно публикует `executionAuthority=false`, `productionApplyAuthorized=false` и
не является production deploy key.

После прохождения всех локальных gates один цикл запускается только через CLI
с шестью явными flag/value pairs; ambient `DATABASE_URL`, `PG*`, `PATH` и secret
environment в runner input не копируются:

```powershell
pnpm --filter database current180-current190:run-disposable-postgresql-rehearsal -- `
  --attempt 1 `
  --source-url "postgresql://postgres@127.0.0.1:55432/leetplus_current179_ci?schema=public" `
  --coordinator-private "C:\absolute\operator-owned\coordinator-private.pk8" `
  --coordinator-public "C:\absolute\operator-owned\coordinator-public.spki" `
  --coordinator-sha256 "<64 lowercase hex>" `
  --confirm run-current180-current190-disposable-postgresql16-rehearsal
```

`--attempt` принимает только `1` или `2`. Второй принятый цикл должен быть новым
запуском с новым run token, а не replay receipt первого. CLI печатает bounded
PII-free runner receipt либо bounded fail-closed diagnostic без URL и key bytes.

## Обязательная последовательность runner’а

Ручной обход отдельно проверенного effectful runner запрещён. Принятый runner
реализует следующую последовательность:

1. Создать свежий journal signer; run token должен быть криптографически связан
   с fingerprint его публичного ключа.
2. Получить planning receipt и initial durable journal record.
3. Зафиксировать absolute executable identity, isolated child environment и
   fresh materializer verification.
4. Выполнить source/maintenance read-only preflight и сохранить его digest в
   журнале.
5. Перед каждой `CREATE`, `COMMENT`, `ALLOW_CONNECTIONS`, `RENAME` или `DROP`
   заново выполнить exhaustive catalog query по обоим именам, expected OID,
   marker и обоим attempt ownership markers. Crash admission дополнительно
   ищет exact anchored marker любого предыдущего rehearsal run.
6. До выдачи команды записать и `fsync` intent; после возможного lost response
   сначала reconcile catalog state и только затем решить, допустим ли retry.
7. Не выполнять `prisma migrate resolve`, не писать напрямую в
   `_prisma_migrations` и не продолжать после unfinished/rolled-back receipt.
8. Использовать materialization receipt только для cleanup; перед процессом
   требовать самый свежий module-branded whole-tree verification receipt.
9. После любой ошибки с подтверждённым ownership закрыть подключения, удалить
   только exact `name + OID + owner + marker`; при неполной идентичности оставить
   объект на manual inspection.
10. Считать цикл завершённым только после отсутствия обеих run-token баз,
    fresh equality source fingerprint с подписанным `SOURCE_ZERO_DIFF_VERIFIED`,
    закрытого журнала и нулевого signed artifact/journal residue.

## Lost response и восстановление

- `CREATE` без подтверждённого marker — особый provisional recovery path.
  Нельзя угадывать, создалась ли база: требуется exhaustive cluster snapshot.
- После marker ownership определяется одновременно именем, OID, owner и exact
  marker. Совпадения только имени недостаточно.
- Admission ищет не только derived names и markers текущего запуска, но и любой
  exact `LEETPLUS_CURRENT180190_REHEARSAL_V1:<64 lowercase hex>` marker. Поэтому
  переименованная база предыдущего run не может стать невидимым residue.
- Rename/allow/drop повторяются только когда fresh reconciliation доказал, что
  предыдущая команда не была зафиксирована и retry безопасен.
- Crash не превращает process-local module brand в durable authority. Journal
  можно заново проверить только через тот же persistent coordinator root.
  Materializer может rehydrate только дерево, которое совпало с coordinator-
  signed manifest по root identity, путям, inode/file identity и bytes. Новая
  DB mutation после restart всё равно требует отдельного recovery admission.
- Подмена дерева, symlink/junction, лишний файл, byte drift или identity drift
  запрещают автоматическую очистку.
- Lost response при unlink/rmdir сверяется с fresh exact tree. Отсутствующий
  ранее подписанный объект допускается как уже удалённый; новый, заменённый или
  неподписанный объект переводит cleanup в manual evidence-preservation.
- Если coordinator anchor уже удалён, а удаление root не доказано, пустой root
  не считается автоматически принадлежащим запуску: он остаётся для ручной
  проверки.
- Source zero-diff включает cluster-global role attributes, password-verifier
  hashes и role memberships. Target DROP не может скрыть переживший его
  `CREATE/ALTER ROLE` или `GRANT`.

### Граница crash recovery

Есть два разных режима, которые нельзя смешивать:

1. **Filesystem-only recovery.** После reload того же coordinator допустимы
   discovery, verify, rehydrate и продолжение удаления только подписанного
   materializer artifact.
2. **Database recovery.** Новый процесс сначала проверяет coordinator-anchored
   journal и выполняет exhaustive read-only catalog inspection. Если база
   отсутствует, можно завершить только безопасный filesystem cleanup. Если
   exact-owned либо неоднозначная база присутствует, runner возвращает
   подписанный `BLOCKED_MANUAL_*` plan и не выполняет DDL. Отдельная human-
   approved recovery authority пока не реализована.

Это осознанная fail-closed граница: наличие persistent coordinator доказывает
provenance, но не восстанавливает потерянный process-local journal append key.

## Условия и результат локального apply

Первый DDL допустим только после одновременного выполнения всех условий:

- planning contract, SQL contract и materializer приняты независимым review;
- authenticated durable journal и verifier зелёные;
- coordinator keys загружены из canonical non-temp/non-repository paths, public
  fingerprint закреплён оператором и key bytes повторно проверены перед подписью;
- effectful runner имеет отдельную execution authority и не принимает
  planning/materializer/SQL receipt как замену;
- абсолютные executable paths и их hashes закреплены;
- runner имеет lost-response tests для каждого DDL transition;
- до запуска и после него доказан zero residue;
- команда остаётся привязана только к loopback PostgreSQL и source
  `leetplus_current179_ci`.

Все эти условия выполнены локально 07.08.2026. Два независимых цикла
`apply → repeat/zero-diff → rollback/drop` приняты:

| Attempt | Run token                          | Source fingerprint                                                 | Runner receipt digest                                              | Результат                |
| ------: | ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------ |
|       1 | `05c5990b42918ec8e9d7fb26ad44089c` | `03e04ef19ad731c5eb4f66977a4572db4da655278b84dce00d7565075bb7357b` | `49f22f51e8bb72d716e50381dbbd52b08005c2525d7ea7ce2efe08cca2573d07` | `ZERO_DIFF_ZERO_RESIDUE` |
|       2 | `c5a0bc6fc2f2ede68d4326c7fd2b6be2` | `03e04ef19ad731c5eb4f66977a4572db4da655278b84dce00d7565075bb7357b` | `fd142b051b7eea56ff2683259adff14fb77c858d4d03ae964c95e85655119aee` | `ZERO_DIFF_ZERO_RESIDUE` |

Общие evidence pins: authorization receipt
`5a1dac1e4543003f878cff428cc146c54d46b6fdd86e4c246e9b74b080303149`,
runtime digest
`ffd3710c20b4a152853b46ea25f3d0a4ad3981e8d1bc3a36aa82af52b6e86432`
и coordinator SHA-256
`88817db52723af831daca30c00deca03a22158da1e3909a00df4ce384b6e0138`.
Audit-chain digests: attempt 1 —
`1a0d96c25abbd3fc664eac480e6a275845b6242c138ff1fdd70a57897a77b7df`,
attempt 2 —
`0d37bc205b6588364e36bab3746637801c53c855b23142db7a9c222a01e2924b`.

Оба receipt дополнительно подтверждают `targetAbsentVerified=true`,
`artifactRootAbsent=true` и `journalRootAbsent=true`. После каждого запуска
source оставался на `179` completed migrations с head
`20260731120000_identity_mail_delivery_release_head`, без unfinished/rolled-back
rows. Полный последовательный gate перед apply: `163` test executions, `0`
failures. Следующий рубеж — rehearsal на восстановленной production-like копии,
а не production deployment.

Финальный postflight отдельно подтвердил `0` target/marker databases и
неизменный source `179/0`. В выделенном task temp остался один обычный
не-reparse каталог Prisma `jiti` с `0` children: host safety guard запретил его
нерекурсивное удаление. Это не journal/materializer evidence и не входит в
подписанный zero-residue claim. Восемь pre-coordinator roots от 06.08 сохранены
в default OS temp как legacy evidence и намеренно не удалялись.

## Текущий порядок приёмки

1. Зафиксировать exact candidate commit SHA и воспроизводимый CI artifact для
   уже принятого coordinator/journal/materializer/runner/runtime/SQL набора.
2. Завершить canonical CURRENT180–190 promotion и exact runtime
   roles/grants/attestation без расширения production authority.
3. Выполнить signed restored-copy production-like apply/repeat/rollback/zero-diff
   rehearsal с backup/restore и emergency-stop evidence.
4. Только после отдельного deploy GO выполнить controlled canary, затем Gate 2
   на `Tenant A/A1..A4` и internal alpha.
5. Выдавать `Tenant B/Store B1` OWNER invite только после отдельного persisted
   `SHARED BETA GO`.

## Влияние на внешний тестовый доступ

Этот этап закрывает только release/runtime foundation. Даже успешный локальный
rehearsal сам по себе не создаёт тестера. До приглашения `Tenant B/Store B1`
также обязательны canonical promotion, runtime roles/grants/attestation,
production-like restored-copy rehearsal, controlled cutover `Tenant A/A1..A4`,
стабильный internal alpha и отдельный persisted `SHARED BETA GO`.
