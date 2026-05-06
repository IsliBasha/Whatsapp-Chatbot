'use strict';

// TDD: POST /webhook must return 429 after exceeding the per-IP rate limit.

const crypto = require('crypto');
const request = require('supertest');

jest.mock('../db', () => ({ findProduct: jest.fn().mockResolvedValue(null), loadProducts: jest.fn() }));
jest.mock('../whatsapp', () => ({ sendMessage: jest.fn().mockResolvedValue(undefined) }));

const SECRET = 'rate-limit-test-secret';

function sign(body) {
	const raw = JSON.stringify(body);
	return 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}

describe('POST /webhook — rate limiting', () => {
	beforeEach(() => {
		jest.resetModules();
		process.env.WHATSAPP_APP_SECRET = SECRET;
		process.env.RATE_LIMIT_MAX = '3'; // low cap for testing
	});

	it('returns 429 after exceeding RATE_LIMIT_MAX requests within the window', async () => {
		const app = require('../app');
		const body = { entry: [] };
		const sig = sign(body);
		const opts = { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig };

		// First three requests should succeed (or fail on sig/business logic, not rate limit)
		for (let i = 0; i < 3; i++) {
			const res = await request(app).post('/webhook').send(body).set(opts);
			expect(res.status).not.toBe(429);
		}

		// Fourth request must be rate-limited
		const res = await request(app).post('/webhook').send(body).set(opts);
		expect(res.status).toBe(429);
	});

	it('does not rate-limit GET /webhook', async () => {
		process.env.VERIFY_TOKEN = 'tok';
		const app = require('../app');

		for (let i = 0; i < 5; i++) {
			const res = await request(app)
				.get('/webhook')
				.query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': 'c' });
			expect(res.status).toBe(200);
		}
	});
});
