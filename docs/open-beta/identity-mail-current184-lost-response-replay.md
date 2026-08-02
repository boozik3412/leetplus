# CURRENT184: replay потерянного ответа provider settlement

| Поле | Значение |
| --- | --- |
| Статус | `IMPLEMENTED_CANDIDATE / NOT_CANONICAL / NOT_DEPLOYABLE` |
| Candidate | `20260802020000_identity_mail_worker_v2_lost_response_replay` |
| Ordinal | `184` поверх exact `CURRENT183/183` |
| SQL SHA-256 | `d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424` |
| Production authority | `false` |
| Runtime/SMTP | не подключены |

## Зачем нужен этот slice

До CURRENT184 worker не повторял SMTP, но не мог достоверно восстановить
результат двух уже выполненных DB-переходов, если PostgreSQL закоммитил
транзакцию, а клиент потерял ответ:

- после `provider_mark_v2` durable marker уже мог существовать, тогда как
  process-local binding оставался на предыдущей revision;
- после `complete_v2(PROVIDER_ACCEPTED)` строка уже могла быть `SENT`, а
  повтор завершался stale-CAS и создавал ложное представление о необходимости
  новой мутации.

CURRENT184 делает повторяемым только DB-RPC. Вызов SMTP не находится внутри
retry-loop и не повторяется этим протоколом.

## Persisted evidence

В append-only `IdentityMailDeliveryEvent` добавлены два PII-free поля:

- `transitionRequestDigest CHAR(64)` — domain-separated SHA-256 exact
  settlement request, включая tenant, outbox, lease version, lease-owner,
  lease-token digest и provider authority;
- `settlementState VARCHAR(16)` — `ACTIVE | DRAINING` в момент исходного
  перехода.

Поля либо оба `NULL` для historical events, либо оба заполнены. CHECK также
связывает их только с допустимыми provider/completion event types. Partial
unique index `(tenantId, outboxId, transitionRequestDigest)` гарантирует один
durable результат exact request.

Raw email, token, ciphertext, Message-ID и provider payload в evidence не
попадают.

Для historical/non-settlement events сохраняется byte-identical digest domain
и preimage `LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V2`. Только события с новым
request evidence используют отдельный domain
`LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V3`, поэтому offline re-verification не
имеет неоднозначности между старой и новой формулой.

## `provider_mark_v2`

Same-signature wrapper сохраняет публичную five-RPC поверхность и выполняет
tenant-first lock до чтения replay evidence.

1. Если request ещё не встречался, owner-only CURRENT183 implementation body
   выполняет исходный CAS, а append trigger сохраняет request digest.
2. Если exact request уже закоммичен и marker всё ещё является текущей
   revision, все lease/provider bindings совпадают и acknowledge window живо,
   возвращается исходный `MARKED`. Только после этого runtime вправе один раз
   вызвать SMTP.
3. Если immutable marker event найден, но aggregate уже продвинулся либо
   acknowledge window истёк, возвращается typed `HANDOFF` со ссылкой на
   durable event. `HANDOFF` запрещает SMTP и останавливает текущий цикл до
   reaper/operator path.
4. Изменённый token, attempt key, authority или Message-ID образует другой
   digest и остаётся stale/conflict, а не replay.

## `complete_v2`

Exact повтор `complete_v2` читает исходный immutable event и возвращает ту же
terminal decision и ту же transition revision. Это относится к `SENT`,
`DEAD`, `RETRY`, `CANCELED` и `RECONCILIATION_REQUIRED`; новый provider call
не выполняется.

## Application boundary

Dormant adapter закреплён за exact `CURRENT184/184` и SQL SHA выше.

- semantic retry разрешён только для `provider_mark_v2` и `complete_v2`;
- максимум две общие попытки DB-RPC;
- retry включается только для структурированных connection-loss/unknown
  outcome кодов, без сопоставления текста ошибки;
- `claim_v2` и `reap_v2` не получают такой retry;
- после двух неизвестных ответов выбрасывается typed
  `IdentityMailWorkerV2AmbiguousSettlementError`;
- validated `HANDOFF` обрабатывается до SMTP: zero SMTP, zero `markSent`, zero
  fallback mutation, цикл завершается с reconciliation-required outcome.

Adapter по-прежнему не имеет `Injectable`, DI/config/CLI registration и
production credential. Readiness возвращает
`NOT_DEPLOYABLE / authorization=false / canSend=false`.

## ACL и dormancy

Migration не создаёт роли и не выдаёт grants. Exact five worker RPC,
`reconcile_v2`, append-trigger и два переименованных CURRENT183 implementation
helper остаются owner-only; helper names запрещены в API runtime source. Новый runtime не
может быть включён одним только применением этого candidate.

## Acceptance

Обязательная матрица:

- static CURRENT180–184 candidate inventory и exact SHA;
- отрицательные проверки columns/CHECK/index/routine/ACL/runtime exposure;
- exact marker replay: один event и одна revision;
- marker replay после expiry/aggregate advance: `HANDOFF`, без разрешения SMTP;
- exact completion replay: один terminal event и исходный receipt;
- DRAINING replay повторно проверяет полный command/enrollment projection:
  action, state/policy revision, role/OID, provider authority и configuration
  digest; неполная authority завершается `42501` без мутации;
- conflicting request остаётся fail-closed;
- max-two structured DB replay, zero semantic retry для claim/reap;
- exact owner-only ACL, source cleanup и отсутствие production residue.

Exact implementation `db154b412a9469f49fab6b27ad2e333426cdfa7f` принят
GitHub Actions
[`30740155651`](https://github.com/boozik3412/leetplus/actions/runs/30740155651):
authority-root gate, application checks и PostgreSQL migration smoke — green;
CURRENT183 step 29 и CURRENT184 step 30 — по `3/3 PASS`.

## Что CURRENT184 не закрывает

CURRENT184 не является разрешением тестового доступа. До первого внешнего
`Tenant B/Store B1` по-прежнему обязательны:

1. independently signed enrollment coordinator с crash-idempotent
   begin/resume/finalize/rollback ledger;
2. отдельные worker/coordinator DB roles, exact grants и live runtime
   attestation;
3. settlement-only режим для `DRAINING`, producer/activation v2 и
   zero-secret/zero-inflight barriers;
4. promotion CURRENT180–184 в один canonical release;
5. production-like apply/rollback/zero-diff rehearsal и отдельный
   `SHARED BETA GO`.

Production, текущий tenant четырёх клубов, SMTP и внешний тестер этим slice не
изменяются.
