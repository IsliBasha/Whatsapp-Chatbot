'use strict';

// Tests for Odoo XML-RPC client (Ticket 2).
// All tests use mocked xmlrpc — no real network calls in CI.
// jest.resetModules() in beforeEach gives each test a fresh module + mock state.

jest.mock('xmlrpc');

const VALID_ENV = {
	ODOO_URL: 'https://odoo.example.com',
	ODOO_DB: 'mydb',
	ODOO_USERNAME: 'admin@example.com',
	ODOO_API_KEY: 'apikey-123',
	ODOO_FETCH_LIMIT: '100',
};

function setEnv(overrides = {}) {
	clearEnv();
	const merged = { ...VALID_ENV, ...overrides };
	for (const [k, v] of Object.entries(merged)) {
		if (v !== undefined) process.env[k] = String(v);
	}
}

function clearEnv() {
	for (const k of Object.keys(VALID_ENV)) delete process.env[k];
}

const SAMPLE_ROWS = [
	{ name: 'Laptop Pro', list_price: 1200, qty_available: 10 },
	{ name: 'Mouse USB',  list_price: 15.5,  qty_available: 50 },
];

describe('odoo — fetchProductsFromOdoo', () => {
	let fetchProductsFromOdoo;
	let xmlrpcMock;
	let mockCommon;
	let mockObject;

	beforeEach(() => {
		// Fresh module registry each test so mock state never bleeds across tests
		jest.resetModules();
		clearEnv();

		// Require xmlrpc first so odoo.js gets the same cached mock instance
		xmlrpcMock = require('xmlrpc');
		mockCommon = { methodCall: jest.fn() };
		mockObject = { methodCall: jest.fn() };

		// createSecureClient/createClient are called in order: /common then /object
		xmlrpcMock.createSecureClient
			.mockReturnValueOnce(mockCommon)
			.mockReturnValueOnce(mockObject);
		xmlrpcMock.createClient
			.mockReturnValueOnce(mockCommon)
			.mockReturnValueOnce(mockObject);

		({ fetchProductsFromOdoo } = require('../odoo'));
	});

	afterEach(() => clearEnv());

	// ---- env validation ----

	it('throws if ODOO_URL is missing', async () => {
		setEnv({ ODOO_URL: undefined });
		await expect(fetchProductsFromOdoo()).rejects.toThrow(/ODOO_URL/);
	});

	it('throws if ODOO_DB is missing', async () => {
		setEnv({ ODOO_DB: undefined });
		await expect(fetchProductsFromOdoo()).rejects.toThrow(/ODOO_DB/);
	});

	it('throws if ODOO_USERNAME is missing', async () => {
		setEnv({ ODOO_USERNAME: undefined });
		await expect(fetchProductsFromOdoo()).rejects.toThrow(/ODOO_USERNAME/);
	});

	it('throws if ODOO_API_KEY is missing', async () => {
		setEnv({ ODOO_API_KEY: undefined });
		await expect(fetchProductsFromOdoo()).rejects.toThrow(/ODOO_API_KEY/);
	});

	// ---- happy path ----

	it('returns { name, price, stock }[] on success', async () => {
		setEnv();
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(null, 2));
		mockObject.methodCall.mockImplementation((m, p, cb) => cb(null, SAMPLE_ROWS));

		const result = await fetchProductsFromOdoo();
		expect(result).toEqual([
			{ name: 'Laptop Pro', price: 1200, stock: 10 },
			{ name: 'Mouse USB',  price: 15.5,  stock: 50 },
		]);
	});

	it('maps list_price → price and qty_available → stock', async () => {
		setEnv();
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(null, 1));
		mockObject.methodCall.mockImplementation((m, p, cb) =>
			cb(null, [{ name: 'Item', list_price: 42.5, qty_available: 7 }])
		);

		const [item] = await fetchProductsFromOdoo();
		expect(item.price).toBe(42.5);
		expect(item.stock).toBe(7);
		expect(item).not.toHaveProperty('list_price');
		expect(item).not.toHaveProperty('qty_available');
	});

	it('filters out products with missing or empty name', async () => {
		setEnv();
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(null, 1));
		mockObject.methodCall.mockImplementation((m, p, cb) =>
			cb(null, [
				{ name: 'Valid', list_price: 10, qty_available: 5 },
				{ name: '',      list_price: 10, qty_available: 5 },
				{ name: null,    list_price: 10, qty_available: 5 },
				{                list_price: 10, qty_available: 5 },
			])
		);

		const result = await fetchProductsFromOdoo();
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('Valid');
	});

	it('passes ODOO_FETCH_LIMIT as limit in search_read', async () => {
		setEnv({ ODOO_FETCH_LIMIT: '250' });
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(null, 1));

		let capturedParams;
		mockObject.methodCall.mockImplementation((m, p, cb) => {
			capturedParams = p;
			cb(null, []);
		});

		await fetchProductsFromOdoo();
		expect(JSON.stringify(capturedParams)).toContain('250');
	});

	// ---- auth failure ----

	it('throws when authentication returns false', async () => {
		setEnv();
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(null, false));
		await expect(fetchProductsFromOdoo()).rejects.toThrow(/auth/i);
	});

	it('throws when auth call itself errors', async () => {
		setEnv();
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(new Error('ECONNREFUSED')));
		await expect(fetchProductsFromOdoo()).rejects.toThrow();
	});

	// ---- search_read failure ----

	it('throws when search_read call errors', async () => {
		setEnv();
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(null, 1));
		mockObject.methodCall.mockImplementation((m, p, cb) => cb(new Error('Timeout')));
		await expect(fetchProductsFromOdoo()).rejects.toThrow();
	});

	// ---- security ----

	it('does not include ODOO_API_KEY in thrown error message', async () => {
		setEnv({ ODOO_API_KEY: 'SECRET_DO_NOT_LEAK' });
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(null, false));

		let caughtMessage = '';
		try { await fetchProductsFromOdoo(); } catch (e) { caughtMessage = e.message; }

		expect(caughtMessage).not.toContain('SECRET_DO_NOT_LEAK');
	});

	it('does not log ODOO_API_KEY to console', async () => {
		setEnv({ ODOO_API_KEY: 'SECRET_CONSOLE_KEY' });
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(null, false));

		const spies = ['error', 'log', 'warn'].map(m =>
			jest.spyOn(console, m).mockImplementation(() => {})
		);

		await fetchProductsFromOdoo().catch(() => {});

		const logged = spies.flatMap(s => s.mock.calls.flat()).join(' ');
		expect(logged).not.toContain('SECRET_CONSOLE_KEY');
		spies.forEach(s => s.mockRestore());
	});

	// ---- protocol selection ----

	it('uses createSecureClient for https:// URLs', async () => {
		setEnv({ ODOO_URL: 'https://odoo.example.com' });
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(null, 1));
		mockObject.methodCall.mockImplementation((m, p, cb) => cb(null, []));

		await fetchProductsFromOdoo();
		expect(xmlrpcMock.createSecureClient).toHaveBeenCalled();
		expect(xmlrpcMock.createClient).not.toHaveBeenCalled();
	});

	it('uses createClient for http:// URLs', async () => {
		setEnv({ ODOO_URL: 'http://odoo.local' });
		mockCommon.methodCall.mockImplementation((m, p, cb) => cb(null, 1));
		mockObject.methodCall.mockImplementation((m, p, cb) => cb(null, []));

		await fetchProductsFromOdoo();
		expect(xmlrpcMock.createClient).toHaveBeenCalled();
		expect(xmlrpcMock.createSecureClient).not.toHaveBeenCalled();
	});
});
