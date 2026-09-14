window.STATE =
{
  "slug": "assortment-operational-dashboard",
  "dir": "2026-09-14-assortment-operational-dashboard--wip",
  "title": "Надёжный дашборд ассортимента",
  "mode": "semi",
  "depth": "normal",
  "polish": null,
  "tier": "T2",
  "briefFile": "2026-09-14-brief.md",
  "memoryFile": "AGENTS.md",
  "skillDir": "C:\\Users\\ALIENWARE\\.codex\\skills\\autopilot",
  "startedAt": "2026-09-14T15:05:31+05:00",
  "updatedAt": "2026-09-14T16:18:45+05:00",
  "finishedAt": null,
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
      "status": "active",
      "startedAt": "2026-09-14T15:15:18+05:00"
    },
    {
      "id": "review",
      "status": "active",
      "startedAt": "2026-09-14T15:38:08+05:00"
    },
    {
      "id": "final",
      "status": "pending"
    }
  ],
  "requirements": {
    "total": 17,
    "done": 0,
    "inTicket": 17,
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
      "status": "review",
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
      }
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
    }
  ],
  "singlePass": null,
  "tests": {
    "passed": 3518,
    "failed": 0,
    "todo": 2,
    "suites": 190
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
  "concerns": [],
  "reviewers": {
    "manifestSpec": "/root/spec_coverage",
    "craft": "/root/craft_review"
  },
  "blind": null
}
