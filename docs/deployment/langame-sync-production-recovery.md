# Langame sync production recovery

Статус: **audit storage repaired; runtime rollout HOLD до admitted drain-successor/worker authority и нового exact-SHA GO**

Актуально на: **04.09.2026**

## Причина и граница исправления

Read-only production diagnosis подтвердил, что импорт Langame записывал факты
в PostgreSQL, а затем получал `EACCES` при создании JSON-файла расхождений в
`/var/lib/leetplus/langame-sync/<tenant-id>`. Blue и green API имеют разные
Unix identities, а legacy tenant directory принадлежал одному slot и не был
доступен второму. Post-fact audit failure ошибочно превращал весь источник в
`FAILED`, не обновлял freshness и скрывал уже сохранённые данные.

Отдельно подтверждено, что встроенный scheduler выключен на обоих API slot и
не имел отдельного production owner. Поэтому unattended daily sync и пять
business snapshots не обновлялись после 26.08.2026.

Исправление не меняет auth, role/capability matrix, public guest ingress,
corporate scope или Langame credentials. Внешние tenant остаются
`EXTERNAL_DENY`; этот recovery разрешает unattended выполнение только одному
явно заданному внутреннему tenant.

## Source contract

1. Persistent root и каждый прямой UUID tenant directory имеют group
   `leetplus-api-runtime` и mode `2770`; owner tenant directory сохраняется.
2. Root-only authority формирует bounded canonical `plan`, связывает его
   SHA-256 и `actionCount`, а `apply` требует exact values и строку
   `I_ACCEPT_EXACT_LANGAME_DISCREPANCY_AUDIT_REPAIR`.
3. Перед каждым стартом API и Langame worker запускается отдельный preflight:
   symlink/mount/unexpected entry запрещены; blue→green и green→blue
   create/read/delete probes обязаны пройти без residue.
4. Fact import и audit JSON имеют разные terminal semantics. Если DB facts
   сохранены, но audit write не прошёл, DB job остаётся `SUCCESS` для freshness,
   а API/UI показывают `PARTIAL` и безопасный код без server path или tenant ID.
5. Audit file создаётся через exclusive create (`wx`) с mode `0640`; tenant
   directory обязан быть реальным directory, а не symlink.
6. Единственный unattended owner —
   `leetplus-langame-daily-worker.timer` → oneshot service. Он каждый раз
   разрешает exact active nginx slot и immutable release SHA. Оба API scheduler
   и scheduled HTTP owner обязаны оставаться `false`.
7. Worker требует exact lowercase tenant slug, ровно один processed tenant и
   zero failed scopes. Explicit business date допустима только в canary.
8. Установка unit files не включает timer. Operator-owned secret env не входит
   в install map и не может быть перезаписан production-control artifact.

## Обязательные gates до production

- exact candidate Fast CI `SUCCESS`;
- Full Release Admission того же exact SHA `SUCCESS`;
- immutable runtime/control handoff и installed-generation verification;
- fresh production backup, off-host checksum и restored-copy smoke;
- healthy active slot и независимо healthy hot rollback;
- read-only audit repair plan с exact digest/count и отдельное подтверждение
  только после проверки плана;
- worker timer disabled, API scheduler false, scheduled HTTP false до canary.
- установленный `/etc/leetplus/legacy-drain-units.conf` содержит exact
  `OPTIONAL_DRAIN` для worker service/timer и exact `SAFE` для audit preflight;
  уже активные автономные bonus-ledger service/timer остаются exact `SAFE` и
  не останавливаются ради Langame rollout;
  после установки unit inventory обязан снова пройти legacy drain verifier;
- если immutable N−1 activation receipt связан с предыдущим manifest, только
  admitted `LEGACY_DRAIN_MANIFEST_SUCCESSOR_V1` может добавить exact fences и
  новый linked receipt. Старый receipt не редактируется и не пересоздаётся;
- наличие successor receipt само по себе не разрешает Langame effect.
  Canary и timer требуют отдельного release/tenant/env-bound worker permit;
  общий legacy fence marker никогда не удаляется.

Ни один CI result, merge или этот документ не является production GO.

## Controlled rollout после отдельного GO

1. Повторно подтвердить production baseline, zero pending rollout intent,
   свободное место, backup/off-host copy и rollback slot.
2. Выпустить read-only audit `plan`. При drift остановиться; не подставлять
   старый digest. После отдельного подтверждения выполнить один exact `apply`,
   затем `check`.
3. Установить только admitted production-control generation, гидратировать
   candidate, запустить inactive slot. Storage preflight, readiness и
   authenticated read smoke должны пройти до cutover.
   Перед установкой новых unit atomically синхронизировать production
   legacy-drain manifest с admitted example, сохранив root-only backup; при
   любом другом расхождении unit inventory остановить rollout. Если manifest
   уже является exact additive successor исторического activation receipt,
   выполнить его отдельный digest-bound `plan/apply/check`; ручные drop-in или
   receipt edits запрещены.
4. Выполнить штатный atomic blue/green cutover. Timer всё ещё disabled.
5. Создать root-owned `/etc/leetplus/langame-daily-worker.env` в canary mode с
   exact internal tenant и одной датой. Первый canary — `2026-09-02`.
   Запускать oneshot только через отдельный worker-authorization plan/apply:
   permit связывает active admitted release, installed control, exact env,
   INTERNAL tenant и выключенные API scheduler/scheduled HTTP. Canary permit
   bounded и после terminal run возвращает оба durable legacy fence. Каждый
   terminal result требует `MainPID/ControlPID/ExecMainPID=0`, пустой cgroup и
   отсутствие systemd jobs; одного `is-active=false` недостаточно.
6. Проверить: три источника без `FAILED`, guest foundation успешен, ровно пять
   snapshot scopes свежие, JSON audit доступен при наличии расхождений, нет
   повторных rows по business keys.
7. Идемпотентно повторить canary для каждой отсутствующей полной business date
   начиная с `2026-08-27` и заканчивая последним завершённым локальным днём
   перед rollout. Уже успешный scope обязан стать безопасным skip,
   а не вторым effect.
8. Удалить explicit date и переключить `CANARY=false`. Отдельный
   timer-authorization plan сверяет timer profile с successful canary по
   stable-env digest, но не запускает oneshot вручную: при `Persistent=true`
   последующий `enable --now` сам может выполнить один пропущенный daily run,
   и ручной preflight создал бы второй effect за ту же business date. Authority
   публикует timer-profile validation receipt, включает timer, ждёт terminal
   result возможного единственного catch-up запуска, строгую quiescence и
   повторно запускает worker-specific + generic drain verifiers. Ручное
   удаление fence запрещено.
9. Провести public guest и corporate smoke независимо от worker QA; проверить
   оба slot, ingress, error logs и отсутствие новых duplicate facts.
10. Точечно сверить обращения `LP-BUG-AFDE6B03` и `LP-BUG-42A647BA`:
    - у первого профиля check-in 02.09 имеет canonical
      `CHECK_IN_PERFORMED`, один event/reward effect и не блокируется как
      pre-activation;
    - у второго профиля импортированы play-time и пополнение `920 ₽` 02.09,
      но пополнение не потребляется третьим шагом, если на его момент второй
      последовательный шаг ещё не был выполнен;
    - повтор canary/backfill не меняет counts, bonus ledger и wallet повторно.
11. После включения timer получить минимум два автоматических успешных tick,
    проверить fresh daily job/snapshots, дренирование pending sync jobs и zero
    `FAILED`, duplicate facts или повторных reward effects. Наличие только
    ручного успешного запуска не считается автономным восстановлением.

## Rollback

- немедленно: получить exact `revoke-plan`, подтвердить его digest/count строкой
  `I_ACCEPT_EXACT_LANGAME_DAILY_WORKER_REVOCATION`, выполнить `revoke-apply`,
  затем `revoke-check`. Authority отключает timer/service, доказывает пустые
  PID/cgroup, удаляет только 91 permit drop-ins и active pointer, возвращает
  exact 90 fences и сохраняет immutable revocation receipt. Ручной
  `systemctl disable --now` сам по себе не является завершённым rollback;
- до cutover: candidate не маршрутизировать;
- после cutover: вернуть только последний accepted hot rollback штатным
  blue/green controller;
- не откатывать schema и не удалять импортированные факты вручную;
- group/mode repair не даёт Web/public доступ и совместим с обоими API slot.

Если внешний tenant должен получить unattended Langame, текущий timer нельзя
расширять списком slug. Сначала нужен отдельный revision/lease-fenced contract,
tenant-system identity и новый admission review.
