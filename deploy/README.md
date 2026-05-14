# Production Deployment — Ubuntu 22.04 / PM2

## Prerequisites

- Ubuntu 22.04 VPS
- Node.js 20 LTS
- PM2 (`npm install -g pm2`)
- pm2-logrotate (`pm2 install pm2-logrotate`)
- Nginx (reverse proxy)

---

## 1. Server bootstrap

```bash
# Install Node.js 20 LTS via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20

# Install PM2 globally
npm install -g pm2

# Logrotate for PM2 logs
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
```

---

## 2. Clone and configure

```bash
git clone <repo-url> /opt/whatsapp-bot
cd /opt/whatsapp-bot
npm ci --omit=dev

cp .env.example .env
# Edit .env and fill in all required values
nano .env

mkdir -p logs
```

---

## 3. Start with PM2

```bash
# Start in production mode
npm run start:prod
# or directly:
pm2 start ecosystem.config.js --env production

# Persist across reboots
pm2 save
pm2 startup    # follow the printed command to enable systemd unit
```

---

## 4. Nginx reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location /webhook {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location /admin/ {
        # Restrict to your management IP
        allow  <YOUR_IP>;
        deny   all;
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

```bash
# Obtain TLS certificate
certbot --nginx -d your-domain.com

nginx -t && systemctl reload nginx
```

---

## 5. PM2 commands

```bash
pm2 status                        # list processes
pm2 logs whatsapp-bot             # tail logs
pm2 logs whatsapp-bot --lines 200 # last 200 lines
pm2 restart whatsapp-bot          # rolling restart
pm2 reload whatsapp-bot           # zero-downtime reload (fork mode)
pm2 stop whatsapp-bot             # stop
pm2 delete whatsapp-bot           # remove from PM2
```

---

## 6. Admin endpoints

```bash
# Trigger an immediate catalogue sync
curl -s -X POST https://your-domain.com/admin/reload \
  -H "Authorization: Bearer $ADMIN_RELOAD_TOKEN"

# Check sync status
curl -s https://your-domain.com/admin/sync-status | jq .
```

---

## 7. Log locations

| Stream | File |
|--------|------|
| stdout | `./logs/out.log` |
| stderr | `./logs/error.log` |
| PM2 internal | `~/.pm2/logs/` |

Logs are rotated automatically by pm2-logrotate (50 MB, 14-day retention).

---

## 8. Memory guard

PM2 will auto-restart the process if RSS exceeds **512 MB** (configured in `ecosystem.config.js`).
