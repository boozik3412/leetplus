# Exact merge-candidate admission

Статус: **source/CI authority; production не изменяется**

Цель контракта — выполнять один deployable Full Release Admission для exact
merge SHA, не повторяя полный цикл на feature-head, а затем ещё раз после merge.

## Штатный release train

```text
PR exact head
  -> Fast CI
  -> merge в коротком согласованном окне
  -> exact main merge SHA
       |-> Fast CI (тот же SHA)
       `-> Full Release Admission (один deployable handoff)
             -> отдельный production GO
```

Обычный путь не требует pre-merge Full. Для особенно рискованного изменения
оператор может вручную запустить полный validation на feature branch, однако
такой run намеренно не выпускает final handoff и не может быть установлен в
production. Повтор внешне упавшего job выполняется через `rerun failed jobs`
того же run; новый source SHA для этого не создаётся.

## Машиночитаемый контракт

[`classify-release-candidate.mjs`](../../.github/scripts/classify-release-candidate.mjs)
получает уже повторно проверенный impact receipt и создаёт canonical
`LEETPLUS_RELEASE_CANDIDATE_RECEIPT_V1`. Положительное
`deployableCandidate=true` возможно только одновременно при всех условиях:

- GitHub event — exact `push`;
- ref — `refs/heads/main`;
- repository — `boozik3412/leetplus`;
- `workflowRef` — exact `ci.yml@refs/heads/main`;
- `workflowSha`, checked-out `HEAD` и release SHA совпадают;
- event `before` — non-zero exact ancestor, совпадающий с base impact receipt;
- impact lane разрешает runtime artifact (`L1` или `L2`).

Markdown-only `L0`, `workflow_dispatch`, `schedule`, feature ref, force-push
ancestry drift, несовпавший workflow SHA или tampered receipt не могут получить
deployable authority. Manual и nightly Full остаются non-deployable validation.

Candidate receipt детерминированно связывает release commit/tree, digest exact
impact receipt, event/ref и workflow identity. Он публикуется в двух формах:

- attempt-bound audit artifact с impact evidence;
- короткоживущий non-deployable intermediate artifact с именем `SHA + run_id`,
  чтобы selective rerun final job использовал те же bytes.

Final handoff скачивает intermediate authority в fresh job, повторно запускает
классификатор и проверяет решение
`EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE`. Deployable runtime/control payload и
final admission receipt по-прежнему привязаны к producing `run_attempt`.

## Concurrency

Fast CI отменяет только устаревший head одного pull request. Push в `main`
привязан к exact SHA и не отменяется последующим docs/runtime commit. Full
Admission использует отдельную группу `event + SHA` и `cancel-in-progress=false`:
новый merge не может оборвать уже выполняющийся exact candidate.

Это не заменяет короткое release-train окно. Несвязанные runtime изменения
должны входить в следующий train; branch rules/merge queue намеренно не
изменялись этим source/CI срезом.

## Проверка

```bash
node .github/scripts/test-release-candidate-classifier.mjs
node .github/scripts/test-release-candidate-workflow.mjs
node .github/scripts/test-release-admission-selective-rerun.mjs
```

Negative matrix фиксирует docs/manual/schedule non-deployable решения, exact
main positive path, wrong ref/repository/workflow SHA, zero/mismatched base,
неизвестный event, tampered impact/candidate receipts и attempt-stable
intermediate authority.

## Не является production GO

Даже final admission handoff не меняет production. Live probes, backup и
restored-copy для своей lane, installed-control verification, signed controller,
blue/green rollback/postcheck и отдельное подтверждение production effect
остаются обязательными.

Для `L2_SCHEMA_SECURITY` backup/off-host copy и disposable restored-copy можно
начинать параллельно этому admission. Nonauthorizing preparation и обязательный
post-admission live rebind описаны в
[`parallel-backup-restored-copy-evidence.md`](./parallel-backup-restored-copy-evidence.md).
