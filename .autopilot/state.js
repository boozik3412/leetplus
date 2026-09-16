window.STATE =
{
  "slug": "executive-priorities",
  "dir": "2026-09-15-executive-priorities--wip",
  "title": "Приоритеты сводки: реализованы, локальная приёмка пройдена",
  "mode": "semi",
  "depth": "normal",
  "polish": null,
  "tier": "T2",
  "briefFile": "2026-09-15-brief.md",
  "memoryFile": "AGENTS.md",
  "skillDir": "C:/Users/ALIENWARE/.codex/skills/autopilot",
  "startedAt": "2026-09-15T19:25:29.759577+05:00",
  "updatedAt": "2026-09-15T22:21:43.948877+05:00",
  "finishedAt": "2026-09-15T22:21:43.948877+05:00",
  "stages": [
    {
      "finishedAt": "2026-09-15T19:25:29.759577+05:00",
      "startedAt": "2026-09-15T19:25:29.759577+05:00",
      "id": "preflight",
      "status": "done"
    },
    {
      "finishedAt": "2026-09-15T19:25:29.759577+05:00",
      "startedAt": "2026-09-15T19:25:29.759577+05:00",
      "id": "manifest",
      "status": "done"
    },
    {
      "startedAt": "2026-09-15T19:25:29.759577+05:00",
      "id": "briefing",
      "status": "done",
      "finishedAt": "2026-09-15T20:01:18.7430179+05:00"
    },
    {
      "status": "done",
      "id": "spec",
      "startedAt": "2026-09-15T20:01:18.7430179+05:00",
      "finishedAt": "2026-09-15T20:25:02.5085669+05:00"
    },
    {
      "status": "done",
      "id": "plan",
      "startedAt": "2026-09-15T20:25:02.5085669+05:00",
      "finishedAt": "2026-09-15T20:43:03.556088+05:00"
    },
    {
      "status": "done",
      "id": "build",
      "startedAt": "2026-09-15T20:43:03.556088+05:00",
      "finishedAt": "2026-09-15T22:21:43.948877+05:00"
    },
    {
      "status": "done",
      "id": "review",
      "finishedAt": "2026-09-15T22:21:43.948877+05:00"
    },
    {
      "status": "done",
      "id": "final",
      "startedAt": "2026-09-15T22:19:45.847918+05:00",
      "finishedAt": "2026-09-15T22:21:43.948877+05:00"
    }
  ],
  "requirements": {
    "placeholder": 0,
    "inSpec": 0,
    "total": 8,
    "deferred": 0,
    "dropped": 0,
    "inTicket": 0,
    "done": 8
  },
  "tickets": [
    {
      "title": "Финансовые сигналы и средний товарный чек",
      "requirements": [
        "R01",
        "R02",
        "R06"
      ],
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "wave": 1,
      "blockedBy": [],
      "zone": [
        "API executive/receipt",
        "Web executive metric/details/financial priorities"
      ],
      "status": "done",
      "id": "01",
      "startedAt": "2026-09-15T20:43:03.556088+05:00",
      "executor": "/root",
      "blockedAttempt": "Delegated executor lacked filesystem; no edits or tests from that attempt",
      "finishedAt": "2026-09-15T22:21:43.948877+05:00"
    },
    {
      "title": "Обязательства персонала и рабочая детализация",
      "requirements": [
        "R03",
        "R04",
        "R05",
        "R06",
        "A01",
        "A02"
      ],
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "wave": 1,
      "blockedBy": [],
      "zone": [
        "API staff priority",
        "Web staff-priorities and dashboard/priorities"
      ],
      "status": "done",
      "id": "02",
      "startedAt": "2026-09-15T20:43:03.556088+05:00",
      "executor": "/root",
      "blockedAttempt": "Delegated executor lacked filesystem; no edits or tests from that attempt",
      "finishedAt": "2026-09-15T22:21:43.948877+05:00"
    },
    {
      "title": "Общий список приоритетов и дополнительные риски",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R08",
        "A01",
        "A02",
        "A03",
        "A04"
      ],
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "wave": 2,
      "blockedBy": [
        "01",
        "02"
      ],
      "zone": [
        "Web executive priority main composition"
      ],
      "status": "done",
      "id": "03",
      "finishedAt": "2026-09-15T22:21:43.948877+05:00",
      "executor": "/root"
    },
    {
      "title": "Приёмка, аудит и документация",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "A01",
        "A02",
        "A03",
        "A04"
      ],
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "wave": 2,
      "blockedBy": [
        "01",
        "02"
      ],
      "note": "API/doc prep parallel03; browser waits03 freeze",
      "zone": [
        "API PG tests",
        "external UI evidence",
        "docs"
      ],
      "status": "done",
      "id": "04",
      "finishedAt": "2026-09-15T22:21:43.948877+05:00",
      "executor": "/root"
    }
  ],
  "singlePass": null,
  "tests": {
    "api": "194 suites / 3588 PASS + 2 previous TODO",
    "apiFinalFocused": "46 PASS",
    "postgres": "17 PASS, loopback55495",
    "web": "typecheck/build/scoped lint PASS",
    "webRules": "3 PASS",
    "browser": "14 checks PASS; 1440/390; light/dark; no page errors",
    "remoteCI": "Tracked separately against the exact PR207 head; not asserted by this source-tree record"
  },
  "debt": {
    "placeholders": [],
    "emptyEnv": [],
    "assumptions": []
  },
  "additions": [
    {
      "parent": "R04",
      "id": "A01",
      "title": "Очередь проверки чек-листов"
    },
    {
      "parent": "R05",
      "id": "A02",
      "title": "Обязательные регламенты текущей версии"
    },
    {
      "parent": "R08",
      "id": "A03",
      "title": "Риск дефицита за3дня"
    },
    {
      "parent": "R08",
      "id": "A04",
      "title": "Без продаж21день"
    }
  ],
  "coverage": {
    "reviewer": "/root/priority_spec_review",
    "notes": [
      "Явно добавлена координация с задачей Спланировать открытый тест",
      "Четыре дополнительные возможности размечены A01–A04 с родителями и правилом precedence"
    ],
    "status": "PASS",
    "fixed": 5,
    "delivery": "G2 text-only harness: delivered exact complete brief/spec text, no other files",
    "found": 5,
    "reviewedAt": "2026-09-15T20:25:02.5085669+05:00"
  },
  "concerns": [],
  "reviewers": {
    "manifestSpec": null,
    "craft": {
      "status": "PASS",
      "mode": "Independent text review; root filesystem and rendered validation",
      "reviewer": "/root/priority_spec_review",
      "remainingP0P1P2": 0
    }
  },
  "blind": null,
  "sourceBase": "f526aa10f60c5f7c0f68eb5520e86b23f65f4351",
  "pr": 207,
  "productionEffects": false,
  "clarification": {
    "answer": "Оба отдельно",
    "question": "Средний чек товарных покупок или доход на один визит?",
    "status": "answered"
  },
  "scouts": {
    "status": "completed",
    "receipts": "/root/priority_receipts_audit",
    "modules": "/root/priority_modules_audit",
    "staff": "/root/priority_staff_audit"
  },
  "plan": {
    "note": "01/02 independent existing-subsystem vertical slices, not a new shared shell; wire fixed before either starts",
    "waves": 2,
    "mergePass": "4 dense slices; no tiny checklist tickets",
    "G3": "PASS8requirements mapped, disjoint same-wave zones",
    "calibratedRules": [
      "01 is an independent financial vertical slice on the existing shell;02 has disjoint staff zones and no dependency on01, so both fly together",
      "Independent local/CI gates are batched with separate receipts; no repeated unchanged full suite solely because two commits record the same tested tree"
    ]
  },
  "executionStrategy": "Root implementation: delegated executor harness exposes only CUA, no filesystem/terminal; user-authorized work continues under higher-priority autonomy instructions. Text-only independent review remains available.",
  "delivery": {
    "pr": 207,
    "state": "SOURCE_IMPLEMENTED_LOCAL_ACCEPTANCE_PASSED",
    "notes": "Remote checks attach to the exact published head. No merge or deploy. Serving app and staged controller authority remain with the production owner."
  }
}
