# listO Best Practices

## Product standards we now follow
- API-first: all task/project actions go through REST endpoints, frontend is thin SPA client.
- Explicit workflow: `todo -> in_progress -> done -> review(approve/reject) -> archive`.
- Auditability: each lifecycle action writes an activity log record.
- Role safety: employees can move their own tasks; managers/admins can review/archive.
- Predictable scheduling: due date + recurrence presets + custom recurrence.
- Calendar interoperability: ICS export for external calendars.

## UX patterns inspired by modern tools
- Linear-style speed: keyboard shortcuts (`N`, `/`, `B`, `C`).
- Jira-style governance: review gate before archive.
- Asana-style visibility: filters, assignee scope, timeline activity, notification center.
- ClickUp-style planning: recurrence presets (daily/weekly/workday/monthly/custom).

## Data and API structure
- Keep task fields normalized: status, review status, archive state, recurrence state.
- Never infer permissions on client side only; backend must enforce RBAC.
- Keep API payloads stable and additive; avoid breaking field renames.
- Use UUID for all entities and soft archive instead of delete.

## Notification strategy
- Event notifications on transitions (done, rejected, reviewed).
- SLA reminders for done-not-reviewed tasks after 24h.
- Reminder throttling: max 1 reminder per user/task in a 24h window.

## Recommended next increments
1. Add holiday-aware business calendar (country profile per project).
2. Add saved views (personal filter presets).
3. Add project-level WIP limits for each kanban column.
4. Add task attachments (S3/local storage adapter).
5. Add calendar month-grid view in addition to agenda.
6. Add optimistic updates with retry queue for offline/network drops.

## Definition of done for new features
- API endpoint + validation + RBAC enforcement.
- Activity log emission.
- Realtime event emission if it changes board state.
- UI control + loading/error handling.
- Smoke scenario covering the happy flow.
