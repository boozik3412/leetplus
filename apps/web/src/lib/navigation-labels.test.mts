import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NAVIGATION_LABEL,
  navigationLabel,
} from "./navigation-labels.ts";

test("the pill names what is opening", () => {
  assert.equal(navigationLabel("/dashboard"), "Открываем сводку сети…");
  assert.equal(navigationLabel("/dashboard/"), "Открываем сводку сети…");
  assert.equal(
    navigationLabel("/dashboard/executive-details", "?metric=drivers&focus=check"),
    "Открываем дерево выручки…",
  );
  assert.equal(
    navigationLabel("/dashboard/executive-details", "?metric=productRevenue"),
    "Открываем детализацию…",
  );
  assert.equal(navigationLabel("/staff/tasks"), "Открываем задачи персонала…");
  assert.equal(navigationLabel("/assortment/dashboard"), "Открываем ассортимент…");
  assert.equal(navigationLabel("/reports/oos/table"), "Готовим отчёт…");
  assert.equal(navigationLabel("/guests/crm/tasks"), "Открываем CRM гостей…");
});

test("the longest matching route wins and prefixes match whole segments", () => {
  assert.equal(
    navigationLabel("/dashboard/priorities"),
    "Открываем приоритеты…",
  );
  assert.equal(navigationLabel("/staff/checklists/report"), "Открываем чек-листы…");
  assert.equal(navigationLabel("/staffing"), DEFAULT_NAVIGATION_LABEL);
  assert.equal(navigationLabel("/"), DEFAULT_NAVIGATION_LABEL);
  assert.equal(navigationLabel("/unknown/place"), DEFAULT_NAVIGATION_LABEL);
});
