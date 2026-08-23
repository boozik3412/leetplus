# Controlled Beta-1: acceptance evidence для release `f4e8d79d…`

Дата: 21.08.2026.

Статус: `ARTIFACT + RESTORED-COPY + ACTUAL CRASH/LOST-RESPONSE ACCEPTED / N-1 OFFLINE COMPATIBILITY ONLY / SAFE HOT ROLLBACK PENDING / PRODUCTION CANARY NOT EXECUTED / EXTERNAL INVITE NO-GO`.

Этот документ фиксирует локальную production-like репетицию exact release
artifact. Он не является разрешением на production migration, runtime switch
или OWNER invite. Production API, Web, PostgreSQL, systemd, nginx, deploy timer,
четыре текущих клуба и outbound во время репетиции не изменялись.

Operator-local evidence содержит `51` indexed regular file; private rehearsal
key намеренно исключён из переносимого индекса. Index SHA-256:
`177faf4d44ee99fc89f7d4ebee161b12b9baedf54c095dcd685c344aa98ff9b8`.

## Exact release provenance

- release SHA: `f4e8d79dadaa62734d045c7ae0b203f618d680b7`;
- Fast CI: [`32420934305`](https://github.com/boozik3412/leetplus/actions/runs/32420934305), `2/2 SUCCESS`;
- Full Release Admission:
  [`32421266035`](https://github.com/boozik3412/leetplus/actions/runs/32421266035), `4/4 SUCCESS`;
- artifact ID: `9426096697`;
- artifact name:
  `leetplus-release-f4e8d79dadaa62734d045c7ae0b203f618d680b7`;
- raw `tar.gz`: `28 597 317` bytes;
- raw archive SHA-256:
  `9f77c15fd4b5bbdc42bc360c5dbdb9f34f66d40a00fcbbe159aaed7ff144d392`;
- materialized Prisma tree:
  `31c526a555f6a15d52f5e4d7b50697a2fee93c742a7ef76ab7d31dab8e475ba2`.

Source Prisma bytes брались только из fresh extraction raw artifact. Windows
working-tree bytes с CRLF не использовались как deploy source.

## Restored-copy normal path

На отдельном loopback PostgreSQL `16.15` exact backup copy прошла:

1. source admission `153 applied / 4 rolled back / 0 unfinished`;
2. exact inventory четырёх stale `ReportDigestScheduleRun`;
3. DB-bound plan и detached Ed25519 approval;
4. reconciliation ровно четырёх строк;
5. materialized Prisma deploy всех `34` pending migrations;
6. второй deploy с zero pending;
7. independent check `187 applied / 4 rolled back / 0 unfinished`.

Финальные pins:

- preterminal manifest:
  `094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b`;
- worker function:
  `a7dd17037ceaccb294953dce145e0fcc589fb2646962db724d919c24ba87c53c`;
- ownership mismatch `pg_class / pg_proc / pg_type`: `0 / 0 / 0`.

Rehearsal signing key был создан только для disposable local evidence. Его
нельзя копировать или повторно использовать в production.

## Фактический crash и lost-response replay

Отдельная fresh clone снова началась с `153/4/0` и четырёх исходных stale
rows. Для неё выпущены новый target-bound plan
`a4e431427878922decd2b8a76fe6aeeb2f0e9941d69d0addc5d92022f9e56fa1`
и отдельная approval.

Выполнены три процесса:

1. Controller был принудительно завершён после fsync
   `RECONCILIATION_VERIFIED + PRISMA_DEPLOY_INTENT_DURABLE`, но до запуска
   реального Prisma. После kill база осталась `153/4/0`, controller sessions
   равнялись нулю, reconciliation marker был применён ровно к четырём строкам.
2. Новый процесс зафиксировал `DURABLE_RECONCILIATION_RESUME_VERIFIED`, не
   повторил DML, выполнил реальный Prisma deploy и получил намеренно
   неоднозначный child response уже после завершения deploy. Journal содержит
   `PRISMA_DEPLOY_RESPONSE_AMBIGUOUS`, затем fresh catalog check подтвердил
   `FINAL_187_VERIFIED`.
3. Ещё один fresh process вернулся с `deploymentAttempt=0`,
   `reconciliationRecovered=true`; ни reconciliation, ни deploy не были
   повторены.

Все три NDJSON journal имеют непрерывную SHA-256 hash chain. Их file SHA-256:

- crash-before-deploy:
  `ca8160a4392a0002e69993f8fb99cb423a0b745ab76750014bd191982fc0963f`;
- ambiguous-after-real-deploy:
  `b5e7d9c27c1dbd8b6286ce96846609e8e8b51dac0e847e956736e2dd6a7afec3`;
- restart-on-final-state:
  `7b0446bb69d1e74d82672164b9e6ea1a99e174905a27f594f6b7dae0d0c63f7a`.

Независимый final check подтвердил `187/4/0`, четыре reconciled rows, ноль
controller/other sessions, ноль unfinished transactions и ownership mismatch
`0/0/0`. Business aggregate по tenant/store/user/product/sales/guest/staff
до и после migration совпал; projection digest:
`d6e7292ca74a4e3d56cb84c9537dbe6f915037be2b21364147bcef0343a7b472`.
Disposable crash DB после запечатывания evidence удалена; source DB и
filesystem evidence сохранены.

## N−1 application и scheduler compatibility

Exact legacy SHA `7de04ff4ccc814494810730be3fa6bf661097b07` на migrated
schema `187/4/0` прошёл API smoke:

- health, login, auth/me;
- stores, assortment, staff checklists/knowledge, communications,
  gamification, users/roles;
- reversible checklist create/delete;
- `12` HTTP steps, fixture residue `0`;
- evidence digest:
  `22a419cd813796f4470ef67ab53d85b2ff45bb6811541f7550367558771e24ba`.

Отдельная scheduler clone прошла все шесть legacy scheduler families, final
health `200` и reviewed aggregate DB diff; evidence digest:
`c5ccebd372dff784473aed7ecafff3af3969329568e703507d94a09020d8a7fd`.
Результат намеренно содержит `authorizesHotSchedulerRollback=false` и
`requiresProductionDrain=true`. Обе N−1 clones удалены; exact catalog absence
зафиксирован отдельным aggregate receipt.

Этот результат доказывает только offline schema/API/scheduler compatibility.
Последующий source audit exact `7de04ff4…` обнаружил публичные B2B reads через
`OptionalJwtAuthGuard` и fallback tenant `demo` (`stores`, `products`,
`dashboard`, `categories`, `suppliers`). Поэтому direct public upstream на
legacy API и прежний hot-rollback receipt запрещены. Новый admission contour
обязан держать неизменённый legacy child только на отдельном loopback port за
пинованным auth-edge: публичны ровно `GET /health` и `POST /auth/login`, а любой
другой запрос проходит uncached bounded `/auth/me` introspection тем же Bearer.
До independent audit и Linux CI этого edge-контракта safe hot rollback остаётся
`PENDING`, даже если старый offline smoke был `PASS`.

## Current release `N=f4` runtime

Raw migrated restored-copy правильно завершилась fail-closed до runtime:
в tenant текущей сети обнаружено `5` active legacy users с
`accessScope=NULL`. Aggregate-only blocker receipt имеет reason
`CURRENT_RELEASE_ACTIVE_SCOPE_UNRESOLVED`, HMAC evidence digest
`2c50831a58e922350139929c5fcaa2e7ce041be8bbe2b235e1d1a65acaa03b20`
и file SHA-256
`21b567bcb238832fe3e7965c84ebae3d522b04e84c8774a2fb3aa2ded1d7cd0f`.
PII, email, user ID и credentials в receipt отсутствуют.

Для ранней диагностики binary/runtime была создана disposable clone. Только
на ней пять строк получили test-only `NETWORK`; source restored-copy не
менялась. Exact f4 API/Web затем прошли `31` probe:

- API `/version` и `/health/ready`, dynamic Web release identity;
- Web BFF login/auth-me;
- `24` authenticated critical reads по разрешённым beta-модулям;
- reversible create/delete с residue `0` и без direct SQL cleanup;
- network block, secret leak и output overflow: `false`.

Диагностический Signed/HMAC-verified digest:
`9f49d155208352e48ef6e638474621917b4395589d88bf0efab7c06a5ab6cc58`;
receipt file SHA-256:
`b46dd5db6f1fe9f3acc45c7bd7980cd17560dc0d9a4605a66985acb4d2c8946d`.
Classified clone после acceptance удалена; disposal receipt SHA-256:
`ac41a7d0cfc557734a1259fffac8773cc8f9cf59ebf8780bd13bbf4cfe811676`.

Последующий independent audit обнаружил, что этот Windows запуск не доказывал
полное `HYDRATED_SHA256SUMS`-покрытие Next/runtime tree, kernel-enforced
no-egress, exact DB runtime-role/ownership и final cgroup/session drain. Поэтому
результат теперь имеет статус `SUPERSEDED_DIAGNOSTIC`, а не acceptance PASS.
Новый harness fail-closed требует root-sealed full hydrated manifest,
непривилегированный Linux systemd cgroup с живым kernel deny probe, exact role
attestation, semantic JSON projections и zero-residue process/cgroup/port/DB
drain. Этот hardened запуск ещё `PENDING`.

Независимо от binary gate, до cutover нужен отдельный reviewed
`classify manifest → plan → apply → zero-diff`; platform user запрещено
автоматически переводить в `NETWORK` без явного решения.

## Что остаётся до production canary и внешнего OWNER invite

1. Принять новым CI SHA operational additions: scheduler-free exact legacy
   rollback pair, drain verifier, receipt-bound slot binding и current-release
   runtime harness.
2. Реализовать и принять reviewed access-scope classification controller для
   пяти legacy users текущей сети; raw source должен получить unresolved `0`.
3. Выполнить privileged disposable Linux rehearsal для systemd, cgroup,
   filesystem ownership, nginx atomic reload, crash reconciliation и reboot.
4. Непосредственно перед production effect снять новый immutable backup,
   globals, SHA-256, off-host copy и выполнить independent restore check.
5. На production read-only доказать exact runtime/migration roles, SCRAM,
   HBA/TLS route, pool/session topology и создать новый production-only
   signing key/pin.
6. Сначала переключить трафик на scheduler-free N−1 runtime и доказать drain
   scheduler-capable legacy процессов. Только затем разрешается migration.
7. После migration поднять current release dark slot с outbound/schedulers OFF,
   пройти readiness + authenticated critical smoke и лишь потом атомарно
   переключить nginx.
8. OWNER invite разрешается отдельно после canary/soak и активации reviewed
   beta profile. Публичная регистрация остаётся выключенной.

До выполнения этих пунктов production decision остаётся `NO-GO`.
Restored-copy history и actual crash/lost-response закрыты локальным evidence;
N−1 offline compatibility подтверждена, но безопасный public rollback contour
остаётся отдельным незакрытым gate до successor CI/Linux acceptance.
