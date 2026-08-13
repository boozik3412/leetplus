# CURRENT198: immutable bootstrap-root registry

| Поле                           | Значение                                 |
| ------------------------------ | ---------------------------------------- |
| Статус                         | `LOCAL FOUNDATION / ROOTS EMPTY / NO-GO` |
| Дата                           | 14.08.2026                               |
| Production root                | отсутствует                              |
| Production / Tenant A / tester | не изменялись                            |

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
повторно CURRENT196 verifier matrix. На момент добавления документа — `20/20`.
CI запускает transition verifier отдельно в authority job и полный gate в
application job.

## Что этот этап не разрешает

CURRENT198 не является key ceremony, root enrollment, migration, deploy или
`SHARED BETA GO`. Следующее добавление реального публичного root должно быть
отдельным reviewed exact-SHA изменением после внешней/offline генерации ключа,
двухконтрольной проверки fingerprint и operational approval. До этого
production acquisition остаётся физически fail-closed.
