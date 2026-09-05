# LeetPlus open beta — текущее состояние на 05.09.2026

| Поле                 | Состояние                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Release decision     | `NO-GO` для внешнего доступа                                                                                                  |
| Production runtime   | healthy; active blue `2b8c7dfd…`, `COMBINED`, bridge OFF, bug reporting LIVE; rollback green `982b537c…` ready              |
| Prisma schema        | production exact `CURRENT_189/189`; migration `20260831120000_guest_support_bug_report_input_repair` applied                  |
| Release authority    | runtime и production-control exact `2b8c7dfd…`; five-phase rollout завершён с terminal receipt                              |
| Runtime successor    | Bonus-ledger/gamification timer enabled/healthy; bounded historical activity backlog drain продолжается                      |
| Employee access      | восстановлен; 26 active users остаются в canonical `demo` tenant                                                              |
| Role-aware landing   | входит в active `f3f119fa…`; real-account canary pending                                                                      |
| Platform admin       | `/administration` → явный подписанный tenant context → `OWNER + NETWORK`                                                      |
| Текущая сеть         | один canonical Tenant, четыре Store; два пустых duplicate tenant не удалены                                                   |
| Первый внешний пилот | отдельный `Tenant B/Store B1`                                                                                                 |
| Offline/USB key      | исключён из beta critical path                                                                                                |
| Owner onboarding     | email-bound invite, пользователь сам задаёт пароль                                                                            |
| Release acceleration | 8/8 + retention: five-phase rollout завершён; V3 и trusted lane metrics merged; root-only exact plan/apply attempt archive реализован в source без production effect |
| Langame freshness    | audit storage repair и drain-successor применены; canary 27.08 выполнил sync, но не получил authority receipt после systemd GC; daily timer остаётся fenced/disabled до admitted terminal-state repair  |

На 05.09 installed production-control уже обновлён до exact `fc7b6e65…`, но
runtime не переключался. Successor остановлен fail-closed из-за orphaned
verifier evidence поколения `3281c070…`; successor receipt отсутствует,
route/schema/data не менялись. Новый source recovery сохраняет старые bytes и
связывает их с replacement через immutable receipt вместо ручного удаления.
До его exact-main Fast+Full, successor `check` и canary статус внешнего beta
остаётся `NO-GO`.

Текущий production baseline позднее обновлён штатным пятифазным rollout до
exact admitted `2b8c7dfd…`: active blue, green `982b537c…` сохранён hot
rollback, schema `CURRENT_189/189`, public/corporate runtime healthy.
Application canary Langame за `2026-08-27` обработал ровно один INTERNAL tenant
без failed scope. Однако controller не зафиксировал success receipt: после
завершения static oneshot systemd 255 выгрузил unit и больше не отдавал
terminal timestamps/result; cleanup затем ошибочно вызвал `reset-failed` для
уже inactive/unloaded unit. Timer не включён, temporary authorization был
снят после строгой сверки permit/intent и zero PID/cgroup/jobs, исходные
90-fence восстановлены.

Source candidate разрешает только этот узкий terminal state: fresh start
должен быть наблюдён тем же apply, `is-failed` обязан вернуть exact `inactive`,
а PID/cgroup/jobs — оставаться пустыми. Failed, ambiguous и не наблюдавшийся
запуск по-прежнему rejected. Одновременно wrapper сохраняет systemd-parsed
значения трёх секретных переменных при quoted EnvFile, не меняя raw-file hash,
allowlist или secret scope. До exact-main Fast/Full, control install,
повторного принятого canary, date-by-date backfill и timer check внешний beta
остаётся `NO-GO`.

Позднее 05.09 controlled rollout exact admitted `982b537c…` завершил все пять
фаз: production active green generation 22, blue сохранён hot rollback,
public/API readiness и exact `CURRENT_189/189` проходят. Autonomous
bonus-ledger/gamification timer включён; на read-only срезе очередь уменьшилась
до `74 PENDING + 1 RUNNING`, проходы завершаются без activity retry и без новых
bonus-ledger ошибок. Один ранний timeout безопасно оставил lease для штатного
reclaim и не создал повторного provider effect.

Langame daily canary при этом не запускался: официальный authorization
authority fail-closed остановился до effect, потому что direct Node invocation
добавлял служебную bash-переменную `_` в окружение strict installed-control
verifier. Source repair передаёт verifier только exact
`PATH/LANG/LC_ALL/TZ` через `/usr/bin/env -i`, а disposable-root fixture теперь
отвергает любую лишнюю переменную. До нового exact-main Fast/Full, установки
control generation, успешных date-by-date canary и timer check внешний beta
остаётся `NO-GO`.

## Исправление двух обращений геймификации (04.09.2026)

Разбор `LP-BUG-AFDE6B03` подтвердил гонку первого публичного check-in с
асинхронным `APP_OPEN`: корректный check-in мог оказаться на несколько секунд
раньше сохранённого `gameActivatedAt` и затем отбрасывался как
pre-activation. Source candidate закрепляет activation boundary до rule
evaluation, создаёт exact canonical `CHECK_IN_PERFORMED` и связывает с ним
событие. Идентичность включает локальную дату клуба, поэтому повтор запроса в
тот же день безопасен, а новая дата в долгоживущей Langame-сессии не теряется.

Разбор `LP-BUG-42A647BA` подтвердил иной сценарий. Пополнение на `920 ₽`
произошло, пока последовательный Battle Pass ещё ожидал предыдущий шаг
`PLAY_TIME`. По текущему продуктовому контракту закрытый третий шаг не
потребляет событие задним числом. Восстановление unattended Langame sync должно
вернуть отсутствующие play-time/top-up facts и актуальный прогресс, но не
обходить последовательность и не выдавать награду повторно. Если бизнес решит
компенсировать конкретное ранее совершённое пополнение, это отдельный bounded
operator effect с собственным idempotency key и audit receipt.

До production rollout обязательны: exact Fast+Full admission, существующие
backup/rollback gates, canary автономного Langame worker, backfill пропущенных
полных дат и точечная сверка обоих профилей. Для первого обращения допустим
только preview подтверждённых false pre-activation событий и единичное
идемпотентное восстановление; широкий replay наград запрещён. Production этим
source candidate ещё не менялся.

## P0 Langame recovery (04.09.2026)

Production остаётся healthy для public/corporate запросов, но Langame
freshness нельзя считать готовой к открытому тесту. Read-only diagnosis
подтвердил: business facts коммитятся, после чего запись discrepancy JSON
падает из-за несовместимых прав blue/green; все три источника поэтому получают
ложный полный `FAILED`. Отдельного nightly owner нет, последние unattended
данные относятся к 26.08.

Source candidate вводит `PARTIAL` для post-fact audit failure, общий storage
contract с двусторонним slot preflight и один dedicated worker для exact
internal tenant. Он не расширяет public guest/corporate права и сохраняет
`EXTERNAL_DENY`. До exact Fast+Full, backup, отдельного production GO, backfill
`27.08–02.09` и QA `3/3 + guest + five snapshots + zero duplicates` решение
open beta остаётся `NO-GO`. Подробности:
[`langame-sync-production-recovery.md`](../deployment/langame-sync-production-recovery.md).

Exact candidate `64a0efed…` прошёл Fast+Full, но production preflight 04.09
правильно остановил rollout до effect: уже активный автономный bonus-ledger
service отсутствовал в exact legacy-drain manifest кандидата. Production
остался на `f3f119fa…`. Исправление должно одновременно классифицировать оба
bonus-ledger unit как `SAFE` в manifest и закрытом verifier allowlist и пройти
новый exact-main admission; ручной manifest override или остановка здорового
bonus-ledger worker запрещены.

Successor `475d7e0c…` прошёл exact-main Fast+Full. До runtime hydration были
созданы fresh production backup, off-host copy и полностью проверенная
restored copy PostgreSQL 16. Exact подтверждённый audit plan с двумя действиями
применён: persistent root и один tenant directory теперь имеют canonical
`leetplus-api-runtime:2770`, owner tenant directory сохранён; повторный
`check` с двусторонними slot probes прошёл. Public HTTP и обе blue/green пары
остались healthy, схема и routing не менялись.

Установка exact production-control `475d7e0c…` выявила следующий fail-closed
разрыв до hydration/cutover. Исторический immutable N−1 activation receipt
связан с предыдущим legacy-drain manifest, а добавленные
`OPTIONAL_DRAIN` Langame service/timer ещё не имеют durable start-fence и
successor receipt. Ручная правка receipt/drop-in запрещена. Новый source fix
должен дать один pinned additive manifest-successor controller, сохранить
исторический receipt неизменным и отдельным exact worker authorization
разрешить canary/timer без снятия общей legacy-защиты. Timer authorization
связывается с successful canary/stable-env и не выполняет ручной timer-profile
oneshot перед возможным `Persistent=true` catch-up, исключая двойной daily run.
До нового admitted SHA и
отдельного GO production rollout остаётся на HOLD; Langame timer
`inactive/disabled`, public/corporate и действующий bonus-ledger worker не
затронуты.

CI successor дополнительно обязан пройти реальный PID 1/DynamicUser путь.
Wrapper принимает permit только когда его первым shell-builtin-only шагом
совпали exact cgroup-v2 unit path, единственный PID `$$` и `InvocationID`;
direct/wrong-unit вызовы fail-closed, а оба system-manager transport скрыты.
Positive path запускается прямо на уничтожаемом GitHub-hosted Ubuntu runner с
настоящим PID 1 systemd. Root controller создаёт только exact fixture units;
DynamicUser canary доказывает cgroup singleton и отсутствие доступа к
`/run/dbus` и `/run/systemd/private`, actual Node entrypoint повторяет те же
проверки. Gate не устанавливает container engine, не собирает образ и не меняет
system D-Bus. Exact cleanup требует zero unit/PID/cgroup/timer residue.

Следующий source successor закрывает обнаруженный после этого admission разрыв
автономности. Отдельный nightly Langame worker сам по себе обновлял бы daily
facts, но не дренировал `GuestActivitySyncJob`, не запускал основной и
supplemental pipeline и не собирал quality snapshots. Эти пути нельзя включать
в обоих blue/green API одновременно. Поэтому уже существующий active-slot
bonus-ledger systemd singleton расширен tenant-scoped обработкой activity,
pipeline и monitoring, а nightly worker после exact успешного sync ставит due
recovery и выполняет bounded maintenance. Canary остаётся dry-run/SHADOW с
лимитами `1`; stable — bounded LIVE только для canonical `demo` INTERNAL
tenant. Production остаётся на `f3f119fa…` до нового exact-main Fast+Full,
immutable handoff, controlled canary/backfill и отдельного postflight.

Exact-main successor `e4da6a04…` прошёл Fast+Full, его production-control
generation установлена, но successor apply 05.09 вновь остановился до effect:
реальный systemd 255 возвращает пустые service-only PID properties у `.timer`,
тогда как disposable fixture возвращал `0`. Узкий source repair принимает
пустые PID properties только для `.timer`, продолжает требовать явные нули у
`.service` и добавляет отрицательный тест этого различия. Runtime cutover,
route, schema и worker activation не выполнялись; перед продолжением нужен
новый exact-main Fast+Full и новая immutable control generation.

Следующий exact production-control `3281c070…` успешно установлен 05.09, но
manifest-successor apply снова fail-closed остановился до runtime cutover.
Controller использовал frozen verifier принятой N−1 activation из `/usr/local`,
а не обновлённый verifier exact control bundle; поэтому штатный systemd 255
service state `static` был ошибочно отклонён как boot-enabled. Два additive
start-fence drop-in присутствуют, но successor receipt отсутствует; traffic,
schema, rewards и active runtime не менялись. Новый source candidate привязывает
оба successor/worker authorities к root-owned `0400` verifier внутри immutable
bundle и проверяет отсутствие fallback отрицательным fixture. Rollout остаётся
на HOLD до нового exact-main Fast+Full и повторного контролируемого apply.

## Ускорение release pipeline без ослабления gates (02.09.2026)

В backlog добавлена отдельная инициатива
[`release-pipeline-acceleration.md`](../deployment/release-pipeline-acceleration.md).
Первый срез уже фиксирует slots/ports, runtime NSS topology, exact API/Web
EnvironmentFiles, transient restored-copy identity и независимые bind receipts
в
[`production-topology-contract.json`](../deployment/production-artifact/production-topology-contract.json).
Fail-closed verifier и negative fixture включены в Fast CI и Full Release
Admission.

Второй срез поднимает на одноразовом GitHub runner обе API/Web blue/green пары
на exact ports и runtime identities, проверяет effective EnvironmentFiles и
process groups, а также transient restored-copy membership с обязательным
zero-residue cleanup до существующих bind/cutover fixtures. Дополнительная
инфраструктура и production-доступ для этого не нужны.

Третий срез запускает machine-readable impact classifier отдельным первым job в
Fast и Full CI. Он сохраняет exact base/head/rules receipt; неизвестный, mixed,
rename/delete, schema/security или недоверенный event становится `L2`. Обычный
runtime допускается в `L1` только по allowlist. Лишь доказанный Markdown-only
`L0` завершает CI без тяжёлых runtime/database jobs и без runtime artifact.

Четвёртый срез устраняет двойной Full до и после merge. Deployable candidate
теперь может возникнуть только из runtime-eligible exact `push` merge SHA в
`main`; feature/manual/nightly и docs-only Full выпускают лишь non-deployable
validation evidence. Final job повторно проверяет impact/candidate receipts в
fresh checkout. Fast и Full для main SHA не отменяются последующим commit, а
устаревший PR Fast по-прежнему отменяется. Production и решение open beta этим
не изменены.

Пятый срез формализует deployable exact-main candidate как единственный runtime
handoff: pre-merge/manual evidence не может стать production authority.

Шестой срез разрешает готовить backup/off-host и restored-copy evidence
параллельно Full Admission, но делает оба результата nonauthorizing. Перед L2
effect короткоживущий binding повторно связывает exact runtime/control/live DB,
backup и rehearsal с zero pending intents; его digest обязан войти в отдельно
подписанный schema-plan.

Седьмой срез добавляет
[`resumable-release-orchestrator`](../deployment/resumable-release-orchestrator.md)
для `HYDRATE -> BIND -> SMOKE -> CUTOVER -> POSTCHECK`. Exact plan не разрешает
effect; `apply` требует отдельного production GO. Immutable phase receipts и
повторная attestation позволяют продолжить ту же operation после lost response,
не повторяя завершённые effects и не принимая чужую cutover generation.
Orchestrator не выполняет schema/ACL/worker changes и оставляет previous slot
горячим rollback.

Первый production rollout этого контура завершён 03.09.2026 на exact admitted
SHA `f3f119fa81fc497b75cc1e57f046d8539676c943`. Approved five-phase operation
переключила nginx на active blue generation 21, сохранила green `22ab6b81…` как
hot rollback и получила terminal receipt без pending record. Public/loopback
API и Web, authenticated reads, CURRENT189 и worker timers прошли postcheck.
Schema, auth/scope, guest flags, ACL и worker state этим rollout не менялись.

Production feedback показал пять безопасно возобновляемых late cases: transient
cache cleanup, systemd failed state после stop, отсутствие automatic slot-env
bind, readiness до окончания startup и already-accepted cutover с
диагностическим stderr. V3 source successor автоматизирует только эти exact
случаи с bounded retry, повторной fence/receipt attestation и atomic root-owned
slot-env lineage backup. Exact legacy `API_BIND_HOST=localhost` сходится к
canonical `127.0.0.1` только после target fence и с отдельным evidence enum;
иной alias запрещён. Ambiguous outcome, чужая generation или flag drift
по-прежнему останавливают operation. Это не меняет open beta `NO-GO` и не
закрывает Gate 1MT/2. Public guest, corporate tenant и workers/control-plane
остаются независимыми; schema/security effects сохраняют полную admission,
backup/restored-copy, signed controller и отдельный production GO.

Восьмой срез делает ускорение измеримым. Final admission и обе immutable
provenance цепочки переносят exact impact receipt и только trusted
`L1_RUNTIME|L2_SCHEMA_SECURITY` до root-only installed receipt и нового plan.
Read-only `metrics` считает approval→final, phase durations, failure histogram,
unresolved и p50/p95 по lane только из локальных root-owned receipts. Attempt
records не содержат operation ID, SHA, paths, env, command output или PII. До 20
terminal samples возвращается `INSUFFICIENT_SAMPLE_SIZE`; первый реальный V2
rollout помечается `LEGACY_UNCLASSIFIED` и не влияет на процентили. Отдельный
production deploy только ради метрик не выполняется.

Operational retention отделён от read-only отчёта. До `10 000` live attempt
files оператор создаёт nonauthorizing `metrics-retention-plan`, затем отдельным
root-only apply подтверждает тот же retain count и plan SHA-256. Apply держит
exclusive production-control/orchestrator locks, публикует immutable raw-record
segments до удаления live copies и допускает lost-response recovery только по
тому же manifest. Incomplete archive блокирует metrics и runtime apply/resume;
DB, systemd/runtime, сеть, public guest, corporate tenant и workers не
вызываются. Archive reader ограничен `4 096` файлами, `128 MiB` и `131 072`
записями. Terminal operation directories не удаляются; их предел `4 096`
остаётся отдельным capacity boundary.

## Production CURRENT189 rollout (01.09.2026)

Exact release `22ab6b81dacc726068d0dfcc5172fe67581a45b1` развёрнут на обоих
blue/green API и Web slot. Active green и hot-rollback blue проходят readiness
с exact `CURRENT_189/189`; nginx generation 20 направляет трафик на green.
`GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=OFF`,
`GUEST_BUG_REPORTING_MODE=LIVE`.

Перед production effect exact release прошёл restored-copy acceptance. Затем
контроллер `GUEST_SUPPORT_PRODUCTION_188_TO_189_V1` под production-control и
cutover locks применил только checksum-pinned migration
`20260831120000_guest_support_bug_report_input_repair`. Backup
`current189-preupgrade-20260901T1511Z` и подписанные evidence/receipts сохранены
вне release; dump SHA-256 —
`6839ec24f440339e672326d6ba500a9e02baa4bebee267a2a337bdf862625244`.

Production QA подтвердил public `/`, `/game` и `/game/auth`, USER_CALL readiness,
tenant и platform support queues, description `20..2000`, multipart
`5 fields + 1 JPG`, а также standards-manager delegation только в exact fresh
store scope. Bonus-ledger timer снова `active (waiting)`; actionable,
stale-processing и failed backlog равны нулю. Disposable restored-copy contour
удалён после копирования evidence; production backup не затронут.

Внешний open-beta decision остаётся `NO-GO`: этот rollout исправляет текущий
production, но сам по себе не закрывает остальные пункты внешнего admission.

## История: standards-manager invite delegation repair candidate (31.08.2026)

Локализована причина ошибки `You cannot grant permissions outside your access
scope`: матрица ролей уже разрешала `STANDARDS_MANAGER` создавать
`CLUB_ADMINISTRATOR` и `SENIOR_ADMINISTRATOR`, но общий capability guard
повторно сравнивал весь canonical набор прав получателя с личными правами
инициатора. После появления у администраторских ролей отдельного игрового
capability штатный процесс подбора администраторов стал fail-closed.

Source repair разделяет две границы. Неизменённые canonical роли
`CLUB_ADMINISTRATOR` и `SENIOR_ADMINISTRATOR` делегируются менеджером по
стандартам по явной матрице ролей; tenant overrides и custom roles по-прежнему
проходят полный capability-subset guard. Fresh scope остаётся обязательным:
приглашение можно создать только для непустого подмножества клубов инициатора,
а чужой клуб, `NETWORK`, broad `CLUB_MANAGER`, `OWNER` и platform authority не
разрешены. Focused regression покрывает обе разрешённые роли и все эти
отрицательные границы. На момент подготовки candidate production этим
изменением ещё не был затронут; итоговый rollout зафиксирован выше.

## История: guest bug-report input repair candidate (31.08.2026)

Source candidate снижает минимальное описание обращения с 30 до 20 символов и
исправляет ложный `Too many parts` для канонической формы с пятью служебными
полями и одним JPG/PNG/WebP. Allowlist и независимые пределы не ослаблены:
`fields=5`, `files=1`, `fileSize=5 MiB`, `fieldSize=4 KiB`; только exclusive
Busboy `parts` cap исправлен на `7`.

Новая additive migration
`20260831120000_guest_support_bug_report_input_repair` меняет только длину
description check на `20..2000` и переводит exact worker readiness на 189-й
head. Локально прошли API multipart/boundary tests, focused API, runtime
boundary, Prisma validation/typecheck, Web boundary/lint/build и current-head
operational gates. На момент подготовки candidate active runtime оставался
`a130c13e…`, generation 16, schema CURRENT_188, reporting LIVE. Итоговый
exact-SHA admission, rehearsal и production rollout зафиксированы выше.

Существующий dormant/noncanonical employee-invite proposal с логическим
названием CURRENT189 этим изменением не активируется. Его будущая canonical
promotion требует rebase/refreeze поверх фактического нового head.

Release artifact provenance для кандидата теперь получает migration head и
count из exact набора каталогов, уже скопированных в artifact, и затем проходит
независимую повторную сверку verifier. Ранее workflow записывал stale
`188/20260828190000_guest_support_bug_reports`, хотя artifact уже содержал 189
миграций; admission корректно остановился до публикации deployable handoff.
Изолированный API child-process fixture отдельно pin-ит reviewed
`189/20260831120000_guest_support_bug_report_input_repair`, поэтому provenance,
runtime readiness и реально применённая disposable schema должны совпасть.
Исправление этой metadata-границы не меняет production и не заменяет отдельный
production GO.

Restored-copy preflight 31.08.2026 восстановил production backup в отдельный
PostgreSQL 16 contour и успешно применил canonical `188 -> 189`. Первый runtime
acceptance остановился fail-closed до production effect на несовпадении
каталога товаров: oracle включал 251 архивный `Product`, а `/products` по
контракту отдаёт только `isActive=true` (`1489` против `1238`). Source repair
синхронизирует oracle с endpoint и закрепляет это тестом; данные production не
менялись. Новый exact-SHA acceptance на восстановленной копии остаётся
обязательным gate.

Повторный acceptance затем остановился на user-reference oracle. Read-only
сверка 103 tenant-scoped FK к `User` не нашла ни одной реальной cross-tenant
ссылки: отказ вызвали historical ссылки на platform-admin этого же tenant,
скрытого из `/users`. Candidate разделяет visible user set и полный tenant
reference set, сохраняя точный `/users` projection и отказ для настоящего
foreign ID. Production не менялся; требуется новый exact-SHA admission и PASS
на той же restored-copy.

Третий acceptance дошёл до staff selectors и также завершился fail-closed без
production effect. В canonical tenant существуют 28 управляемых non-platform
учётных записей, из которых 26 активны; `/staff/tasks` и аналогичные selectors
по контракту не возвращают две `isActive=false` записи. Новый oracle разделяет
account-management, active-staff и discipline-eligible sets, проверяет их
отношения и добавляет endpoint context в signed failure evidence. Одновременно
platform-admin явно исключён из tenant employee selectors. Неактивные аккаунты
не удалены и доступны в `/users`, но не назначаются в staff workflows. Локальный
контракт проходит 28/28 тестов; нужен новый exact-SHA admission и PASS на той же
restored-copy до любого production rollout.

Для контролируемого rollout добавлен отдельный точный bridge
`ALLOW_CURRENT_188`: только `COMBINED + reporting OFF`, source CURRENT_188 и
target release CURRENT_189. Он нужен, чтобы до DDL оба independently admitted
blue/green slot принадлежали одному target-189 SHA, а после additive migration
оба автоматически перешли в exact-189 readiness. Любой иной head/count,
release identity, `LIVE` или split runtime блокируется. После postflight bridge
возвращается в `OFF`, reporting — в `LIVE`, bonus-ledger timer — в автономный
режим. Это не меняет внешний beta decision и до завершённого rollout production
остаётся на `a130c13e…`/CURRENT_188.

## Checklist review production rollout (31.08.2026)

PR [#90](https://github.com/boozik3412/leetplus/pull/90) и
[#91](https://github.com/boozik3412/leetplus/pull/91) разделили изменение
ответов чек-листа и review-решение. `ACCEPTED`, `RETURNED`, `ESCALATED` и
`CANCELED` теперь меняют только status/comment/audit metadata; stale клиент не
может заставить API повторно записать answers, score/evidence или attachment
bindings. Обычная отправка и редактирование ответов по-прежнему проходят
строгую attachment validation.

Exact SHA `a130c13e8d694b605d86a924b1524a6174ae1b51` прошёл Fast CI
[`33330505183`](https://github.com/boozik3412/leetplus/actions/runs/33330505183)
и Full Release Admission
[`33330505182`](https://github.com/boozik3412/leetplus/actions/runs/33330505182).
Immutable handoff установил production-control generation, offline hydration,
sealed release и переключил nginx generation 16 на active green. Postflight:
exact API/Web SHA, schema `188/20260828190000_guest_support_bug_reports`, public
`/game`, authenticated catalog smoke и autonomous bonus-ledger timer — healthy.
Legacy absolute attachment URLs и `QUARANTINED` файлы не мигрировались; два
ожидающих checklist run не принимались автоматически.

## Autonomous bonus-ledger production rollout (30.08.2026)

Накопившиеся bonus-ledger entries не обрабатывались автономно, потому что
`canary-safe.env` корректно выключал scheduler во всех blue/green API slot, а
отдельного worker unit не существовало. Источник проблемы — отсутствие
единственного production owner очереди, а не ошибки claim/idempotency ledger.

Отдельный bounded worker запускается
systemd timer из exact active release и не входит ни в public guest, ни в
corporate API process. Он fail-closed требует exact tenant, отдельный secret
set и live gates; staff/test rewards остаются исключены.

Первый live canary безопасно остановился до claim и Langame write: scheduled
tenant-wide pass не задаёт один общий `storeId`, тогда как прежняя aggregate
проверка требовала store identity ещё до выбора записей. Исправление не
ослабляет corporate/manual dispatch. Только scheduled worker/control-plane path
откладывает эту проверку до уже существующей per-entry границы, где перед каждым
внешним write заново требуется exact `entry.storeId`; запись без клуба остаётся
заблокированной. Исправление слито PR
[#88](https://github.com/boozik3412/leetplus/pull/88), exact SHA
`4036d312b5760e9daf292e416288d68949419aaa`; Fast CI
[`33309468458`](https://github.com/boozik3412/leetplus/actions/runs/33309468458)
и Full Release Admission
[`33309468461`](https://github.com/boozik3412/leetplus/actions/runs/33309468461)
успешны.

Generation 15 переключил production на active blue `4036d312…`; green
`d8c97649…` оставлен активным hot rollback. Live canary подтвердила одну
операцию `0 -> 500` во всех трёх локальных состояниях и Langame snapshot.
Recovery batch поставил одну своевременно claimed reward, проверил 28 ledger
entries, подтвердил 18 реальных начислений и отменил 10 staff/test записей до
provider write; `failed=0`, `blocked=0`, unresolved backlog `0`. Четыре
оставшихся wallet item имеют `PENDING` и ещё не были забраны пользователями,
поэтому не являются зависшими начислениями. После пустого повторного прохода
timer включён; два последовательных 30-секундных tick завершились успешно с
нулевой очередью.

## Обновление 30.08.2026 — Battle Pass/store-scope production repair

PR [#84](https://github.com/boozik3412/leetplus/pull/84) исключил ложный
onboarding fallback из Battle Pass, привязал второй onboarding-шаг только к
подтверждённому `CHECK_IN`, добавил безопасный category remap при смене клубов
и вывел ошибки сохранения рядом с кнопкой. PR
[#85](https://github.com/boozik3412/leetplus/pull/85) добавил в сохранённую
карточку Battle Pass явную метку автоматической или ручной выдачи наград.

Exact merge SHA `6ec3a5f18cf4448b0460efee266254908bbef1a1` прошёл
[Fast CI](https://github.com/boozik3412/leetplus/actions/runs/33300382020) и
[Full Release Admission](https://github.com/boozik3412/leetplus/actions/runs/33300382035).
Immutable runtime/control handoff установлен в blue slot; штатный verifier
принял exact API SHA, Web BUILD_ID и `CURRENT_188` (`188` migrations).
Blue/green controller переключил nginx на blue и выдал generation 13 receipt.
Green `ca3f332f…` оставлен активным hot rollback. Public API/Web identity,
страницы `/game` и `/gamification?tab=seasons`, watchdog и post-cutover
error scan прошли; schema и security-контуры не изменялись.

## Обновление 30.08.2026 — runtime repair production rollout

Выпущен единый exact release для трёх production-регрессий без расширения
security-контуров:

- USER_CALL advisory lock приводит PostgreSQL `void` к `text`, поэтому Prisma
  больше не обрывает public request до создания challenge;
- CURRENT188 runtime-function enrollment добавляет два минимальных
  attachment-helper grant для `leetplus_runtime`, сохраняя `PUBLIC` revoke и
  запрет `GRANT OPTION`; перед грантом exact controller идемпотентно закрепляет
  для этих двух исторических `SECURITY INVOKER` helpers безопасный
  `search_path=pg_catalog, public, pg_temp` и отклоняет runtime role с `CREATE`
  на `public`;
- canonical API overlay оставляет автономный reward scheduler выключенным, но
  меняет emergency materializer kill switch на `false`, чтобы ручное открытие
  уже заработанного кейса проходило через idempotent inline pipeline.

Финальный exact SHA `ca3f332ff6f9105793da4e85cfecd8f34770ab21` слит PR
[#82](https://github.com/boozik3412/leetplus/pull/82). Post-merge
[Fast CI](https://github.com/boozik3412/leetplus/actions/runs/33272038099) и
[Full Release Admission](https://github.com/boozik3412/leetplus/actions/runs/33272038128)
зелёные. Admitted runtime/control artifacts установлены; runtime-function
controller перевёл только два attachment helpers из exact legacy `<unset>` в
`search_path=pg_catalog, public, pg_temp`, выдал `leetplus_runtime` EXECUTE без
grant option и сохранил `PUBLIC=false`.

Blue/green controller переключил production на active green `ca3f332f…`,
generation 12. Blue `fdf97624…` оставлен активным hot rollback. Public API/Web,
exact CURRENT188 readiness и authenticated reads прошли watchdog. Production
postflight подтвердил materializer `false`, emergency kill switch `false`,
USER_CALL `true/SMS_RU_CALLCHECK`, корректный scalar advisory lock и отсутствие
новых `P2010` после cutover. Отрицательный USER_CALL status request вернул
контролируемый `400`, а штатный staff upload/download после signed tenant
context — `200/200` с побайтовым совпадением файла.

Для `***6035` entitlement `КЕЙС «УТРО»` остаётся `AVAILABLE`, не потреблён,
wallet item `PENDING`; production QA не имитировал пользовательское открытие и
не выбирал приз. Повторное открытие теперь проходит через включённый inline
pipeline, при этом автономный materializer остаётся выключенным.

## Обновление 29.08.2026 — bug-report production LIVE

PR [#78](https://github.com/boozik3412/leetplus/pull/78), merge SHA
`fdf97624674112858dc7303dcee33c8acb7041e2`, прошёл Fast CI
`33257317114` и Full Release Admission `33257317130`. Production schema
переведена подписанным mixed-owner планом
`f109a174df1954aa4787ab95a1d1b963c6eb920a8910143777af061255124b7f`
на exact `CURRENT_188`. Финальный active slot — blue `fdf97624…`, cutover
generation 11, `GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=OFF`,
`GUEST_BUG_REPORTING_MODE=LIVE`. Rollback green `cc4d1c59…` прошёл exact
CURRENT188 readiness и остаётся `OFF/OFF`.

Финальный pre-apply backup:
`/var/lib/leetplus/backups/current188-preapply-fdf97624-20260829T150010Z`;
dump SHA-256
`5b663c8204ca4ea060f502bc4229624cc6d6c3128cd3bf169d584bb86ad17780`.
DB objects/ACL, оба slot, public health/release identity, anonymous guard и
tenant/platform login redirects проверены. Позитивный гостевой submit без
действующего guest JWT не имитировался; support row counts после rollout —
`0/0/0/0`.

## Обновление 29.08.2026 — bug-report rollout watchdog

Bug-report/USER_CALL successor из PR #72 и исправленный cutover watchdog из
PR #73 объединены в exact merge SHA
`8d26acae670f5244f0f30fd2a9aac70eae940d1a`. Post-merge Fast CI
[`33205114353`](https://github.com/boozik3412/leetplus/actions/runs/33205114353)
и Full Release Admission
[`33205114384`](https://github.com/boozik3412/leetplus/actions/runs/33205114384)
зелёные. Этот exact SHA уже обслуживает production как `COMBINED` bridge
`CURRENT_187 -> CURRENT_188`; `GUEST_BUG_REPORTING_MODE=OFF`, поэтому новые
support routes остаются fail-closed до изменения схемы и отдельного LIVE
cutover. Схема остаётся чистой `CURRENT_187`.

Ранние public cutover корректно откатились до database effect: stateful
authenticated smoke создавал краткий post-login ingress cooldown, а прежний
watchdog ошибочно запускал readiness probe после него. Исправленный controller
сначала требует три последовательных readiness samples, затем один
authenticated smoke в общем deadline; bounded children не наследуют deployment
lock descriptor. Повторять тот же application deploy больше не требуется.

Строгий production migration controller V3 ожидает единый migration owner и
правильно блокируется на фактической исторической mixed-owner topology. Для
production подготовлен отдельный fail-closed signed mixed-owner controller V2:
план фиксирует OID, owner identity и ACL каждого исторического объекта; target
migration выполняется локальной `postgres` identity; владельцы старых объектов
не меняются; одной транзакцией выдаётся только минимальный runtime ACL новых
support tables/enums. Он допускает только source `187/4/0`, pre-grant
`188/4/0` или exact final `188/4/0` и удерживает тот же root-owned cutover lock.
Перед DDL он требует `DUAL_BRIDGE_N_MINUS_ONE`: active и rollback slot должны
быть independently admitted target-188 artifacts с exact provenance,
hydration/slot-link receipts, migration checksum, unit invocation,
authenticated reads и reporting OFF; active production-control generation
должна совпадать с controller SHA, а production-control install lock удерживается
вместе с cutover lock до post-effect проверки.
До успешного результата оба slot обязаны перейти из readiness
`187 -> target 188` в exact `188/188`. Controller должен получить собственные
зелёные Fast CI + Full Release Admission до production database effect.

## Обновление 28.08.2026

После production-инцидента `USER_CALL` подготовлено разделение B2B и public
guest runtime без изменения production. Актуальный контекст слит в `main` merge
SHA `8b1d5972aec3c61b62789002ddacf1653a8b5bbc`; его post-merge Fast CI
[`33149292335`](https://github.com/boozik3412/leetplus/actions/runs/33149292335)
и Full Release Admission
[`33149292273`](https://github.com/boozik3412/leetplus/actions/runs/33149292273)
зелёные.

При preflight bug-report rollout обнаружен ручной emergency USER_CALL sidecar
от 27.08.2026 на старом release `39e11b61…`. Он обслуживает только allowlisted
public auth routes на localhost `3400/4400`, но не имеет immutable handoff,
schema bridge и migration/rollback receipt, поэтому не может пережить
`CURRENT_187 -> CURRENT_188`. Production gate корректно остановил rollout до
database effect. Source successor формализует Callcheck как API-only exact
`guest-user-call-live.env`: admitted main slot сначала принимает USER_CALL без
простоя, после чего ручной sidecar выводится до миграции. Это не включает owner
activation, scheduler или delivery workers.

Отдельные `corporate-main`/`guest-main` имеют разные module graphs. Guest graph
не импортирует `AuthModule`, `StaffModule` и широкие domain modules. Corporate
graph не импортирует public `GuestPortalModule` или полный смешанный
`GuestGamificationModule`, но через `CorporateGuestGamificationModule`
сохраняет tenant-authenticated `/guests/gamification*`, media management и
controlled game jobs. Public guest controllers в corporate process не
регистрируются. HTTP perimeter, entrypoint role и secret allowlist работают
fail-closed. Guest process не регистрирует background scheduler: требуемый
bonus signal заменён no-op.

Подготовлены dormant systemd/nginx templates для отдельных UID/slices, портов
`4100/4101` и `4200/4201`, route split и разных bounded PostgreSQL pools на
том же VDS. Это пока не production-ready cutover: production-control
attestation/watchdog/rollback ещё знают только одну API unit; также нужны
отдельные DB-роли, restored-copy ACL/pool rehearsal, нагрузочный canary и явный
GO. Текущий production остаётся `COMBINED` и не изменён. Runbook:
[split guest runtime candidate](../deployment/guest-runtime-pool-candidate/README.md).
Канонические route/identity/process инварианты:
[runtime/security contours](../security/runtime-security-contours.md).

### Guest bug-report support candidate

Подготовлена fail-closed система обращений для игрового модуля. Public submit
зарегистрирован только в GuestRuntime и требует действующую guest identity;
tenant queue зарегистрирована только в CorporateRuntime и требует support
capability + fresh network scope; общая очередь требует PlatformAdminGuard.
Support storage не связан со StaffTask, уведомлениями или outbound providers.
Один JPG/PNG/WebP до 5 MiB проверяется по bytes, очищается от metadata и
выдаётся сотруднику только как private attachment. Additive migration
`20260828190000_guest_support_bug_reports` переводит exact schema contract в
`CURRENT_188`. До same-SHA admission, restored-copy rehearsal, inactive-slot
canary и atomic cutover production считается `CURRENT_187`, а runtime flag
остаётся `OFF`. Runbook:
[guest bug reporting](../support/guest-bug-reporting.md).

Для текущего exact `CURRENT_187` подготовлен отдельный fail-closed переход.
Подписанный legacy mixed-owner controller удерживает root-owned blue/green lock
и связывает план одновременно с active и rollback target-188 slot, accepted
cutover, production-control, release/hydration/slot-link authority, protected
env/unit invocation и authenticated live reads. Оба slot должны показывать
`187 -> target 188`, reporting OFF, а старый CURRENT_187 artifact выводится из
rollback authority до DDL. Controller применяет единственную checksum-pinned
migration через локальную `postgres` identity без owner normalization и требует
от обоих slot readiness `188/188` вместе с полным support catalog и exact
минимальным ACL. Затем candidate slot запускается с bridge OFF и reporting LIVE.

### Role-aware landing

Закрыт кодовый дефект общей post-login маршрутизации: tenant-роли больше не
используют `/dashboard` как универсальный fallback. Каноническая карта:
управляющие роли → `/dashboard`, `BUYER` → `/assortment/dashboard`,
`MARKETER` → `/marketing`, `STANDARDS_MANAGER` → `/staff`, сменные роли →
`/staff/shift-workspace`, platform admin без tenant-контекста →
`/administration`. Stale `returnTo=/dashboard` и прямой `/dashboard`
проверяются сервером до загрузки dashboard API.

Implementation SHA `359e5aeb1a7e0b53197747ef781adaf166baf6d3` слит через
[PR #63](https://github.com/boozik3412/leetplus/pull/63). Fast CI
[`33136172976`](https://github.com/boozik3412/leetplus/actions/runs/33136172976)
и Full Release Admission
[`33136173010`](https://github.com/boozik3412/leetplus/actions/runs/33136173010)
зелёные на одном exact SHA. Production для этого изменения ещё не переключён;
до этого момента реальный пользовательский инцидент нельзя считать закрытым
production canary. Полное evidence:
[role-aware corporate landing](./role-aware-corporate-landing-evidence-2026-08-28.md).

## Обновление 24.08.2026

Инциденты входа platform admin и сотрудников закрыты без расширения
cross-tenant доступа. Коммуникации доступны всем системным ролям;
административные роли имеют непонижаемый read-контур рабочих staff-разделов;
`STORES` landing больше не ведёт на network-only `shift-workspace`.
Platform admin с сохранённой сессией сначала попадает в control plane и входит
в tenant только через подписанный выбор. Production cohort и известные
data-quality отклонения зафиксированы в
[production access baseline](./production-access-baseline-2026-08-24.md).

Предыдущий mutable `main → git pull → build → restart` создал release-gate
bypass: runtime мог попасть в production до завершения CI. Поэтому текущий
healthy runtime сам по себе не считается admitted evidence. Exact SHA
`d2ea7121…` уже имеет успешные Fast CI `32716122369`, Full Release Admission
`32716122390` и immutable handoff; legacy deploy timer теперь masked.
Production всё ещё работает из legacy checkout SHA `59239eeb…`, поэтому
immutable slot cutover и отдельный GO остаются launch blockers. Canonical-deploy
successor из текущего change обязан получить новую same-SHA admission до замены
этого baseline.

В PostgreSQL fixture custom-role raw permissions были ошибочно выданы за
effective permissions после введения обязательного минимума роли. Runtime
модель была корректной и fail-closed; исправляется fixture, а не разграничение
данных. StaffTask current-state label также синхронизирован с фактическим
187-entry manifest: `CURRENT_187`, при сохранении frozen evidence prefix
`EXPAND_162`.

Ложный CURRENT179 exact-history failure закрыт. Git/LF manifest `1..178`
канонически равен `7f986797…`; `ba9ca94c…` появился только из-за `150` CRLF
файлов старого Windows checkout. `db:deploy` теперь использует изолированный
canonical LF Prisma artifact. PostgreSQL 16.15 clean deploy дошёл до `187/187`,
повторился как no-op, а attachment reconciliation завершил plan/apply/replay/
check/rollback с zero residue. Подробности:
[canonical deploy/reconciliation evidence](./gate-1mt-canonical-deploy-reconciliation-pg16-evidence-2026-08-24.md).
Эти prerequisites впоследствии закрыты для base subset: fresh backup,
restored-copy, exact role/grant attestation и owner approval завершились
production apply `4 416/4 416`, check/replay `zeroDiff`, drift/downtime `0`.
Оставшийся residual subset требует отдельного нового admission/approval.

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

Attachment reader exact `abb8a667…` расширил coverage на chat, task,
checklist, knowledge, regulation, training и onboarding parents. В том
историческом срезе пять новых типов требовали fresh NETWORK, capability своего
staff-модуля и exact same-tenant parent до blob read; последующий
`085f8bbd…` безопасно открыл knowledge для STORES вместе с parent policy.
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

Production-build attachment browser slice принят на exact implementation
`97648308…`. Первый run обнаружил и отклонил absolute-locator дефект Web BFF;
после исправления fresh clone прошёл OWNER upload→bind→download→remove→
quarantine→404. Database blob и browser download совпали с исходником по
SHA-256, положительный console `0/0`, whole-schema postflight: только семь
ожидаемых deltas из `156` таблиц, database residue `0`. STORES(B1) direct URL
к network-only knowledge parent дал штатный 404 с чистой console; это было
deny-only evidence до последующего knowledge STORES adoption.
[Полный browser-отчёт](./gate-1mt-attachment-browser-evidence-2026-08-19.md).

Knowledge-base STORES adoption реализован на exact implementation
`085f8bbdd3115b3ec7a4438e7614c815004dd844`. Общая server-side policy теперь
одинаково ограничивает list/detail/mutation/audit и attachment download:
`STORES(B1)` управляет только статьями B1, читает совместимые опубликованные
network articles и получает hidden `404` для B2. Focused unit `32/32`, Web BFF
`12/12`, restored-copy PostgreSQL `9/9`, API/Web typecheck/build и
production-build browser A/B прошли. B1 upload/bind/download дал `BOUND`
binding с exact B1 Store; authenticated B2 GET того же файла вернул hidden
`404`. После этого среза оставались четыре network-only staff parent families.
[Полный отчёт](./gate-1mt-knowledge-stores-evidence-2026-08-19.md).

Shift-regulations STORES adoption реализован на exact implementation
`6ce36a41494e488076c60ac1776b765e24731d5e`. Fresh parent policy теперь
ограничивает list/detail/create/update, версии, оценки, подтверждения и
attachment download. `STORES(B1)` управляет только B1 regulation, читает и
подтверждает опубликованный network regulation read-only, не видит B2 и не
может назначить assessment B2. Focused unit `53/53`, Web BFF `13/13`, pilot
HTTP/guard `160/160`, restored-copy PostgreSQL `10/10`, typecheck/lint/build и
production-build browser A/B прошли. Остались три network-only staff parent
families: training, onboarding и checklists/templates.
[Полный отчёт](./gate-1mt-shift-regulations-stores-evidence-2026-08-19.md).

Training STORES adoption реализован на exact implementation
`40a8e82886e8c98c4fc72b67ff6ef809f22e511c`. Fresh course/profile policy
ограничивает list/detail/create/update, profiles, progress, export, reference
choices и attachment download. `STORES(B1)` управляет только B1 course и
сотрудниками B1, читает опубликованный network course read-only и не видит
B2; B2 получает симметричный контур. Focused unit `54/54`, Web BFF `14/14`,
pilot HTTP/guard `160/160`, restored-copy PostgreSQL `11/11`, typecheck/lint/
build и production-build browser A/B прошли. Остались две network-only staff
parent families: onboarding и checklists/templates.
[Полный отчёт](./gate-1mt-training-stores-evidence-2026-08-19.md).

Onboarding STORES adoption реализован на exact implementation
`26b9f4425e4fc416fb1e741949be2a30a53576d7`. Fresh plan/reference policy
ограничивает list/detail/create/update, Store и task/checklist/regulation/
course choices, а attachment download повторяет ту же parent authority.
`STORES(B1)` управляет только B1 plan, читает active network plan read-only и
не видит B2; B2 получает симметричный контур. Focused unit `55/55`, Web BFF
`15/15`, pilot HTTP/guard `160/160`, local PostgreSQL `12/12`, typecheck/lint/
build и production-build browser A/B прошли. Осталась одна ранее network-only
staff parent family: checklists/checklist templates.
Exact push CI `32220369599` принял implementation SHA как `4/4 SUCCESS`.
[Полный отчёт](./gate-1mt-onboarding-stores-evidence-2026-08-19.md).

Checklists STORES adoption реализован на exact implementation
`70d8301d204141c7d4d07c83c2752737f18aaa7d`. Fresh checklist policy
ограничивает templates, runs, answers/review, reports/exports, reference
catalogs и attachment download. `STORES(B1)` управляет только B1 resources,
читает active network template read-only и не видит B2; B2 получает
симметричный контур. Focused API `59/59`, full API `3192`, Web BFF `16/16`,
local PostgreSQL `13/13`, typecheck/lint/build и production-build browser A/B
прошли. Этим закрыта последняя ранее network-only staff parent family; общий
STAFF и Gate 1MT ещё не закрыты. Exact push CI `32223728916` принял
implementation SHA как `4/4 SUCCESS`.
[Полный отчёт](./gate-1mt-checklists-stores-evidence-2026-08-19.md).

Attachment parent-delete DB guard добавлен как следующий bounded engineering
slice. Migration `20260819010000_staff_attachment_parent_delete_guard`
ставит deferred constraint triggers на все семь polymorphic attachment parent
tables и запрещает raw parent delete, пока существует `BOUND`
`StaffAttachmentBinding`. Focused local PostgreSQL matrix прошла `14/14`: все
trigger names установлены, raw-delete reject и unbind/quarantine→delete allow
проверены. Этот же migration теперь является canonical `CURRENT_186` release
head для identity-mail readiness: count `186`, clean preterminal
`589dd0a3…`, production-history preterminal `094f3ad3…`. Current-head gate
`3/3`, identity-mail repository `67/67`, production-history lane `7/7` и
focused evidence pack `110/110` прошли. Полный local clean deploy всё ещё
останавливается до `CURRENT_186` на pre-existing
`20260731120000_identity_mail_delivery_release_head`, поэтому production,
текущий tenant из четырёх клубов и внешние тестеры не изменялись.
[Полный отчёт](./gate-1mt-attachment-parent-delete-guard-evidence-2026-08-19.md).

Clean head `6c6bf7adca71c8ee27d1e0fc2a61819dd7e149f8` принят GitHub Actions run
`32178680887` как `4/4 SUCCESS`. Exact `94a146d2…` принял founder-mail gate,
но application CI отклонил одно устаревшее network-guard ожидание; остальные
`158/159` тестов прошли. Successor `542c8126…` исправил inventory и принят
exact-head GitHub Actions run `32187880656`: все четыре jobs `SUCCESS`.

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

1. Новый exact SHA должен получить одновременно зелёные Fast CI и Full Release
   Admission; final receipt/runtime/control artifacts должны быть независимо
   проверены на сервере, а legacy main-watching deploy timer — выведен из
   authority path. Предыдущий healthy runtime этим gate не закрывает.
2. Production backup/restore, clean migration/repeat/data zero-diff,
   activation-role TLS/HBA/SCRAM lifecycle и повторная приёмка скачанного
   exact-SHA artifact закрыты.
3. `SENT`, owner accept, one-tenant enrollment и trusted TLS SMTP доказаны на
   disposable клонах restored copy. Ещё не выполнены production worker-role
   enrollment, production SMTP secret/config и controlled production canary.
4. Gate 1MT PostgreSQL A/B matrix (`35/35`, включая attachment reader и native
   writer/lifecycle, real
   HTTP SSE и latest
   assortment HTTP `15/15`), browser read/admission и report/download/mutation
   journey, OWNER attachment lifecycle, knowledge, shift-regulations,
   training, onboarding и checklists STORES adoption приняты. Production
   parent-delete trigger inventory `7/7` также принят на read-only snapshot.
   Aggregate inventory выявил `5 446 UNRESOLVED`, из которых production base
   apply уже закрыл `4 416` unique-parent rows с drift/downtime `0`. Остались
   `1 030 UNRESOLVED`, `20 PENDING` и `243` URL-review signals. Residual
   controller прошёл fresh restored-copy lifecycle: `309` blobs получили
   предложение `795` existing-parent bindings, `721` no-parent blobs —
   reversible quarantine, `20` non-expired PENDING остались review-only.
   CURRENT179 manifest blocker закрыт canonical LF deploy. До browser matrix
   нужны новый same-SHA admission, fresh production residual plan/approval,
   apply/check/replay и pending TTL disposition. Также не закрыты outbound
   digest, remaining STAFF slices, jobs/Telegram/public guest binding и Gate 2
   текущей сети.
5. External-beta activation, `FOUNDER_OPERATOR_BETA_MODE=ACTIVE`, внешний tenant и
   реальный tester invite не выполнялись.

## Полный путь до первого внешнего тестера

```text
[DONE main 88719342] exact SHA + Fast CI + Full Release Admission
  → [DONE CI] immutable runtime/control handoff
  → [DONE operational baseline] legacy auto-deploy removal from authority path
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
  → [DONE restored-copy clone] OWNER attachment upload/bind/download/unbind/quarantine
  → [DONE restored-copy clone] STORES side-door deny for network-only staff parents
  → [DONE restored-copy clone] knowledge-base STORES parent + attachment adoption
  → [DONE restored-copy clone] shift-regulations STORES parent + attachment adoption
  → [DONE restored-copy/browser] training STORES parent + attachment adoption
  → [DONE local PostgreSQL/browser] onboarding STORES parent + attachment adoption
  → [DONE local PostgreSQL/browser] checklists STORES parent + attachment adoption
  → production roles/secrets + controlled SMTP canary
  → [DONE read-only production] attachment trigger/inventory evidence
  → [DONE engineering/local PG] attachment plan/apply/replay/rollback controller
  → [DONE] clean-history manifest fix + fresh restored-copy rehearsal
  → [DONE production] reviewed unique-parent apply: 4 416 bindings, zero drift/downtime
  → [DONE engineering/restored-copy PG] residual controller: 309→795 bindings,
    721 no-parent quarantine proposals, 20 active PENDING retained, exact rollback
  → admitted residual artifact + fresh production plan + exact owner approval
  → residual production apply/check/replay + pending TTL disposition
  → Gate 1MT attachment archive/orphan browser matrix + remaining STAFF slices
  → Gate 1MT jobs/Telegram/public-guest/outbound
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
