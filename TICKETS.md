# Live Data Sync + Production Deployment — Tickets

> Planned: 2026-05-06. Build when ready to move off local machine + ngrok.

---

## Ticket 1 — Refactor `db.js` for in-memory swap and reload `S`

**Goal:** Make the product catalogue swappable at runtime without a restart.

**Files:** `src/db.js`, `src/__tests__/db.test.js`

**Changes:**
- Add `swapProducts(newList)` — atomic pointer swap, updates `_ready`, `productCount`, `lastReloadedAt`
- Add `getLastReloadedAt()` — returns ISO timestamp of last successful load/swap
- `loadProducts()` becomes a thin wrapper: parse Excel → call `swapProducts(rows)`
- Guard: if `swapProducts` is called with empty array, preserve existing catalogue and log error

**Acceptance criteria:**
- [ ] `swapProducts` validates each item has `name` (string), `price` (number), `stock` (number) — filters invalid entries with warning
- [ ] Empty-input is rejected, existing catalogue preserved
- [ ] `getLastReloadedAt()` updates on every successful swap
- [ ] All 86 existing tests still pass
- [ ] New unit tests: successful swap, empty-input rejection, invalid-shape filtering

**Dependencies:** None

---

## Ticket 2 — Odoo XML-RPC client + product fetcher `M`

**Goal:** Pull live `product.template` data directly from Odoo over XML-RPC.

**Files:** `src/odoo.js` (new), `src/__tests__/odoo.test.js` (new), `.env.example`, `package.json`

**New env vars:**
```
ODOO_URL=https://your-odoo-instance.com
ODOO_DB=your-database-name
ODOO_USERNAME=your-user@email.com
ODOO_API_KEY=your-odoo-api-key
ODOO_FETCH_LIMIT=5000
```

**Changes:**
- Install `xmlrpc` package
- `fetchProductsFromOdoo()`:
  1. Authenticates via `/xmlrpc/2/common`
  2. Calls `search_read` on `product.template` with `['active','=',true]`
  3. Maps `list_price` → `price`, `qty_available` → `stock`
  4. 30s timeout, 3 retries with exponential backoff (1s/2s/4s)
- Validate all `ODOO_*` env vars at entry — throw descriptive errors, never log the API key

**Acceptance criteria:**
- [ ] Returns `{ name, price, stock }[]` matching existing db.js shape
- [ ] Auth failure throws, transport timeout throws, missing env throws
- [ ] Tests use mocked XML-RPC client — no real network calls in CI
- [ ] `.env.example` updated with all four vars + comment pointing to Odoo Settings → API Keys

**Dependencies:** None (parallel with Ticket 1)

---

## Ticket 3 — Sync orchestrator + daily scheduled refresh `M`

**Goal:** Wire Odoo fetch → atomic catalogue swap on a daily cron.

**Files:** `src/sync.js` (new), `src/scheduler.js` (new), `src/index.js`, `src/__tests__/sync.test.js` (new), `package.json`, `.env.example`

**New env vars:**
```
SYNC_ENABLED=true
SYNC_CRON=0 3 * * *   # 03:00 server time daily
MIN_VALID_ROWS=100     # abort sync if Odoo returns fewer rows than this
```

**Changes:**
- Install `node-cron`
- `runSync()` in `sync.js`:
  1. Calls `fetchProductsFromOdoo()`
  2. Aborts if result has fewer than `MIN_VALID_ROWS` (protects against wiping catalogue on bad fetch)
  3. Calls `swapProducts(rows)`
  4. Records `{ lastSyncAt, lastSyncRowCount, lastSyncError }` — exported via `getSyncStatus()`
  5. Never throws upward — errors logged and stored, old catalogue kept
  6. Overlap guard: if sync in progress, next tick logs warning and skips
- `scheduler.js` registers cron using `SYNC_CRON`
- `index.js` starts scheduler after `loadProducts()` if `SYNC_ENABLED !== 'false'`

**Acceptance criteria:**
- [ ] Happy path: Odoo fetch → swap → `lastSyncAt` updated
- [ ] Fetch failure: existing catalogue preserved, error stored in status
- [ ] Undersized response (`< MIN_VALID_ROWS`): refused, catalogue preserved
- [ ] Overlap guard prevents concurrent syncs
- [ ] `getSyncStatus()` returns `{ lastSyncAt, lastSyncRowCount, lastSyncError }`

**Dependencies:** Tickets 1 and 2

---

## Ticket 4 — Admin reload + sync-status HTTP endpoints `S`

**Goal:** Operator can trigger an immediate sync and inspect status without SSHing.

**Files:** `src/app.js`, `src/__tests__/admin.test.js` (new), `.env.example`

**New env var:**
```
ADMIN_RELOAD_TOKEN=your-secret-token
```

**Changes:**
- `POST /admin/reload` — bearer token auth (timing-safe), kicks off `runSync()` async, returns `202 { status: "queued" }`
- `GET /admin/sync-status` — returns `{ lastSyncAt, lastSyncRowCount, lastSyncError, isReady, productCount }`
- Both routes: separate rate limiter (6/min), fail-closed if `ADMIN_RELOAD_TOKEN` unset → 503
- Wrong/missing token → 403 with no detail

**Acceptance criteria:**
- [ ] Valid token → 202, sync triggered in background
- [ ] Invalid token → 403, no oracle
- [ ] Missing env → 503
- [ ] Status endpoint returns correct shape
- [ ] Rate limiter rejects > 6 req/min

**Dependencies:** Ticket 3

---

## Ticket 5 — PM2 process management `S`

**Goal:** Bot runs as a daemon, survives crashes and reboots, logs rotated.

**Files:** `ecosystem.config.js` (new), `package.json`, `deploy/README.md` (new)

**Changes:**
- `ecosystem.config.js`:
  - `instances: 1`, `exec_mode: 'fork'` (single instance required — in-memory catalogue would desync in cluster mode)
  - `max_memory_restart: '512M'`, `autorestart: true`, `watch: false`
  - `out_file`/`error_file` under `./logs/`
- `pm2-logrotate`: 10MB rotation, 14 retained files, daily
- `npm run start:prod` → `pm2 start ecosystem.config.js --env production`
- `deploy/README.md`: exact command sequence for Ubuntu 22.04 bootstrap, PM2 startup on boot

**Acceptance criteria:**
- [ ] `pm2 start ecosystem.config.js` starts bot successfully
- [ ] `pm2 save` + `pm2 startup systemd` survives reboot
- [ ] Log rotation configured and documented
- [ ] No app code changes required

**Dependencies:** None (parallel with Tickets 1-4)

---

## Ticket 6 — VPS provisioning + TLS + Meta webhook cutover `L`

**Goal:** Replace ngrok with a permanent HTTPS endpoint. Production goes live.

**Files:** `deploy/nginx.conf.example` (new), `deploy/README.md` (extend)

**Infrastructure:**
- Ubuntu 22.04 LTS VPS
- Nginx terminates TLS, proxies to `localhost:3000`
- Let's Encrypt + certbot with auto-renew
- `ufw`: only ports 22, 80, 443 open
- Admin routes (`/admin/*`) restricted to known IP at nginx level

**Nginx config adds:**
- `X-Forwarded-For` + `X-Forwarded-Proto` (keeps `trust proxy` working)
- Security headers: `HSTS`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`

**Cutover playbook:**
1. Deploy app + smoke-test `/health` and `POST /admin/reload`
2. Update Meta webhook URL in App Dashboard
3. Verify a test WhatsApp message gets a reply
4. Decommission ngrok
5. Rollback: revert webhook URL to old ngrok (keep it alive until confirmation)

**Acceptance criteria:**
- [ ] `https://bot.yourdomain.com/webhook` returns 200 to Meta verification
- [ ] TLS grade A (no mixed content, HSTS enabled)
- [ ] Send "Sa kushton Luna?" → receive correct Albanian price reply
- [ ] ngrok removed from startup scripts
- [ ] `.env` on server is `chmod 600`, not in git

**Dependencies:** Tickets 1–5 merged and green

---

## Build Order

```
Ticket 1 ──┐
            ├──► Ticket 3 ──► Ticket 4 ──► Ticket 6
Ticket 2 ──┘

Ticket 5 ──────────────────────────────► Ticket 6
```

Tickets 1–5 can ship to `main` incrementally with zero user-facing change (bot keeps loading from Excel until `SYNC_ENABLED=true` is set on the server). Ticket 6 is the single planned cutover event.
