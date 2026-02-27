# WhatsApp Assistant Roadmap (Execution v1)

## Phase A: Core command router
- Status: `COMPLETED (baseline)`
- Implemented:
  - intent parser (`apps/api/src/services/assistantIntent.js`)
  - intents: `help`, `status`, `task.create`, `task.list`, `task.done`, `task.approve`, `task.reject`
  - natural language aliases (BG/EN) like `създай задача ...`, `what can you do?`

## Phase B: Progress updates
- Status: `COMPLETED (baseline)`
- Implemented:
  - request id in WhatsApp replies
  - progress ping (`⏳ Working on it...`) for action intents
  - activity log enrichment with intent + request id

## Phase C: Safety + RBAC
- Status: `COMPLETED (baseline)`
- Next:
  - expand allowlist to future intents (`remember/forget/run skill`)
  - add per-project scoped permissions for command execution

## Phase D: Reliability
- Status: `COMPLETED (baseline)`
- Implemented:
  - inbound webhook dedupe table (`inbound_webhook_messages`)
  - outbound retry queue (`outbound_message_queue`)
  - retry worker in API bootstrap

## Phase E: UX commands
- Status: `COMPLETED (baseline)`
- Implemented:
  - `remember that ...`
  - `forget ...`
  - `what do you remember`
  - `skills`
  - `run skill <name>` (allowlisted skill registry)
  - `request skill <name>`
  - `skill requests`
  - `approve/reject skill <name> for <email>`
- Next:
  - add UI panel for dynamic skills management

## Phase F: Monitoring
- Status: `COMPLETED (baseline)`
- Implemented:
  - diagnostics endpoint `GET /api/integrations/whatsapp/metrics`
  - intent counters (24h), inbound volume (24h), outbound queue status

## Phase G: SLA WhatsApp Cadence
- Status: `COMPLETED (baseline+)`
- Implemented:
  - repeated SLA reminders for overdue tasks (`SLA_REPEAT_EVERY_HOURS`)
  - per-task anti-spam cap (`SLA_MAX_REMINDERS`)
  - metrics extension in WhatsApp diagnostics (`slaOps24h`)

## Phase H: Template Delivery + Fallback
- Status: `COMPLETED (baseline)`
- Implemented:
  - template-first delivery for notification events when template env is configured
  - automatic fallback to text + retry queue if template send fails
  - new env knobs for per-event template mapping

## Phase I: Queue Operations Dashboard
- Status: `COMPLETED (baseline)`
- Implemented:
  - queue API for admin/manager (`list`, `requeue`)
  - admin UI section for pending/failed/sent visibility
  - manual requeue action for failed outbound messages
