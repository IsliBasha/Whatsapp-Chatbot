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

---

## 9. Nginx + TLS

Copy `deploy/nginx.conf.example` to the server, fill in your domain, then:

```bash
# Install nginx + certbot
apt install -y nginx certbot python3-certbot-nginx

# Copy config
cp deploy/nginx.conf.example /etc/nginx/sites-available/whatsapp-bot
nano /etc/nginx/sites-available/whatsapp-bot  # replace your-domain.com and <YOUR_MGMT_IP>
ln -s /etc/nginx/sites-available/whatsapp-bot /etc/nginx/sites-enabled/

# Obtain TLS certificate
certbot --nginx -d your-domain.com

# Verify and reload
nginx -t && systemctl reload nginx
```

### Firewall

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## 10. Cutover playbook (ngrok → production)

Follow these steps in order. Keep ngrok running until step 5 is confirmed.

### Step 1 — Smoke-test the new server

```bash
# Readiness probe
curl -s https://your-domain.com/health

# Trigger a catalogue sync and check status
curl -s -X POST https://your-domain.com/admin/reload \
  -H "Authorization: Bearer $ADMIN_RELOAD_TOKEN"

curl -s https://your-domain.com/admin/sync-status | jq .
```

Both calls must succeed before proceeding.

### Step 2 — Update the Meta webhook URL

1. Open [Meta App Dashboard](https://developers.facebook.com/apps/) → your app → WhatsApp → Configuration
2. Set **Callback URL** to `https://your-domain.com/webhook`
3. Set **Verify Token** to the value of `VERIFY_TOKEN` in your server `.env`
4. Click **Verify and Save** — Meta will issue a `GET /webhook` challenge; the new server must respond `200`

### Step 3 — Send a test message

Send `Sa kushton Luna?` from a real WhatsApp number.
Confirm you receive the correct Albanian price reply within a few seconds.

### Step 4 — Confirm and decommission ngrok

Only after Step 3 succeeds:

```bash
# On the dev machine — stop ngrok and remove it from startup
pkill ngrok
# Remove ngrok from ~/.bashrc / ~/.profile / systemd if you added it there
```

### Step 5 — Secure the .env on the server

```bash
chmod 600 /opt/whatsapp-bot/.env
# Verify it is NOT tracked by git
git -C /opt/whatsapp-bot ls-files .env  # must print nothing
```

### Rollback

If production has issues before Step 4:

1. Revert the Meta webhook URL back to the ngrok URL (App Dashboard → WhatsApp → Configuration)
2. Meta will instantly route traffic back to ngrok
3. Debug the new server without user impact
