# How to observe progress locally

## 1) Start full stack

```bash
cd /Users/O-connect/Downloads/TASK-Team
npm run docker:up
```

This starts:
- web SPA on `http://127.0.0.1:5173`
- legacy app on `http://127.0.0.1:3310`
- new API on `http://127.0.0.1:3320`
- postgres on `127.0.0.1:5432`

## 2) Seed new API once

```bash
npm run docker:seed:api
```

## 3) Open visual monitor page

```bash
npm run monitor:ui
```

Open:
- `http://127.0.0.1:5173` (new React SPA)
- `http://127.0.0.1:3330`
- `http://127.0.0.1:3320/docs` (Swagger UI)

Use buttons to:
- check old app health
- check new API health
- login to new API
- load projects/tasks

## 4) Run smoke checks in terminal

```bash
npm run monitor:smoke
```

This validates:
- old app health
- new API health
- JWT login
- projects list
- tasks list

## 5) One-command full status snapshot

```bash
npm run monitor:status
```

This prints:
- current git branch/commit/dirty state
- running containers
- API health probe
- web probe
- smoke test tail

## 6) Critical role-flow e2e

```bash
npm run monitor:e2e
```

This validates end-to-end:
- login for admin/manager/employee
- admin creates task assigned to employee
- employee can list/comment/attach/move to done
- employee is blocked by ACL on foreign task and task review
- manager can approve + archive task

## 7) Final validation

```bash
npm run monitor:final
```
