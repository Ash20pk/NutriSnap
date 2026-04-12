#!/usr/bin/env bash
# ============================================================
# NutriSnap — DigitalOcean Ubuntu Droplet Deploy Script
# Run once on a fresh Ubuntu 22.04 / 24.04 droplet.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
# ============================================================
set -euo pipefail

APP_DIR="/opt/nutrisnap"
REPO_URL=""          # optional: set to your git remote if you want auto-clone
COMPOSE_FILE="docker-compose.prod.yml"

echo "──────────────────────────────────────────"
echo " NutriSnap Droplet Setup"
echo "──────────────────────────────────────────"

# ── 1. System update & Docker install ─────────────────────────
echo "[1/6] Installing Docker..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release ufw

# Docker official GPG key + repo
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

systemctl enable --now docker
echo "    Docker $(docker --version) installed."

# ── 2. Firewall ────────────────────────────────────────────────
echo "[2/6] Configuring UFW firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "    Firewall: SSH, HTTP, HTTPS allowed."

# ── 2b. Open UDP 443 for HTTP/3 ───────────────────────────────
ufw allow 443/udp

# ── 3. Create app directory & copy files ──────────────────────
echo "[3/6] Setting up app directory at $APP_DIR..."
mkdir -p "$APP_DIR"

# If running from a git clone, copy everything over
if [ -d "$(dirname "$0")/../backend" ]; then
    cp -r "$(dirname "$0")"/. "$APP_DIR/"
elif [ -n "$REPO_URL" ]; then
    git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ── 4. .env check ─────────────────────────────────────────────
echo "[4/6] Checking .env file..."
if [ ! -f ".env" ]; then
    echo ""
    echo "  ❌  .env file not found!"
    echo "      Copy your .env to $APP_DIR/.env and re-run this script."
    echo "      Minimum required variables:"
    echo "        DATABASE_URL, OPENAI_API_KEY, SUPABASE_URL,"
    echo "        SUPABASE_JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY,"
    echo "        ADMIN_API_KEY, CORS_ORIGINS"
    exit 1
fi
echo "    .env found."

# ── 4b. Domain check in Caddyfile ─────────────────────────────
if grep -q "your-domain.com" Caddyfile 2>/dev/null; then
    echo ""
    echo "  ⚠️   Edit Caddyfile: replace 'your-domain.com' with your real domain."
    echo "      Then re-run this script (or run: docker compose -f $COMPOSE_FILE up -d)"
    echo ""
fi

# ── 5. Build & start containers ───────────────────────────────
echo "[5/6] Building and starting containers..."
docker compose -f "$COMPOSE_FILE" pull --ignore-buildable
docker compose -f "$COMPOSE_FILE" build --no-cache
docker compose -f "$COMPOSE_FILE" up -d

# ── 6. Health check ───────────────────────────────────────────
echo "[6/6] Waiting for API to become healthy..."
sleep 10
DROPLET_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || hostname -I | awk '{print $1}')

for i in {1..12}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:80/health" || true)
    if [ "$STATUS" = "200" ]; then
        echo ""
        echo "  ✅  API is live!"
        echo "      http://$DROPLET_IP/health"
        echo "      http://$DROPLET_IP/docs  (HTTP only until domain is set)"
        echo ""
        echo "  Next steps for HTTPS:"
        echo "    1. Point your domain A record → $DROPLET_IP"
        echo "    2. Edit Caddyfile: replace 'your-domain.com' with your real domain"
        echo "    3. Run: docker compose -f $COMPOSE_FILE restart caddy"
        echo "    Caddy will auto-provision the TLS cert. That's it."
        echo ""
        exit 0
    fi
    echo "    Attempt $i/12 — HTTP $STATUS, retrying in 5s..."
    sleep 5
done

echo ""
echo "  ⚠️  API did not become healthy in time. Check logs:"
echo "     docker compose -f $COMPOSE_FILE logs api --tail 50"
echo "     docker compose -f $COMPOSE_FILE logs caddy --tail 20"
exit 1
