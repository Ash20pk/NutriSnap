#!/bin/bash
# NutriSnap Backend Deployment Script
# Usage: ./deploy.sh [--initial]

set -e  # Exit on error

DEPLOY_USER="nutrisnap"
DEPLOY_PATH="/opt/nutrisnap/backend"
VENV_PATH="$DEPLOY_PATH/venv"
SERVICE_NAME="nutrisnap"

echo "=== NutriSnap Backend Deployment ==="

# Check if running as root (needed for systemd operations)
if [ "$EUID" -ne 0 ]; then 
    echo "Please run with sudo for systemd operations"
    exit 1
fi

# Initial setup flag
INITIAL_SETUP=false
if [ "$1" == "--initial" ]; then
    INITIAL_SETUP=true
    echo "Running initial setup..."
fi

# 1. Create user and directories (initial setup only)
if [ "$INITIAL_SETUP" = true ]; then
    echo "Creating system user..."
    if ! id "$DEPLOY_USER" &>/dev/null; then
        useradd -r -s /bin/bash -d "$DEPLOY_PATH" "$DEPLOY_USER"
    fi
    
    echo "Creating directories..."
    mkdir -p "$DEPLOY_PATH"
    mkdir -p "$DEPLOY_PATH/logs"
    chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_PATH"
fi

# 2. Pull latest code
echo "Pulling latest code..."
cd "$DEPLOY_PATH"
sudo -u "$DEPLOY_USER" git pull origin main

# 3. Setup Python virtual environment
if [ ! -d "$VENV_PATH" ]; then
    echo "Creating virtual environment..."
    sudo -u "$DEPLOY_USER" python3 -m venv "$VENV_PATH"
fi

# 4. Install dependencies
echo "Installing dependencies..."
sudo -u "$DEPLOY_USER" "$VENV_PATH/bin/pip" install --upgrade pip
sudo -u "$DEPLOY_USER" "$VENV_PATH/bin/pip" install -r requirements.txt

# 5. Install systemd service (initial setup only)
if [ "$INITIAL_SETUP" = true ]; then
    echo "Installing systemd service..."
    cp deploy/nutrisnap.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    echo "Installing nginx configuration..."
    cp deploy/nginx.conf /etc/nginx/sites-available/nutrisnap
    ln -sf /etc/nginx/sites-available/nutrisnap /etc/nginx/sites-enabled/
    nginx -t
    systemctl reload nginx
fi

# 6. Restart service
echo "Restarting service..."
systemctl restart "$SERVICE_NAME"

# 7. Wait for service to be ready
echo "Waiting for service to start..."
sleep 3

# 8. Health check
echo "Running health check..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✓ Service is healthy"
else
    echo "✗ Health check failed"
    systemctl status "$SERVICE_NAME"
    exit 1
fi

echo ""
echo "=== Deployment Complete ==="
echo "Service status: systemctl status $SERVICE_NAME"
echo "Logs: journalctl -u $SERVICE_NAME -f"
echo "Health: curl http://localhost/health"
