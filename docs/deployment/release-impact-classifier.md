# Fail-closed release impact classifier

Статус: **source/CI guard; production authority не предоставляется**

Канонические правила находятся в
[`release-impact-classifier.json`](./release-impact-classifier.json). Классификатор
не анализирует намерение автора и не пытается угадать риск по содержимому diff:
он сопоставляет exact committed `base..head` paths с закрытым allowlist.

## Lanes

| Lane | Допустимый diff | Результат |
| --- | --- | --- |
| `L0_DOCS` | Только Markdown | Fast CI + non-deployable receipt; runtime artifact запрещён |
| `L1_RUNTIME` | Только явно allowlisted обычные application paths | Fast, focused tests, Full Admission и blue/green rollout |
| `L2_SCHEMA_SECURITY` | Schema/DB/ACL, auth/scope, public guest, worker/outbound, systemd/deploy/control, unknown или mixed | Полный admission и production safety contour |

`L1` не является правилом `apps/**`. Новый application path, которого ещё нет в
allowlist, попадает в default `L2`. Удаление или rename runtime-файла также
классифицируется по старому path: Git rename намеренно разворачивается в
`delete + add`, а mixed lane повышается до `L2`.

## Fail-closed contract

- `headSha` обязан совпасть с checked-out `HEAD`;
- `baseSha` и `headSha` — полные lowercase commit SHA, base обязан быть ancestor;
- rules manifest — canonical LF JSON, regular one-link file с bounded size;
- manifest фиксирует точный порядок lanes, gates и rule classes;
- неизвестный status/path и non-UTF-8 diff останавливают классификацию либо
  повышают её до `L2`;
- `minimumLane` может только повысить результат;
- receipt не содержит времени и детерминирован для exact base/head/rules;
- запись receipt exclusive; повторная проверка пересчитывает exact bytes.

CI adapter выбирает диапазон без пользовательского понижения:

- pull request — merge-base exact event base и head;
- обычный push — exact `before..head`;
- manual feature branch — merge-base с `origin/main`;
- force-push, schedule, manual `main`, отсутствующий trusted base или иной
  неопределённый event — не ниже `L2`.

## Локальная проверка

```bash
node .github/scripts/test-release-impact-classifier.mjs
node .github/scripts/test-release-impact-ci.mjs
```

Прямой CLI требует явные commit SHA и создаёт новый receipt:

```bash
node .github/scripts/classify-release-impact.mjs \
  --root . \
  --base-sha "$BASE_SHA" \
  --head-sha "$HEAD_SHA" \
  --minimum-lane L0_DOCS \
  --output "$RECEIPT"

node .github/scripts/classify-release-impact.mjs \
  --root . \
  --base-sha "$BASE_SHA" \
  --head-sha "$HEAD_SHA" \
  --minimum-lane L0_DOCS \
  --verify-receipt "$RECEIPT"
```

Receipt является evidence классификации source diff. Он не подтверждает live
systemd/nginx/NSS/DB, не заменяет admitted exact SHA, backup/restored-copy,
signed controller, rollback postcheck или отдельный production GO.

Для runtime-eligible diff Full CI передаёт этот receipt во второй fail-closed
контракт —
[`release-candidate-admission.md`](./release-candidate-admission.md). Impact
lane отвечает на вопрос «какие gates нужны», а candidate receipt — «может ли
этот exact event/SHA вообще выпустить deployable handoff». Ручной или nightly
Full не становится deployable только потому, что его impact lane равна `L2`.

## Docs-only canary acceptance

После включения gate его отдельный Markdown-only canary считается принятым,
только если одновременно выполнены все условия:

- receipt фиксирует `effectiveLane=L0_DOCS` и
  `runtimeArtifactEligible=false`;
- `Release impact classification` завершён `SUCCESS`;
- Fast Application и Authority jobs имеют terminal `SKIPPED`, а не запускаются;
- среди artifacts есть только impact receipt, без runtime candidate,
  production-control candidate и admission handoff;
- merge canary вызывает такой же `L0` post-merge Fast/Full результат на exact
  merge SHA.

Canary не использует production host, secrets, database или runtime artifact.

Первый pre-merge canary принят 02.09.2026: Fast CI
[`33556827337`](https://github.com/boozik3412/leetplus/actions/runs/33556827337)
для exact `60b51c04… → d1c5ea33…` завершился за 16 секунд. Receipt зафиксировал
`PULL_REQUEST_MERGE_BASE` и `L0_DOCS`; оба тяжёлых job получили `SKIPPED`.
Единственным artifact стал impact receipt размером 1 124 байта с transport
digest `sha256:191bdc70e381350a4200bb742a36e924676f0efb32440096363255fb6a62d274`.
