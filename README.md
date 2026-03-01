# listO (team-task)

Modern task platform with:
- React SPA frontend
- Express + PostgreSQL API
- JWT auth + RBAC
- Realtime updates (Socket.IO)
- SLA reminders/escalations
- Review + reject + archive workflow
- WhatsApp assistant integration (optional)

## Quick Start (Docker)

```bash
cd /Users/O-connect/Downloads/TASK-Team
cp -n .env.docker.example .env.docker
docker compose up -d --build
docker compose exec -T api npm run seed
```

Open:
- Web: `http://127.0.0.1:5173`
- API docs: `http://127.0.0.1:3320/docs`
- API health: `http://127.0.0.1:3320/api/health`

## Demo Accounts

- `admin@nexus-flow.local / admin123`
- `manager@nexus-flow.local / manager123`
- `ivan@nexus-flow.local / 123456`

## One-Command Monitoring

```bash
npm run monitor:status
```

What it checks:
- git state (branch/commit/dirty)
- docker containers
- API health
- web reachability
- smoke test output

## Validation Commands

- Smoke: `npm run monitor:smoke`
- Critical e2e: `npm run monitor:e2e`
- Final checks: `npm run monitor:final`
- Strict legacy check (optional): `STRICT_OLD_APP=1 npm run monitor:smoke`

## Key Features

- Drag-and-drop Kanban board
- Calendar + recurring schedule presets
- Task comments + attachments (link and file upload)
- Notification center with:
  - tabs (`Unread`, `All`, `Critical`, `Mentions`)
  - grouped severity
  - one-click actions (`Open task`, `Approve`, `Reject`)
- Admin inbox panel for review/escalation queue
- Quick filter presets (`Focus`, `Overdue`, `Review Queue`, `SLA Escalated`, ...)
- Deep links to specific tasks via URL (`?projectId=...&task=...`)

## Useful Docs

- Local observing: `OBSERVE.md`
- Live progress: `PROGRESS.md`
- Migration roadmap: `ROADMAP.md`
- Notifications roadmap: `NOTIFICATIONS_ROADMAP.md`
- WhatsApp roadmap: `WHATSAPP_ASSISTANT_ROADMAP.md`
- Deployment: `DEPLOY.md`
- Production readiness: `PRODUCTION_READINESS.md`
- Security runbook: `SECURITY_RUNBOOK.md`
- UAT pack: `UAT_PACK.md`

## Deployment

- CI regression (smoke + e2e) is configured in GitHub Actions.
- Production deploy instructions and Hetzner scripts are in `DEPLOY.md`.
