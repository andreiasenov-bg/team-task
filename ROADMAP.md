# Nexus Flow Master Roadmap (Hardcoded)

Този файл е оперативен план за автономна работа по проекта.
Структурата е фиксирана; променям само статуси, ETA и бележки за прогрес.

## 1) Execution Mode (Autonomous)

1. Работя по чекпойнтите последователно по фази, без да чакам потвърждение за всяка дребна стъпка.
2. На всеки чекпойнт давам кратък отчет:
- Какво е направено
- Как е валидирано
- Какво остава
- Обновен ETA
3. Ако има блокер (външен достъп, ключове, домейн, права), маркирам `BLOCKED` и продължавам по следващ възможен чекпойнт.
4. Не чупя вече работещи фичъри; всяка промяна минава през smoke/health проверка.

## 2) Definition of Done (за всяка функционалност)

1. Backend: endpoint/logic + валидации + RBAC.
2. Data: нужните DB полета/миграция + backward compatibility.
3. Frontend: реален UI поток (не само hidden API).
4. Realtime/notifications: когато е приложимо.
5. Docs: кратко описание в README/ROADMAP.
6. Validation: build + smoke + целева проверка на фичъра.

## 3) Current Status Snapshot

1. Phase 1: Migration Core: `COMPLETED`
2. Phase 2: Productization: `COMPLETED`
3. SLA Reminders + Escalation: `COMPLETED`
4. Phase 3: Team Workflow Excellence: `COMPLETED`
5. WhatsApp Webhook MVP: `COMPLETED` (production callback и стабилен публичен URL зависят от инфраструктура)

## 4) Phase 3: Team Workflow Excellence

### Checkpoint 11: Employee Workspace Hardening
- Scope: служител вижда и управлява само свои задачи (API + UI + edge cases).
- Status: `COMPLETED`
- ETA: 0h
- Notes: enforced in API query layer + employee-oriented UI.

### Checkpoint 12: SLA UX Visibility
- Scope: визуални индикатори за `overdue` и `escalated`, филтри по SLA състояние.
- Status: `COMPLETED`
- ETA: 0h
- Dependencies: none.

### Checkpoint 13: Saved Views
- Scope: запазени филтри за роли (Admin/Manager/Employee), бързо превключване.
- Status: `COMPLETED`
- ETA: 0h
- Dependencies: Checkpoint 12.

### Checkpoint 14: WIP Limits + Policy Alerts
- Scope: лимити на колони, warning при надвишение, activity log за policy events.
- Status: `COMPLETED`
- ETA: 0h
- Dependencies: none.

## 5) Phase 4: Integrations & Automation

### Checkpoint 15: WhatsApp Task Command Parser
- Scope: `task @user ... due:... prio:...` -> директен task create.
- Status: `COMPLETED`
- ETA: 0h
- Dependencies: stable webhook URL + WhatsApp credentials.

### Checkpoint 16: Voice-to-Task Pipeline
- Scope: voice message transcription + маркери + task create.
- Status: `COMPLETED` (dry-run + provider-ready)
- ETA: 0h
- Dependencies: media fetch + transcription provider.

### Checkpoint 17: Escalation Policies (Advanced)
- Scope: multi-step escalation matrix (assignee -> manager -> admin).
- Status: `COMPLETED` (implemented assignee reminder + manager/admin escalation)
- ETA: 0h
- Dependencies: Checkpoint 15 optional.

## 6) Phase 5: Data, Security, Operability

### Checkpoint 18: Audit Expansion
- Scope: по-детайлен audit trail за интеграции и автоматични jobs.
- Status: `COMPLETED`
- ETA: 0h

### Checkpoint 19: Secrets & Config Hygiene
- Scope: env split (dev/stage/prod), key rotation notes, безопасни defaults.
- Status: `COMPLETED`
- ETA: 0h

### Checkpoint 20: Observability Pack
- Scope: structured logs + error buckets + operational runbook.
- Status: `COMPLETED`
- ETA: 0h

## 7) Phase 6: Release & Deployment

### Checkpoint 21: Staging Profile
- Scope: staging compose/profile, seeded QA сценарии.
- Status: `COMPLETED`
- ETA: 0h
- Notes: compose staging profile via `qa-seed` + `scripts/staging-up.sh` + staging smoke on isolated ports.

### Checkpoint 22: Production Readiness Checklist
- Scope: domain/SSL, webhook callback, backup policy, recovery checklist.
- Status: `COMPLETED`
- ETA: 0h
- Notes: added `PRODUCTION_READINESS.md` + DB backup/restore scripts.

### Checkpoint 23: Final UAT Pack
- Scope: ръчни сценарии за роли + acceptance report.
- Status: `COMPLETED`
- ETA: 0h
- Notes: added `UAT_PACK.md` with role scenarios and PASS/FAIL report template.

## 8) Checkpoint Reporting Template (Hardcoded)

1. Checkpoint ID + име
2. Промени (backend/frontend/data/docs)
3. Валидация (команди/резултат)
4. Рискове и блокери
5. Следващ чекпойнт + ETA

## 9) Live Blockers Board

1. `NONE` в момента.
2. Потенциален бъдещ блокер: постоянен публичен webhook URL за WhatsApp production.

## 10) Updated Global ETA

1. Remaining roadmap (без външни зависимости): ~0h
2. Integrations in production mode (WhatsApp + voice credentials/domain): +2-4h
3. Total remaining envelope: ~2-4h

## 11) Next Track: Notifications Excellence

1. Dedicated hardcoded plan:
- `NOTIFICATIONS_ROADMAP.md`
2. Recommended start batch:
- N1 (type catalog) + N2 (central notification service)
