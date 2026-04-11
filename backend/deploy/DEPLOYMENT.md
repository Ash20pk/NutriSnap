# NutriSnap Backend - Production Deployment Guide

This guide covers deploying the NutriSnap backend to your own VM with systemd, nginx, and PostgreSQL.

## Prerequisites

- Ubuntu 20.04+ or similar Linux distribution
- Root/sudo access
- Domain name pointing to your VM (optional but recommended)
- PostgreSQL database (can be on same VM or external like Supabase)

## Initial Server Setup

### 1. Update system packages
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install required packages
```bash
sudo apt install -y python3 python3-pip python3-venv nginx postgresql-client git curl
```

### 3. Install certbot (for SSL)
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 4. Configure firewall
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## Application Deployment

### 1. Clone repository
```bash
sudo mkdir -p /opt/nutrisnap
cd /opt/nutrisnap
sudo git clone https://github.com/yourusername/NutriSnap.git .
```

### 2. Run initial deployment
```bash
cd /opt/nutrisnap/backend
sudo ./deploy/deploy.sh --initial
```

This script will:
- Create `nutrisnap` system user
- Set up Python virtual environment
- Install dependencies
- Configure systemd service
- Configure nginx reverse proxy
- Start the service

### 3. Configure environment variables
```bash
sudo nano /opt/nutrisnap/backend/.env
```

Required variables:
```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/nutrisnap

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
OPENAI_CHEAP_MODEL=gpt-4.1-mini

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=food-labels

# Admin
ADMIN_SYNC_KEY=your-secure-admin-key

# USDA (optional)
USDA_API_KEY=your-usda-key

# Server
ENVIRONMENT=production
HOST=0.0.0.0
PORT=8000
WORKERS=4
LOG_LEVEL=INFO
LOG_FORMAT=json

# CORS
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

Set proper permissions:
```bash
sudo chmod 600 /opt/nutrisnap/backend/.env
sudo chown nutrisnap:nutrisnap /opt/nutrisnap/backend/.env
```

### 4. Update nginx configuration
```bash
sudo nano /etc/nginx/sites-available/nutrisnap
```

Replace `api.nutrisnap.com` with your domain.

Test and reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Set up SSL with Let's Encrypt
```bash
sudo certbot --nginx -d api.nutrisnap.com
```

Follow the prompts. Certbot will automatically update your nginx config.

Then uncomment the HTTPS server block in `/etc/nginx/sites-available/nutrisnap`.

### 6. Verify deployment
```bash
# Check service status
sudo systemctl status nutrisnap

# Check logs
sudo journalctl -u nutrisnap -f

# Test health endpoint
curl http://localhost/health
curl https://api.nutrisnap.com/health
```

## Regular Deployment (Updates)

For subsequent deployments after code changes:

```bash
cd /opt/nutrisnap/backend
sudo ./deploy/deploy.sh
```

This will:
- Pull latest code
- Update dependencies
- Restart service
- Run health check

## Service Management

### Start/Stop/Restart
```bash
sudo systemctl start nutrisnap
sudo systemctl stop nutrisnap
sudo systemctl restart nutrisnap
sudo systemctl reload nutrisnap  # Graceful reload
```

### View logs
```bash
# Follow logs in real-time
sudo journalctl -u nutrisnap -f

# View last 100 lines
sudo journalctl -u nutrisnap -n 100

# View logs from specific time
sudo journalctl -u nutrisnap --since "1 hour ago"
```

### Check status
```bash
sudo systemctl status nutrisnap
```

## Monitoring & Maintenance

### Log Rotation
Create `/etc/logrotate.d/nutrisnap`:
```
/opt/nutrisnap/backend/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 nutrisnap nutrisnap
    sharedscripts
    postrotate
        systemctl reload nutrisnap > /dev/null 2>&1 || true
    endscript
}
```

### Health Monitoring
Set up a cron job to monitor the health endpoint:

```bash
sudo crontab -e
```

Add:
```cron
*/5 * * * * curl -f http://localhost/health || systemctl restart nutrisnap
```

### Database Backups
```bash
# Create backup script
sudo nano /opt/nutrisnap/scripts/backup-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/nutrisnap/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

pg_dump $DATABASE_URL > "$BACKUP_DIR/nutrisnap_$DATE.sql"

# Keep only last 7 days
find "$BACKUP_DIR" -name "nutrisnap_*.sql" -mtime +7 -delete
```

```bash
sudo chmod +x /opt/nutrisnap/scripts/backup-db.sh
```

Add to crontab:
```cron
0 2 * * * /opt/nutrisnap/scripts/backup-db.sh
```

## Troubleshooting

### Service won't start
```bash
# Check logs
sudo journalctl -u nutrisnap -n 50

# Check if port is already in use
sudo netstat -tlnp | grep 8000

# Verify environment file
sudo -u nutrisnap cat /opt/nutrisnap/backend/.env
```

### Database connection errors
```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# Check if database exists
psql $DATABASE_URL -c "\l"
```

### High memory usage
```bash
# Check worker count
ps aux | grep gunicorn

# Reduce workers in gunicorn_conf.py or set WORKERS env var
```

### Nginx errors
```bash
# Test nginx config
sudo nginx -t

# Check nginx logs
sudo tail -f /var/log/nginx/error.log
```

## Performance Tuning

### Database Connection Pool
Edit `/opt/nutrisnap/backend/server.py` pool settings:
```python
pg_pool = await asyncpg.create_pool(
    DATABASE_URL,
    min_size=5,
    max_size=20,  # Adjust based on load
    command_timeout=60
)
```

### Gunicorn Workers
Adjust in `gunicorn_conf.py` or set env var:
```bash
export WORKERS=8  # 2-4x CPU cores
```

### Nginx Caching
Add to nginx config:
```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

location /api/ {
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_key "$scheme$request_method$host$request_uri";
}
```

## Security Checklist

- [ ] SSL/TLS enabled with Let's Encrypt
- [ ] Firewall configured (ufw)
- [ ] Service running as non-root user
- [ ] Environment file has 600 permissions
- [ ] Database uses strong password
- [ ] Admin keys are secure and rotated
- [ ] CORS origins are restricted
- [ ] Rate limiting enabled in nginx
- [ ] Regular security updates applied
- [ ] Backups configured and tested

## Rollback Procedure

If deployment fails:

```bash
cd /opt/nutrisnap/backend
sudo -u nutrisnap git log --oneline -5  # Find previous commit
sudo -u nutrisnap git reset --hard <commit-hash>
sudo systemctl restart nutrisnap
```

## Support

For issues:
1. Check logs: `sudo journalctl -u nutrisnap -f`
2. Verify health: `curl http://localhost/health`
3. Review this guide
4. Check GitHub issues
