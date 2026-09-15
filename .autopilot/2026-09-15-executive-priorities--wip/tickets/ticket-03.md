# 03 — Общий полезный список приоритетов

Требования: R01,R02,R03,R04,R05,R06,R08,A01,A02,A03,A04. Blocked by:01,02. Волна:2. Status: ready.
Зона: main executive priority composition/list/streaming/dashboard page; no API. После01 получает executive-priority presentation files.

Из брифа: «тоже надо в этом блоке подсвечивать», «что еще очень важно не упустить»; уточнение двух разных финансовых сигналов — «Оба отдельно».

Спецификация §2,5,6,7,8,9; interfaces wire уже фиксирован. Сохранить выбранный вид5карточек/графика и компактную таблицу.

Критерии:
- Financial/OOS/staff signals объединены со стабильными ids, детерминированной urgency группировкой; total count считает весь список;3видимых + показать все/свернуть без потерь/дублей.
- LowStock/noSales21 добавлены по canonical child+wrapper eligibility; stale/MISSING/FAILED не создают закупочные советы. Partial qualified, без выдуманной оценки денежных потерь.
- Staff current time/scope явно отличается от financial period. Safe server async/Suspense или действующий эквивалент не блокирует base KPI/priority при staff delay/failure.
- Loading/unavailable/denied/failed не превращаются в0проблем; sources свёрнуты с видимым признаком ограничения. Older API404 graceful, никакого fallback на более широкий legacy staff report.
- Staff/financial drill and Back сохраняют поддерживаемый scope. Нельзя отправлять unsupported multistore query старым staff pages. Latest scope не принимает старый staff result.
- Role-safe targets и подписи, пользователь не видит enum/trace. Keyboard, mobile390/944/1440, light/dark; не строить ещё один standalone HTML вместо реального Next.

Root организует Web build после freeze;04 проводит независимую UI matrix. Исполнитель проверяет scoped lint/types, meaningful public presentation behavior. No commits/branches/.autopilot edits.
