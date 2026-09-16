# 02 — Текущие обязательства персонала и рабочая детализация

Требования: R03,R04,R05,R06,A01,A02. Blocked by: none. Волна:1. Status: ready.
Зона: API staff priority reader/types/controller/module/coverage metadata/guard inventory; Web staff-priorities transport + /dashboard/priorities. Не менять executive финансовые/главные UI файлы.

Из брифа: «связать с блоком персонала», «незакрытые вовремя задачи или чек-листы (либо не пройдены учебные материалы)».

Спецификация §2,4,5,7,8,9 и фиксированный wire в interfaces. Вертикальный результат — текущие counts и read-only matching item lists, с working item links и честными источниками.

Критерии:
- Два узких GET source summary/items не вызывают report5000 pipeline для task counts; один fixed evaluatedAt и same where для count/items, paging20/max100.
- JWT/Roles/FreshNetwork/view_staff_control не ослаблены. Feature/custom permissions per kind, training manage для чужих profiles, foreign/stale/STORES deny; no hidden count or self fallback.
- Selected multiple stores проверены FreshStoreScope. null-store и NETWORK без bindings только при полном активном сетевом выборе; inactive без запроса не подмешивается; scope metadata и подписи честные.
- Tasks dueAt past != DONE/CANCELED. Checklist canonical overdue statuses OPEN/IN_PROGRESS/RETURNED/ESCALATED; ON_REVIEW отдельно без выдуманного review SLA. Старые open records вне финансового периода не потеряны.
- Required ACTIVE course assignments используют существующие rules; COMPLETED/WAIVED/optional excluded. Matching PUBLISHED current-version regulations ack; no impersonated acknowledgement action.
- Target-user membership and course/reg scope доказаны; данные capped/неполные не создают ложного непрохождения. Явные coverage/limit codes, PARTIAL только подтверждённый lower-bound, нет ложного0.
- DTO /dashboard/priorities показывает matching rows/paging/evaluatedAt, Back financial context отдельный; taskId/runId/userId реально работают. Reg pair employee/material/version видна в read-only details; broad catalog link так и называется.
- No writes/materialization/provider/sync/notify/autoassign. Существующие guards и закрытый inventory расширены только двумя точными read surfaces. API behavior and custom-boundary tests green; root полный suite/PG.

Не менять canonical security/openbeta docs параллельно04; сообщить precise surface/schema/permission facts root. No commits/branches/.autopilot edits. При необходимости дополнительных зон запросить root и сообщить UI автору wire changes до правки.
