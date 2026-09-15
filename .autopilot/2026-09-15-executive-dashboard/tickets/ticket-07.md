# 07 — Ширина нижних блоков на мобильном экране

**Требования:** R01, R16, R19
**Blocked by:** 03
**Зона:** executive-dashboard.tsx, executive-club-table.tsx; только необходимые constraints нижнего layout
**Статус:** done

В delivery-preview/dashboard-lower-390.png весь нижний layout шире внутреннего viewport: таблица клубов растягивает grid, справа обрезаются карточки «Закончится за3дня» и «Без продаж21день». Предыдущий Q17 проверял documentWidth, но у приложения отдельный scroll-host, поэтому не доказал отсутствие переполнения этого контейнера.

Исправить минимальные ширины grid/card/таблицы. На390 все три ассортиментные карточки должны целиком помещаться в доступную ширину (допустим разумный вертикальный перенос), таблица имеет только собственную горизонтальную прокрутку. Полные длинные названия/значения сохраняются; остальные KPI, desktop, фильтры, source states и API не менять.

Проверка: actual Next390, проверить scrollWidth/clientWidth именно главного scroll-host и прямоугольники всех3stockcards относительно его viewport. Table overflow допускается только внутри её собственного scrollable element. Нужны desktop regression snapshot и390bottom screenshot после lint/typecheck/build. No global overflow-x:hidden masking, no deleting columns or clipping values.

## Приёмка

15.09.2026: Web typecheck, scoped ESLint и build PASS; Manifest/Spec и Craft review PASS. На реальном Next при viewport390 внутренний host clientWidth/scrollWidth=375/375, все три ассортиментные карточки внутри него. У таблицы собственный wrapper301/680 с работающей горизонтальной прокруткой; desktop wrapper790/790. Глобальное маскирование overflow не добавлялось. Обновлены нижние screenshots390/1440, Q17 addendum сохраняет исходную находку и её исправление. Локальные fixture-процессы остановлены.

Evidence: deploy-evidence/executive-dashboard-20260915/delivery-preview/mobile-scroll-host-result.json; full-acceptance/README.md. Это локальная синтетическая UI-проверка, не production admission.
