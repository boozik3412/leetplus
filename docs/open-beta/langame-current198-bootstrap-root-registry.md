# CURRENT198: immutable bootstrap-root registry

| Поле                           | Значение                                |
| ------------------------------ | --------------------------------------- |
| Статус                         | `CI SHA ACCEPTED / ROOTS EMPTY / NO-GO` |
| Дата                           | 14.08.2026                              |
| Production root                | отсутствует                             |
| Production / Tenant A / tester | не изменялись                           |

CURRENT198 вводит единственный канонический release-owned реестр публичных
bootstrap roots для проверки CURRENT196 trust-enrollment proposal. Реестр
намеренно пуст: этот срез создаёт только защищённый механизм хранения и смены
доверия, но не создаёт ключи и не разрешает production enrollment.

## Инварианты

- реестр находится только в исходном коде релиза как один canonical JSON
  literal; env, API, БД и runtime-файл не могут добавить root;
- private key и signing authority в модуле отсутствуют;
- поддерживаются состояния `ACTIVE`, `RETIRED`, `REVOKED`, не более одного
  активного root и не более восьми записей;
- fingerprint вычисляется из canonical Ed25519 SPKI, lifetime ограничен 366
  сутками, purpose и trust domain фиксированы;
- история append-only: существующий root нельзя удалить или переписать;
- supersession образует одну связанную линейную цепочку без ответвлений;
- rotation добавляет ровно один новый `ACTIVE` root, связывает его через
  `supersedesKeyId` и закрывает прежний root в точный момент `notBefore` нового;
- emergency revoke может оставить реестр без active root; возобновление требует
  нового root после времени revocation;
- CURRENT196 получает только девятиполевую проекцию активного root, без
  lifecycle metadata;
- CI transition verifier читает exact bytes текущего HEAD и каждого Git parent,
  проверяет clean worktree и отклоняет обход истории.

## Проверка

Локальный gate выполняет syntax checks, CURRENT198 transition/registry matrix и
повторно CURRENT196 verifier matrix: `20/20`. Совместимость CURRENT196/197 с
реальным loopback TLS fixture: `25/25`; database typecheck и format/diff checks
зелёные.

Exact SHA `539e51a0f036dde44af8e8397c8791fe0a41123c` принят GitHub Actions run
[`31736711886`](https://github.com/boozik3412/leetplus/actions/runs/31736711886)
как `3/3 SUCCESS`: authority transition, application и PostgreSQL migration
smoke завершились успешно. SHA-bound artifact `9195731834`, digest
`sha256:5bcc5dd5342e8667b96ef8909997ae7b3ad4c188c45dfb9daa3b46a3e7de6254`,
size `16318211` bytes.

## Что этот этап не разрешает

CURRENT198 не является key ceremony, root enrollment, migration, deploy или
`SHARED BETA GO`. Следующее добавление реального публичного root должно быть
отдельным reviewed exact-SHA изменением после внешней/offline генерации ключа,
двухконтрольной проверки fingerprint и operational approval. Программная
часть этой проверки реализована в
[CURRENT201](./langame-current201-two-person-bootstrap-ceremony.md): изменение
реестра без exact canonical public evidence, двух валидных подписей и
совпадающего signed candidate теперь отклоняется transition gate. До
фактической offline ceremony и принятого reviewed PR production acquisition
остаётся физически fail-closed.
