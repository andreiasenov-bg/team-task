# Final UAT Pack

## Scope

Roles covered:
1. Admin
2. Manager
3. Employee

Main flows covered:
1. Auth + RBAC
2. Task lifecycle (create -> in progress -> done -> review -> archive)
3. Comments and notifications
4. SLA overdue/escalation
5. Filters/search/saved views
6. WhatsApp command path (optional if enabled)

## Test data baseline

1. Run staging setup:
   - `bash scripts/staging-up.sh`
2. Use demo credentials:
   - `admin@nexus-flow.local / admin123`
   - `manager@nexus-flow.local / manager123`
   - `ivan@nexus-flow.local / 123456`

## Manual scenarios

### A) Employee scenarios

1. Employee login succeeds.
2. Employee sees only own tasks.
3. Employee moves task `todo -> in_progress -> done`.
4. Employee adds comment on a task.
5. Employee cannot assign task to another employee directly.

### B) Manager scenarios

1. Manager login succeeds.
2. Manager creates task and assigns to employee.
3. Manager can reject done task with and without comment.
4. Manager can approve done task.
5. Manager archives approved task.

### C) Admin scenarios

1. Admin sees all projects/tasks.
2. Admin receives escalation notification for overdue task.
3. Admin can filter by SLA state (`overdue`, `escalated`).
4. Admin can use saved views and search.

### D) Integration scenarios (optional)

1. WhatsApp verify webhook returns challenge.
2. `task @ivan ...` creates task in board.
3. Overdue task triggers reminder notification.

## Acceptance report template

Date:
Environment:
Build/Commit:
Tester:

| Scenario ID | Result (PASS/FAIL) | Notes | Bug Ref |
|---|---|---|---|
| A1 |  |  |  |
| A2 |  |  |  |
| A3 |  |  |  |
| A4 |  |  |  |
| A5 |  |  |  |
| B1 |  |  |  |
| B2 |  |  |  |
| B3 |  |  |  |
| B4 |  |  |  |
| B5 |  |  |  |
| C1 |  |  |  |
| C2 |  |  |  |
| C3 |  |  |  |
| C4 |  |  |  |
| D1 |  |  |  |
| D2 |  |  |  |
| D3 |  |  |  |

Final decision:
1. GO
2. NO-GO

Blocking issues:
1. ...
2. ...
