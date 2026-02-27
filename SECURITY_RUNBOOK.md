# Security & Config Runbook

## Environment split
- `apps/api/.env.example`: template for local/dev.
- `.env.docker`: runtime env for local docker stack.
- Production should use secret manager or host-level env vars, not committed `.env` files.

## Key rotation
1. Rotate `JWT_SECRET`.
2. Rotate `WHATSAPP_ACCESS_TOKEN`.
3. Rotate `TRANSCRIPTION_API_KEY` (if enabled).
4. Restart API service.

## Safe defaults
- WhatsApp and transcription integrations can run in dry-run mode.
- WIP limits are disabled when set to `0`.
- SLA jobs are enabled with conservative defaults (`3h` reminder, `2h` escalation).

## Incident quick checks
1. API health: `GET /api/health`
2. Request tracing: use response header `X-Request-Id`.
3. Logs: filter by `requestId` and `event` (`http.request`, `http.error`).
4. Notifications table for delivery state / escalation traces.

## Production checklist
- HTTPS only for webhook callbacks.
- Restrict CORS to trusted frontend origins.
- Use strong random `JWT_SECRET`.
- Keep Docker host and dependencies patched.
