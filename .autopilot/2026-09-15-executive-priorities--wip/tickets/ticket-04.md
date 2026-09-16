# 04 — Приёмка, аудит всех разделов и source-only документация

Требования: R01,R02,R03,R04,R05,R06,R07,R08,A01,A02,A03,A04. Blocked by:01,02. Волна:2. Status: ready.
Зона: API PG integration tests в apps/api/test; external fixtures/evidence; docs. Не менять implementation. Browser acceptance ждёт03 freeze/build, API proof и docs prep могут идти параллельно03.

Из брифа: «Пробегись по всем блокам и посмотри что еще очень важно не упустить» и все прямые сигналы.

Критерии:
- Реальный scoped PG/HTTP proof для staff routes, foreign/non-NETWORK/custom perms, counts/items parity, cases deadlines/training/scope/caps/no writes. Не заменять mocked Prisma shape этим доказательством.
- Financial current/previous/group/coverage proof прослеживается к API tests; UI fixtures не выдаются за доступный ARPV/source data.
- Actual Next matrix: оба decline отдельно, staff + stock,3/all,loading/failure/denied/partial/zero, scope/Back/item links, keyboard and3widths/themes. Один контролируемый fixture без внешних запросов/real auth, финальные PNG полностью показывают нужные блоки.
- Matrix всех модулей сохраняет реальные находки/ограничения: CRM no store binding, support no SLA, snapshot read-only permission, gamification no replay, platform admin separate, knowledge/assessments не равны course completion.
- Docs metric contract/staff priority semantics, exact new read surface and source-only openbeta/security section updated. Согласовать shared docs с root; preserve controller owner sections. Никаких утверждений current control399876 без проверки.
- Отдельные logs/exits, исторические ошибки сохранены. Список completed/partial/source-limited требований честный; R02 source limitation явно в отчёте. Проверенные local/CI source не выдаются за deployment.

Начать API proof после01/02; не запускать browser до03 freeze/root build. Root владеет PG стартом/остановкой, full suites/CI. Не ставить dependencies и не повторять неизменные полные наборы. No commits/branches/.autopilot edits.
