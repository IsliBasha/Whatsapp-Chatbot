'use strict';

// TDD: Meta webhook HMAC-SHA256 signature verification (CRITICAL security fix)
//
// User journey:
//   As an operator, I want all POST /webhook requests to be rejected unless
//   they carry a valid Meta HMAC-SHA256 signature, so that forged messages
//   cannot impersonate real users or drive outbound API calls.

const crypto = require('crypto');
const request = require('supertest');

// Prevent db.js from crashing when no PRODUCTS_FILE is present
jest.mock('../db', () => ({
	findProduct: jest.fn().mockResolvedValue(null),
	loadProducts: jest.fn()
}));

// Prevent outbound WhatsApp calls during tests
jest.mock('../whatsapp', () => ({
	sendMessage: jest.fn().mockResolvedValue(undefined)
}));

const APP_SECRET = 'test-app-secret-1234';

function validSignature(body, secret) {
	const payload = typeof body === 'string' ? body : JSON.stringify(body);
	return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('POST /webhook — Meta signature verification', () => {
	let app;

	beforeEach(() => {
		process.env.WHATSAPP_APP_SECRET = APP_SECRET;
		// Re-require app fresh for each test so env vars are picked up
		jest.resetModules();
		app = require('../app');
	});

	it('returns 403 when X-Hub-Signature-256 header is missing', async () => {
		const res = await request(app)
			.post('/webhook')
			.send({ entry: [] })
			.set('Content-Type', 'application/json');

		expect(res.status).toBe(403);
	});

	it('returns 403 when signature header is present but invalid', async () => {
		const body = { entry: [] };
		const res = await request(app)
			.post('/webhook')
			.send(body)
			.set('Content-Type', 'application/json')
			.set('X-Hub-Signature-256', 'sha256=badhash');

		expect(res.status).toBe(403);
	});

	it('returns 403 when signature is computed with the wrong secret', async () => {
		const body = { entry: [] };
		const wrongSig = validSignature(body, 'wrong-secret');

		const res = await request(app)
			.post('/webhook')
			.send(body)
			.set('Content-Type', 'application/json')
			.set('X-Hub-Signature-256', wrongSig);

		expect(res.status).toBe(403);
	});

	it('returns 200 when signature is valid', async () => {
		const body = { entry: [] };
		const sig = validSignature(body, APP_SECRET);

		const res = await request(app)
			.post('/webhook')
			.send(body)
			.set('Content-Type', 'application/json')
			.set('X-Hub-Signature-256', sig);

		expect(res.status).toBe(200);
	});

	it('returns 403 when WHATSAPP_APP_SECRET env var is not set', async () => {
		delete process.env.WHATSAPP_APP_SECRET;
		jest.resetModules();
		const appWithoutSecret = require('../app');

		const res = await request(appWithoutSecret)
			.post('/webhook')
			.send({ entry: [] })
			.set('Content-Type', 'application/json')
			.set('X-Hub-Signature-256', 'sha256=anything');

		expect(res.status).toBe(403);
	});

	it('does not affect GET /webhook verification endpoint', async () => {
		process.env.VERIFY_TOKEN = 'mytoken';
		jest.resetModules();
		const freshApp = require('../app');

		const res = await request(freshApp)
			.get('/webhook')
			.query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'mytoken', 'hub.challenge': 'abc123' });

		expect(res.status).toBe(200);
		expect(res.text).toBe('abc123');
	});
});
