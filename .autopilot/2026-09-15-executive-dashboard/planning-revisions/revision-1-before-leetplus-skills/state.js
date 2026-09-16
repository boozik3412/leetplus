window.STATE =
{
  "slug": "executive-dashboard",
  "dir": "2026-09-15-executive-dashboard--wip",
  "title": "Сводный дашборд — пауза по запросу пользователя",
  "mode": "semi",
  "depth": "normal",
  "polish": null,
  "tier": "T2",
  "briefFile": "2026-09-15-brief.md",
  "memoryFile": "AGENTS.md",
  "skillDir": "C:\\Users\\ALIENWARE\\.codex\\skills\\autopilot",
  "startedAt": "2026-09-15T10:27:25.425605+05:00",
  "updatedAt": "2026-09-15T10:49:55.805274+05:00",
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
      "finishedAt": "2026-09-15T10:41:30.814570+05:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-09-15T10:41:30.814570+05:00",
      "finishedAt": "2026-09-15T10:41:30.814570+05:00",
      "note": "Определение выручки подтверждено"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-09-15T10:41:30.814570+05:00",
      "finishedAt": "2026-09-15T10:48:23.259190+05:00"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-09-15T10:48:23.259190+05:00",
      "finishedAt": "2026-09-15T10:48:23.259190+05:00",
      "note": "T2 · 4 задачи · 3 волны"
    },
    {
      "id": "build",
      "status": "pending",
      "note": "Пауза до обновления навыков и задачи; реализация ещё не начата"
    },
    {
      "id": "review",
      "status": "pending"
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
      "title": "Общий контракт и чистые расчёты сводки",
      "requirements": [
        "R02",
        "R03",
        "R04",
        "R05",
        "R07",
        "R08",
        "R09",
        "R11",
        "R13",
        "R20"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "apps/api/src/common/executive-*"
      ],
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "note": "Исполнитель не запускался до паузы"
    },
    {
      "id": "02",
      "title": "Рабочая оперативная API сводка из сохранённых данных",
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
        "apps/api/src/dashboard/"
      ],
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
    },
    {
      "id": "03",
      "title": "Первый визуальный вариант и согласованные переходы",
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
        "apps/web/src/app/(app)/assortment/dashboard/page.tsx",
        "apps/web/src/components/dashboard-filters.tsx"
      ],
      "status": "pending",
      "retries": 0,
      "repairs": 0,
      "handoffs": 0
    },
    {
      "id": "04",
      "title": "Сквозная приёмка и документация реализации",
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
      "handoffs": 0
    }
  ],
  "singlePass": null,
  "tests": null,
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "found": 2,
    "fixed": 2,
    "deferred": 0,
    "notes": [
      "Привязаны точные visual target пути",
      "Документация/релизныеусловияобозначеныкакобязательное сопровождение R03/R05/R07, неавтодеплой"
    ],
    "verdict": "PASS"
  },
  "concerns": [],
  "reviewers": {
    "manifestSpec": "/root/executive_spec_review",
    "craft": null
  },
  "blind": null,
  "pause": {
    "at": "2026-09-15T10:49:55.805274+05:00",
    "reason": "user_requested",
    "message": "поставь выполнение на паузу, сейчас  интегрируем новые скиллы и обновим текущую задачу после этого",
    "resumeOnlyOnUserInstruction": true
  }
}
