window.STATE =
{
  "slug": "executive-dashboard",
  "dir": "2026-09-15-executive-dashboard--wip",
  "title": "Сводный дашборд: реализация варианта1",
  "mode": "semi",
  "depth": "normal",
  "polish": null,
  "tier": "T2",
  "briefFile": "2026-09-15-brief.md",
  "memoryFile": "AGENTS.md",
  "skillDir": "C:\\Users\\ALIENWARE\\.codex\\skills\\autopilot",
  "startedAt": "2026-09-15T10:27:25.425605+05:00",
  "updatedAt": "2026-09-15T12:49:00.6793083+05:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-09-15T10:27:25.425605+05:00",
      "finishedAt": "2026-09-15T10:29:24.943765+05:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-09-15T10:29:24.943765+05:00",
      "finishedAt": "2026-09-15T10:41:30.81457+05:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-09-15T10:41:30.81457+05:00",
      "finishedAt": "2026-09-15T10:41:30.81457+05:00",
      "note": "Определение выручки подтверждено"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-09-15T10:41:30.81457+05:00",
      "finishedAt": "2026-09-15T10:48:23.25919+05:00",
      "note": "Спецификация v2 пересмотрена по четырём навыкам; G2 PASS"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-09-15T10:48:23.25919+05:00",
      "finishedAt": "2026-09-15T10:48:23.25919+05:00",
      "note": "План v2: сквозной пилот → API/UI → приёмка; 4 задачи, 3 волны"
    },
    {
      "id": "build",
      "status": "active",
      "note": "Пилот: API и компоненты собраны; приёмка пограничных данных",
      "startedAt": "2026-09-15T11:28:39.532933+05:00"
    },
    {
      "id": "review",
      "status": "active",
      "startedAt": "2026-09-15T11:54:14.5178883+05:00",
      "note": "Проверка стабильной API части01; Web завершается"
    },
    {
      "id": "final",
      "status": "pending"
    }
  ],
  "requirements": {
    "total": 20,
    "done": 0,
    "inTicket": 20,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Сквозной пилот: товарная выручка, фильтр и объяснение",
      "requirements": [
        "R02",
        "R03",
        "R05",
        "R06",
        "R12",
        "R17",
        "R19",
        "R20"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "shared executive contract/product-revenue service slice",
        "apps/web/src/components/metric-*",
        "apps/web/src/lib/metric-presentation*",
        "apps/web/src/components/dashboard-filters.tsx",
        "apps/api/src/dashboard/dashboard.service.ts (pilot projection only)",
        "apps/api/src/dashboard/dashboard.controller.ts (pilot route only)",
        "apps/web/src/lib/dashboard-summary.ts (pilot transport only)"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 2,
      "handoffs": 1,
      "planRevision": 2,
      "startedAt": "2026-09-15T11:28:39.532933+05:00",
      "executor": "/root/executive_pilot_repair",
      "repairFindings": [
        "Confirmed store-day partial sums and nullable row state; no false0 for unknown clubs",
        "One actual store universe for facts/rows/scope incl. inactive consistency; explicit scope IDs",
        "Actual accepted business timezone/asOf for pilot",
        "Public-boundary cancellation/zero/missing/partial/failed/inactive evidence",
        "Repair2: preserve authorized mixed-timezone selection via per-store business dates, not400",
        "Repair2: assert service outputs, remove privatePrisma queryshape assertions/typecast",
        "Repair2 Web: remove mismatched legacy drill route, isolate product request failure, preserve per-row explanation/date/coverage, stable fiscal-date labels"
      ],
      "handoffFiles": [
        ".autopilot/2026-09-15-executive-dashboard--wip/handoff-01-1.md"
      ],
      "files": [
        "apps/api/src/common/executive-contract.ts",
        "apps/api/src/dashboard/dashboard.controller.ts",
        "apps/api/src/dashboard/dashboard.service.spec.ts",
        "apps/api/src/dashboard/dashboard.service.ts",
        "apps/api/src/tenancy/pilot-http-surface-manifest.spec.ts",
        "apps/api/src/tenancy/pilot-http-surface-manifest.ts",
        "apps/web/src/app/(app)/dashboard/page.tsx",
        "apps/web/src/components/dashboard-filters.tsx",
        "apps/web/src/components/metric-product-revenue-card.tsx",
        "apps/web/src/lib/dashboard-executive.ts",
        "apps/web/src/lib/dashboard-summary.ts",
        "apps/web/src/lib/metric-presentation.ts"
      ],
      "tests": {
        "targetedApi": 27,
        "apiTypecheck": "PASS",
        "webBuild": "PASS",
        "webScopedLint": "PASS",
        "browser": "PASS synthetic actual components; final copy-only update",
        "webTypecheck": "PASS",
        "apiScopedLint": "PASS"
      },
      "review": {
        "apiFull": "PASS:191 suites,3567 tests,2 existing todo",
        "craftBlocking": "none",
        "spec": "PASS",
        "manifest": "PASS"
      },
      "finishedAt": "2026-09-15T12:49:00.6858794+05:00"
    },
    {
      "id": "02",
      "title": "Единые оперативные расчёты и реальные источники",
      "requirements": [
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "R09",
        "R10",
        "R11",
        "R13",
        "R15",
        "R16",
        "R18",
        "R20"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "apps/api/src/dashboard/",
        "apps/api/src/common/executive-* business calculations"
      ],
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "planRevision": 2
    },
    {
      "id": "03",
      "title": "Полный вариант1 и устойчивые пользовательские переходы",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R05",
        "R06",
        "R10",
        "R11",
        "R12",
        "R13",
        "R14",
        "R15",
        "R16",
        "R17",
        "R18",
        "R19",
        "R20"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "apps/web/src/app/(app)/dashboard/",
        "apps/web/src/components/executive-*",
        "apps/web/src/lib/dashboard-executive*",
        "apps/web/src/lib/assortment-report-query*",
        "apps/web/src/app/(app)/assortment/dashboard/page.tsx"
      ],
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "planRevision": 2
    },
    {
      "id": "04",
      "title": "Приёмка по ожидаемым данным и документация",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "R09",
        "R10",
        "R11",
        "R12",
        "R13",
        "R14",
        "R15",
        "R16",
        "R17",
        "R18",
        "R19",
        "R20"
      ],
      "blockedBy": [
        "02",
        "03"
      ],
      "wave": 3,
      "zone": [
        "docs/",
        "apps/api/src/tenancy/gate-1mt.postgres.spec.ts",
        "external evidence browser fixtures"
      ],
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "planRevision": 2
    }
  ],
  "singlePass": null,
  "tests": {
    "todo": 2,
    "gate": "pilot-final-api-full",
    "suitesPassed": 191,
    "passed": 3567,
    "failed": 0,
    "at": "2026-09-15T12:47:36.0666056+05:00"
  },
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "revision": 2,
    "verdict": "PASS",
    "found": 1,
    "fixed": 1,
    "deferred": 0,
    "notes": [
      "Восстановлено явное правило R10: MISSING/FAILED movements не0 и не0% во всех связанных представлениях"
    ],
    "reviewer": "/root/executive_spec_review",
    "reviewedAt": "2026-09-15T11:24:31.954361+05:00"
  },
  "concerns": [
    "03: dashboard-filters.tsx duplicate wrapper/content props -> shared DashboardFiltersProps during mobile-label adaptation",
    "03: 390px preset label truncates; keep meaningful compact labels",
    "04: pilot contrast coverage is title/surface smoke only; full changed palette/focus still required"
  ],
  "reviewers": {
    "manifestSpec": "/root/executive_spec_review",
    "craft": "/root/executive_craft_review"
  },
  "blind": null,
  "planRevision": 2,
  "planningUpdate": {
    "startedAt": "2026-09-15T11:11:23.930037+05:00",
    "status": "complete",
    "reason": "Новые четыре навыка LeetPlus; пересмотр задания по просьбе пользователя",
    "implementationResumed": true,
    "finishedAt": "2026-09-15T11:24:31.954361+05:00",
    "review": "G2 PASS; 20 requirements retained; G3 mapping and disjoint wave2 zones verified"
  },
  "coverageHistory": [
    {
      "found": 2,
      "fixed": 2,
      "deferred": 0,
      "notes": [
        "Привязаны точные visual target пути",
        "Документация/релизныеусловияобозначеныкакобязательное сопровождение R03/R05/R07, неавтодеплой"
      ],
      "verdict": "PASS"
    }
  ],
  "appliedSkills": [
    "leetplus-dashboard-ux",
    "leetplus-ux-writing",
    "leetplus-ui-quality",
    "leetplus-design-system"
  ],
  "pauseHistory": [
    {
      "at": "2026-09-15T10:49:55.805274+05:00",
      "reason": "user_requested",
      "message": "поставь выполнение на паузу, сейчас  интегрируем новые скиллы и обновим текущую задачу после этого",
      "resumeOnlyOnUserInstruction": true,
      "planningRevision": 2,
      "resumedAt": "2026-09-15T11:28:39.532933+05:00",
      "resumeMessage": "ок, реализуй"
    }
  ],
  "resumedAt": "2026-09-15T11:28:39.532933+05:00",
  "contractReview": {
    "reviewedAt": "2026-09-15T11:50:06.1916123+05:00",
    "reviewer": "/root/executive_spec_review",
    "findingsFixed": 4,
    "status": "PASS"
  },
  "uiQa": {
    "agent": "/root/executive_browser_fixture",
    "scope": "01 actual component fixture",
    "status": "PASS pilot; limited palette smoke",
    "evidence": "deploy-evidence/executive-dashboard-20260915/pilot-ui-qa",
    "limits": [
      "Title/background contrast only; full palette acceptance remains04",
      "Legacy drill link is removed during repair2; inline details stay",
      "Timezone America/Los_Angeles recheck after fiscal label fix"
    ]
  }
}