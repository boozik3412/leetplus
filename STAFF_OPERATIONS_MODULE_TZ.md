# TZ: Staff Operations Module

Date: 2026-05-29
Status: approved for staged implementation, MVP 1 started
Product: LeetPlus

## 1. Product Goal

The staff operations module turns LeetPlus from a reporting layer into an operating system for daily club execution. It should connect standards, shift work, tasks, evidence, review, and analytics.

The module must not become a generic task manager. Every screen should answer a club-network question:

- what must be done on this shift;
- who is responsible;
- what is late or risky;
- what proof exists;
- which club, shift, or employee needs manager attention;
- how execution affects service quality, money control, bar revenue, guest experience, and operational discipline.

## 2. Product Scope

### In Scope

- Staff directory and role model for operational work.
- Staff identity links to existing Langame `working_shifts.user_id` mapping where available.
- Tasks for a club, shift, role, employee, period, or the whole network.
- Task statuses, priorities, deadlines, comments, evidence links, future attachments, and audit history.
- Checklist templates and concrete checklist runs.
- Versioned regulations and required acknowledgements.
- Training materials, courses, tests, attestations, and employee progress.
- Operational analytics by club, shift, employee, checklist, and task.
- Links to existing `/guests/staff-control` signals: shifts, refunds, cash, incassation, administrator rankings, and operation categories.

### Out Of Scope For First Release

- Payroll, fines, automatic sanctions, or automatic bonus changes.
- Automatic write-back into Langame.
- Public mobile app.
- Universal project-management boards unrelated to club operations.
- Telegram/MAX mass workflows without separate legal and channel setup.

## 3. Users And Permissions

### Owner

- Sees network-level operational discipline.
- Creates and edits tasks, templates, regulations, courses, and checklists.
- Reviews execution and exports reports.

### Manager

- Creates and controls tasks for clubs, shifts, and employees.
- Reviews checklist runs and evidence.
- Assigns training and sees completion.

### Senior Administrator

- Sees current shift tasks and checklists.
- Completes tasks, uploads evidence, leaves comments.
- Can create incident or follow-up tasks if allowed.

### Administrator

- Sees personal and shift tasks.
- Completes assigned work and reads regulations/knowledge base.
- Does not edit published standards or other employees' tasks.

### Viewer/Auditor

- Reads reports and evidence where allowed.
- Does not change task or checklist state.

## 4. Core Entities

### Staff Member

LeetPlus-owned employee identity. It can be linked to:

- `User` for LeetPlus login;
- `GuestStaffIdentityMapping` for Langame operator/admin identity;
- `GuestWorkingShift` facts for historical shift analytics.

Historical facts must keep snapshots and must not break after rename, role change, unlinking, or Langame data changes.

### Staff Task

Operational task assigned to a person, club, role, shift, period, or network.

Required fields:

- tenant;
- title;
- type;
- status;
- priority;
- author;
- created time.

Optional fields:

- description;
- club;
- shift;
- responsible employee/user;
- deadline;
- labels;
- checklist JSON for the first MVP;
- comments;
- evidence links;
- audit events.

Statuses:

- `OPEN`;
- `IN_PROGRESS`;
- `ON_REVIEW`;
- `DONE`;
- `CANCELED`.

`OVERDUE` is a derived operational state: active task with `dueAt` in the past.

Types:

- `ONE_TIME`;
- `SHIFT`;
- `RECURRING`;
- `LONG_TERM`;
- `PERSONAL`;
- `CLUB`;
- `ROLE`.

Priorities:

- `LOW`;
- `NORMAL`;
- `HIGH`;
- `URGENT`.

### Checklist Template

Reusable standard for opening shift, closing shift, cash desk, bar, PC zone, cleanliness, incidents, and inventory handover.

### Checklist Run

Concrete completion instance tied to club, shift, employee, scheduled time, answers, evidence, score, and review result.

### Regulation

Versioned operational document with owner, status, effective date, required acknowledgement, and attachments.

### Training And Attestation

Role-based onboarding and recurring knowledge validation. Training results are historical facts.

## 5. MVP 1: Staff Foundation And Tasks

Goal: let managers create short-term and long-term operational tasks for shifts, clubs, roles, and responsible employees.

Implementation sequence:

1. Create the Staff Operations TZ and align backlog.
2. Add first `StaffTask` model with tenant/store/shift/user links.
3. Add API for task list, create, and status update.
4. Add `/staff/tasks` manager workspace.
5. Add sidebar entry under `Персонал`.
6. Add comments, evidence links, and audit events.
7. Keep task data LeetPlus-owned and independent from Langame sync.

Acceptance criteria:

- A manager can create a task for a club or the whole network.
- A task can have type, priority, deadline, responsible user, and description.
- The task list shows total, overdue, in progress, on review, and done counts.
- A task can move through `OPEN -> IN_PROGRESS -> ON_REVIEW -> DONE`.
- A task can be completed with a comment or evidence link.
- Managers can see a compact task audit journal.
- Active tasks past deadline are visibly overdue.
- Langame sync does not overwrite staff tasks.

## 6. MVP 2: Shift Checklists And Regulations

Goal: turn daily standards into controlled execution.

Acceptance criteria:

- An administrator can complete an opening or closing checklist.
- Required evidence blocks closure when missing.
- Failed checklist item can create a follow-up task.
- Manager sees missed, late, failed, returned, and accepted checklist runs.

## 7. MVP 3: Training, Knowledge Base, And Attestations

Goal: make onboarding and operational knowledge measurable.

Acceptance criteria:

- New administrator receives onboarding.
- Manager sees course and test progress.
- Published regulation update can require acknowledgement or retest.
- Historical training results remain stable after role or club change.

## 8. MVP 4: Control And Analytics

Goal: show operational discipline, not only task completion.

Acceptance criteria:

- Owner sees clubs with the highest operational risk.
- Manager drills down from club to shift, employee, checklist, evidence, and task history.
- Staff-control anomalies can reference operational tasks/checklists when available.

## 9. Data Rules

- All staff operations data is tenant-scoped.
- Historical task/checklist facts must survive employee, club, role, and mapping changes.
- Langame sync must not overwrite LeetPlus-owned staff tasks, notes, statuses, training, acknowledgements, or role assignments.
- Personal staff data must be role-protected.
- Attachments may contain sensitive workplace information and need tenant scoping and retention rules.
- Dates in UI use `dd.mm.yyyy`; money uses `руб`; counts and hours must be labeled.

## 10. First Implementation Notes

The first implementation deliberately starts with tasks, not checklist templates. This creates the operational queue that later receives:

- failed checklist follow-ups;
- regulation acknowledgement tasks;
- training overdue tasks;
- staff-control anomaly review tasks;
- manager weekly action lists.
