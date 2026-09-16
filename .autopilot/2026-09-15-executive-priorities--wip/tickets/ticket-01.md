# 01 — Финансовые сигналы и проверяемый средний товарный чек

Требования: R01,R02,R06. Blocked by: none. Волна:1. Status: ready.
Зона: API receipt/executive contract/dashboard; Web executive metric mirror/details/financial priority slice. Полные границы в interfaces.

Из брифа: «Добавь изменение среднего чека, в случае снижения - надо разбираться». Уточнение: «Оба отдельно».

Спецификация §2,3,5,7,8,9. Вертикальный результат — настоящее API среднее по чекам, понятные основания/детали и два разных финансовых decline rules в текущем UI. Верхние5карточек не расширять. При необходимости извлечь существующий Priority list/business builder, не делать новую тему.

Критерии:
- Receipt-v1 grain/ambiguity и две независимые coverage реализованы через narrow facts; no heavy legacy summary. Canonical helper reused/adapted, без несовместимого дубля.
- Period/club/day admitted groups согласованы; validation window стабилен при comparison off. Несколько строк одного чека, несколько чеков одного SKU, provider/domain/store collisions, ambiguous cross-date ids проверены.
- Current600/previous750 даёт-150/-20%; incomplete data не даёт comparison. Empty sales mean null с причиной; free receipts mean0; no floating-noise false alert.
- averageProductCheck в existing executive details, receiptEvidence показан; older API без нового metric не ломает экран.
- ARPV отдельный AVAILABLE+valid negative comparison rule; текущая MISSING причина не скрывается и не подменяется выручкой товаров/движением баланса.
- Source scope,5card chart и фильтры сохранены; финансовые сигналы доступны в компактном top3/all списке, не обрезаны старым лимитом.
- Public service/HTTP or component behavior tests; no private query-shape snapshots. Targeted API+types/lint, Web types/lint. Root собирает Web и проводит полный suite при стабилизации.

До второго автора UI передать точные exports/interfaces и changed consumers. Не менять staff; no commits/branches/.autopilot edits. Завершение по prompts/executor.md; при риске контекста заранее seam handoff.
