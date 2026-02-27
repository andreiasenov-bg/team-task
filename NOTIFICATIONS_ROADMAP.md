# Notifications Roadmap (Hardcoded)

Цел: предвидима, мащабируема и полезна нотификационна система за Admin/Manager/Employee, без spam и без пропуснати критични събития.

## 0) Current Baseline (as-is)

1. Има in-app таблица `notifications` и read/unread.
2. Има SLA reminders/escalations и review reminder.
3. Има WhatsApp канал (частично, по env/credentials).
4. Липсва централен notification service и унифицирани правила.
5. Reminder логика се задейства в `GET /notifications` (не е идеално).

## 1) Target Architecture

1. `Notification Engine` (backend service):
   - един вход за всички събития (`emitNotification(eventType, payload)`).
2. `Policy Layer`:
   - правила кога, на кого, по кой канал, с какъв throttle.
3. `Delivery Layer`:
   - in-app (DB + realtime socket), WhatsApp (optional), email (future).
4. `Preference Layer`:
   - per-user настройки (mute, digest, quiet hours, channel opt-in).
5. `Scheduler Layer`:
   - cron jobs за delayed reminders/escalation/digests.

## 2) Phased Plan

### Checkpoint N1: Event Catalog + Notification Types
- Scope:
  1. Консолидация на всички notification `type` в enum/registry.
  2. Стандартизирани templates за title/message.
  3. Severity: `info|warning|critical`.
- Deliverables:
  1. `apps/api/src/notifications/types.js`
  2. `apps/api/src/notifications/templates.js`
  3. OpenAPI update за типове.
- ETA: 1-2h
- Status: `COMPLETED`

### Checkpoint N2: Central Notification Service
- Scope:
  1. Нов service `createNotification(...)` + dedupe key + TTL.
  2. Рефактор на `tasks.js`, `whatsapp.js`, `slaReminders.js` да минават през него.
  3. Премахване на директните `insert into notifications` от route handlers.
- Deliverables:
  1. `apps/api/src/services/notificationService.js`
  2. refactor на route/job файлове.
- ETA: 2-4h
- Status: `COMPLETED`

### Checkpoint N3: Realtime Push for Notifications
- Scope:
  1. Socket room `user:<id>`.
  2. Event `notification.created`.
  3. UI instant badge increment + toast.
- Deliverables:
  1. server socket update
  2. frontend listener + toast component
- ETA: 2-3h
- Status: `COMPLETED`
- Notes: implemented user-room subscribe/unsubscribe, `notification.created`, `notification.read`, and frontend toast + unread sync.

### Checkpoint N4: Preferences + Quiet Hours
- Scope:
  1. Таблица `notification_preferences`.
  2. Настройки: channel on/off, task-type on/off, quiet hours.
  3. API: `GET/PATCH /notification-preferences`.
- Deliverables:
  1. DB migration
  2. API endpoints
  3. Frontend settings panel
- ETA: 4-6h
- Status: `COMPLETED`

### Checkpoint N5: Reminder Scheduler Refactor
- Scope:
  1. Review reminders да се генерират от job, не от `GET /notifications`.
  2. Idempotency guard (24h window + unique dedupe key).
  3. Dead-letter style logging при delivery fail.
- Deliverables:
  1. new job file
  2. removal of side effects from read endpoint
- ETA: 2-4h
- Status: `COMPLETED`
- Notes: review reminders moved to `jobs/reviewReminders.js`; `GET /notifications` is now read-only.

### Checkpoint N6: Digest Mode (Daily/Weekly)
- Scope:
  1. Daily digest за мениджъри/админ.
  2. Weekly summary за completed/rejected/overdue.
  3. Digest card in-app + optional WhatsApp summary.
- Deliverables:
  1. digest job
  2. digest templates
  3. UI digest inbox section
- ETA: 3-5h
- Status: `COMPLETED` (daily digest baseline)

### Checkpoint N7: Notification Center UX Upgrade
- Scope:
  1. Tabs: `All | Unread | Mentions | Critical`.
  2. Bulk actions: mark all read, clear old read.
  3. Deep link към task/project с context highlight.
- Deliverables:
  1. App.jsx notifications panel refactor
  2. API for bulk actions
- ETA: 3-4h
- Status: `COMPLETED` (tabs + bulk actions baseline)

### Checkpoint N8: Metrics + Operability
- Scope:
  1. KPIs: sent/read rate, median time-to-read, failures by channel.
  2. Structured logs per notification id + request id correlation.
  3. Admin diagnostics endpoint.
- Deliverables:
  1. `/api/notifications/metrics`
  2. runbook section update
- ETA: 2-3h
- Status: `COMPLETED` (baseline metrics endpoint)

### Checkpoint N9: SLA Cadence + Anti-Spam
- Scope:
  1. Повтарящи се SLA reminders към assignee (на интервал).
  2. Hard cap за reminders на задача.
  3. Запазване на текущата escalation логика към manager/admin.
- Deliverables:
  1. нови SLA полета в `tasks` (`sla_last_reminded_at`, `sla_reminder_count`)
  2. env controls: `SLA_REPEAT_EVERY_HOURS`, `SLA_MAX_REMINDERS`
  3. metrics разширение за SLA ops
- ETA: 1-2h
- Status: `COMPLETED`

### Checkpoint N10: WhatsApp Templates + Fallback
- Scope:
  1. Template-first delivery за notification събития.
  2. Автоматичен fallback към text + retry queue при template failure.
  3. Env-based mapping за template имена по тип нотификация.
- Deliverables:
  1. `sendTemplateMessage(...)` в WhatsApp integration
  2. template mapping в notification service
  3. env/docs update
- ETA: 1-2h
- Status: `COMPLETED`

### Checkpoint N11: Live SLA Policy (No Restart)
- Scope:
  1. SLA policy from DB override instead of env-only.
  2. Admin/manager API to read/update live policy.
  3. UI panel for live edits.
- Deliverables:
  1. `GET/PATCH /api/admin/sla-policy`
  2. scheduler reads updated policy during runtime
  3. web admin panel for SLA values
- ETA: 2-3h
- Status: `COMPLETED`

### Checkpoint N12: WhatsApp Queue Operations
- Scope:
  1. API list/requeue за outbound WhatsApp queue.
  2. Admin UI панел за pending/failed/sent и ръчно requeue.
  3. Връзка с текущите metrics.
- Deliverables:
  1. `GET /api/integrations/whatsapp/queue`
  2. `PATCH /api/integrations/whatsapp/queue/:queueId/requeue`
  3. frontend dashboard section
- ETA: 1-2h
- Status: `COMPLETED`

## 3) Recommended Execution Order (Best ROI)

1. N1 -> N2 -> N3 -> N5 (core correctness + realtime + no read-side effects)
2. N4 (preferences)
3. N7 (UX)
4. N6 (digests)
5. N8 (metrics)
6. N9 (SLA cadence hardening)

## 4) Acceptance Criteria

1. Няма side-effects в `GET /notifications`.
2. Всяка critical нотификация достига user-а в <2s през socket (локална среда).
3. Дублирани reminders не се създават в рамките на dedupe window.
4. User preferences реално филтрират каналите.
5. Bulk read/clear работи за 1000+ нотификации без timeout.

## 5) Risks

1. Spam risk без dedupe/throttle.
2. Realtime desync между tab-ове без event-driven refresh.
3. Growth risk при липса на retention/archiving policy.

## 6) Next Immediate Step

1. Start with N1 + N2 in one implementation batch.
2. After that, run smoke + role-based UAT slice for notifications.
