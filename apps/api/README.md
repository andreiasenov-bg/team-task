# Nexus Flow API (migration baseline)

This folder contains the new backend baseline for the API + SPA migration.

## What is implemented

- Express API with PostgreSQL.
- JWT authentication (`/api/auth/login`, `/api/auth/me`).
- RBAC model (`admin`, `manager`, `employee`).
- Project APIs (`GET /api/projects`, `POST /api/projects`).
- Task APIs (`GET /api/tasks?projectId=...`, `POST /api/tasks`, `PATCH /api/tasks/:taskId/status`).
- Activity log writes on project/task changes.

## Run locally

1. Start PostgreSQL (you can reuse repository `docker-compose.yml`).
2. Install dependencies:
   - `cd apps/api`
   - `npm install`
3. Create `.env` from `.env.example`.
4. Seed sample data:
   - `npm run seed`
5. Start API:
   - `npm run dev`

API base URL: `http://127.0.0.1:3320/api`
Swagger docs: `http://127.0.0.1:3320/docs`
WhatsApp webhook verify: `GET /api/integrations/whatsapp/webhook`
WhatsApp webhook inbound: `POST /api/integrations/whatsapp/webhook`
WhatsApp link phone: `PATCH /api/integrations/whatsapp/link` (Bearer token)

## Staging profile (compose + QA seed)

From repository root:

1. Optional: create `.env.staging` from `.env.staging.example`.
2. Start staging stack + seed + smoke:
   - `bash scripts/staging-up.sh`

Default staging ports:
- web: `http://127.0.0.1:5174`
- api: `http://127.0.0.1:4320/api`
- legacy app: `http://127.0.0.1:4310`

## Demo credentials after seed

- `admin@nexus-flow.local` / `admin123`
- `manager@nexus-flow.local` / `manager123`
- `ivan@nexus-flow.local` / `123456`

## WhatsApp bot (MVP)

1. Set env values in `.env` (or `.env.docker` for compose):
   - `WHATSAPP_ENABLED=1`
   - `WHATSAPP_DRY_RUN=0` (or `1` for local dry-run)
   - `WHATSAPP_VERIFY_TOKEN=...`
   - `WHATSAPP_ACCESS_TOKEN=...`
   - `WHATSAPP_PHONE_NUMBER_ID=...`
   - `WHATSAPP_TEMPLATE_LANG=bg`
   - optional templates:
     - `WHATSAPP_TEMPLATE_TASK_DONE`
     - `WHATSAPP_TEMPLATE_TASK_REVIEW_REJECTED`
     - `WHATSAPP_TEMPLATE_TASK_REVIEW_REMINDER`
     - `WHATSAPP_TEMPLATE_TASK_SLA_OVERDUE`
     - `WHATSAPP_TEMPLATE_TASK_SLA_ESCALATED`
     - `WHATSAPP_TEMPLATE_DIGEST_DAILY_SUMMARY`
2. In Meta WhatsApp App webhook config:
   - Callback URL: `https://<your-domain>/api/integrations/whatsapp/webhook`
   - Verify token: same as `WHATSAPP_VERIFY_TOKEN`
3. Link a Nexus user with phone:
   - `PATCH /api/integrations/whatsapp/link` with `{ "phone": "+359..." }`
4. Supported bot commands:
   - `help`
   - `task @ivan Оправи login due:2026-03-01 prio:high`
   - `създай задача @ivan Оправи login due:2026-03-01 prio:high`
   - `my tasks`
   - `my tasks todo`
   - `done <taskIdPrefix>`
   - `approve <taskIdPrefix>`
   - `reject <taskIdPrefix> <comment>`
   - `status`
   - `remember that <text>`
   - `forget <text>`
   - `what do you remember`
   - `skills`
   - `run skill <name>`
   - `request skill <name>`
   - `skill requests`
   - `approve skill <name> for <email>`
   - `reject skill <name> for <email>`

5. Assistant behavior:
   - action intents send progress update first (`⏳ Working on it...`)
   - final reply includes short request id for traceability
   - webhook messages are deduplicated by provider message id
   - outbound WhatsApp sends use retry queue on delivery failure
   - assistant metrics endpoint: `GET /api/integrations/whatsapp/metrics` (admin/manager)
   - queue diagnostics:
     - `GET /api/integrations/whatsapp/queue?status=failed&limit=50`
     - `PATCH /api/integrations/whatsapp/queue/:queueId/requeue`

5. Voice command pipeline:
   - inbound `audio` -> transcription -> command handler
   - dry-run mode supports webhook payload test with `audio.mock_text`
   - env:
     - `TRANSCRIPTION_ENABLED`
     - `TRANSCRIPTION_DRY_RUN`
     - `TRANSCRIPTION_PROVIDER`
     - `TRANSCRIPTION_ENDPOINT`
     - `TRANSCRIPTION_API_KEY`
     - `TRANSCRIPTION_MODEL`

## SLA auto-reminders

- New tasks get an automatic SLA deadline (`created_at + SLA_DEFAULT_HOURS`, default 3h).
- Background job scans overdue unfinished tasks and sends reminders to assignee:
  - in-app notification (`task.sla.overdue`)
  - WhatsApp message (if user has linked phone)
- Env:
  - `SLA_REMINDER_ENABLED=1`
  - `SLA_DEFAULT_HOURS=3`
  - `SLA_REPEAT_EVERY_HOURS=3`
  - `SLA_MAX_REMINDERS=6`
  - `SLA_ESCALATION_HOURS=2`
  - `SLA_SCAN_EVERY_SECONDS=300`
- Escalation:
  - if task is still unresolved after assignee reminder + `SLA_ESCALATION_HOURS`, manager/admin receive escalation notifications (and WhatsApp if linked).
- Reminder cadence:
  - overdue tasks can receive repeated reminders every `SLA_REPEAT_EVERY_HOURS`
  - reminders stop after `SLA_MAX_REMINDERS` per task (anti-spam cap)

## Live SLA policy (no restart)

- Admin/manager endpoints:
  - `GET /api/admin/sla-policy`
  - `PATCH /api/admin/sla-policy`
- Fields:
  - `enabled`
  - `defaultHours`
  - `repeatHours`
  - `maxReminders`
  - `escalationHours`
  - `scanEverySeconds`
- Stored in DB (`system_settings`) and applied live by SLA scheduler and new task creation flow.

## WIP limits (policy warnings)

- Optional per-column limits (disabled when value is `0`):
  - `WIP_LIMIT_TODO`
  - `WIP_LIMIT_IN_PROGRESS`
  - `WIP_LIMIT_DONE`
- When limit is reached and another task is created/moved into that column:
  - action is still allowed
  - API returns `wipWarning`
  - manager/admin receive policy warning notification
  - activity log writes `project.wip.limit.exceeded`

## Notification engine (in-app + WhatsApp)

- Centralized service: `apps/api/src/services/notificationService.js`
- Event type registry: `apps/api/src/notifications/types.js`
- Supports:
  - in-app notifications (DB + realtime socket event `notification.created`)
  - WhatsApp delivery (when user has linked phone and integration is enabled)
  - template-first WhatsApp delivery per notification type with automatic text fallback on template failure
  - dedupe window via `dedupe_key` to reduce spam
  - per-user preferences (`/api/notification-preferences`) including quiet hours

## Review reminders job

- Review reminders are generated by scheduler job (`jobs/reviewReminders.js`).
- `GET /api/notifications` is read-only (no reminder side-effects).
- Env:
  - `REVIEW_REMINDER_ENABLED=1`
  - `REVIEW_REMINDER_SCAN_EVERY_SECONDS=600`

## Daily digest + bulk notification actions

- Daily digest job (`jobs/digestNotifications.js`) sends summary to admin/manager.
- Env:
  - `DIGEST_ENABLED=1`
  - `DIGEST_SCAN_EVERY_SECONDS=3600`
- Notification center APIs:
  - `POST /api/notifications/read-all`
  - `DELETE /api/notifications/read?olderThanDays=14`
