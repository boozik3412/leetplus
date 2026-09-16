window.STATE =
{
  "slug": "assortment-operational-dashboard",
  "dir": "2026-09-14-assortment-operational-dashboard",
  "title": "Дашборд ассортимента: опубликован на production",
  "mode": "semi",
  "depth": "normal",
  "polish": null,
  "tier": "T2",
  "briefFile": "2026-09-14-brief.md",
  "memoryFile": "AGENTS.md",
  "skillDir": "C:\\Users\\ALIENWARE\\.codex\\skills\\autopilot",
  "startedAt": "2026-09-14T15:05:31+05:00",
  "updatedAt": "2026-09-15T02:03:49.529501+05:00",
  "finishedAt": "2026-09-14T21:21:56+05:00",
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-09-14T15:05:31+05:00",
      "finishedAt": "2026-09-14T15:06:42+05:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-09-14T15:06:42+05:00",
      "finishedAt": "2026-09-14T15:09:56+05:00"
    },
    {
      "id": "briefing",
      "status": "skipped",
      "note": "План согласован, вопросов не потребовалось"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-09-14T15:09:56+05:00",
      "finishedAt": "2026-09-14T15:15:18+05:00"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-09-14T15:15:18+05:00",
      "finishedAt": "2026-09-14T15:15:18+05:00",
      "note": "4таска,3волны,T2"
    },
    {
      "id": "build",
      "status": "done",
      "startedAt": "2026-09-14T15:15:18+05:00",
      "finishedAt": "2026-09-14T21:21:56+05:00"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-09-14T15:38:08+05:00",
      "finishedAt": "2026-09-14T21:21:56+05:00"
    },
    {
      "id": "final",
      "status": "done",
      "finishedAt": "2026-09-14T21:21:56+05:00",
      "note": "G4 PASS, API 191/3564, Web build and 47 synthetic UI checks PASS. Production state remains in canonical deployment documentation."
    }
  ],
  "requirements": {
    "total": 17,
    "done": 17,
    "inTicket": 0,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Общие правила состояния запасов и привязки визитов",
      "requirements": [
        "R03",
        "R04",
        "R05",
        "R08",
        "R09",
        "R10",
        "R11",
        "R12",
        "R14",
        "R15",
        "R16"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "apps/api/src/common/assortment-health*",
        "apps/api/src/common/guest-session-store*"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "handoffs": 0,
      "startedAt": "2026-09-14T15:15:18+05:00",
      "repairFindings": [
        "transaction price requires confirmed coverage",
        "stale inventory cannot aggregate AVAILABLE",
        "unknown no-sales retained in valuation coverage",
        "explicit excess threshold",
        "all historical facts bounded by asOf",
        "latest valid configuration selection",
        "targeted lint"
      ],
      "tests": {
        "passed": 10,
        "failed": 0
      },
      "finishedAt": "2026-09-14T16:20:00+05:00",
      "commit": "fe061c62390bedcc490cd8adaa7bd492d293dd87",
      "agent": "/root/health_foundation"
    },
    {
      "id": "02",
      "title": "Подключить единые метрики к API дашборда и отчётам",
      "requirements": [
        "R02",
        "R03",
        "R04",
        "R05",
        "R08",
        "R09",
        "R10",
        "R11",
        "R12",
        "R13",
        "R14",
        "R15",
        "R16",
        "R17"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "apps/api/src/dashboard/",
        "apps/api/src/reports/",
        "apps/api/src/common/assortment-health-loader*"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "handoffs": 2,
      "startedAt": "2026-09-14T16:20:00+05:00",
      "agent": "/root/api_parity",
      "tests": {
        "passed": 37,
        "failed": 0
      },
      "repairFindings": [
        "Replace remaining global source freshness",
        "Long period loader coverage",
        "Cost-only configuration valuation",
        "Known write-offs partial vs false zero",
        "Legacy report row/filter parity and no duplicate history",
        "Covered margin instead of missing cost zero",
        "Confirmed zero-day forecast",
        "Restricted shared-domain visit counts must not leak"
      ],
      "finishedAt": "2026-09-14T18:29:22+05:00",
      "commit": "c7aa73695138e77e10fafc15bfeafa17e11e23b5"
    },
    {
      "id": "03",
      "title": "Обновлять остатки и сохранять доказуемую привязку сессий",
      "requirements": [
        "R01",
        "R03"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "apps/api/src/integrations/guest-data-foundation.service*",
        "apps/api/src/integrations/langame-daily-sync.service*",
        "apps/api/src/integrations/langame-sync.service*"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-14T16:20:00+05:00",
      "tests": {
        "passed": 56,
        "failed": 0
      },
      "agent": "/root/source_cursor",
      "finishedAt": "2026-09-14T17:35:13+05:00",
      "commit": "0697a67c779af6388c310e6828f100c77e3ced93",
      "note": "D06: inventory-only не продвигает sales cursor"
    },
    {
      "id": "04",
      "title": "Показать оперативные показатели и проверить полный сценарий",
      "requirements": [
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
        "R17"
      ],
      "blockedBy": [
        "02",
        "03"
      ],
      "wave": 3,
      "zone": [
        "apps/web/",
        "docs/assortment-dashboard-metric-contract.md"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "handoffs": 2,
      "startedAt": "2026-09-14T18:29:22+05:00",
      "agent": "/root/browser_qa",
      "note": "Web build PASS exit0; real Next4312 + syntheticAPI4311 QA running. Final decimal movement precision and partial-source labels repair in progress.",
      "finishedAt": "2026-09-14T21:21:56+05:00"
    },
    {
      "id": "05",
      "title": "Сохранить область ассортимента на главном дашборде",
      "requirements": [
        "R13"
      ],
      "blockedBy": [],
      "wave": 4,
      "zone": [
        "apps/web/src/app/(app)/dashboard/page.tsx",
        "apps/web/src/app/reports/assortment-risk/table/page.tsx",
        "apps/web/src/lib/assortment-report-query*"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "startedAt": "2026-09-14T19:47:56+05:00",
      "agent": "/root/web_scope_finish",
      "finishedAt": "2026-09-14T21:21:56+05:00"
    },
    {
      "id": "06",
      "title": "Отделить повтор загрузки от свежести остатков",
      "requirements": [
        "R01",
        "R02"
      ],
      "blockedBy": [],
      "wave": 5,
      "zone": [
        "apps/api/src/integrations/langame-daily-sync.service*"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "finishedAt": "2026-09-14T21:21:56+05:00",
      "agent": "/root/inventory_cadence",
      "tests": {
        "passed": 11,
        "failed": 0
      }
    },
    {
      "id": "07",
      "title": "Сохранить вычислимую прибыль OOS",
      "requirements": [
        "R04",
        "R05",
        "R14",
        "R15"
      ],
      "blockedBy": [],
      "wave": 5,
      "zone": [
        "apps/api/src/common/assortment-health*",
        "apps/api/src/reports/reports.service*",
        "apps/web/src/app/reports/oos/table/page.tsx"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "finishedAt": "2026-09-14T21:21:56+05:00",
      "agent": "/root/profit_risk_restore",
      "tests": {
        "passed": 40,
        "failed": 0
      }
    }
  ],
  "singlePass": null,
  "tests": {
    "passed": 3564,
    "failed": 0,
    "todo": 2,
    "suites": 191
  },
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "found": 3,
    "fixed": 3,
    "deferred": 0,
    "result": "PASS"
  },
  "concerns": [
    {
      "source": "final source review",
      "finding": "Legacy homepage assortment widget widens multi-club selection and drops report filters",
      "decision": "fix now",
      "ticket": "05",
      "resolution": "fixed and independently accepted"
    }
  ],
  "reviewers": {
    "manifestSpec": "/root/spec_coverage",
    "craft": "/root/craft_review"
  },
  "blind": {
    "result": "PASS_LOCAL",
    "drift": [],
    "apiFocusedTests": 51,
    "uiChecks": 47,
    "productionVerified": false
  },
  "scope": "source implementation and local acceptance; production uses separate release controls",
  "production": {
    "status": "deployed",
    "releaseSha": "b5c03360941e1e5d59fe83f334b8dc29c2eced3b",
    "activeSlot": "blue",
    "generation": 5,
    "operationId": "9f793938-e989-40a6-abec-b7f2e890192e",
    "browserChecks": "16/16 PASS",
    "inventoryObservations": 2117,
    "stores": 4,
    "finalOffhostBackup": "PASS",
    "acceptedAt": "2026-09-15T02:02:00+05:00"
  }
};
