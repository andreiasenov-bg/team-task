# Autonomous CI/CD setup (GitHub + hosting)

This project includes 3 GitHub Actions workflows:

- `CI` (`.github/workflows/ci.yml`): runs tests and docker build on every push/PR.
- `Deploy` (`.github/workflows/deploy.yml`): uploads the repository to your server over SSH and deploys on push to `main` or manually.
- `Monitor` (`.github/workflows/monitor.yml`): checks app health every 30 minutes.

## 1) Add GitHub repository secrets

In `GitHub -> Settings -> Secrets and variables -> Actions`, add:

- `SSH_HOST`: production server host/IP.
- `SSH_PORT`: SSH port (usually `22`).
- `SSH_USER`: SSH user.
- `SSH_PRIVATE_KEY`: private key that can SSH into the server.
- `APP_DIR`: absolute app directory on the server (example: `/opt/team-task`).
- `APP_HEALTH_URL`: public health endpoint (example: `https://your-domain.com/api/health`).

## 2) Server prerequisites

Install on the server:

- `git`
- `docker`
- `docker compose` (plugin)

The deploy workflow will:

1. Upload repository files from GitHub Actions runner to `APP_DIR`.
2. Keep/prepare `.env.docker`.
3. Run `docker compose up -d --build`.

## 3) First deploy

1. Push to `main` or run `Deploy` manually from GitHub Actions.
2. Verify service:
   - open `APP_HEALTH_URL`
   - check `Monitor` workflow runs successfully.

## 4) How this works while your laptop is off

All CI, deployment, and health monitoring run in GitHub-hosted runners and on your server.
Your local machine is not required after setup.

## 5) Staging profile quick start (local)

Use this when you want a separate pre-release run on different ports:

1. Optional env:
   - copy `.env.staging.example` to `.env.staging`
2. Start and validate:
   - `bash scripts/staging-up.sh`

This command will:
1. start compose with staging ports (`5174`, `4320`, `4310`)
2. run QA seed data (`qa-seed` service in profile `staging`)
3. run smoke checks against staging API and app
