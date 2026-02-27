# Production Readiness Checklist

## 1) Infrastructure and domain

1. Provision VM (Hetzner CX23+ recommended) with Ubuntu 22.04 LTS.
2. Install Docker + Compose plugin.
3. Point subdomain (example: `tasks.yourdomain.com`) to VM public IP.
4. Put reverse proxy (Nginx/Caddy/Traefik) in front of API+web.
5. Enable TLS certificate (Let's Encrypt) and force HTTPS.

## 2) Environment and secrets

1. Copy `.env.docker.example` to `.env.docker`.
2. Replace all placeholder values:
   - `JWT_SECRET`
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `TRANSCRIPTION_API_KEY` (if enabled)
3. Keep `.env.docker` only on server, never in Git.
4. Rotate tokens/keys every 90 days or after an incident.

## 3) Deployment checks

1. Run: `docker compose up -d --build`.
2. Health:
   - `GET /api/health` must return `ok: true`.
   - `GET /docs` must load swagger UI.
3. Login and smoke:
   - `npm run monitor:smoke`.
4. Realtime:
   - open two browsers and verify live task movement.

## 4) WhatsApp webhook checks

1. Callback URL:
   - `https://<domain>/api/integrations/whatsapp/webhook`
2. Verify token must match `WHATSAPP_VERIFY_TOKEN`.
3. Send a test message:
   - `help`
   - `task @ivan Test due:2026-03-01 prio:high`
4. Confirm inbound logs show `whatsapp.command.received`.

## 5) Backup policy

1. Daily DB backup:
   - `npm run ops:backup`
2. Retention:
   - Keep last 14 daily backups + 4 weekly backups.
3. Store a copy off-machine (Hetzner Storage Box/S3).
4. Test restore weekly on staging:
   - `bash scripts/restore-db.sh <backup.sql.gz>`

## 6) Recovery checklist

1. Incident start:
   - freeze deploys
   - collect `docker compose logs`
2. Recover:
   - restore DB from latest healthy backup
   - start stack: `docker compose up -d`
3. Verify:
   - health + smoke + one role login per role
4. Close incident:
   - root cause summary
   - rotate impacted secrets
   - add preventive action to roadmap

## 7) Go-live gate

All items below must be `YES`:

1. HTTPS active and valid cert.
2. Non-placeholder secrets.
3. Backups running and restore tested.
4. Health/smoke pass on latest deploy.
5. WhatsApp webhook verified (if enabled).
6. Admin, manager, employee UAT scenarios passed.
