# LeetPlus open beta: пакет запуска

| Поле             | Значение                                     |
| ---------------- | -------------------------------------------- |
| Статус           | Active implementation package                |
| Версия           | 1.177                                        |
| Дата             | 19.08.2026                                   |
| Release decision | `NO-GO`; shared beta только после Gate 1MT/2 |
| Владелец         | LeetPlus product / engineering / operations  |

Этот каталог — навигационная точка для перевода текущей сети из demo-режима в
полноценную работу и последующего invite-only теста с внешними сетями. Он не
разрешает deployment, миграцию production-данных или выдачу доступа сам по
себе.

Основной путь первого внешнего клуба — `SHARED_MULTI_TENANT_BETA`: новый
`Tenant B/Store B1` в общем web/API/workers/PostgreSQL/Telegram data plane.
Доступ остаётся `NO-GO` до Gate 1MT, Gate 2 и отдельного protected
`SHARED BETA GO`. Отдельный runtime/DB сохранён только как contingency или
enterprise-isolation option и не сокращает shared gates.

Решением от 17.08.2026 offline CURRENT198–202 bootstrap, USB и key ceremony
перенесены из critical path первого внешнего beta tenant в post-beta security
hardening. Они остаются deny-only и не заменяются фиктивными ключами. Beta
onboarding использует persisted `FOUNDER_OPERATOR_BETA_GO_V1`: fresh Platform
Admin, exact release SHA, конкретный tenant shell, 30-day trial, тот же founder
как rollback owner и явные stop conditions. Клиенту по-прежнему не нужен ключ:
он получает email-bound OWNER invite и сам задаёт пароль. Обычные production
JWT/encryption/SMTP secrets, tenant isolation, backup/restore и rollback
остаются обязательными.

## Зафиксированные решения

- четыре текущих клуба — четыре `Store` одной сети внутри одного существующего
  `Tenant`;
- текущий `tenantId` сохраняется, данные четырёх `Store` остаются внутри одного
  `Tenant` и не разделяются на четыре tenant;
- operational tenant перестаёт быть anonymous demo до переименования;
- независимая внешняя сеть всегда получает отдельный `Tenant`;
- первый внешний клуб получает новый `Tenant B` и `Store B1` в общем data
  plane; current `Tenant A/A1..A4` не меняется и не копируется;
- согласованный scope `Tenant B/B1` включает геймификацию,
  ассортимент/товары, сотрудников целиком, коммуникации,
  users/roles и integrations только внутри своей сети;
- shared web, API, workers, PostgreSQL и Telegram являются целевой topology;
- OWNER получает email-bound invite, а затем управляет пользователями,
  ролями, клубами и интеграциями только своей сети;
- все external effects и unattended jobs по умолчанию `OFF` и включаются
  только после отдельных evidence и `GO`;
- первая внешняя когорта подключается только вручную и по приглашениям;
- состав доступа задаёт
  [shared beta profile](./shared-multi-tenant-beta-profile.md);
- tenant user работает только внутри своего tenant и persisted
  `NETWORK | STORES` scope;
- production-изменения выполняются только после exact candidate SHA, CI,
  backup/restore, canary и явного решения `GO`.

Актуальный successor и его строгая граница:
[Founder-operator beta GO](./founder-operator-beta-go.md).

Текущий фактический статус после реализации v2:
[open beta status 18.08.2026](./open-beta-current-status-2026-08-17.md).

Dedicated database boundary:
[founder activation runtime v1](./founder-operator-beta-activation-runtime.md).

Исполнимый read-only вход в restored-copy этап:
[founder restored-copy preflight](./founder-pilot-restored-copy-preflight.md).

Принятый прогон настоящего production backup, production-history migration
lane, data zero-diff и TLS activation-role rollback:
[production restored-copy rehearsal 18.08.2026](./founder-production-restored-copy-rehearsal-2026-08-18.md).

Trusted TLS SMTP, protected mail enrollment и полный OWNER workflow на
disposable клонах clean restored copy:
[restored-copy mail rehearsal 18.08.2026](./founder-restored-copy-mail-rehearsal-2026-08-18.md).

Production-like PostgreSQL A/B matrix ассортимента, team chat, CRM и
users/roles на отдельном CURRENT185 restored-copy clone:
[Gate 1MT restored-copy PostgreSQL evidence 18.08.2026](./gate-1mt-restored-copy-pg-evidence-2026-08-18.md).

Production-build report/download/mutation acceptance на clean restored-copy
clone:
[Gate 1MT report browser evidence 18.08.2026](./gate-1mt-report-browser-evidence-2026-08-18.md).

Team-chat SSE cookie/BFF, pre-header API authorization и real
Nest/PostgreSQL A/A1/A2↔B/B1 evidence:
[Gate 1MT team-chat SSE evidence 18.08.2026](./gate-1mt-team-chat-sse-evidence-2026-08-18.md).

Staff attachment reader coverage всех семи parent kinds:
[Gate 1MT attachment parent evidence 18.08.2026](./gate-1mt-attachment-parent-evidence-2026-08-18.md).

Production-build OWNER upload/bind/download/unbind/quarantine lifecycle и
STORES side-door deny для network-only staff parent:
[Gate 1MT attachment browser evidence 19.08.2026](./gate-1mt-attachment-browser-evidence-2026-08-19.md).

Store-aware knowledge parent, per-row mutation authority и совпадающая
attachment download policy для `NETWORK | STORES`:
[Gate 1MT knowledge STORES evidence 19.08.2026](./gate-1mt-knowledge-stores-evidence-2026-08-19.md).

Store-aware shift-regulations parent, assessment/acknowledgement authority и
совпадающая attachment download policy для `NETWORK | STORES`:
[Gate 1MT shift-regulations STORES evidence 19.08.2026](./gate-1mt-shift-regulations-stores-evidence-2026-08-19.md).

Store-aware training courses/profiles, progress/export authority и совпадающая
attachment download policy для `NETWORK | STORES`:
[Gate 1MT training STORES evidence 19.08.2026](./gate-1mt-training-stores-evidence-2026-08-19.md).

Store-aware staff onboarding plans, reference catalogs и совпадающая
attachment download policy для `NETWORK | STORES`:
[Gate 1MT onboarding STORES evidence 19.08.2026](./gate-1mt-onboarding-stores-evidence-2026-08-19.md).

Store-aware checklist templates/runs, answers/review, reports/exports,
reference catalogs и совпадающая attachment download policy для
`NETWORK | STORES`:
[Gate 1MT checklists STORES evidence 19.08.2026](./gate-1mt-checklists-stores-evidence-2026-08-19.md).

DB-level parent-delete guard для всех семи staff attachment parent kinds и
canonical `CURRENT_186` identity-mail readiness bump:
[Gate 1MT attachment parent-delete guard evidence 19.08.2026](./gate-1mt-attachment-parent-delete-guard-evidence-2026-08-19.md).

Successor staff attachment file BFF hardening: download route теперь
selector-free (`forwardQuery: false`), upload locator остаётся canonical
same-origin, а Web BFF boundary расширен до `18/18`. Это частичный file-policy
gate; полный production-build archive/delete/orphan browser matrix ещё открыт.

Successor Telegram edge config hardening: edge adapter больше не имеет
production API URL по умолчанию и fail-closed требует явный LeetPlus API URL до
network/provider effects. Targeted Telegram edge/poller tests `12/12`; полный
tenant-aware Telegram/public-guest/outbound matrix ещё открыт.

Successor public guest club selector hardening: `selectGameClub` и Telegram
Mini App session exchange отклоняют конфликтующие `clubId = tenant:store` и
явные `tenantSlug/storeId`. Обычный selector reject происходит до tenant/store
lookup, profile mutation и JWT signing; Mini App reject происходит до
candidate/profile lookup и JWT signing, чтобы один доступный кандидат не
выбирался молча при конфликтующих selectors. Targeted guest portal service
suite `196/196`; полный Telegram/public-guest/outbound matrix ещё открыт.

Successor public guest BFF query allowlist: active
`/api/guest-portal/[...path]` GET пересылает только `lat/lng/radiusKm` для
public club directory и `offset/limit` для authenticated missions paging. Все
прочие query, включая tenant/store-like selectors на session/public-config
paths, получают `400` до upstream fetch. Web `test:pilot-bff-boundary` `19/19`;
полный public guest/Telegram/outbound matrix ещё открыт.

Successor public guest BFF POST body allowlist: active
`/api/guest-portal/[...path]` POST пересылает только route-scoped JSON поля;
unknown route получает `404` до upstream, unknown body fields получают `400`.
Provider/webhook-like paths не доступны через web BFF; Mini App edge path
по-прежнему пересобирает `telegramUserId/authDate` server-side после подписи и
отклоняет любые client fields вне `initData/clubId/tenantSlug/storeId` до
validation/upstream. Web `test:pilot-bff-boundary` `21/21`; полный public
guest/Telegram/outbound matrix ещё открыт.

Successor public guest BFF GET path allowlist: active
`/api/guest-portal/[...path]` GET принимает только public club directory,
public config, authenticated session, game summary и missions paging.
Legacy/dormant media и unknown GET paths получают `404` до upstream fetch;
query validation по-прежнему даёт `400`. Web `test:pilot-bff-boundary`
`21/21`; полный public guest/Telegram/outbound matrix ещё открыт.

Successor Telegram `sendMessage` outbound projection: active
Telegram edge и основной API webhook reply sender строят строгий
`sendMessage` body перед Bot API: numeric `chat_id`, text до 4096 символов,
bounded contact keyboard, inline `callback_data`, HTTPS `url`/`web_app` и
`remove_keyboard`. Unknown fields, control chars, oversized callback data и
non-HTTPS URLs отклоняются до Telegram fetch; edge возвращает safe
`replySent=false/outboundRejected=true` для unsafe upstream reply. Targeted API
tests `207/207`, API typecheck, targeted ESLint и Prettier зелёные. Полный
tenant-aware public guest/Telegram/outbound matrix ещё открыт.

Exact lifecycle dedicated activation role на restored copy:
[founder activation-role deployment](./founder-pilot-activation-role-deployment.md).

Exact direct PostgreSQL HBA/TLS/SCRAM acceptance dedicated роли:
[founder activation-role network acceptance](./founder-pilot-activation-role-network-acceptance.md).
Следующий runtime-слой описан в
[founder dedicated activation pool and API acceptance](./founder-pilot-activation-pool-api-acceptance.md).
Состав и hydration SHA-bound runtime package зафиксированы в
[founder runnable release artifact](./founder-pilot-release-artifact-runtime.md).
Полный запуск скачанного API package описан в
[founder release artifact API child process](./founder-pilot-release-artifact-api-child-process.md).
Защищённые status/revoke initial OWNER invite описаны в
[founder owner invite lifecycle](./founder-owner-invite-lifecycle.md).
Канонический CURRENT185 delivery/accept successor описан в
[founder owner delivery CURRENT185](./founder-owner-delivery-current185.md).
Безопасное включение mail worker только для одного pilot tenant описано в
[founder-pilot mail tenant enrollment](./founder-pilot-mail-tenant-enrollment.md).
Контроллер принят на exact SHA `55748217…`: push/PR CI — `4/4 SUCCESS`,
focused PostgreSQL — `SUCCESS`; скачанный 14-script artifact прошёл внешний
checksum. Production и текущая сеть не изменялись.

## Канонические документы

Сначала читать:
[актуальный статус открытого теста на 18.08.2026](./open-beta-current-status-2026-08-17.md) —
единый вердикт по текущей задаче, release gates, фактическим blockers и пути до
первого `Tenant B/Store B1`.

Предыдущий подробный snapshot:
[статус на 07.08.2026](./open-beta-current-status-2026-08-07.md).

Текущая source-синхронизация:
[canonicalization manifest 07.08.2026](./canonicalization-manifest-2026-08-07.md) —
исходные SHA, точная staging boundary, exclusions, recovery strategy и место
для final commit/CI evidence.

0. [Implementation checkpoint 05.08.2026](./implementation-checkpoint-2026-08-05.md) —
   фактический статус CURRENT186–190, Gate 1MT, неизменность production и
   строгий остаток до первого `Tenant B/Store B1`.
   0a. [Gate 1MT pilot HTTP surface](./gate-1mt-pilot-http-surface.md) — полный
   controller inventory, fresh tenant/store authority, 26 assortment reads,
   29 assortment mutations, 77 NETWORK-only in-app gamification handlers и
   точный fail-closed остаток.
   0a.1. [Gate 1MT users/roles PostgreSQL CI evidence](./gate-1mt-users-roles-pg-ci-evidence-2026-08-13.md) —
   exact-SHA A/A1/A2↔B/B1 inventory/mutation/stale-authority matrix `4/4`,
   SHA-bound artifact и явная граница `NO ACCESS GO`.
   0a.2. [Gate 1MT users/roles BFF CI evidence](./gate-1mt-users-roles-bff-ci-evidence-2026-08-13.md) —
   exact seven-route/nine-handler cookie-only boundary `4/4`, SHA-bound
   artifact и оставшийся browser/cutover blocker.
   0a.3. [Gate 1MT local browser/store-scope evidence](./gate-1mt-local-browser-evidence-2026-08-17.md) —
   реальный локальный Nest/Web/PostgreSQL bootstrap, согласованные модули,
   allowed/denied Store direct-URL matrix и invite-only employee flow;
   `PARTIAL PASS`, не production/shared-beta GO.
   0a.4. [Gate 1MT restored-copy PostgreSQL evidence](./gate-1mt-restored-copy-pg-evidence-2026-08-18.md) —
   CURRENT185 production-backup clones, пять A/B suites, `35/35 PASS`
   (включая staff attachments), затем production-build OWNER/STORES browser
   read/admission slice на `771bbd5f…`; fixture/database residue `0`. Latest
   assortment candidate `f59c32fc…` добавил category/supplier,
   product/fact CSV, все local report variants, CSV/XLSX exports и
   OOS/recommendation-state PostgreSQL boundary; два последовательных
   прогона exact bytes дали `12/12 + 12/12` на clean current-head DB и
   `12/12 + 12/12` на disposable
   restored-copy clone; fixture/database residue `0`. Exact `3e0389b4…`
   добавил real Nest HTTP/RolesGuard и hardened report BFF proxies; два
   restored-copy run дали `14/14 + 14/14`. Exact `94db1fdd…` закрыл
   RecommendationState concurrency и bounded SSR fan-out: `15/15 + 15/15`,
   BFF acceptance `9/9`, production-build report/download/mutation journey,
   whole-schema `156`-table postflight и zero database residue приняты.
   Team-chat real HTTP SSE extension принят на `ccf81a28…`/`dfe5e0f8…`:
   pre-stream `404/401`, Web BFF `10/10`, unit `22/22`, два PG/HTTP run
   `4/4 + 4/4`, `156` table counts zero-diff и database residue `0`.
   OWNER attachment production-build browser lifecycle, knowledge, shift
   regulations, training, onboarding и checklists STORES adoption также
   приняты; remaining attachment archive/orphan matrix, outbound
   digest и job/Telegram/public-guest остаток не закрыты. HTTP
   inventory: `295 = 241 ALLOW + 54
   BLOCKED`.
   0a.5. [Gate 1MT report browser evidence](./gate-1mt-report-browser-evidence-2026-08-18.md) —
   exact `94db1fdd…`, реальные CSV/XLSX, recommendation/OOS mutations,
   `0` console errors/warnings и unexpected table deltas, database residue `0`.
   0a.6. [Gate 1MT team-chat SSE evidence](./gate-1mt-team-chat-sse-evidence-2026-08-18.md) —
   exact `ccf81a28…`/`dfe5e0f8…`, cookie-only selector-allowlisted BFF,
   authorization до SSE headers, real Nest/PostgreSQL `4/4 + 4/4`, zero table
   diff и database residue `0`.
   0a.7. [Gate 1MT attachment parent evidence](./gate-1mt-attachment-parent-evidence-2026-08-18.md) —
   exact `abb8a667…`, fresh NETWORK/capability/exact-parent reader для всех
   семи kinds; exact `fc07e959…` добавил atomic create/update binding пяти
   content parents, same-parent replay и foreign-tenant rollback. Exact
   `f2e9e6ca…` добавил full-set synchronization: status-only retention,
   unbind, last-reference quarantine и shift-regulation delete lifecycle.
   Exact `7928b7f8…` принял PostgreSQL bind/unbind/replacement races; exact
   `c5b86aba…` — direct persisted-user revoke до blob read. Final
   `bc8fffd2…` сериализует custom/system-role capability revoke с reader.
   Role/attachment focused unit `56/56`, restored-copy `4/4 + 4/4` и
   `8/8 + 8/8`, `156` table count zero-diff и database residue `0`;
   STORES parent policies ещё обязательны.
   0a.8. [Gate 1MT attachment browser evidence](./gate-1mt-attachment-browser-evidence-2026-08-19.md) —
   exact `97648308…`, production-build OWNER
   upload→bind→download→remove→quarantine→404, byte-identical SHA-256,
   positive console `0/0`, `156`-table postflight и database residue `0`;
   независимый STORES(B1) direct URL получил штатный network-only `404`.
   0a.9. [Gate 1MT knowledge STORES evidence](./gate-1mt-knowledge-stores-evidence-2026-08-19.md) —
   exact `085f8bbd…`, общая parent/attachment policy для `NETWORK | STORES`,
   unit `32/32`, Web BFF `12/12`, restored-copy PostgreSQL `9/9` и
   production-build B1↔B2 browser matrix; B1 edit/upload/download принят,
   authenticated B2 foreign attachment получил hidden `404`.
   0a.10. [Gate 1MT shift-regulations STORES evidence](./gate-1mt-shift-regulations-stores-evidence-2026-08-19.md) —
   exact `6ce36a41…`, общая parent/attachment policy для `NETWORK | STORES`,
   assessment/acknowledgement scope, unit `53/53`, Web BFF `13/13`, pilot
   HTTP/guard `160/160`, restored-copy PostgreSQL `10/10` и production-build
   B1↔B2 browser matrix; B1 edit/ack принят, B2 foreign mutation скрыта `404`.
   Remote successor `542c8126…` принят exact-head GitHub Actions run
   `32187880656`: все четыре jobs `SUCCESS`.
   0a.11. [Gate 1MT training STORES evidence](./gate-1mt-training-stores-evidence-2026-08-19.md) —
   exact `40a8e828…`, общая course/profile/attachment policy для
   `NETWORK | STORES`, unit `54/54`, Web BFF `14/14`, pilot HTTP/guard
   `160/160`, restored-copy PostgreSQL `11/11` и production-build B1↔B2
   browser matrix; B1/B2 видят только свой Store и published network course,
   foreign mutation скрыта `404`, foreign filter отклонён `403`.
   0a.12. [Gate 1MT onboarding STORES evidence](./gate-1mt-onboarding-stores-evidence-2026-08-19.md) —
   exact `26b9f442…`, общая plan/reference/attachment policy для
   `NETWORK | STORES`, unit `55/55`, Web BFF `15/15`, pilot HTTP/guard
   `160/160`, local PostgreSQL `12/12` и production-build B1↔B2 browser;
   network plan read-only, foreign mutation скрыта `404`, foreign filter
   отклонён `403`; exact push CI `32220369599` завершился `4/4 SUCCESS`.
   0a.13. [Gate 1MT checklists STORES evidence](./gate-1mt-checklists-stores-evidence-2026-08-19.md) —
   exact `70d8301d…`, общая template/run/report/attachment policy для
   `NETWORK | STORES`, focused API `59/59`, full API `3192`, Web BFF `16/16`,
   local PostgreSQL `13/13` и production-build B1↔B2 browser; network
   template read-only, foreign mutation скрыта `404`, foreign filter
   отклонён `403`; exact push CI `32223728916` завершился `4/4 SUCCESS`.
   0b. [CURRENT189 employee invite boundary](./identity-employee-invite-mail-current189.md) —
   tenant-owned mailbox delivery, reissue/revoke/accept, terminal replay и
   PostgreSQL race evidence, dormant bounded runtime/health boundary;
   noncanonical и route-closed.
   0b.1. [CURRENT189 dormant route policy](./employee-invite-current189-dormant-route-policy.md) —
   exact three-route issue/reissue/revoke binding, safe response projection и
   AST-доказательство, что production UsersController остаётся legacy/BLOCKED.
   0b.2. [CURRENT189 dormant HTTP/BFF candidate](./employee-invite-current189-http-bff-candidate.md) —
   exact Nest transport, cookie-backed same-origin Web boundary, bounded safe
   receipts и доказательство отсутствия module/Route Handler wiring.
   0c. [CURRENT190 persisted guest session boundary](./guest-portal-current190-persisted-session-boundary.md) —
   persisted guest JWT lifecycle, tenant/store/media isolation, permanent
   tenant revoke-all fence, bounded audit-complete batches и lock-freshness
   evidence; dormant fresh-Platform-Admin revoke orchestrator and all public
   routes remain closed.
   0d. [CURRENT190 dormant route policy](./guest-portal-current190-dormant-route-policy.md) —
   exact 30-handler READ/WRITE/OUTBOUND/PUBLIC_BOOTSTRAP inventory, fail-closed
   candidate adapter, unregistered persisted-logout/private-media Nest
   controller, private/no-store media boundary and explicit legacy cutover
   blocker.
   0d.1. [CURRENT190 dormant Web BFF candidate](./guest-portal-current190-bff-candidate.md) —
   exact revoke-before-cookie-clear and tenant-media transport contract,
   bounded private responses and an explicit proof that no active Route
   Handler imports it.
   0e. [CURRENT188 dormant Langame Web BFF candidate](./langame-current188-bff-candidate.md) —
   exact preview/activate/status/reconcile/initial-sync-preflight transport;
   все новые адаптеры default-off и production-denied, а persisted selected-
   Store import остаётся явным blocker; legacy external sync также
   fail-closed до credentials/provider/database effects.
   0e.1. [CURRENT188 legacy sync deny CI evidence](./langame-current188-legacy-sync-deny-ci-evidence-2026-08-13.md) —
   exact-SHA `3/3 SUCCESS`, SHA-bound artifact и доказательство, что external
   legacy sync прекращается до credential/provider/job/business effects.
   0e.2. [CURRENT188 status CI evidence](./langame-current188-status-ci-evidence-2026-08-13.md) —
   exact-SHA `3/3 SUCCESS`, status tenant/store binding, fail-closed expiry,
   dormant Web BFF и SHA-bound artifact без production authority.
   0e.3. [CURRENT188 reconcile CI evidence](./langame-current188-reconcile-ci-evidence-2026-08-13.md) —
   exact-SHA `3/3 SUCCESS`, activation receipt/claim/Store/source/credential/
   audit reconciliation, dormant Web BFF и SHA-bound artifact.
   0e.4. [CURRENT188 initial sync preflight CI evidence](./langame-current188-initial-sync-preflight-ci-evidence-2026-08-13.md) —
   exact-SHA `3/3 SUCCESS`, bounded selected-club provider reads, double fresh
   authority, dormant Web BFF и SHA-bound artifact без platform import.
   0e.5. [CURRENT191 deterministic initial sync plan](./langame-current191-initial-sync-plan.md) —
   pure immutable selected-Store product/inventory plan и branded canonical
   serializer без DB/provider effects; import остаётся закрыт.
   0e.6. [CURRENT191 deterministic plan CI evidence](./langame-current191-initial-sync-plan-ci-evidence-2026-08-13.md) —
   exact SHA `d433cd67…`, CI `3/3 SUCCESS` и artifact
   `sha256:010b2f9f…88fa` без import/deploy authority.
   0e.7. [CURRENT191 initial-sync approval ledger](./langame-current191-initial-sync-approval-ledger.md) —
   отдельный dormant successor с PII-free short-lived preflight/approval,
   fresh GO/NETWORK/binding recheck и rollback-only PostgreSQL acceptance;
   business import и route wiring отсутствуют.
   0e.8. [CURRENT191 approval CI evidence](./langame-current191-approval-ci-evidence-2026-08-13.md) —
   exact SHA `56f24216…`, PostgreSQL replay/drift/expiry acceptance `3/3
SUCCESS` и artifact `sha256:5e8e07de…a3a` без import/deploy authority.
   0e.9. [CURRENT192 atomic initial-sync execution](./langame-current192-initial-sync-execution.md) —
   локальный dormant claim/atomic selected-Store import/complete/reconcile;
   runtime grants, route, provider effect и production authority отсутствуют.
   0e.10. [CURRENT193 runtime boundary](./langame-current193-runtime-boundary.md) —
   execute-only role/catalog/ACL admission и последовательность signed runtime
   acceptance; production roots и route authority остаются закрыты.
   0e.11. [CURRENT194 runtime-attestation ledger](./langame-current194-runtime-attestation-ledger.md) —
   owner-only persisted register/consume/revoke/expiry state machine с exact
   replay; runtime grants, production authority и route activation отсутствуют.
   0e.12. [CURRENT195 signed revoke intent](./langame-current195-signed-revoke-intent.md) —
   принятые Ed25519-bound foundation, owner-only persisted ledger и
   persist → drain → apply/restart lifecycle; production roots и
   route authority отсутствуют.
   0e.13. [CURRENT196 trust-enrollment proposal](./langame-current196-trust-enrollment.md) —
   nonauthorizing bootstrap-authority envelope для двухконтрольной церемонии,
   отдельных runtime/revoke roots и exact TLS peer pins; production registry
   frozen-empty, enrollment и network I/O отсутствуют.
   0e.14. [CURRENT197 protected trust acquisition](./langame-current197-trust-acquisition.md) —
   descriptor-bound чтение exact public roots/CA и production-capable TLS
   verify-full collector; post-acceptance IPv4-mapped P1 исправлен, hardened
   exact SHA `12733fbe…` принят CI `31734216369` как `3/3 SUCCESS`; production
   proposal пока невозможно получить из-за frozen-empty CURRENT196 roots.
   0e.15. [CURRENT198 immutable bootstrap-root registry](./langame-current198-bootstrap-root-registry.md) —
   canonical data-only lifecycle registry, append-only Git transition policy и
   active-root projection в CURRENT196; exact SHA `539e51a0…` принят CI
   `31736711886` как `3/3 SUCCESS`, initial registry остаётся пустым, key
   ceremony, production enrollment и доступ не разрешены.
   0e.16. [CURRENT199 trust-registration provenance bridge](./langame-current199-trust-registration.md) —
   full CURRENT196 payload digest проходит через CURRENT197 protected receipt в
   immutable initial-registration record; exact SHA `be8d670d…` принят CI
   `31738982139` как `3/3 SUCCESS`; foundation deny-only, process-local, не
   persisted и не разрешает apply/rotation/revocation.
   0e.17. [CURRENT199 owner-only registration ledger candidate](./langame-current199-registration-ledger.md) —
   noncanonical two-table `REGISTERED/EXPIRED` ledger, exact replay, immutable
   bindings и owner/database/runtime-role identity; final SHA `d3e6d8ea…`
   принят CI `31744420994` как `3/3 SUCCESS`, artifact digest
   `sha256:e46d9a70…cbb87`; test-only adapter `9/9`, actual PostgreSQL matrix
   `1/1`, production entry и authority остаются закрытыми.
   0e.18. [CURRENT200 bootstrap-root lifecycle](./langame-current200-bootstrap-lifecycle.md) —
   public-only `ENROLL/ROTATE/REVOKE` planner; exact SHA `ccf38764…` принят CI
   `31767536910` как `3/3 SUCCESS`, release artifact
   `sha256:eae83b26…a4f33`; private-key, registry-write и access authority
   отсутствуют.
   0e.19. [CURRENT201 two-person bootstrap ceremony](./langame-current201-two-person-bootstrap-ceremony.md) —
   разные operator/reviewer identities и Ed25519 public keys, role-bound
   detached signatures и обязательный canonical public evidence для любого
   изменения CURRENT198; focused matrix `16/16`, exact implementation SHA
   `e3cf6ff4…`, CI `31776034567` — `3/3 SUCCESS`, artifact
   `sha256:2e3d1201…86d2`; production root и доступ остаются `NO-GO` до
   фактической ceremony и restored-copy rehearsal.
   0e.20. [CURRENT202 V2 single-founder global platform bootstrap](./langame-current202-founder-single-control-pilot.md) —
   один founder подписывает release/rollback ownership глобального внутреннего
   trust anchor; контракт фиксирует один зашифрованный USB-носитель, отсутствие
   физической независимости и 12-часовой cooling-off. V2 подписывает
   `platformScope=GLOBAL`, требует отдельный `SHARED BETA GO` и не содержит
   tenant/store/trial policy. Клиенты и последующие tenants не проходят key
   ceremony. Исторический V1 exact SHA `77bb66b3…` принят CI `31783338350`;
   V2 exact SHA `c2b7b370…` принят CI `31790021275` как `3/3 SUCCESS`, artifact
   `9215344140`, digest `sha256:8e7b70c5…b504`. Все effect/access flags остаются
   false.
   0e.21. Founder pilot operation plans:
   [key custody](./founder-pilot-key-custody-plan.md),
   [isolated restored copy](./founder-pilot-restored-copy-plan.md),
   [restored-copy preflight](./founder-pilot-restored-copy-preflight.md),
   [activation role deployment](./founder-pilot-activation-role-deployment.md),
   [activation role network acceptance](./founder-pilot-activation-role-network-acceptance.md) и
   [stop/rollback](./founder-pilot-rollback-plan.md). Это exact digest inputs,
   а не утверждение о выполненном production restore.
   0e.22. [Commercial multi-tenant onboarding plan](./commercial-multi-tenant-onboarding-plan.md) —
   целевая SaaS-модель без клиентских ключей: global internal platform trust,
   tenant factory, owner email invite, self-service Langame и поэтапный cohort.
   0f. [CURRENT180–190 release rehearsal blocker](./current180-current190-release-rehearsal-blocker.md) —
   fail-closed доказательство несовместимого Prisma order, database guards и
   unresolved predecessor chain до любого deploy или подключения к БД.
   0g. [CURRENT180–190 materialization plan](./current180-current190-release-materialization-plan.md) —
   deny-only двухконтурный план: schema lane с отдельным CURRENT187 admission
   anchor и изолированный CURRENT187-E evidence lane; assembly/deploy всё ещё
   запрещены.
   0h. [CURRENT180–190 immutable refreeze proposal](./current180-current190-release-refreeze-proposal.md) —
   exact proposal-only anchor, полный byte-level manifest и fail-closed
   verifier; canonical apply и assembly не разрешены.
   0i. [CURRENT180–190 in-memory release assembler](./current180-current190-disposable-release-assembler.md) —
   immutable 179+11 assembly без filesystem write, process spawn, database/network
   access и без права на runner consumption, deploy или production apply.
   0j. [CURRENT180–190 disposable PostgreSQL rehearsal](./current180-current190-disposable-postgresql-rehearsal.md) —
   единый fail-closed runbook для planning contract, полного SQL fingerprint,
   file-backed coordinator, restart-safe system-temp materialization, signed
   journal и reviewed runner/runtime. Два финальных локальных PG16.13 цикла
   приняты с одинаковым source fingerprint, zero target/artifact/journal
   residue и независимым `P0=0/P1=0`; до canonical promotion и restored-copy
   rehearsal production DDL и test access запрещены.
   [Gate 0 CI artifact evidence, 10.08.2026](./gate-0-ci-artifact-2026-08-10.md) —
   exact synchronized SHA, зелёный GitHub CI `3/3` и принятый SHA-bound
   release artifact; документ отдельно фиксирует, что это не production/tester
   GO.
1. [Специальный launch backlog](../../OPEN_BETA_BACKLOG.md) — приоритеты,
   зависимости, Gate 0–3, метрики и последовательность разработки.
2. [Shared multi-tenant beta profile](./shared-multi-tenant-beta-profile.md) —
   целевая topology, полный module scope, IAM и integrations contract.
3. [Shared multi-tenant launch checklist](./shared-multi-tenant-launch-checklist.md) —
   Gate 1MT/Gate 2, owner invite, day-0, first-club cycle и offboarding.
4. [Профиль доступа первой когорты](./pilot-access-profile.md) — продуктовый
   состав и нормативные access rules.
5. [Профиль optional isolated design partner](./single-design-partner-access-profile.md)
   и
   [его launch checklist](./single-design-partner-launch-checklist.md) —
   contingency/enterprise-isolation lane, не основной launch path.
   [PostgreSQL runtime-role contract](./design-partner-database-role-contract.md) —
   bounded real-PostgreSQL evidence для разделения migration/provisioning и
   restricted runtime identity.
6. [Intake isolated design partner](./single-design-partner-intake.md) —
   какие несекретные данные нужны для Tenant D/Store D1 и что передаётся
   только защищённым каналом.
7. [Cutover-чеклист текущей сети](./current-network-cutover-checklist.md) —
   безопасный перевод одного tenant с четырьмя Store.
8. [AccessScope package](../security/access-scope/README.md) — нормативная
   server-side модель tenant/store authority, rollout и rollback.
9. [Матрица внедрения](../security/access-scope/v1/module-adoption-matrix.md) —
   фактический статус поверхностей.
10. [Стратегия тестирования](../security/access-scope/v1/test-strategy.md) —
    обязательные positive/negative topology-сценарии.
11. [Attachment ACL rollout](../security/access-scope/v1/attachment-acl-rollout.md)
    и
    [implementation checkpoint](../security/access-scope/v1/attachment-acl-implementation-checkpoint.md).
12. [План templates/recurring tasks](../security/access-scope/v1/staff-task-catalog-adoption-plan.md) —
    подтверждённые same-tenant cross-store разрывы и следующий implementation
    slice.
13. [Checkpoint task catalog](../security/access-scope/v1/staff-task-catalog-implementation-checkpoint.md) —
    фактический template/materializer/audit candidate, проверки и остаточные
    блокеры recurring/scheduler.
14. [Checkpoint recurring actor HTTP](../security/access-scope/v1/staff-task-recurring-http-implementation-checkpoint.md) —
    scoped Rule CRUD/manual/interactive due candidate и явная изоляция
    scheduler/all-tenant execution.
15. [Runbook integrity inventory staff tasks](../security/access-scope/v1/staff-task-integrity-inventory-runbook.md) —
    guarded read-only проверка legacy Template/Rule/Task/Run перед
    same-tenant EXPAND/VALIDATE.
16. [Runbook StaffTask integrity EXPAND](../security/access-scope/v1/staff-task-integrity-expand-runbook.md) —
    пять concurrent parent indexes, 14 composite + 14 simple compatibility
    `NOT VALID` FK, archive-first/global-existence Store protection, immutable
    parent IDs и порядок дальнейших `VALIDATE/CONTRACT`.
17. [Runbook aggregate reconciliation plan](../security/access-scope/v1/staff-task-integrity-reconciliation-plan-runbook.md) —
    read-only классификация `8 proposal + 29 operator + 6 review`, exact
    schema-first gate, actionable cap, `contentDigest`/`executionDigest` и
    exits `0/1/2/3`.
18. [Runbook admission StaffTask snapshot](../security/access-scope/v1/staff-task-integrity-snapshot-admission-runbook.md) —
    обязательный fail-closed checkpoint перед production-like inventory и
    planner: PostgreSQL 16, frozen `BASELINE_156 | EXPAND_162`, historical
    inventory checkpoint `CURRENT_171`, release manifest, catalog и отдельная
    SELECT-only роль.
    18a. [Runbook production-like authority operations](../security/access-scope/v1/staff-task-integrity-snapshot-authority-operations.md) —
    strict acquisition evidence, public-root lifecycle и detached Ed25519
    ceremony без private-key path внутри LeetPlus.
19. [Runbook SYNTHETIC reconciliation proposal dry-run](../security/access-scope/v1/staff-task-integrity-reconciliation-proposal-dry-run-runbook.md) —
    read-only row-evidence rehearsal только для подписанной disposable
    harness-БД: восемь proposal-кодов, HMAC-токены, coalescing и явный запрет
    standalone/production-like/apply.
20. [Шаблон release evidence](../security/access-scope/evidence/README.md) —
    какие обезличенные доказательства сохранять для каждого SHA.
21. [Tenant execution control-plane checkpoint](./tenant-execution-control-plane.md) —
    persisted stage/trial/profile, Platform Admin CAS, runtime admission,
    shared provisioning/revoke candidate, owner onboarding и точный остаток
    до dedicated external activation.
22. [Background execution containment](./background-execution-containment.md) —
    authoritative registry из 17 job kinds, временный `INTERNAL` compatibility
    lane, fail-closed external deny и точные ограничения до durable fencing.
23. [Initial OWNER identity and activation](./initial-owner-identity-and-activation.md) —
    shell-only provisioning, canonical email claim, encrypted mail outbox,
    persisted release gates, activation/suspend state machine и обязательная
    concurrency/effect-fencing matrix.
24. [Migration 166 delivery claim design](./delivery-claim-migration-166-design.md) —
    typed claim-generation/lease/revision для direct и bot delivery,
    canonical Store fence, fresh consent/reward/provider revalidation,
    provider-attempt marker, durable reaper/reconciliation, old-worker cutoff
    и обязательный populated `165 → 166` rehearsal. Reviewed design уже
    переведён в implementation candidate: additive migration и fail-closed
    legacy runtime containment созданы, но coordinator, Store-scoped effect
    enforcement, production-like evidence и cutover ещё не приняты.
25. [Identity email claim foundation and sealed write boundary](./identity-email-claim-foundation.md) —
    migrations 167/168, global canonical reservation, private advisory-lock
    namespace, sealed reserve/assert/transition/release RPC и zero-DML
    runtime-role contract для shell-only provisioning.
26. [Identity invite writer boundary](./identity-invite-writer-boundary.md) —
    migration 169, persisted claim provenance, explicit revoke history,
    sealed issue/reissue/revoke/accept, direct-create/email-change fail-closed
    и точный список оставшихся activation/backfill blockers.
27. [Legacy identity inventory and future backfill](./identity-legacy-backfill.md) —
    `IDENTITY_LEGACY_RECONCILIATION_V1`, least-privilege read-only inventory,
    exact catalog/RI-trigger/system authority, PG16 PUBLIC-ACL baseline,
    high-OID/SECURITY-DEFINER/INVOKER, FDW/parameter/type guards и current
    23-column ACL, strict remote TLS/production database binding,
    frozen-lock/Prisma `6.19.3` release verification. Historical
    `CURRENT_171` exact-head
    `7fca785ac6c2d77bcbd3655985d668a45fca788a` / CI
    [`30501299486`](https://github.com/boozik3412/leetplus/actions/runs/30501299486)
    (`run #50`) — `3/3 PASS`; ordinary-archive three-clone PostgreSQL 16 audit
    и independent review — `PASS`, P0/P1/P2=0. Historical `CURRENT_169`
    `d1162eed...` / CI `30479020686` остаётся prerequisite. Production-like
    inventory и signed proposal/apply/rollback остаются отдельной будущей lane.
28. [Design-partner identity writer isolation](./design-partner-identity-writer-isolation.md) —
    `DESIGN_PARTNER_IDENTITY_WRITER_ISOLATION_V1`: legacy
    `provision`/`rotate-invite` fail-closed до manifest/Prisma/БД/token,
    `status` остаётся read-only для исторических isolated fixtures, emergency
    `suspend` — narrowing-only. Local unit/boundary `23/23 PASS`, independent
    review без actionable P0/P1/P2; exact-head
    `f4224072f60507bd97f8e49440e3bda89ffe2aaa` / CI `30483184102`
    (`run #41`) — `3/3 PASS`, включая PostgreSQL 16 writer-isolation lifecycle.
29. [Invite secret transport](./invite-secret-transport.md) —
    `INVITE_SECRET_TRANSPORT_V1`: fragment-only delivery, capture/scrub до
    session/preview, fixed POST-body BFF/API, streaming/route-scoped `4 KiB`
    limits, strict Origin/JSON/token, preview projection и explicit INTERNAL
    residual. На этом historical checkpoint schema остаётся `CURRENT_169`;
    outbox, activation locator, verified OWNER delivery и production
    acceptance ещё pending.
    Implementation exact-head
    `f09383563bbcc22e11e0e67ca597360cf8996f4b` принят CI
    [`30488598755`](https://github.com/boozik3412/leetplus/actions/runs/30488598755)
    (`run #43`), `3/3 PASS`; independent review — `PASS` без actionable
    P0/P1/P2.
30. [Identity activation locator](./identity-activation-locator.md) —
    migration 170, immutable opaque workflow UUID, PII-free locked assertion,
    exact seven-RPC runtime allowlist и zero table privileges. Engineering
    exact-head `8dfe219...` принят CI `30493779099` (`run #47`), `3/3 PASS`;
    independent review — `PASS` без P0/P1/P2. Он остаётся historical
    prerequisite для dormant OWNER issue; verified delivery, activation и
    production admission ещё pending.
31. [Dormant OWNER invite HOLD outbox](./identity-owner-invite-hold-outbox.md) —
    `BETA-IAM-004G` / migration 171 — принятый bounded engineering checkpoint:
    один atomic DB writer
    для hard-coded `NETWORK OWNER` invite hash, encrypted `HOLD` outbox,
    claim transition, immutable idempotency command и PII-free
    audit/receipt. Issue RPC остаётся `EXCLUDED_PENDING` без runtime grant,
    admin routes — `503`; SMTP, worker, `HOLD→PENDING`, persisted GO, trial,
    tenant mutation, deploy и tester account не входят. Clean/populated,
    hostile-default-ACL, replay/race/rollback, exact runtime column ACL и
    crypto known-answer evidence `PASS`. Implementation `c03ee76...`,
    portability-fix/current head `7fca785...`; exact-head CI
    [`30501299486`](https://github.com/boozik3412/leetplus/actions/runs/30501299486)
    (`run #50`) — `3/3 PASS`, independent review — P0/P1/P2=0. Внешний
    `NO-GO` не изменён.
32. [Signed shared-beta admission provenance](./shared-beta-admission-provenance.md) —
    `BETA-IAM-004H` / migration 172: отдельные Ed25519-bound gate
    attestations и tenant admission decision, exact three-gate set,
    целостность заявленных release/environment/schema/database/tenant/identity/
    profile claims, create/assert/revoke без consumption и пустой production
    root registry. Actual current DB/release context этот checkpoint независимо
    не получает; `shellEvidenceDigest` здесь тоже является только signed claim и
    не доказывает фактические Store/OWNER override/provisioning audit. Их
    locked re-read, domain-separated recomputation и hard match обязательны в
    `BETA-IAM-004I` до issue и повторно до consume.
    Identity assert допускает только exact reservation либо доказанный
    immutable command + live `OWNER/NETWORK` invite + encrypted `HOLD` outbox.
    Отдельный PG16 test обязан доказать
    `seal → один issue RPC → persisted outbox → open`. Standalone
    `HOLD→PENDING` запрещён: он появится только в будущей единой activation
    transaction вместе с trial, `ACTIVE/OWNER_INVITED` и persisted-GO consume.
    Exact implementation `12d574166bffe860205b128dd9d092f4f54514fc`,
    migration `58f0ee03...`, catalog snapshot `3f53d6aa...`; GitHub CI
    [`30509157338`](https://github.com/boozik3412/leetplus/actions/runs/30509157338)
    (`run #53`) — `3/3 PASS`, independent reviews — P0/P1/P2=0. SMTP, route,
    production и tester account не входят; статус
    `ENGINEERING_ACCEPTED / NO-GO`.
33. [Atomic OWNER activation and release](./activate-and-release-owner-invite.md) —
    `BETA-IAM-004I` принят как bounded engineering checkpoint. Migration
    173 изолированно добавляет
    dormant enum label `PENDING`, но не разрешает ни одного перехода и не
    выдаёт новых privileges. Отдельный fail-closed verifier требует две
    независимые Ed25519-подписи: CI build provenance и ops deployment
    provenance; оба production root registry пока намеренно пусты. Build
    подписывает exact artifact/migration/policy manifests и обязательные
    `trialPolicyVersion + trialDurationSeconds` без product default.
    Deployment связывает build с одноразовым DB challenge, environment,
    database identity и exact dedicated activation `session_user` role/OID.
    Accepted checkpoint усиливает identity до v2: owner-only `UNLOGGED` instance
    anchor плюс `pg_postmaster_start_time()` делают copied/restarted database
    fail-closed до нового signed marker. Dedicated role проверяется по полной
    hostile matrix, включая cross-database/TEMP, FDW/parameter/system/PUBLIC
    ACL и `pg_authid`/`pg_read_file`.
    Live VM/process-memory snapshot clone остаётся вне threat model до
    independently sourced external host attestation.
    Локальный PostgreSQL 16 подтвердил exact populated
    `172→173→174`, clean `174/174`, hostile ACL rollback/retry,
    `1 ACTIVATED + 99 REPLAYED`, fault rollback, replay-role/OID drift,
    direct/PUBLIC enum-domain type drift и exact typed build-provenance replay.
    Runtime enrollment сохранил `7` application RPC, запретил `5 + 9 + 21`
    private functions и подтвердил zero privileges на `12` tables, `232`
    columns и `2` sealed types.
    Migration SHA-256: 173 `8c613bce...`, 174 `df7b7869...`.
    Implementation
    `2540088076997ef228cd68e42165e857575aad86`; final accepted evidence head
    `eb056a491bc7ad161addfd8c4d859606231f7f43`; GitHub CI
    [`30592173595`](https://github.com/boozik3412/leetplus/actions/runs/30592173595)
    (`run #57`) — `3/3 PASS`; independent reviews — P0/P1/P2=0. Статус:
    `ENGINEERING_ACCEPTED / NOT_DEPLOYED / EXTERNAL_PILOT_NO-GO`. Immutable
    production artifact/deployment marker, утверждённая длительность trial,
    root enrollment, SMTP delivery и production-like rehearsal всё ещё
    обязательны, поэтому внешний статус остаётся `NO-GO`.
    Следующий после него checkpoint
    `BETA-IAM-004J / LEASED_INITIAL_OWNER_MAIL_DELIVERY_V1` принят отдельно
    ниже; production
    SMTP, worker enrollment и routes acceptance 004I не включала.
34. [Leased initial-owner mail delivery](./leased-initial-owner-mail-delivery.md) —
    нормативный контракт `BETA-IAM-004J`: отдельная worker DB-role, tenant
    enrollment, leases/CAS, ciphertext erase до SMTP, immutable provider
    marker, post-marker reconciliation, strict TLS, fragment-only invite и
    обязательный `SENT` barrier для preview/accept. Статус:
    `ENGINEERING_ACCEPTED / NOT_DEPLOYED / EXTERNAL_PILOT_NO-GO`. Immutable
    identity checkpoint `CURRENT_176`
    интегрирован через промежуточный merged prerequisite `CURRENT_178` в
    terminal accepted release `CURRENT_179` /
    `20260731120000_identity_mail_delivery_release_head`; clean `179/179` и
    три независимые migration history проходят. Terminal SHA —
    `c394060fb...`, manifest `179` — `333018542...`, tamper matrix —
    `1/1/1/1/1`, post-terminal manifest-drift rejection — `55000/effects 0`,
    cleanup residue — `0`. Owner issue/activation, RPC-only worker
    с trusted TLS fake SMTP, negative SMTP matrix, worker/runtime enrollment и
    full API `113 suites / 2394 passed / 2 todo` проходят. Exact evidence SHA
    `4bdad8c2e6a0f2efc86d54c487bfdc9bf2d9c899`, CI
    [`30661123961`](https://github.com/boozik3412/leetplus/actions/runs/30661123961)
    (`run #60`) — `3/3 PASS`, staged review — P0/P1/P2=0. Production
    deploy/restart/drain, tenant enrollment и внешний доступ не выполнялись.
35. [Protected mail-worker tenant enrollment](./protected-mail-worker-tenant-enrollment.md) —
    контракт `BETA-IAM-004K`: provider authority отделена от полного runtime
    config, tenant allowlist больше не ротирует authority существующей сети,
    описаны `ACTIVE/DRAINING/DISABLED`, единый lock order и будущая
    operator-only ceremony. Worker/config foundation и contract-only proposal
    parser дополнены неавторизующим read-only preflight: bounded canonical
    file проверяется до Prisma, а database/role/release/tenant/enrollment/drain
    evidence читается одной `READ ONLY REPEATABLE READ` транзакцией.
    Результат всегда `authorization=false/canMutate=false`; signature,
    runtime-config digest и apply/rollback остаются deferred. Отдельный
    `CURRENT180` schema-candidate
    `20260801010000_identity_mail_tenant_enrollment_control_plane` с SQL
    SHA-256 `e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683`
    находится вне
    `prisma/migrations`: `DORMANT_SCHEMA_ONLY / NOT_DEPLOYABLE`. Static gate —
    `81/81`, self-test — `21` probes, decision — `COMPLIANT`; два
    независимых PostgreSQL 16.13 smoke — `PASS`, source zero-diff/cleanup
    подтверждены, review P0/P1/P2=`0/0/0`. Candidate не создаёт
    enrollment/role, не имеет apply RPC и не разрешает production mutation.
    Exact implementation
    `475e9be4726787db955d895d348af1fc5a7c2db3`, GitHub Actions
    [`30690147568`](https://github.com/boozik3412/leetplus/actions/runs/30690147568)
    (`run #64`) — `3/3 PASS`.
36. [Protected identity-mail tenant lock and drain v2](./protected-mail-tenant-lock-drain-v2.md) —
    reviewed design-only контракт общего producer/worker advisory lock,
    worker v2 settlement и crash-resumable `DRAINING` с одновременными
    zero-secret/zero-inflight predicates. Рядом реализованы pure
    enrollment-command authority (`12/12`, включая fixture-substituted pinned
    52-column mapping) и worker runtime-attestation (`12/12`); production roots
    frozen empty, runtime verdict не разрешает mutation/send без отдельной
    per-tenant DB readiness. SQL, canonical migration, grant, apply, SMTP и
    tenant data этим срезом не изменяются.
37. [CURRENT181 worker v2 candidate](./identity-mail-current181-worker-v2-candidate.md) —
    materialized stacked rehearsal поверх exact dormant CURRENT180:
    tenant-first advisory lock, пять worker v2 RPC, reconcile replay,
    ACTIVE/DRAINING claim bindings, tenant-leading indexes и immediate
    `55000` stubs обоих legacy producer v1. Exact SQL SHA-256 —
    `c923d26d77fbb268fccc03d6eff0539a75c2644059d7f7ffc2493491c88f69ac`.
    Semantic static gate и PostgreSQL 16.13 apply/ACL/concurrency/timeout/
    rollback/cleanup rehearsal приняты; source остался `179/179`, residue —
    `0`. Candidate не создаёт grants/enrollment и остаётся
    `NOT_CANONICAL / NOT_DEPLOYABLE`; producer/activation/coordinators, signed
    runtime attestation и production grants остаются обязательными следующими
    этапами. Ранее найденная P1 cross-path lock inversion закрыта общим
    tenant-first protocol и zero-`40P01` PostgreSQL matrix. Provider-mark/complete
    lost-response всё ещё требуют event-backed replay либо typed reconcile
    handoff; повторная SMTP-отправка остаётся запрещённой. Exact revised-stack
    implementation `7fb3cf966d5c612f0f2504f4545151ef3edb8ac9`, GitHub Actions
    [`30720288891`](https://github.com/boozik3412/leetplus/actions/runs/30720288891)
    (`run #79`) — `3/3 PASS`. Исторические `abbfe561...` / `run #66`
    относятся к доревизионному candidate и не являются evidence текущих bytes.
38. [Tenant-first claim protocol и CURRENT182 candidate](./identity-mail-current182-tenant-first-claim-protocol.md) —
    CURRENT179-compatible app и worker boundary для create, reissue/revoke,
    cancel, accept, provisioning, emergency suspend и всех пяти текущих
    worker RPC; outbox-only marker/completion допускаются только по
    DB-derived binding validated `CLAIMED` receipt. Runtime boundary теперь
    использует bounded `READ COMMITTED` и отдельные statements
    settings -> tenant advisory lock -> protected operation, чтобы первый
    post-wait read получил свежий snapshot. Stacked CURRENT182 с SQL SHA-256
    `5eb1ab8f2535c212b334e599071aefbae19039cc519177f62cbe0de7373e6fdf`
    fence-ит те же пять canonical claim entrypoints на уровне БД и немедленно
    retire-ит три legacy v1 writer. Candidate остаётся
    `NOT_CANONICAL / NOT_DEPLOYABLE`. Historical exact evidence
    `dd8b541...` / `run #72` подтвердило initial cross-path matrix; revised
    CURRENT181..183 stack принят на `7fb3cf9...` / `run #79`, `3/3 PASS`.
    Non-empty worker-v2 matrix теперь закрыта диагностическими fixtures
    CURRENT183, но они не заменяют signed coordinator.
39. [CURRENT183 worker v2 freshness](./identity-mail-current183-worker-v2-freshness.md) —
    stacked successor с SQL SHA-256
    `a3b92838cac386480384abb770aa06a9f2cb27b4326d5c6f9344f9019b26f2f0`:
    shared helper fail closed требует `READ COMMITTED`, а worker-v2 readiness
    pinned к exact `183/183`. Dormant API adapter вызывает ровно пять v2 RPC,
    tenantId передаётся первым, receipts фиксируют enrollment-state, policy и
    provider authority. CURRENT179 freshness regression и disposable
    PostgreSQL `ACTIVE|DRAINING × HOLD|PENDING` matrix проверяют post-wait
    state, least-privilege worker role и независимый progress другого tenant.
    Initial rows матрицы являются diagnostic owner-seeded fixtures только в
    disposable DB и не заменяют signed coordinator. Candidate не создаёт
    grants/enrollment, не подключён к DI/CLI и остаётся
    `NOT_CANONICAL / NOT_DEPLOYABLE`. Exact implementation
    `7fb3cf966d5c612f0f2504f4545151ef3edb8ac9` принят GitHub Actions
    [`30720288891`](https://github.com/boozik3412/leetplus/actions/runs/30720288891)
    (`run #79`) — `3/3 PASS`; CURRENT183 PostgreSQL suite — `3/3 PASS`:
    `ACTIVE/PENDING` claim, `ACTIVE/HOLD` empty, оба `DRAINING` варианта
    fail closed с `42501`, а waiter после lock видит свежий `DRAINING` без
    `40P01` и без блокировки другого tenant.
40. [CURRENT184 replay потерянного ответа](./identity-mail-current184-lost-response-replay.md) —
    stacked dormant successor с SQL SHA-256
    `d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424`.
    Append-only event хранит domain-separated digest exact settlement request;
    `provider_mark_v2` возвращает `MARKED` только для текущего живого marker,
    иначе typed `HANDOFF` запрещает SMTP, а `complete_v2` восстанавливает
    исходный terminal receipt. Adapter делает не более двух повторов только
    для неизвестного результата DB-RPC; SMTP, claim и reap не повторяются.
    Candidate owner-only, не подключён к DI/config/CLI и возвращает
    `NOT_DEPLOYABLE / authorization=false / canSend=false`. Exact implementation
    `db154b412a9469f49fab6b27ad2e333426cdfa7f` принят GitHub Actions
    [`30740155651`](https://github.com/boozik3412/leetplus/actions/runs/30740155651):
    CURRENT183 и CURRENT184 PostgreSQL suites — по `3/3 PASS`.
41. [CURRENT185 sealed coordinator boundary](./identity-mail-current185-signed-coordinator-boundary.md) —
    dormant application-side import только для branded `PINNED` Ed25519
    authority. Exact frozen 52-column mapping передаётся в одну factory-minted
    owner-owned RPC capability; structural/proxy/accessor forgeries отклоняются.
    Lost response допускает один exact-object retry, затем typed ambiguous
    outcome. SQL, production root, DB role/grant, DI/config/CLI и runtime wiring
    отсутствуют; gate — `14/14 PASS`. Exact implementation `5ee3228...`
    принят GitHub Actions
    [`30742082348`](https://github.com/boozik3412/leetplus/actions/runs/30742082348);
    статус остаётся `DORMANT_APPLICATION_BOUNDARY / NOT_DEPLOYABLE`.
42. [CURRENT185 duty-role authority](./identity-mail-current185-duty-role-authority.md) —
    dormant exact grants projection и отдельный Ed25519 duty-role manifest.
    Каталог связывает database/schema/role/routine OID, exact ACL и effective
    privileges; signed payload дополнительно связывает deployment/actual
    context и CURRENT184/CURRENT185 chain. Transparent/revoked Proxy и recreate
    identity fail closed. Grants `12/12`, manifest `16/16`, combined `28/28`;
    independent reviews — без P0/P1. Exact implementation `ede6291...` принят
    GitHub Actions
    [`30746251082`](https://github.com/boozik3412/leetplus/actions/runs/30746251082)
    (`run #87`). Production roots, SQL apply, роли, grants и runtime wiring
    отсутствуют; successor manifest для V2 обязателен.
43. [Enrollment authority V2](./identity-mail-enrollment-authority-v2.md) —
    отдельный dormant command verifier с новым domain/profile и successor
    manifest V2 binding. Все 52 V1 DB fields сохранены, 17 duty fields добавлены
    exact tail (`69` total); V1 downgrade, cross-domain/root reuse, hostile
    objects/Proxy и transition drift fail closed, локально `14/14 PASS`.
    Boundary честно не проверяет независимую manifest signature и остаётся
    `NOT_AN_ADMISSION`: следующий slice обязан скомпоновать два `PINNED` brand.
    Exact implementation
    `05291a14004fa01d33ca8fc4b360dda4218ceb9a` принят GitHub Actions
    [`30749331368`](https://github.com/boozik3412/leetplus/actions/runs/30749331368)
    (`run #88`), все три CI jobs — green.
44. [Manifest-bound enrollment V2](./identity-mail-enrollment-manifest-bound-v2.md) —
    successor Manifest V2 и pure two-signer composition. Оба exact-module
    `PINNED` brand, разные signer fingerprints, database/deployment/context,
    все 17 duty fields и один normalized grants projection обязаны совпасть.
    Результат раскрывает future-import evidence и exact 69-field DB mapping,
    но сохраняет `authorization/canMutate/canSend=false`; production roots,
    SQL, роли, grants и runtime wiring отсутствуют. Manifest V2 `13/13`,
    composition `6/6`, объединённый контур `45/45 PASS`. Exact implementation
    `96c1d93fb2347a2b799997d7fac2c8df895d8f73` принят GitHub Actions
    [`30753175709`](https://github.com/boozik3412/leetplus/actions/runs/30753175709)
    (`run #89`), оба новых gate и все три CI jobs — green.
45. [Enrollment evidence importer V2](./identity-mail-enrollment-evidence-importer-v2.md) —
    sealed application bridge от exact composed brand к owner-only two-TEXT
    DB RPC из следующего noncanonical candidate. Canonical bundle включает 69 DB arguments, обе signature
    evidence и одну grants projection; limit `262144` bytes. Callable
    capability принимает только module-branded request, lost response имеет
    один exact retry, а replay ссылается на original persisted receipt.
    Focused `9/9`, composition+importer `15/15 PASS`; application module не
    содержит DB credential, DI/CLI/runtime wiring или authority. Exact implementation
    `cd2a0c576ecdbb1b1c8985d72603c8f0777f0553` принят GitHub Actions
    [`30754790681`](https://github.com/boozik3412/leetplus/actions/runs/30754790681)
    (`run #90`), importer gate и все три CI jobs — green.
46. [CURRENT185 evidence ledger V2](./identity-mail-current185-evidence-ledger-design.md) —
    noncanonical database candidate version-expands empty command ledger до
    V2/69, добавляет append-only Manifest V2/revocation evidence и owner-only
    two-TEXT importer. Все `17` duty fields связаны composite FK; replay до
    expiry/revocation возвращает original receipt. Exact SQL SHA-256
    `2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6`;
    foundation `21/21`, branded fixture `3/3`, PostgreSQL 16 `7/7`, CURRENT184
    regression `3/3`. Exact implementation `0688b6ef...` и inventory
    compatibility head `23cd1470...` приняты GitHub Actions
    [`30765750662`](https://github.com/boozik3412/leetplus/actions/runs/30765750662)
    (`run #92`), все три CI jobs — green. GUC INSERT fence — только
    anti-accident. Отдельный
    `NOLOGIN` owner, runtime roles/grants/attestation, shared ACL epoch/lock,
    four-TEXT driver, provider mark/complete lost-response,
    producer/activation/backfill, zero-secret/zero-inflight и подписанная
    apply/rollback/zero-diff rehearsal ещё обязательны. Статус:
    `IMPLEMENTED_CANDIDATE / NONCANONICAL / NOT_DEPLOYABLE`.
47. [CURRENT186 runtime role boundary](./identity-mail-current186-runtime-role-boundary.md) —
    реализован database-local candidate: `9` definition relations, `13`
    ACL/ownership relations, `38` ACL objects, `22` owner routines, `21`
    triggers, `110` constraints и `56` indexes. Support surface содержит `39`
    column-authority rows на `36` relationOid+attnum-bound columns плюс один
    helper `EXECUTE`. Owner-only
    four-TEXT driver, append-only ACL epoch/lock, 39-key epoch payload
    с 20-key/4-MiB durable before-image sidecar и controller с шестью режимами
    `check/plan/apply/rollback/attest/emergency` реализованы. Controller требует
    прямой superuser session exact database-owner OID; rollback ремонтирует
    только owner-granted/non-grantable ACL pinned duty OID либо PUBLIC и
    доказывает canonical non-owner semantics, не raw `relacl/proacl` bytes.
    Exact APPLY
    lost-response replay и emergency phase 1 с common ACL lock, максимум тремя
    попытками/terminal `UNCONFIRMED`, terminal `NOLOGIN` и финальной
    zero-session recheck реализованы. Scope остаётся
    `CURRENT_DATABASE_ONLY`; cross-database, future creator default privileges,
    application-role allowlist и production apply имеют false flags. Два
    независимых PostgreSQL 16 прогона финальных bytes дали `28/28 PASS`
    (`325.812 s`, `320.49 s`) и residue `0/0/0`; CURRENT185 regression сверяет
    exact `16` command и `14` unique manifest provenance rows. Статус:
    `IMPLEMENTED_CANDIDATE / ENGINEERING_ACCEPTED / NONCANONICAL / NOT_DEPLOYABLE`;
    test access — `NO-GO`.
48. [CURRENT187 cluster/application admission successor](./identity-mail-current187-cluster-application-admission.md) —
    обязательный successor. Первые deny-only slices реализованы: separate-purpose
    authority, [pure exhaustive planner](./identity-mail-current187-cluster-inventory-planner.md),
    [read-only multi-DB acquisition](./identity-mail-current187-read-only-cluster-acquisition.md)
    и [independent signed DDL-fence attestation](./identity-mail-current187-independent-ddl-fence-attestation.md).
    [Persisted consumption/revocation ledger](./identity-mail-current187-persisted-ddl-fence-ledger.md)
    закрывает exact replay, revoke/expiry races и least-privilege ACL как
    `25/25` + PostgreSQL `1/1`; fresh-after-lock SQL pin —
    `dd5f4db5aecef2c537251bc5262063c1012a1383aec0d0137e7d8b9536f8bb63`.
    [Signed cluster policy binding](./identity-mail-current187-signed-policy-binding.md)
    добавляет стабильные scoped fingerprints ролей, current/default ACL и
    полного multi-DB catalog, затем fail-closed связывает их с exact
    purpose-bound deployment envelope. Planner `16/16`, acquisition/binding
    `15/15`; exact-SHA CI `31391874407` на `b64abfe5…` — `3/3 SUCCESS`.
    `BINDINGS_MATCHED` остаётся deny-only и не является semantic allowlist либо
    deployment GO. Evidence: [CURRENT187-F CI](./identity-mail-current187-f-ci-evidence-2026-08-10.md).
    [CURRENT187-G semantic risk facts](./identity-mail-current187-semantic-risk-facts.md)
    теперь детерминированно извлекает secret-free counts/digests для опасных
    role attributes, LOGIN, memberships, settings, ownership, current/default
    ACL, `PUBLIC`/grantable grants и effective privileges. Cluster-wide
    semantic digest включён в уже подписываемый `clusterCatalogDigest`, но
    `policyAllowlistEvaluated=false` и все launch/effect flags остаются false.
    Exact-SHA CI `31397844858` на `3804792e…` — `3/3 SUCCESS`; evidence:
    [CURRENT187-G CI](./identity-mail-current187-g-ci-evidence-2026-08-10.md).
    [CURRENT187-H signed semantic allowlist](./identity-mail-current187-semantic-allowlist.md)
    локально добавляет четвёртый независимый Ed25519 purpose, exact secret-free
    allowlist document и fail-closed `facts + allowlist` evaluator. F теперь
    требует exact branded H receipt; успешный результат остаётся только
    `MATCHED_DENY_ONLY`, а `deploymentGoConsumable`, `testAccessAuthorized` и
    `sharedBetaAccess` остаются false. Локальные gates: authority `13/13`,
    acquisition/risk/allowlist/policy `24/24`, DDL fence `11/11`, полный
    disposable rehearsal `163/163`. Exact-SHA CI `31403020215` на `e91b641f…`
    — `3/3 SUCCESS`, artifact digest `sha256:94eb8908…c61b7`; evidence:
    [CURRENT187-H CI](./identity-mail-current187-h-ci-evidence-2026-08-10.md).
    Статус H — `ENGINEERING ACCEPTED / DENY-ONLY / NONCANONICAL / NOT_DEPLOYABLE`.
    [CURRENT187-I persisted semantic approval ledger](./identity-mail-current187-persisted-semantic-approval-ledger.md)
    добавляет explicit verification provenance, canonical one-time consumption
    и scoped revocation contracts; F теперь принимает только branded persisted
    I receipt. Foundation SHA `340e6f05…` принят CI `31411596083` как
    `3/3 SUCCESS`; [CI evidence](./identity-mail-current187-i-ci-evidence-2026-08-10.md).
    Noncanonical PostgreSQL candidate `daf5a98f…` реализует append-only/FORCE
    RLS/execute-only RPC ledger и exact canonical-JSON reconstruction; static
    `7/7`, два независимых PostgreSQL 16.13 hostile run — `1/1 PASS`, включая
    duplicate-key/reordered JSON attacks, postflight `0/0/0`. Exact candidate
    SHA `8e2a25ec…` принят CI `31416609580` как `3/3 SUCCESS`, artifact digest
    `sha256:9c46d1d6…a2fe0f`. Candidate ещё не canonical, production roots/runtime
    attestation отсутствуют. Поэтому I остаётся
    `EXACT-HEAD CI ACCEPTED / DENY-ONLY / NOT DEPLOYABLE`, а внешний доступ —
    `NO-GO`.
    [CURRENT187-J network/runtime attestation foundation](./identity-mail-current187-j-network-runtime-attestation-foundation.md)
    фиксирует exact deny-only контракт для четырёх service identities и пяти
    deployment digest: endpoint, TLS, HBA, pooler и service-account mapping.
    Host/control-plane и network probe имеют разные branded границы; trust,
    wildcard, user collapse, неверный pool mode и incomplete negative probes
    fail closed. J `10/10`, общий CURRENT187 gate `42/42`; exact SHA
    `04ffff27…` принят CI `31420665364` как `3/3 SUCCESS`, artifact digest
    `sha256:0cb6ac6e…bd337`. Это только `SYNTHETIC-CI-ONLY`: actual
    TCP/TLS/HBA/PgBouncer collectors, production signer/root, persisted
    consumption и связь с F ещё не реализованы.
    [CURRENT187-J1 actual PostgreSQL backend session collector](./identity-mail-current187-j1-postgres-session-collector.md)
    добавляет capability-bearing read-only Prisma collector: exact database и
    role OID, application identity, backend/network coordinates, read-only/TLS
    и role-policy facts. Local unit `11/11`, общий CURRENT187 gate `53/53`;
    exact SHA `a9513c69…` принят CI `31577001152` как `3/3 SUCCESS`, actual
    loopback PostgreSQL J1 — `SUCCESS`, artifact `sha256:8e0c26f5…d334`.
    [CI evidence](./identity-mail-current187-j1-ci-evidence-2026-08-12.md).
    J1 остаётся deny-only и не
    утверждает endpoint identity, matched HBA rule, PgBouncer identity или
    negative probe.
    [CURRENT187-J2 endpoint/TLS peer collector](./identity-mail-current187-j2-endpoint-tls-peer-collector.md)
    добавляет actual DNS→exact IP→TCP→PostgreSQL SSLRequest→TLS 1.2/1.3
    observation с verify-full hostname/CA, leaf DER и SPKI binding. J2 unit
    `10/10`, aggregate CURRENT187 `63/63`, actual protocol/TLS harness `1/1`;
    exact SHA `d386dfa2…` принят CI `31584476362` как `3/3 SUCCESS`, artifact
    `sha256:722f77c2…f495`.
    [CI evidence](./identity-mail-current187-j2-ci-evidence-2026-08-12.md).
    Receipt остаётся deny-only: endpoint/TLS observed, но не attested.
    [CURRENT187-J3/J4 control-plane collectors](./identity-mail-current187-j3-j4-control-plane-collectors.md)
    добавляют actual read-only `pg_hba_file_rules`/reload-clock observation и
    PgBouncer simple-protocol `SHOW CONFIG/DATABASES/USERS/POOLS/SERVERS`.
    J3 `8/8`, J4 `8/8`, aggregate CURRENT187 `79/79`; actual HBA PostgreSQL
    step и collector candidate приняты exact SHA `ceed7239…`, CI
    `31586755130` — `3/3 SUCCESS`, artifact `sha256:faf8c3e2…aa283`.
    [CI evidence](./identity-mail-current187-j3-j4-ci-evidence-2026-08-12.md).
    Actual disposable PgBouncer process принят SHA `b9296430…`, CI
    `31591848857` — `3/3 SUCCESS`, integration `2/2`, artifact
    `sha256:01f3aba1…d776`.
    [Actual J4 PgBouncer CI evidence](./identity-mail-current187-j4-pgbouncer-ci-evidence-2026-08-12.md).
    File catalog не объявляется
    effective loaded HBA; оба receipt остаются unsigned deny-only.
    Production roots остаются frozen-empty. Дальше требуются post-Green
    production root enrollment и отдельный deployment GO, actual
    LOGIN/HBA/pooler/service mapping,
    application/migration/creator role name+OID, exact current/default ACL,
    host-side fence executor, hostile second-DB matrix,
    rollback/emergency/zero-diff и зависимости от
    provider mark/complete recovery и outbound kill-switch. Он также не снимает
    отдельный CURRENT186/follow-up gate полного definition coverage для
    `pg_attribute`, column defaults и RLS policies. Статус:
    `IN PROGRESS / DENY-ONLY / NONCANONICAL / NOT_DEPLOYABLE`. Любой CURRENT187 receipt имеет
    `testAccessAuthorized=false`; после Engineering Green всё ещё обязательны
    production enrollment/deploy GO, protected OWNER workflow, полный
    AccessScope/module scope, Gate 1MT, Gate 2, canary и отдельный post-green
    `SHARED BETA GO`. Production остаётся `CURRENT179/179`; четыре текущих
    клуба одной сети и внешний тестер не изменены.
    [CURRENT187-J5 signed connection-probe matrix](./identity-mail-current187-j5-signed-connection-probe-matrix.md)
    добавляет отдельный Ed25519 purpose для четырёх service purpose и exact
    `positive + 8 negative` outcomes на каждый. J5 `10/10`, aggregate CURRENT187
    `89/89`, typecheck green; exact-SHA CI `31594459396` — `3/3 SUCCESS`, artifact
    ID `9140727030`; production roots frozen-empty, actual topology execution,
    persisted consumption и F binding отсутствуют, поэтому статус
    остаётся `NO-GO`.

- [CURRENT187-J5 capability probe runner](./identity-mail-current187-j5-capability-probe-runner.md)
  — production entry связывает branded J1–J4 receipts, выполняет 20
  классифицированных negative PostgreSQL connection attempts и 12 безопасных
  control-policy evaluations без изменения HBA/PgBouncer; runner `10/10`, J5
  `20/20`, actual wire/TLS fixture `1/1`, aggregate CURRENT187 `99/99`. Exact
  SHA `e4789e29…`, CI `31597872402` — `3/3 SUCCESS`, actual negative probe step
  `SUCCESS`, artifact `sha256:1fb76259…fdd85f`; см.
  [J5-R1 CI evidence](./identity-mail-current187-j5-r1-ci-evidence-2026-08-12.md).
  Actual branded J1–J4 production-like topology, signer/root, persistence и
  F/deploy binding ещё обязательны.

- [CURRENT187-J5-R2 protected signer](./identity-mail-current187-j5-r2-protected-signer.md)
  — отдельный file-backed signer принимает только branded R1 receipt, требует
  external canonical Ed25519 pair и exact public pin, закрывает repo/temp,
  link и byte/inode drift. Signer `6/6`, combined J5 `26/26`, aggregate
  CURRENT187 `105/105`; production root frozen-empty, key ceremony/OS ACL или
  HSM/KMS, persistence и F/deploy binding ещё обязательны.

- [CURRENT187-J5-R3 persisted ledger contract](./identity-mail-current187-j5-r3-persisted-ledger-contract.md)
  — transferable deny-only one-time consumption и `ENVELOPE/MATRIX/ROOT`
  revocation bundles для exact signed J5 envelope. Noncanonical PG candidate
  добавляет append-only/FORCE-RLS/execute-only RPC; contract `6/6`, static PG
  `7/7`, combined J5 `39/39`, aggregate CURRENT187 `118/118`. Exact SHA
  `1f7ef47c…`, CI `31606012609` — `3/3 SUCCESS`, actual PG `1/1`, postflight
  `0/0/0`; см. [J5-R3 PostgreSQL CI evidence](./identity-mail-current187-j5-r3-pg-ci-evidence-2026-08-12.md).
  Independent review, canonical promotion, production root/topology и
  production binding обязательны.

- [CURRENT187-J5-R4 persisted probe deploy binding](./identity-mail-current187-j5-r4-deploy-binding.md)
  — отдельный exact deny-only successor receipt рядом с immutable deployment
  authority: J5 envelope/matrix/persisted receipt/root/verifier digest связаны
  через общий release/cluster/universe без изменения frozen deploy contract. J5
  `42/42`, aggregate CURRENT187 `121/121`, authority `13/13`; receipt остаётся
  synthetic/non-consumable. Exact SHA `5fca5a9d…` принят CI `31609394804`
  `3/3 SUCCESS`, artifact `sha256:396d7e78…dce1`. R5 ниже уже добавляет
  отдельный F + R4 successor; production root/topology ещё обязательны.
  [CI evidence](./identity-mail-current187-j5-r4-ci-evidence-2026-08-12.md).

- [CURRENT187-J5-R5 policy successor](./identity-mail-current187-j5-r5-policy-successor.md)
  — pure branded composition CURRENT187-F + R4 с exact authority payload digest
  equality. Acquisition `21/21`, aggregate CURRENT187 `124/124`, refreeze
  `17/17`, assembler `21/21`; другой signed authority, clone, Proxy и arity fail
  closed. Exact SHA `603e09bf…` принят CI `31612439527` `3/3 SUCCESS`, artifact
  `sha256:d1fe9df4…8a11`; результат synthetic deny-only и не выдаёт внешний
  доступ. [CI evidence](./identity-mail-current187-j5-r5-ci-evidence-2026-08-12.md).

- [CURRENT187-J5-R6 production-origin fence](./identity-mail-current187-j5-r6-production-origin-fence.md)
  — отдельные strict brands не позволяют production-mode test dependency seams
  подменить actual J1–J4 collectors. Production runner отклоняет все такие
  receipts до network I/O; integration `2/2`. SHA `24b2f7ea…` принят CI
  `31614205518` `3/3 SUCCESS`, artifact `sha256:766d1173…9449`. Actual co-located
  topology и production GO не заявляются. [CI evidence](./identity-mail-current187-j5-r6-ci-evidence-2026-08-12.md).

- [CURRENT187-J5-R7 PgBouncer client mTLS credentials](./identity-mail-current187-j5-r7-pgbouncer-mtls-client-credentials.md)
  — production J4 требует bounded exact client certificate + PKCS#8 private
  key, проверяет отдельные SHA-256 и передаёт секреты только TLS client. Receipt
  содержит лишь aggregate binding digest; synthetic mode принимает только
  четыре `null`. J4 `9/9`, CURRENT187 `125/125`, actual wire/TLS `2/2`,
  typecheck green. SHA `5f2b529a…` принят CI `31617615666` `3/3 SUCCESS`,
  artifact `sha256:77b3e24a…60b0a`. Actual co-located public-collector topology
  ещё обязательна; production GO не заявляется.
  [CI evidence](./identity-mail-current187-j5-r7-ci-evidence-2026-08-12.md).

- [CURRENT187-J5-R8 actual J4 mTLS fixture](./identity-mail-current187-j5-r8-actual-pgbouncer-mtls-fixture.md)
  — одноразовый CA, отдельные server/client certificates, PostgreSQL TLS и
  PgBouncer client/server verify-full. Integration вызывает public actual J4
  collector и требует strict production-origin receipt без PEM/raw hashes.
  Actual integration `3/3` без skip; SHA `8917cd4b…` принят CI `31624262449`
  `3/3 SUCCESS`, artifact `sha256:101e956b…04cca`. Co-located J1–J4 topology
  ещё не заявляется. [CI evidence](./identity-mail-current187-j5-r8-ci-evidence-2026-08-12.md).

- [CURRENT187-J5-R9 co-located runner](./identity-mail-current187-j5-r9-co-located-runner-candidate.md)
  — один disposable контур собирает strict public J1/J2 для четырёх service
  purpose, strict J3/J4 и запускает production connection-probe matrix `4 + 20
  - 12`. J2 и runner используют exact client mTLS credentials без отражения
секретов в receipt; exact gateway `/32`, временные HBA, roles и hostname
mapping имеют scoped cleanup. Target integration `4/4`без fail/skip; SHA`677a37c2…`принят CI`31635286090` `3/3 SUCCESS`, artifact
`sha256:c0ade8bd…a7595`; все downstream PostgreSQL gates green. Это engineering
    acceptance, а не разрешение production или внешнего доступа.
    [CI evidence](./identity-mail-current187-j5-r9-ci-evidence-2026-08-13.md).

- [CURRENT187-J5-R10 disposable external signer bridge](./identity-mail-current187-j5-r10-external-signer-bridge-candidate.md)
  — production file-backed signer подписывает exact R9 receipt одноразовым
  внешним Ed25519 key; production root registry остаётся frozen-empty и
  обязан отклонить envelope до отдельной key ceremony/root enrollment. Exact
  SHA `8c34895a…` принят CI `31639146344` как `3/3 SUCCESS`; target integration
  `4/4`, без fail/skip; artifact `sha256:9ac538fa…b00a4`. Это доказывает bridge,
  но не регистрирует production root и не разрешает deployment/внешний доступ.
  [CI evidence](./identity-mail-current187-j5-r10-ci-evidence-2026-08-13.md).

49. [Provider boundary acceptance](./identity-mail-provider-boundary-acceptance.md) —
    единый acceptance contract для at-most-one SMTP invocation на durable
    attempt, provider mark/complete lost-response, ambiguous-result quarantine,
    global/tenant kill-drain и zero-secret-bearing/zero-process-inflight
    evidence. Deterministic actual-service + CURRENT184-adapter + strict-SMTP
    harness принят как `ENGINEERING_ACCEPTED / DORMANT`; обычный candidate
    `assertReady` остаётся fail-closed `NOT_DEPLOYABLE`. Это не доказывает
    exactly-once SMTP delivery и не меняет production/shared-beta `NO-GO`.

Текущий engineering-accepted schema target — `CURRENT_179`;
`CURRENT_176` остаётся его отдельно доказанным immutable identity-mail
checkpoint, а `CURRENT_178` — промежуточным `origin/main` prerequisite.
Merge evidence SHA `9b2f82b2cfdd41b05bf67e71e48df6cdc3e0fda2`, CI
[`30684863397`](https://github.com/boozik3412/leetplus/actions/runs/30684863397)
(`run #61`) — `3/3 PASS`; внешний статус остаётся `NO-GO`.

Неканонические candidates и application boundaries не повышают target до
`CURRENT_180`, `CURRENT_181`, `CURRENT_182`, `CURRENT_183`, `CURRENT_184` или
`CURRENT185`, `CURRENT186` или `CURRENT187`.
Promotion запрещён до единого release с worker v2/runtime attestation,
producer/worker tenant advisory lock, `DRAINING` zero-secret barrier,
CURRENT187 cluster/application admission, provider mark/complete
lost-response recovery, outbound kill-switch, независимо подписанным
apply/rollback/zero-diff, production-like rehearsal, protected OWNER workflow,
полным AccessScope/module scope, Gate 1MT/Gate 2 и отдельным post-green
`SHARED BETA GO`. Historical `004J/CURRENT179` evidence остаётся неизменным.

Historical 004I implementation `2540088076997ef228cd68e42165e857575aad86`,
final accepted evidence head
`eb056a491bc7ad161addfd8c4d859606231f7f43`, CI
[`30592173595`](https://github.com/boozik3412/leetplus/actions/runs/30592173595)
(`run #57`) — `3/3 PASS`. `CURRENT_172` сохраняется как historical accepted
prerequisite, а не current target. Он был принят exact-head
`12d574166bffe860205b128dd9d092f4f54514fc` / CI `30509157338`
(`run #53`) — `3/3 PASS`.

Предыдущий принятый schema target `CURRENT_171`: локальный
PostgreSQL 16 подтвердил clean deploy `171/171`, populated `170 → 171`,
hostile-default-ACL rollback/retry, `1 CREATED + 99 REPLAYED + 0 deadlocks`,
late-fault rollback, exact seven-RPC runtime allowlist и zero
target/PUBLIC privileges на трёх sealed relations / 45 columns. Exact AAD и
71-byte AES-GCM закреплены known-answer vector, raw token удалён из seal DTO,
runtime registration отсутствует. Exact-head
`7fca785ac6c2d77bcbd3655985d668a45fca788a` принят GitHub CI
[`30501299486`](https://github.com/boozik3412/leetplus/actions/runs/30501299486)
(`run #50`), `3/3 PASS`. Независимый ordinary-archive audit подтвердил
`171/171` raw-equivalent LF migration blobs, zero checksum mismatch, exact
PostgreSQL `171/171`, three-clone inventory и zero residue. Source manifest
digest:
`76d2c9df088e9fad201f2769e55d999b2a9232d14eaa1e69be38313fd7283f6f`.
Rejected CI
[`30500793016`](https://github.com/boozik3412/leetplus/actions/runs/30500793016)
(`run #49`) evidence не является.
Принятый locator exact-head `8dfe219...` / CI `30493779099` (`run #47`),
`3/3 PASS`, остаётся engineering prerequisite `CURRENT_170`.

Historical engineering exact-head `CURRENT_169`
`f5d39fd89145c995c51e7005698327f5581a5cd8` принят GitHub CI
[`30467882578`](https://github.com/boozik3412/leetplus/actions/runs/30467882578)
(`run #37`), `3/3 PASS`, и independent review без новых P0/P1.

Предыдущий принятый `CURRENT_168` exact-head
`3b8228dd278fae062c753bf4301e0339ba93738b` прошёл GitHub CI
[`30460154200`](https://github.com/boozik3412/leetplus/actions/runs/30460154200),
`3/3 PASS`, и независимый review без новых P0. Он остаётся историческим
prerequisite, но не является evidence текущего candidate. Local и remote
engineering evidence не являются production-like admission, persisted GO
или production deploy. Production apply/deploy не выполнялись.

При противоречии исторического документа этому пакету действует
`OPEN_BETA_BACKLOG.md`. Изменение продуктового состава первой когорты требует
одновременного обновления backlog и `pilot-access-profile.md`.

## Текущее состояние реализации

Уже существуют неприменённые production candidates:

- tenant execution control-plane EXPAND: `SUSPENDED + PROVISIONING` default,
  stage/trial/cohort/support owner, атомарный six-module profile,
  initial `read/write=ON + outbound=OFF`, generic outbound rejection,
  только same-state profile mutation; все cross-state transitions принадлежат
  dedicated workflows,
  session/activation policy, запрет generic lifecycle mutation для каждого
  non-`INTERNAL` tenant, owner-invite onboarding transition и удалённый
  database default с `User.role`;
- shared shell-only provisioning candidate: Platform Admin service атомарно
  создаёт `PILOT/SUSPENDED/PROVISIONING/revision 1` tenant, один неактивный
  Store, OWNER override, exact six-row profile
  `read/write=ON + outbound=OFF`, canonical owner-email reservation и
  HMAC-only audit/request digest. Он не создаёт `User`, `UserInvite`, token,
  registration URL, trial, outbox или письмо. Provision controller остаётся
  закрыт с `503 SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING`, legacy
  initial-owner revoke route — с
  `503 SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING`;
- identity email claim candidate: migration 167 создаёт global canonical
  claim/lock namespace, migration 168 — sealed foundation, а migration 169 —
  persisted `User`/`UserInvite` claim provenance, explicit revoke history и
  sealed application issue/reissue/revoke/accept writers. Migration 170
  добавляет immutable opaque `workflowLocator` и PII-free sealed locator
  assert. Migration 171 добавляет dormant atomic `NETWORK OWNER` issue и
  immutable encrypted `HOLD` outbox. Migration 172 добавляет signed,
  non-consuming admission provenance. Новые issue/admission primitives не
  получают runtime grant. Runtime
  candidate имеет exact семь application RPC и zero effective
  `IdentityEmailClaim` table privileges; identity allowlist использует
  `reserve_v2/assert_v1/assert_invite_locator_v1/transition_v2/release_v2`.
  Local PostgreSQL evidence: clean `171/171`, populated `170 → 171`,
  owner issue `1/99/0 deadlocks`, hostile-default/column ACL/rollback checks,
  а historical locator evidence включает populated `169 → 170`,
  revoked-history/re-reservation и shell `2/2`; full API —
  `101 suites / 1960 passed / 2 todo`. Production startup-validation candidate
  требует отдельный fingerprint HMAC key version `v1`, запрещает reuse и
  включён в CI environment contract; до deploy нужно настроить отдельное
  production значение. Exact-head CI/review и release-bound inventory для
  locator приняты на `8dfe219...` / CI `30493779099`; dormant issue-by-locator
  локально реализован в `CURRENT_171`, но exact-head CI,
  admitted production-like legacy provenance backfill, encrypted
  outbox/verified delivery и persisted GO ещё pending.
  Design-partner identity writer boundary принята как engineering checkpoint:
  legacy `provision`/`rotate-invite` fail-closed до manifest/Prisma/БД/token;
  на том historical `CURRENT_169` schema, six-RPC allowlist и shared admin
  route не изменялись. Exact-head
  `f4224072f60507bd97f8e49440e3bda89ffe2aaa`, PostgreSQL 16 и independent
  review приняты; production-like admission и activation остаются pending;
- accepted invite secret transport engineering checkpoint: canonical URL
  использует только
  `/register#invite=<43-char base64url>`, fragment удаляется до первого
  session/preview request, legacy token-path/query fallback отсутствует,
  fixed POST BFF/API имеют bounded body, strict request/token checks,
  allowlisted preview и private no-store responses. Для `INTERNAL` generic
  create/reissue всё ещё возвращает fragment-only `registrationUrl`
  авторизованному actor/UI; external generic workflow закрыт, обе shared-beta
  admin route остаются `503`. Exact-head
  `f09383563bbcc22e11e0e67ca597360cf8996f4b` / CI `30488598755`
  (`run #43`) — `3/3 PASS`, independent review — `PASS`; production
  proxy/APM/CSP/browser/mail-client acceptance остаётся pending;
- external authenticated HTTP admission candidate: обязательные beta-prefixes
  получают `module + READ|WRITE|OUTBOUND`, неизвестный route запрещён;
  reusable lower-layer admission перечитывает persisted state на каждый
  effect и поддерживает cross-module requirements. Уже защищены report
  email/digest, scheduled Langame sync, bonus-ledger provider и игровой
  Telegram/MAX delivery/pull;
- execution-revision fence candidate: migration `164` добавляет trigger-owned
  monotonic revision, CAS для lifecycle/profile/OWNER/revoke и durable
  revision capture в report schedule и bonus-ledger claim. Migration
  fail-closed требует zero `RUNNING/PROCESSING/DISPATCHING` effects до DDL.
  SMTP повторно проверяет actor/capability/scope/revision, а Langame bonus
  effect — target/source/eligibility/claim ownership непосредственно перед
  provider.
  Durable lease/reclaim для delivery/общего Langame sync, public
  guest/Telegram identity routes, files и strict suspend/drain ещё pending;
- background containment candidate: authoritative registry фиксирует 17 job
  kinds; `INTERNAL` временно сохраняет legacy execution, а
  `PILOT/BETA/LIVE` допускает только revision-fenced report SMTP и bonus-ledger
  Langame effect. Остальные 15 scheduled/AUTO paths fail-closed пропускаются
  до credentials/provider/защищённой business mutation; детерминированная
  audit-запись `SKIPPED`/`BLOCKED` разрешена. Оба разрешённых effect path сами
  проверяют registry. Это не durable suspend/drain fence; подробности и
  ограничения зафиксированы в checkpoint. Локальный gate:
  `15 suites / 665 tests`; полный API regression:
  `96 suites / 1873 passed / 2 todo`; подробности:
  [checkpoint](./background-execution-containment.md);
- guest-game delivery claim implementation candidate: migration `166`
  добавляет generation-bound claim, immutable provider-attempt evidence,
  typed transition events и database transition fence; legacy direct send
  принудительно остаётся dry-run, legacy bot pull не выдаёт payload, а
  provider prepare/update/bot ack отклоняются до delivery mutation.
  Bonus-ledger revoke и Telegram unsubscribe продолжают основную
  ledger/reward/consent mutation, но не изменяют provider delivery rows/events;
  `CASHIER/MANUAL` cancellation сохраняется.
  Schema target этого historical guest-game checkpoint — `CURRENT_166`.
  Previous accepted engineering baseline связан с
  PR head
  `bbef153a288bfdf1c3573eb704f27c013cc0e856`, GitHub CI
  [`30443837684`](https://github.com/boozik3412/leetplus/actions/runs/30443837684)
  (`run #23`), но выполнен через merge-ref и не является exact-SHA checkout
  evidence. Все три job `PASS`; PostgreSQL major `16` подтвердил
  `immutableMutationsRejected=7` и
  `finalStateAndEvidenceUnchanged=true`. Authority checks не выполняли root
  enrollment; canonical root registry остаётся `{}`. Это закрывает legacy
  quarantine delivery-row/lifecycle P1: `LEGACY_QUARANTINED` delivery
  immutable для ordinary/enrolled DML roles при включённых triggers, включая
  `DELETE`.
  `c1fee42c...` / CI `30442286822` сохраняется как historical precursor,
  принявший foundation migration `166` до этой lifecycle freeze.
  Изначально оставались три provider-write P1: lock order/`40P01`, final-row
  reason/evidence consistency и procedure-only durable events.
  Rejected `6a69cd8247a2ec1787d00e4f9afacee2af075c60` / CI
  `30445054152` (`run #26`), PostgreSQL job `90553255161`, завершился
  `FAILED`: retry readiness fixture и найденный preflight null-closed Event gap
  не позволили закрыть P1. Exact-head
  `a644b81e909ea97c21e3c404480505bf97b19935` / CI
  [`30447011917`](https://github.com/boozik3412/leetplus/actions/runs/30447011917)
  (`run #27`) — `REJECTED`: Application `90559756157` и Authority
  `90559756309` — `PASS`, PostgreSQL `90559756334` — `FAIL` из-за
  replay-message expectation. Previous accepted exact-head checkpoint —
  `d525b736d03162a2c58de17cbf7679ba6f515096`, CI
  [`30447467729`](https://github.com/boozik3412/leetplus/actions/runs/30447467729)
  (`run #28`): Application `90561260920`, Authority `90561260926` и PostgreSQL
  `90561260878` — `3/3 PASS`; `committedTransitions=4`,
  `runtimeBoundaryNegatives=9`. Он закрыл final-row reason/evidence и worker
  boundary-only durable-event P1. Последний принятый provider-write exact-head —
  `be8c94c4ea9106a31055a0aff577ffbd62b67e7c`, CI
  [`30449026506`](https://github.com/boozik3412/leetplus/actions/runs/30449026506)
  (`run #29`): Application `90566337085`, Authority checks `90566337062` и
  PostgreSQL major `16` job `90566337060` — `3/3 PASS`. Authority checks не
  выполняли root enrollment; roots остаются `{}`. Private SECURITY INVOKER
  `guest_game_reward_delivery_lock_v1` и двухсессионный rehearsal закрыли
  lock-order/`40P01`; `privateSecurityInvokerLockBoundaries=1`,
  `rawDeadlockOrLockTimeoutErrors=0`,
  `stateAndEvidenceUnchanged=true`,
  `sourceDatabaseMigrationsApplied=0`. Все четыре исходных engineering
  provider-write P1 закрыты. Отдельная non-owner runtime/app DB role всё ещё
  должна пройти admission и получить explicit `EXECUTE` grant, поскольку
  `PUBLIC EXECUTE` revoked; batch/rebind/future provider writers остаются
  fail-closed, whole-transaction bounded retry — defense-in-depth. Worker
  boundary не принимает `actorUserId`, а interactive same-tenant actor
  boundary и operational grants ещё pending.
  Effect-capable coordinator, persisted `NETWORK | STORES` проверка
  `allowedStoreIds`, provider/workload authority, bounded audited retention
  identity/procedure/grants, production-like evidence и cutover ещё pending.
  Прямой `DELETE` Attempt/Event fail-closed запрещён для ordinary/enrolled DML
  roles при включённых triggers. Owner/superuser/DDL bypass operationally
  denied; retention не enrolled. Поэтому outbound, production deploy и owner
  invite остаются `NO-GO`;
- historical migration `164` rehearsal workflow создаёт две
  disposable PostgreSQL 16 test-БД, поднимает exact schema `1..163` с
  tenant/report-run/bonus-ledger fixtures и проверяет upgrade `164`,
  preservation/backfill/defaults, trigger/CAS, три SQLSTATE `55000`,
  `lock_timeout`, late-DDL rollback и повторный deploy. Source database не
  мигрируется и не используется как template. Offline self-test и отдельный
  local PostgreSQL major `16` diagnostic rehearsal зелёные; remote
  prerequisite `CURRENT_164` уже прошёл на `37f8cc88...` / CI `30423839760`.
  Это historical prerequisite, не current migration `166` evidence;
  production-like backup/restore остаётся pending, поэтому этот пункт не
  меняет `NO-GO`;
- scheduled report digest применяет effective role/custom-role overrides и
  требует `export_reports`; Langame/guest foundation/business snapshot
  проверяют полный cross-module entitlement и AND-capability contract;
- CI/security baseline, startup contract и health/version foundation;
- persisted `NETWORK | STORES` и database invariants;
- user/role/invite authority; generic direct create, invite issue/rotation и
  email change для external tenant fail-closed до verified email workflows;
- scoped staff directory, notifications и team chat core;
- attachment lifecycle/ACL EXPAND schema;
- parent-aware chat и `STAFF_TASK` attachment adoption candidate.
- scoped task templates, shared safe task materializer и catalog audit EXPAND
  candidate.
- scoped recurring Rule CRUD/manual/interactive due candidate со
  Store/participant locks, sparse PATCH, IANA/DST schedule и real PostgreSQL
  race evidence; background scheduler и all-tenant scheduled route не
  зарегистрированы и остаются `NO-GO`.
- guarded staff task integrity inventory: 43 aggregate reason code, одна
  read-only `REPEATABLE READ` snapshot, fail-closed exit `1/2` и обязательный
  clean-schema CI run; production inventory не выполнялся.
- same-tenant StaffTask catalog EXPAND candidate
  `dc26568d94d76b886f1d1b79c36b1bd9f00ac401` — not deployed: 162 migrations,
  пять concurrent parent indexes, 14 composite + 14 simple compatibility
  `NOT VALID` FK, archive-first/global-existence protection, immutable parent
  IDs и future-migration guard для 28 DB-native constraints; staged real
  PostgreSQL smoke подтвердил 14 benign legacy updates, 5 UUID + 5 tenant
  move rejections и scoped `prismaDriftDrops=14`; expanded DDL guard пройден,
  а усиленная rehearsal строит пять concurrent indexes на populated legacy
  baseline 156 и применяет ровно шесть migrations `157..162`.
- aggregate-only StaffTask reconciliation planner: historical candidate
  `2c74c663780b3f183be708a01431c22efe57a723` не является evidence текущего
  рабочего дерева; historical prerequisite `CURRENT_165` remote evidence
  принято на `4bd6a036...` / CI `30428288353`, а documentation/evidence
  successor `7c20adec...` прошёл CI `30429463161` (полная ссылка — backlog
  §5.29). Оба checkpoint остаются историческими.
  Полный каталог
  из 43 кодов классифицирован как `8 proposal + 29 operator + 6 review`;
  обязательны одна read-only `REPEATABLE READ` transaction, exact target /
  confirmation / production attestation / 40-hex SHA / HMAC и expected
  database binding. Frozen StaffTask evidence остаётся на exact
  `EXPAND_162`, а latest supported historical inventory gate требует
  `CURRENT_171`, `migrationCount=171`, latest
  `20260730010000_identity_owner_invite_hold_outbox`,
  `unfinished=0`, `14 composite exact`, `14 simple exact`,
  `0 expected-FK mismatch`, `0 unexpected protected FK`, `5 indexes exact` и
  `0 index mismatch`; expected/actual database names не выводятся, а
  domain-separated HMAC `databaseIdentityDigest` связывает evidence с
  database name, PostgreSQL cluster и database OID без раскрытия raw identity.
  Proposal не является authorization, apply path отсутствует, output
  aggregate-only без identifiers. Инвариант
  `inventoryExecuted === schema.ready` проверяется fail-closed. Стабильный
  `contentDigest` и timestamp-bound `executionDigest` не являются
  row-stable/CAS authorization. Contract tests, clean real PostgreSQL planner
  и adversarial disposable-clone smoke для неверного FK/index contract прошли.
- StaffTask snapshot admission schema `v2`: исторический runtime
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` не является current evidence;
  historical prerequisite `CURRENT_165` на `4bd6a036...` и его
  documentation/evidence successor `7c20adec...` прошли remote CI. Last
  previous accepted `CURRENT_166` baseline связан с PR head
  `bbef153a288bfdf1c3573eb704f27c013cc0e856` / merge-ref CI `30443837684`;
  это не exact-SHA checkout evidence. Historical precursor `c1fee42c...` /
  `30442286822` предшествовал legacy quarantine delivery-row/lifecycle freeze.
  Exact-head `a644b81...` / CI `30447011917` (`run #27`) rejected (`2/3
PASS`, PostgreSQL `FAIL`). Previous accepted exact-head `d525b73...` / CI
  `30447467729` (`run #28`) — `3/3 PASS`. Последний принятый provider-write
  exact-head
  `be8c94c4...` / CI `30449026506` (`run #29`) — `3/3 PASS`; все четыре
  исходных engineering provider-write P1 закрыты. Принятый `CURRENT_168`
  implementation — `3b8228dd...` / CI `30460154200`, `3/3 PASS` — является
  предыдущим historical prerequisite. Historical engineering exact-head
  `CURRENT_169` `f5d39fd...` / CI `30467882578` (`run #37`) принят,
  `3/3 PASS`, но это не production-like admission и не exact-head evidence
  historical checkpoint `CURRENT_171`.
  `IMPLEMENTED_CANDIDATE`, not deployed. Admission принимает только
  изолированную loopback PostgreSQL 16 копию в точном `BASELINE_156`,
  `EXPAND_162` или `CURRENT_171`,
  сверяет ordered migration names/checksums, exact Git blob content, catalog,
  database marker и freshness. Отдельная `LOGIN NOINHERIT` роль получает
  table-level `SELECT` ровно на восьми разрешённых relations и column-level
  `SELECT` только на
  `User(id, tenantId, isPlatformAdmin, isActive, accessScope)`, без
  table-wide `User SELECT`, write, DDL, TEMP, membership или ownership.
  Independent verify-only Ed25519 boundary реализована, но pinned public
  roots намеренно пусты: production-like authority fail-closed и остаётся
  `NO-GO`. HMAC не заменяет authority; production-like report доверяется
  только как same-process/non-transferable evidence.
- Detached authority operations имеют `IMPLEMENTED_CANDIDATE`: strict
  canonical acquisition request, derived `acquisition-v1:<digest>`, lifecycle
  registry `ACTIVE/RETIRED/REVOKED` и ceremony
  `prepare → external Ed25519 sign → finalize`. LeetPlus не читает private key
  или signer secret; `finalize` re-hash исходный request, root history
  проверяется actual parent→HEAD CI gate, а payload/envelope публикуются
  последними readiness files. Каждая output-пара своей фазы находится в одном
  protected каталоге; каталоги prepare/finalize могут различаться. Локально authority
  bundle прошёл `40/40`, включая child-process positive ceremony E2E и
  rejection промежуточного `CURRENT_164`;
  admission — `21/21`. Root registry остаётся exact `{}`. Ветка `main`
  сейчас без branch protection/ruleset и без `CODEOWNERS`; до enrollment
  production public root обязателен независимый reviewer и защищённый approval
  path. Реальный public root, внешний signer/HSM и snapshot
  acquisition/restore ещё не выполнены.
  Remote PostgreSQL 16 prerequisite для exact `CURRENT_164` пройден на SHA
  `37f8cc88cdba05b3c73f6bc14e14528f831228ee`, CI run `30423839760`.
- Historical public-only pinned-path test evidence
  `2341b99937e54cc50d1763a0a794d975816c72ce` —
  включён в полностью зелёный remote CI SHA
  `d77c74393c510b688f9f2a5c43eaa908390450b5`. Historical runtime
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` не является current candidate.
  Pre-signed fixture не содержит
  private key, generation или signing API; production root registry остаётся
  пустым. Изолированный Node.js 22 child проверяет реальный pinned wrapper,
  marker/nonce-bound identity, expiry и отказ detached report; admission suite
  прошла `19/19`. Experimental module mock является `P2` test-infrastructure
  risk и не превращает fixture в production authority.
- StaffTask reconciliation proposal dry-run
  `044ceca2c2476bcd3c0fc58f3151c5c8e237fa9c` —
  `IMPLEMENTED_CANDIDATE`, not deployed. Он работает только внутри
  `SYNTHETIC EXPAND_162` disposable harness, в одной read-only
  `REPEATABLE READ` transaction и без apply-path. Реальный PostgreSQL 16.13
  smoke прошёл `23` scenarios: все `8` proposal codes дали `8` occurrences и
  `7` cases, включая coalescing двух last-task причин в один case; пройдены
  exact parity/cap/privacy/unlinkability и все negative ACL gates. Source data
  не изменились, временная cluster ACL mutation восстановлена. Planner и
  proposal report остаются schema `v1`. Exact synthetic database name и
  `synthetic:` reference — доверенная декларация harness/operator, а не
  provenance proof, production-like authority или Gate 2 evidence.
- production-like inventory/planner/proposal dry-run, standalone dry-run,
  reconciliation apply,
  `VALIDATE`, `CONTRACT` и deployment не выполнялись.

Ближайшая последовательность намеренно разделена на независимые решения:

1. Использовать принятый historical engineering exact `CURRENT_169`
   `f5d39fd89145c995c51e7005698327f5581a5cd8` / CI `30467882578`
   (`run #37`), `3/3 PASS`, как prerequisite, и принятый `CURRENT_170`
   locator exact-head `8dfe219...` / CI `30493779099` (`run #47`),
   `3/3 PASS`. Ни один из них не deployed и не является production-like
   admission; `CURRENT_168`
   `3b8228dd278fae062c753bf4301e0339ba93738b` / CI `30460154200`
   сохраняется только как historical prerequisite.
2. Независимо проверить detached authority candidate, утвердить внешний
   signer/HSM, separation of duties и key custody; затем отдельным reviewed
   change enrol Ed25519 public root и получить зелёный remote CI exact
   enrolled-root SHA до acquisition.
3. Выполнить approved acquisition/restore в protected evidence boundary для
   exact current SHA; произвольный approval alias не использовать. Создать
   отдельную `LOGIN NOINHERIT` reader role, выдать exact grants и пройти
   negative ACL gate.
4. отдельно production-like admission: новый request/nonce/envelope/marker для
   `BASELINE_156` → admission → migrations `157..162` → новый request и
   `EXPAND_162` envelope/marker → admission → exact allowlisted migration
   `20260728120000_tenant_execution_control_plane_expand` → exact
   `20260728150000_tenant_execution_revision_fence` → exact fail-closed
   migration `20260729120000_store_background_execution_fence` → exact
   migration `20260729160000_guest_game_delivery_claim_fence` → foundation
   migration `20260729190000_identity_email_claim_foundation` → sealed
   boundary migration `20260729210000_identity_email_claim_write_boundary` →
   persisted writer migration
   `20260729230000_identity_invite_writer_boundary` → locator migration
   `20260729233000_identity_activation_locator` → dormant HOLD migration
   `20260730010000_identity_owner_invite_hold_outbox` → новый третий
   `CURRENT_171` request/envelope/marker и третий admission.
   Protected StaffTask evidence остаётся bound к prefix 162; historical
   planner stage работает только на DB 171;
5. отдельно production-like inventory и aggregate planner;
6. отдельно production-like row dry-run;
7. отдельно explicit apply, rollback и доказательство zero-diff;
8. только после zero blocking — отдельные решения по `VALIDATE`, N-1 window,
   `CONTRACT` и deployment;
9. после выполнения всех platform/module prerequisites и отдельного `Gate 2A`
   explicit `CUTOVER GO` — in-place cutover четырёх `Store` текущей сети
   внутри одного существующего `Tenant`;
10. параллельно закрыть `BETA-MT-001..009`: использовать принятые exact-head
    CI/review `BETA-IAM-004B` как engineering prerequisite, отдельно выполнить
    production-like inventory и будущий signed proposal/apply/rollback;
    использовать принятые exact-head PostgreSQL/CI/review checkpoints
    design-partner writer isolation и locator, реализовать
    sealed issue-by-locator, encrypted outbox/verified OWNER delivery и
    persisted GO, а для реализованного
    `BETA-IAM-004E` пройти production proxy/APM/CSP/browser/mail-client
    acceptance; затем закрыть delegation/integrations, A/B isolation и
    tenant-aware workers/Telegram;
11. семь стабильных дней internal alpha и Gate 1MT завершают Gate 2; только
    затем возможен protected `SHARED BETA GO` и owner invite нового
    `Tenant B/Store B1`.

После повторного zero-diff inventory/planner reader role отзывается и удаляется
до уничтожения disposable snapshot.

Это не означает готовность к внешнему тесту. Прежняя последовательность
network-only staff parent families закрыта, но в launch scope ещё остаются
attachment archive/orphan browser matrix, tests/assessments/readiness,
control/ratings/motivation/discipline/salary, полный gamification/assortment
adoption, tenant-aware jobs/Telegram/public guest, Gate 2, production
operations и canary.

Section 5.26 с isolated DP-1 сохраняется как contingency/enterprise-isolation
lane. Legacy identity creation/rotation в ней disabled; полезными остаются
read-only historical status, narrowing-only emergency suspend и isolated
runtime admission. Отдельный runtime/DB больше не является основным способом
первого теста и не имеет назначенного календарного окна.

Текущий плановый ориентир первого shared friendly external club —
`31.08–07.09.2026`, если Gate 1MT и Gate 2 закрыты без stop condition. Это не
обещание даты.

## Рабочий цикл каждой реализации

Для каждого bounded slice:

1. Зафиксировать route/action/job/file inventory и resource class.
2. Применить persisted tenant/store scope и capability server-side.
3. Проверить list, detail, aggregate, mutation, export, file и background path.
4. Добавить same-tenant, cross-tenant, allowed-store и denied-store тесты.
5. Если есть конкурентная запись — добавить real PostgreSQL rollback/race test.
6. Обновить матрицу, backlog, rollout/rollback и verification evidence.
7. Выполнить focused и full CI, production builds и `git diff --check`.
8. Создать exact candidate SHA; не повышать статус до `VERIFIED` без staging
   или canary evidence.

## Правила хранения evidence

В git разрешены:

- aliases вместо production ID;
- counts, hashes/checksums и ожидаемые zero-values;
- exact SHA, migration revision/count и результаты автоматических проверок;
- ссылки на защищённые операционные записи.

В git запрещены production ID, email, телефоны, database URLs, токены,
credentials, encryption keys и необработанные выгрузки.

## Условия внешнего доступа

### Первый shared external club

Owner invite для `Tenant B/Store B1` можно выдать только после Gate 1MT,
Gate 2 и
[shared launch checklist](./shared-multi-tenant-launch-checklist.md), когда:

- текущая сеть успешно переведена и прошла семь дней internal alpha;
- persisted lifecycle/stage/trial/entitlements и `TenantExecutionPolicy`
  применяются fail-closed во всех HTTP/background/Telegram paths;
- idempotent shell provisioning создаёт отдельный Tenant B, Store B1,
  six-row profile и canonical owner-email claim без User/invite/token/trial;
- отдельная non-owner runtime role имеет exact seven-RPC allowlist и zero
  `IdentityEmailClaim` table DML; legacy `User`/`UserInvite` writers не
  обходят sealed reserve/assert/transition/release invariant;
- отдельное production fingerprint HMAC secret value version `v1`
  защищённо настроено и аттестовано; protected activation использует
  privacy-safe claim locator без raw-email lookup leak;
- persisted GO и dedicated activation запускают trial и атомарно создают
  email-bound OWNER invite + encrypted mail outbox; response/replay не
  раскрывает identity secret, а real PostgreSQL concurrency подтверждает
  zero-duplicate issue/accept;
- protected email delivery/reissue/revoke и emergency suspend проверены;
  generic lifecycle endpoint для Tenant B не используется;
- owner и все созданные им пользователи ограничены собственной сетью и
  `NETWORK | STORES` scope;
- shared PostgreSQL/runtime A/A1/A2 ↔ B/B1 IDOR matrix зелёная для API, BFF,
  browser, files, jobs, SSE и Telegram;
- integration preview/mapping не импортирует чужие клубы, secrets защищены,
  unattended sync и write-back остаются отдельно gated;
- shared workers используют tenant/store system identity, durable
  lease/fencing/idempotency и kill switches;
- все обязательные surfaces имеют статус `VERIFIED`;
- `LEGACY/SHADOW` не используются как внешний attachment authorization;
- tenant/store IDOR, PII, exports, files, jobs и BFF regression зелёные;
- тот же production-like snapshot до inventory прошёл
  [обязательный admission checkpoint](../security/access-scope/v1/staff-task-integrity-snapshot-admission-runbook.md)
  в `BASELINE_156`, после migrations `157..162` — в frozen-prefix
  `EXPAND_162`, а после exact allowlisted migrations `163..171` — в
  `CURRENT_171`;
  для каждого состояния использован отдельный signed envelope, перед каждым
  следующим admission DB marker заменён digest нового envelope, а
  state-specific protected evidence и marker-rotation attestation
  сохранены;
  подтверждены PostgreSQL 16, admission schema `v2`, exact release
  manifest/blob/catalog, database marker/freshness, table-level `SELECT` на
  восьми разрешённых relations и column-level `SELECT` только на
  `User(id, tenantId, isPlatformAdmin, isActive, accessScope)`, isolation и
  no-egress;
- reviewed Ed25519 public root enrolment, protected signer и acquisition
  evidence завершены до production-like admission; текущий empty-root
  fail-closed state не засчитывается как Gate 2;
- HMAC digest/report не используется как authority или provenance;
  production-like report не передаётся как самостоятельное доказательство,
  потому что его authority evidence same-process и non-transferable;
- staff task integrity inventory имеет zero blocking findings; все review-only
  findings имеют owner и принятое решение;
- aggregate reconciliation planner запущен на том же production-like
  snapshot и прошёл exact schema-first gate:
  `CURRENT_171`, `migrationCount=171`, latest
  `20260730010000_identity_owner_invite_hold_outbox`, `unfinished=0`,
  `14 composite exact`, `14 simple exact`, `0 expected-FK mismatch`,
  `0 unexpected protected FK`, `5 indexes exact`, `0 index mismatch`;
  `databaseIdentityMatched=true`, `databaseIdentityDigest` зафиксирован,
  `inventoryExecuted === schema.ready`, actionable cap не превышен;
  `proposal` не считается authorization, `contentDigest`/`executionDigest` не
  используются как row-level/CAS token;
- текущий proposal dry-run candidate не засчитывается как production-like
  reconciliation: он допускает только exact-name/ref `SYNTHETIC` harness-БД,
  а эта классификация является доверенной декларацией operator/harness, не
  provenance proof;
  отдельные protected production-like row evidence, owner approval,
  locks/recheck, audit и rollback по-прежнему обязательны;
- adversarial catalog smoke на disposable local/CI clone при сохранении всех
  28 expected FK отклонил дополнительный конфликтующий FK с другим именем и
  неверный parent index с `SCHEMA_MISMATCH`, не запустил inventory и не
  изменил source database;
- отдельные reconciliation dry-run, approved apply и повторный zero-diff
  завершены до `VALIDATE`;
- все 14 StaffTask catalog constraints валидированы после production-like
  reconciliation; три Store delete restrictions и N/N-1 rollback проверены;
- все 14 simple compatibility FK не удалены до отдельного CONTRACT; rollback
  не запускает старый seed или parent ID updates, `db push` запрещён;
- expanded future-migration DDL guard и scoped
  `prismaDriftDrops=14` check зелёные; credentials отсутствуют в argv;
- после закрытия N-1 window CONTRACT удалил ровно 14 simple compatibility FK
  и оставил future guard на 14 validated composite FK;
- exact SHA виден в API/web/edge;
- backup restore, alert и rollback drills подтверждены;
- gamification write-back включается отдельно по Store через
  `OFF → SHADOW → CANARY → LIVE`.

Optional isolated DP-1 feedback не заменяет shared Gate 1MT/internal alpha и
не входит автоматически в Gate 3. Promotion из isolated режима требует новой
entitlement revision, отдельного решения и нового измерительного окна.

### Optional isolated contingency

Отдельные web/API/PostgreSQL/secrets допускаются только по документированному
решению о contingency/enterprise isolation и после Gate 1DP. Эта lane
остаётся `NO-GO`, не разрешает обход Gate 1MT/Gate 2 для shared beta и не имеет
обещанного срока.
