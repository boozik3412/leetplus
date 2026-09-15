# 06 — Пояснение нулевой базы сравнения

**Требования:** R05, R13, R19
**Blocked by:** 03
**Зона:** apps/web/src/components/executive-dashboard.tsx и только необходимая существующая metric presentation
**Статус:** done — Q08 actual Next and bounded Q16 repaired pair passed

## Основание и результат

В actual-Next case zero-base нет Infinity/NaN, но Q08 не видит объяснения, почему процент отсутствует. При comparison.previousValue=0 показать рядом с абсолютным изменением понятное «Было0» с правильной единицей и/или «Процент не рассчитывается». Не превращать отсутствующий previousValue в0 и не добавлять фиктивный0%/100%.

Использовать существующий сравниваемый metric contract, правильные единицы/п.п. Сохранить обычное сравнение, missing и partial states. API/wire/источники не менять. Проверка после scoped lint/typecheck/build — один повтор actual zero-base владельцем04; весь набор заново не повторяется.

Если отдельный контрастный probe найдёт необходимые локальные цветовые исправления, root явно добавит их сюда до build; не менять палитру наугад.

ПодтверждённыйQ16scope: previousSVGline наlight#fff имела#A1A1AA и2.56:1<3. Разрешена только локальная смена previous-series насуществующийzinc-500/#71717A вexecutive-trend-chart.tsx; остальныецвета только по измерению. No globalthemechange.
