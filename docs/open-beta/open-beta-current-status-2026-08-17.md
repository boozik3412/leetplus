# LeetPlus open beta — текущее состояние на 19.08.2026

| Поле                 | Состояние                                          |
| -------------------- | -------------------------------------------------- |
| Release decision     | `NO-GO` для внешнего доступа                       |
| Production           | не изменён                                         |
| Текущая сеть         | один Tenant, четыре Store; не изменена             |
| Первый внешний пилот | отдельный `Tenant B/Store B1`                      |
| Offline/USB key      | исключён из beta critical path                     |
| Owner onboarding     | email-bound invite, пользователь сам задаёт пароль |

Restored-copy gate 18.08.2026: настоящий production backup восстановлен в
изолированный PostgreSQL; clean migration/repeat/data-zero-diff и полный
activation-role TLS/HBA/SCRAM apply/attest/rollback завершены `PASS`.
Exact SHA `3f325acc2428b1e3c3797075b218efeb454fae91` принят четырьмя CI
runs; скачанный artifact `9321380247`, archive SHA-256
`adb75120f35ca54bbd80924f467c78296d425f3c94de86f437998b9046b5b7f4`,
полностью прошёл outer/inner checksum, offline hydration и повторную
artifact-bound приёмку на clean copy. Production не изменён.
[Полный отчёт](./founder-production-restored-copy-rehearsal-2026-08-18.md).

Restored-copy mail gate также принят: trusted TLS SMTP worker `1/1`, полный
protected founder activation/enrollment/SENT/accept/disable `1/1`, после обоих
disposable clone database/role residue `0`, исходный preflight снова `READY`.
[Отчёт mail rehearsal](./founder-restored-copy-mail-rehearsal-2026-08-18.md).

Gate 1MT PostgreSQL A/B matrix на disposable клонах той же clean restored copy
расширена до `35/35`: ассортимент HTTP `15/15`, team chat `4/4` с real HTTP
SSE, CRM `4/4`,
users/roles `4/4`, staff attachments `8/8` со всеми семью reader parent kinds
и native writer/lifecycle flow пяти content parents.
Fixture residue равен нулю,
контрольные row counts клонов совпали с источником, одноразовые БД удалены.
[Отчёт Gate 1MT](./gate-1mt-restored-copy-pg-evidence-2026-08-18.md).

Service-level assortment candidate `f59c32fc…` расширил suite до `12/12`:
добавлены реальные PostgreSQL-проверки `CategoriesService`,
`SuppliersService`, `ProductCsvImportService`, `FactCsvImportService`,
`ReportsService` и `ReportsExportService` для NETWORK-only reads/mutations/
imports, tenant-bound product/inventory/sales/movement writes, все local
report variants, CSV/XLSX exports без foreign rows, OOS/recommendation state,
cross-tenant deny и stale-scope deny. На чистом CURRENT185+ current-head PostgreSQL
выполнены два последовательных run `12/12 + 12/12`; fixture residue
`0/0/0/0/0/0/0`, одноразовый кластер удалён. Два последовательных
restored-copy прогона тех же exact bytes `f59c32fc…` дали `12/12 + 12/12` на
disposable restored-copy clone; target/source core counts совпали
`3/4/30/1483/51257`, database residue `0`. Два последовательных
restored-copy прогона exact `3e0389b4…` дали `14/14 + 14/14`
через real Nest HTTP/RolesGuard; OWNER A/B и CLUB_MANAGER/STORES isolation,
CSV/XLSX stream, OOS/recommendation mutations приняты. Report BFF переведён
на hardened cookie-backed file/JSON proxies. Exact `94db1fdd…` добавил
concurrent RecommendationState regression и bounded report SSR fan-out;
два restored-copy run дали `15/15 + 15/15`, BFF acceptance `9/9`. Seven-table
counts `3/30/0/106897/0/8/1212` и core counts совпали с source,
одноразовый клон удалён, residue `0`.

На exact implementation SHA `771bbd5fa73e0be3b41d74dbb107495824987554`
принят следующий restored-copy production-build browser slice. Независимые
OWNER и STORES(B1) cookie sessions прошли согласованные entry/read journeys;
B1 не увидел B2 или Tenant A, foreign product store filters дали штатный 404.
Network-only staff links для STORES скрыты, прямые URL завершаются 404 до
upstream request вместо RSC error; OWNER сохранил полный staff-доступ.
Disposable browser DB удалена, residue `0`.

На exact implementation SHA
`94db1fdd20f816c785fb4153cbaccca37890f94d` принят production-build
report/browser journey. OWNER открыл `/reports`, скачал CSV/XLSX (`200`,
private/no-store, XLSX с 11 sheets), перевёл recommendation в `IN_PROGRESS` и
выполнил OOS exclusion `POST→DELETE`; browser console `0/0`. Whole-schema
postflight сравнил все `156` public tables: только десять ожидаемых fixture/
workflow deltas, неожиданных изменений нет; exact disposable DB удалена,
residue `0`. Отдельно зафиксированы и устранены Prisma `P2002` race и `P2037`
connection exhaustion. [Полный browser report](./gate-1mt-report-browser-evidence-2026-08-18.md).

Team-chat SSE boundary принят на exact `ccf81a28…`/`dfe5e0f8…`. Web BFF
локально отклоняет отсутствие cookie, unknown/duplicate/malformed selectors и
передаёт upstream только один UUID с private/no-store (`10/10`). API завершает
fresh tenant/store authority до фиксации `200 text/event-stream`: hidden
cross-store/cross-tenant channel возвращает `404`, stale persisted scope —
`401`. Unit `22/22`, API/Web lint/typecheck/build зелёные; два restored-copy
PG/HTTP run дали `4/4 + 4/4`, все `156` table counts совпали с source,
database residue `0`.
[Полный SSE-отчёт](./gate-1mt-team-chat-sse-evidence-2026-08-18.md).

Attachment reader exact `abb8a667…` теперь покрывает chat, task, checklist,
knowledge, regulation, training и onboarding parents. Пять новых типов требуют
fresh NETWORK, capability своего staff-модуля и exact same-tenant parent до
blob read; STORES пока скрыт, чтобы download не обходил network-only workspace.
Unit `26/26`, два restored-copy run `4/4 + 4/4`, все `156` table counts
zero-diff, database residue `0`.
[Полный attachment-отчёт](./gate-1mt-attachment-parent-evidence-2026-08-18.md).

Native writer exact `fc07e959…` атомарно связывает PENDING uploads при
create/update regulation, knowledge, training и onboarding и при answers update
checklist. Same-parent replay идемпотентен, BOUND cross-parent reuse запрещён,
foreign-tenant ссылка откатывает parent write. Focused unit `24/24`; два
restored-copy run дали `5/5 + 5/5`, все `156` table counts zero-diff,
database residue `0`.

Attachment lifecycle exact `f2e9e6ca…` синхронизирует полный набор native
references в parent transaction. Status-only update сохраняет binding;
удалённая ссылка снимает только exact native binding, последний blob переходит
в `QUARANTINED` и становится недоступным reader; shift-regulation delete
выполняет тот же cleanup под parent lock. Final attachment-focused unit
`48/48`; два fresh restored-copy run дали `5/5 + 5/5`, все `156` table counts
zero-diff, active sessions `0`, database residue `0`.

PostgreSQL race evidence exact `7928b7f8…` добавил наблюдаемый row-lock
contention для bind одного PENDING blob к двум parent и параллельного
remove/replacement одного course. Принято `6/6 + 6/6`: ровно один конкурент
получает initial binding, проигравший parent rollback полный; оба lifecycle
update сериализуются, parent JSON и binding остаются согласованными,
quarantined blob нельзя привязать повторно. На обоих клонах `156` table counts
zero-diff, active sessions `0`, database residue `0`.

Direct persisted-user revoke exact `c5b86aba…` теперь сериализуется с download:
в `ENFORCED` режиме reader до metadata берёт tenant-scoped shared row lock на
`User + StaffAttachment`, а user/lifecycle writers используют конфликтующие
locks. Два fresh restored-copy run `7/7 + 7/7` подтвердили, что held
`isActive=false` commit завершается раньше download, после чего reader видит
stale subject, возвращает `Unauthorized` без bytes и сохраняет binding. Unit
`49/49`, все `156` table counts zero-diff, sessions/residue `0`.

Custom/system-role capability revoke exact `bc8fffd2…` использует один
transaction-scoped advisory key в reader и обоих role-update workflows.
Custom role и system override race дважды прошли `8/8 + 8/8`: download ждал
held permission revoke, после commit fresh scope дал `Unauthorized` без bytes.
Role/attachment focused unit `56/56`, expanded users/staff regression `85/85`,
API build зелёный; все `156` table counts zero-diff, sessions/residue `0`.

Pilot HTTP inventory повторно связан с production source: `295` exact routes,
`241 ALLOW / 54 BLOCKED`. `POST /stores` имеет fresh NETWORK assertion; для
внешнего `PILOT` tenant generic creation остаётся закрыт `409` до dedicated
provisioning/quota workflow.

## Что уже реализовано

Первый внешний клуб создаётся как отдельный tenant общей SaaS-платформы, а не
как отдельная база и не как пользователь текущей сети. Его владелец получает
`OWNER + NETWORK`, после чего создаёт пользователей и роли только своей сети и
подключает Langame credentials своих Store.

Локально реализованы обе части founder-operator admission:

1. `FOUNDER_OPERATOR_BETA_GO_V1` — short-lived persisted решение Platform
   Admin, exact-bound к release, tenant shell, profile revisions, trial и stop
   conditions;
2. `FOUNDER_OPERATOR_BETA_ACTIVATION_V2` — одна `SERIALIZABLE` transaction,
   которая повторно проверяет shell/GO, создаёт dormant owner aggregate,
   активирует tenant на 30 дней, consume GO и выпускает только связанный
   encrypted outbox `HOLD→PENDING`.

HTTP route существует, но default mode — `DISABLED`. Отдельный application
pool и least-privilege runtime assertion реализованы; `PUBLIC EXECUTE` отозван.
Production runtime role/secret/grant не создавались. Поэтому code presence не
открывает production-доступ.

На полном локальном Nest/Web/PostgreSQL контуре дополнительно принят первый
browser/store-scope срез Gate 1MT. Владелец синтетической сети открыл
геймификацию, ассортимент/товары, сотрудников, регламенты, базу знаний,
коммуникации и users/roles. Пользователь с доступом к одному Store видел только
разрешённый клуб; прямой URL с ID второго Store не расширил scope. Новые
сотрудники теперь создаются UI только через обязательное email-bound
приглашение и задают пароль сами. Локальный запрос реально создал приглашение
только в разрешённый Store; preview/accept затем создал сотрудника с
`STORES` scope и тем же единственным Store, пароль был задан самим
получателем.

## Принятое локальное evidence

- Prisma validate/generate и API/database typecheck — `PASS`;
- focused config/admin/GO/activation — `4 suites / 65 tests PASS`;
- identity-mail/onboarding — `18 suites / 477 tests PASS`;
- identity-mail и PostgreSQL focused ESLint — `PASS`;
- clean PostgreSQL 16 deploy `184` migrations — `PASS`;
- real PostgreSQL v2 activation/replay/immutability — `1/1 PASS`;
- результат: `ACTIVATED → REPLAYED`, tenant `ACTIVE/OWNER_INVITED`, trial 30
  дней, один `OWNER/NETWORK` invite, один `PENDING` outbox, `User=0` до accept;
- email и secret material отсутствуют в API response;
- disposable test database удалена без residue.
- restricted runtime role имеет ровно один effective `SECURITY DEFINER`;
  owner/superuser, `INHERIT` drift и `PUBLIC EXECUTE` drift блокируются.
- exact SHA `8cce1408dda7c32bd1f3a367d32f2caabefddcbe` принят GitHub CI
  [run 32038312056](https://github.com/boozik3412/leetplus/actions/runs/32038312056)
  как `3/3 SUCCESS`; release artifact `9291522690`, digest
  `sha256:54cc505b22e5980ad747e0eef45fc46f5ab138e847e2859241909fdd145b57f1`;
- invite-only Web successor `15b9e3ac878f01e04c76efc3942d4d0cfe87d7a1`:
  `pilot BFF 4/4`, `users/roles BFF 5/5`, Web typecheck, full Web lint без
  errors и локальный browser/API scenario — `PASS`; exact-SHA GitHub CI
  [run 32040816369](https://github.com/boozik3412/leetplus/actions/runs/32040816369)
  attempt 2 — `3/3 SUCCESS`, artifact `9292006557`, digest
  `sha256:edb072f72b97924440dc4b8f8f36ea61b04e543a030f80e84f8a84859561b06a`;
- подробное browser evidence:
  [Gate 1MT local browser evidence](./gate-1mt-local-browser-evidence-2026-08-17.md).
- канонический merged SHA `eb46d587b12a79e34ef271db3fc8ac65a91a0d8a`
  содержит `origin/main` без отставания и принят exact-SHA push CI
  [run 32043177732](https://github.com/boozik3412/leetplus/actions/runs/32043177732)
  как `3/3 SUCCESS`; artifact `9292418006`, digest
  `sha256:eb5b7ac2cfeeab9912ed0dcf91d2b22a089661bb4fb4d3c1cc79fe8149acfce9`.
- документационный baseline `171bb8fb5ffe57dbb3b881e3ea4e22753e4ed9a7`
  принят push/PR CI `3/3 SUCCESS`; release artifact `9292569673`, digest
  `sha256:c4bcec5fdd195a3f59512ab55edde61268ddb44edc234c7a19d994ce18a9c9e9`;
- read-only restored-copy preflight реализован локально: exact actual
  artifact/backup SHA-256, loopback/non-5432 target, live system/database/migration
  identity, runtime-role absence, zero other sessions и explicit outbound-off
  declarations; focused `6/6 PASS`.
  Первоначальный synthetic PostgreSQL 16.14 run на `55439` вернул `READY`.
  Этот исторический synthetic этап теперь superseded принятым 18.08
  production-backup clean rehearsal, указанным выше.
- implementation SHA `9caa3e49a03e4b04156689aa6d8ef0d8f4ffebe6` принят push CI
  `32053402516` и PR CI `32053406454` как `3/3 SUCCESS`; release artifact
  `9295786786`, digest
  `sha256:e8cf5a0e062089fc709054c74e754de92e579bc0e6ce195ec6aa5aadf2526704`;
- activation-role controller реализован: raw password заменяется локально
  рассчитанным SCRAM verifier, modes `plan/apply/check/rollback` exact-bound к
  fresh preflight/manifest/operation ID и сохраняют recovery receipt. Unit
  `6/6`; synthetic PostgreSQL lifecycle прошёл
  `PLAN→APPLIED→ATTESTED→APPLY_RECONCILED→ROLLED_BACK→ROLLBACK_RECONCILED` с
  восстановлением исходного PUBLIC ACL и zero role/database/file residue.
  SHA `032bacbf…` принят push CI `32059938202` и PR CI `32059941436` как
  `3/3 SUCCESS`; artifact `9298073553`, digest `sha256:137acecc…a8b`;
- 18.08 direct network acceptance реализован и принят на одноразовом PG16.13:
  exact `hostssl+scram`, TLS 1.3 peer verification, successful role login,
  wrong-secret `28P01`, other-database/plaintext `28000`, direct table read
  `42501`, identical pre/post role attestation. Evidence digest
  `5674b09f…dd7b`; затем role rollback и zero process/port/temp residue.
  Implementation SHA `821b2fbd62a098141664ca4c1b3970125e05eeff` принят
  push CI `32065667436` и PR CI `32065674292` как `3/3 SUCCESS`; artifact
  `9300127232`, digest `sha256:f2cca9b5…d1e41`. Это synthetic engineering
  evidence; PgBouncer/dedicated pool и live API ещё не приняты.
- 18.08 начат следующий runtime-слой: отдельный activation Prisma pool теперь
  fresh-attest'ит exact session role/database/TLS внутри каждой транзакции, а
  production `ACTIVE` требует `sslmode=verify-full`. PostgreSQL fixture
  вызывает production `AdminController` по HTTP и затем проверяет replay и
  zero residue. Exact SHA `5199563561683ae2d9fce4c08aa5d991cf6d2fe3`
  принят push CI `32068262701` и PR CI `32068266758` attempt `2` как
  `3/3 SUCCESS`; artifact `9301062934`, digest `sha256:ed1db27f…16e7`.
  In-process HTTP/PG pool gate закрыт; полный artifact child-process gate ещё
  открыт.
- Runnable-artifact слой принят: release tar содержит package manifests,
  operational founder scripts и web public assets, исключает `.next/dev`,
  cache, symlink и `node_modules`; CI до upload доказал frozen offline
  production install, Prisma generate и runtime resolution. Exact SHA
  `90a94f1bd729424751db156fb17fa2a318995a59` принят push CI `32075030815`
  и PR CI `32075035388` как `3/3 SUCCESS`; artifact `9303394475`, размер
  `28 419 842` bytes, digest `sha256:b73c932f…d5fd`.
- Реализован следующий synthetic gate: отдельный CI job скачивает exact
  artifact, повторно проверяет внешний/внутренний SHA-256, гидратирует только
  production dependencies, поднимает disposable PostgreSQL и реальный
  `apps/api/dist/main.js`. Через JWT/guards он обязан выполнить
  `provision→GO→ACTIVATED→REPLAYED`, проверить readiness/DB и удалить database и
  role без residue. Exact SHA `0c721f4de5891689e9e344b89c64b5b72e6a8ce7`
  принят push CI `32078882449` и PR CI `32078886786` как `4/4 SUCCESS`;
  artifact `9304656653`, размер `28 421 509` bytes, digest
  `sha256:5dc17d356030d480fdae5cbae3e97d0329c23b77e9032be019f2ef4336915700`.
  Фактический результат child process: `SHELL_PROVISIONED→ISSUED→ACTIVATED→REPLAYED`,
  tenant `ACTIVE/OWNER_INVITED`, database residue `0`, role residue `0`.
- Owner invite reissue принят на exact SHA
  `f33e598ad2955afaf378777165bd2c34e6471c7a`: локально owner lifecycle
  `2 suites / 18`, full API `157 suites / 3144 passed`, static migration `4/4`
  и real PostgreSQL `REVOKED→REISSUED→REPLAYED` `1/1 PASS`. Push CI
  [32098804217](https://github.com/boozik3412/leetplus/actions/runs/32098804217)
  завершён `4/4 SUCCESS`, PR CI
  [32098806708](https://github.com/boozik3412/leetplus/actions/runs/32098806708)
  — `3/3 SUCCESS`; artifact `9311012974`, digest
  `sha256:f0843edc24b9664436258910b2149b60d999fc58ed9bad5ca48c8ed248c77e81`.
- На локальном canonical head добавлен forward-only
  `20260818020000_identity_mail_delivery_current_head_v1`. Он не расширяет
  delivery RPC, а fail-closed перепривязывает active worker к точному набору
  из `185` завершённых migrations. Clean PostgreSQL deploy всех `185`
  migrations, отдельный strict-TLS SMTP worker fixture и полный disposable
  PostgreSQL сценарий
  `ACTIVATED→REVOKED→REISSUED→REPLAYED→SENT→PREVIEW→ACCEPTED` прошли `1/1`.
  После accept создан ровно один `OWNER/NETWORK`, tenant перешёл
  `OWNER_INVITED→ONBOARDING`, identity claim — `INVITE→USER`, ciphertext
  очищен, пароль проверен как самостоятельно заданный получателем. Full API:
  `157 suites / 3144 passed / 2 todo`. Exact implementation SHA
  `14193e5151cf5ba1118466facdaf4a8a4a4e0922` принят push CI
  [32105326187](https://github.com/boozik3412/leetplus/actions/runs/32105326187)
  и PR CI
  [32105331954](https://github.com/boozik3412/leetplus/actions/runs/32105331954)
  как `4/4 SUCCESS`; artifact `9313186108`, `28 444 909` bytes, digest
  `sha256:6d2747e7642f7ebd52714638bb229c0abd0c1b4fc221c2de3c09d04d2eb2fe09`.
  Production не менялся.
- SHA `dd035cb6b199bcfa3c0c3e00454e282e5d717a97` добавил в release artifact
  operator-ready runtime/worker enrollment sources и CLI. Push/PR CI
  `32108215180`/`32108218082` приняты `4/4 SUCCESS`; artifact `9314172297`,
  GitHub digest `sha256:69ed66ad…f9e61a`, downloaded archive SHA-256
  `67ada963…391d5` совпал с outer checksum.
- Реализован отсутствовавший one-tenant mail enrollment controller:
  `plan/apply/check/disable`, CURRENT185, exact activation release,
  worker role/OID, provider digest, fixed policy, tenant advisory lock,
  `SERIALIZABLE`, monotonic disable и lost-response reconciliation. Unit
  `7/7`, database typecheck/scoped lint и реальный disposable PostgreSQL founder
  lifecycle через CLI `1/1` прошли. Full CI выявил и закрыл residue старого
  PgBouncer fixture: точный `postgresql.auto.conf` теперь восстанавливается,
  post-cleanup доказывает `ssl=off` и отсутствие трёх fixture-сертификатов.
  Exact SHA `5574821723de22d3d83a51a03f3dbdab639cd53d` принят push/PR CI
  `32115334678`/`32115340009` как `4/4 SUCCESS`, focused PG
  `32115339918` — `SUCCESS`. Artifact `9316782148`, digest
  `sha256:a2b0ea21563efb5fc9c1df078a9d0d97afce9f9c8b404d9351457aa7433f0706`;
  downloaded SHA-256 `d360e5b1…a7849167` совпал с outer checksum и содержит
  `14` operational scripts (`8+6`). Production и Tenant A не изменялись.

## Что блокирует выдачу доступа

1. Production backup/restore, clean migration/repeat/data zero-diff,
   activation-role TLS/HBA/SCRAM lifecycle и повторная приёмка скачанного
   exact-SHA artifact закрыты.
2. `SENT`, owner accept, one-tenant enrollment и trusted TLS SMTP доказаны на
   disposable клонах restored copy. Ещё не выполнены production worker-role
   enrollment, production SMTP secret/config и controlled production canary.
3. Gate 1MT PostgreSQL A/B matrix (`35/35`, включая attachment reader и native
   writer/lifecycle, real
   HTTP SSE и latest
   assortment HTTP `15/15`), browser read/admission и report/download/mutation
   journey приняты на restored copy. Не закрыты outbound digest, attachment
   production-build browser/STORES policy, jobs/Telegram/public guest binding
   и Gate 2 текущей сети.
4. Production deploy, `FOUNDER_OPERATOR_BETA_MODE=ACTIVE`, внешний tenant и
   реальный tester invite не выполнялись.

## Полный путь до первого внешнего тестера

```text
clean SHA + CI artifact [DONE]
  → [DONE] live backup + isolated target + read-only preflight
  → [DONE restored copy] production-history migrate + repeat + zero-diff
  → [DONE restored copy] execute-only runtime role/grant/attestation
  → [DONE restored copy] direct HBA/TLS/SCRAM + rollback
  → [DONE] exact-SHA CI artifact + outer/inner SHA + offline hydration
  → [DONE restored copy] downloaded-artifact preflight/history/role/TLS/rollback
  → [DONE synthetic] dedicated pool + in-process HTTP/PG
  → [DONE synthetic] downloaded artifact API child process
  → [DONE] owner invite status/revoke
  → [DONE engineering/CI] immutable owner invite reissue
  → [DONE local PostgreSQL] CURRENT185 worker + SENT/reissue/accept
  → [DONE exact-SHA CI] exact one-tenant mail enrollment plan/apply/check/disable
  → [DONE restored-copy clones] trusted TLS SMTP + enrollment/SENT/accept/disable
  → [DONE restored-copy clones] Gate 1MT PostgreSQL A/B matrix 35/35
  → [DONE restored-copy clone] assortment service + HTTP + BFF 15/15 and 9/9
  → [DONE restored-copy clone] production-build OWNER/STORES browser read/admission
  → [DONE restored-copy clone] production-build reports/downloads/mutations
  → [DONE restored-copy clone] team-chat Web BFF + real API SSE pre-header deny
  → [DONE restored-copy clones] all seven attachment reader parent kinds
  → [DONE restored-copy clones] five native attachment writer parent kinds
  → [DONE restored-copy clones] native unbind/quarantine/delete lifecycle
  → [DONE restored-copy clones] native bind/unbind/replacement race matrix
  → [DONE restored-copy clones] direct persisted-user revoke/download race
  → [DONE restored-copy clones] custom/system-role revoke/download races
  → production roles/secrets + controlled SMTP canary
  → Gate 1MT attachment production-build browser/STORES + jobs/Telegram/public-guest/outbound
  → Gate 2 current Tenant A/A1..A4
  → production deploy in PREPARE
  → create Tenant B/Store B1 + persisted GO
  → controlled ACTIVE activation
  → owner email invite and self-set password
  → day-0 monitoring and rollback window
```

Временный пароль `123456`, ручное создание `User`, добавление тестера в текущий
Tenant A и public signup запрещены. CURRENT198–202/USB остаются post-beta
hardening и не блокируют этот путь.
