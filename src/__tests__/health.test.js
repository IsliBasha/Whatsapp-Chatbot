'use strict';

// TDD: /health endpoint + readiness flag + timing-safe VERIFY_TOKEN

const request = require('supertest');

const mockIsReady = jest.fn();
const mockProductCount = jest.fn();

jest.mock('../db', () => ({
	findProduct: jest.fn().mockResolvedValue(null),
	loadProducts: jest.fn().mockResolvedValue(undefined),
	isReady: (...args) => mockIsReady(...args),
	productCount: (...args) => mockProductCount(...args)
}));

jest.mock('../whatsapp', () => ({ sendMessage: jest.fn().mockResolvedValue(undefined) }));

describe('GET /health', () => {
	let app;

	beforeEach(() => {
		jest.resetModules();
		app = require('../app');
	});

	it('returns 503 when products are not yet loaded', async () => {
		mockIsReady.mockReturnValue(false);
		mockProductCount.mockReturnValue(0);

		const res = await request(app).get('/health');

		expect(res.status).toBe(503);
		expect(res.body.status).toBe('unavailable');
	});

	it('returns 200 with product count when products are loaded', async () => {
		mockIsReady.mockReturnValue(true);
		mockProductCount.mockReturnValue(3087);

		const res = await request(app).get('/health');

		expect(res.status).toBe(200);
		expect(res.body.status).toBe('ok');
		expect(res.body.products).toBe(3087);
	});
});

describe('GET /webhook — timing-safe VERIFY_TOKEN comparison', () => {
	let app;

	beforeEach(() => {
		jest.resetModules();
		process.env.VERIFY_TOKEN = 'secret-verify-token';
		app = require('../app');
	});

	it('accepts a matching verify token', async () => {
		const res = await request(app)
			.get('/webhook')
			.query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'secret-verify-token', 'hub.challenge': 'xyz' });

		expect(res.status).toBe(200);
		expect(res.text).toBe('xyz');
	});

	it('rejects a non-matching verify token', async () => {
		const res = await request(app)
			.get('/webhook')
			.query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'xyz' });

		expect(res.status).toBe(403);
	});

	it('rejects when verify token is missing', async () => {
		const res = await request(app)
			.get('/webhook')
			.query({ 'hub.mode': 'subscribe', 'hub.challenge': 'xyz' });

		expect(res.status).toBe(403);
	});
});

