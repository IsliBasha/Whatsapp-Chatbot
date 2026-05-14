'use strict';

// Tests for admin HTTP endpoints (Ticket 4).
// POST /admin/reload  — bearer token auth, kicks runSync async, 202
// GET  /admin/sync-status — returns sync + db state, no token needed
// Both: fail-closed (503) if ADMIN_RELOAD_TOKEN is unset; 6-req/min limiter

jest.mock('../sync');
jest.mock('../db');

const request = require('supertest');

const VALID_TOKEN = 'test-admin-token-abc123';
const MOCK_STATUS = {
	lastSyncAt:       '2026-05-14T03:00:00.000Z',
	lastSyncRowCount: 3087,
	lastSyncError:    null,
};

function loadApp() {
	const syncMod = require('../sync');
	const dbMod   = require('../db');
	syncMod.runSync.mockResolvedValue(undefined);
	syncMod.getSyncStatus.mockReturnValue(MOCK_STATUS);
	dbMod.isReady.mockReturnValue(true);
	dbMod.productCount.mockReturnValue(3087);
	return require('../app');
}

// ── token configured ──────────────────────────────────────────────────────────

describe('admin routes — token configured', () => {
	let app;

	beforeEach(() => {
		jest.resetModules();
		process.env.ADMIN_RELOAD_TOKEN = VALID_TOKEN;
		app = loadApp();
	});

	afterEach(() => {
		delete process.env.ADMIN_RELOAD_TOKEN;
	});

	// ---- POST /admin/reload ----

	it('POST /admin/reload returns 202 with valid bearer token', async () => {
		const res = await request(app)
			.post('/admin/reload')
			.set('Authorization', `Bearer ${VALID_TOKEN}`);

		expect(res.status).toBe(202);
		expect(res.body.status).toBe('queued');
	});

	it('POST /admin/reload triggers runSync in the background', async () => {
		await request(app)
			.post('/admin/reload')
			.set('Authorization', `Bearer ${VALID_TOKEN}`);

		await new Promise(r => setImmediate(r));
		expect(require('../sync').runSync).toHaveBeenCalled();
	});

	it('POST /admin/reload returns 403 with wrong token', async () => {
		const res = await request(app)
			.post('/admin/reload')
			.set('Authorization', 'Bearer wrong-token');

		expect(res.status).toBe(403);
	});

	it('POST /admin/reload returns 403 with no Authorization header', async () => {
		const res = await request(app).post('/admin/reload');
		expect(res.status).toBe(403);
	});

	it('POST /admin/reload returns 403 with wrong auth scheme (Basic)', async () => {
		const res = await request(app)
			.post('/admin/reload')
			.set('Authorization', `Basic ${VALID_TOKEN}`);

		expect(res.status).toBe(403);
	});

	it('POST /admin/reload 403 body does not leak the real token', async () => {
		const res = await request(app)
			.post('/admin/reload')
			.set('Authorization', 'Bearer wrong-token');

		expect(JSON.stringify(res.body)).not.toContain(VALID_TOKEN);
	});

	it('POST /admin/reload does not call runSync on 403', async () => {
		await request(app)
			.post('/admin/reload')
			.set('Authorization', 'Bearer wrong-token');

		expect(require('../sync').runSync).not.toHaveBeenCalled();
	});

	// ---- GET /admin/sync-status ----

	it('GET /admin/sync-status returns 200 with correct shape', async () => {
		const res = await request(app).get('/admin/sync-status');

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			lastSyncAt:       MOCK_STATUS.lastSyncAt,
			lastSyncRowCount: MOCK_STATUS.lastSyncRowCount,
			lastSyncError:    null,
			isReady:          true,
			productCount:     3087,
		});
	});

	it('GET /admin/sync-status reflects current sync error when present', async () => {
		require('../sync').getSyncStatus.mockReturnValue({
			lastSyncAt:       null,
			lastSyncRowCount: null,
			lastSyncError:    'Odoo unreachable',
		});

		const res = await request(app).get('/admin/sync-status');

		expect(res.status).toBe(200);
		expect(res.body.lastSyncError).toBe('Odoo unreachable');
	});

	// ---- rate limiter ----

	it('POST /admin/reload returns 429 after 6 requests per minute', async () => {
		for (let i = 0; i < 6; i++) {
			await request(app)
				.post('/admin/reload')
				.set('Authorization', `Bearer ${VALID_TOKEN}`);
		}
		const res = await request(app)
			.post('/admin/reload')
			.set('Authorization', `Bearer ${VALID_TOKEN}`);

		expect(res.status).toBe(429);
	});

	it('GET /admin/sync-status returns 429 after 6 requests per minute', async () => {
		for (let i = 0; i < 6; i++) {
			await request(app).get('/admin/sync-status');
		}
		const res = await request(app).get('/admin/sync-status');

		expect(res.status).toBe(429);
	});
});

// ── token not configured (fail-closed) ───────────────────────────────────────

describe('admin routes — token not configured', () => {
	let app;

	beforeEach(() => {
		jest.resetModules();
		delete process.env.ADMIN_RELOAD_TOKEN;
		app = loadApp();
	});

	it('POST /admin/reload returns 503 when ADMIN_RELOAD_TOKEN is unset', async () => {
		const res = await request(app)
			.post('/admin/reload')
			.set('Authorization', `Bearer ${VALID_TOKEN}`);

		expect(res.status).toBe(503);
	});

	it('GET /admin/sync-status returns 503 when ADMIN_RELOAD_TOKEN is unset', async () => {
		const res = await request(app).get('/admin/sync-status');
		expect(res.status).toBe(503);
	});
});
