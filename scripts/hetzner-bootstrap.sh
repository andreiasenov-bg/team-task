#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash scripts/hetzner-bootstrap.sh"
  exit 1
fi

APP_USER="${APP_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/team-task}"
SSH_PUBKEY="${SSH_PUBKEY:-}"

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release git ufw cron

install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi
chmod a+r /etc/apt/keyrings/docker.gpg

ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo \
  "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $CODENAME stable" > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$APP_USER"
fi
usermod -aG docker "$APP_USER"

install -d -m 0755 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"

if [ -n "$SSH_PUBKEY" ]; then
  install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  touch "/home/$APP_USER/.ssh/authorized_keys"
  grep -qxF "$SSH_PUBKEY" "/home/$APP_USER/.ssh/authorized_keys" || echo "$SSH_PUBKEY" >> "/home/$APP_USER/.ssh/authorized_keys"
  chown "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh/authorized_keys"
  chmod 0600 "/home/$APP_USER/.ssh/authorized_keys"
fi

ufw --force allow OpenSSH
ufw --force allow 80/tcp
ufw --force allow 443/tcp
ufw --force enable

CRON_FILE="/etc/cron.d/team-task-backup"
cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * $APP_USER cd $APP_DIR && /usr/bin/bash scripts/backup-db.sh >> /var/log/team-task-backup.log 2>&1
EOF
chmod 0644 "$CRON_FILE"
systemctl restart cron

echo "Bootstrap complete."
echo "App user: $APP_USER"
echo "App dir: $APP_DIR"
echo "Next: switch to $APP_USER and run scripts/prod-deploy.sh"

