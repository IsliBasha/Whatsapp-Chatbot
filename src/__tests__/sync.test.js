'use strict';

// Tests for sync orchestrator (Ticket 3).
// sync.js has module-level state (_status, _syncing), so jest.resetModules()
// in beforeEach gives each test a clean slate.

jest.mock('../odoo');
jest.mock('../db');
jest.mock('node-cron');
// Note: '../sync' is NOT globally mocked — sync tests run against the real module.
// Scheduler tests use jest.spyOn to intercept runSync after load.

function clearSyncEnv() {
	delete process.env.MIN_VALID_ROWS;
	delete process.env.SYNC_CRON;
	delete process.env.SYNC_ENABLED;
}

const ENOUGH_ROWS = Array.from({ length: 150 }, (_, i) => ({
	name: `Product ${i}`, price: i + 1, stock: i,
}));

// ── sync.js ──────────────────────────────────────────────────────────────────

describe('sync — runSync + getSyncStatus', () => {
	let runSync;
	let getSyncStatus;
	let fetchProductsFromOdoo;
	let swapProducts;

	beforeEach(() => {
		jest.resetModules();
		clearSyncEnv();

		fetchProductsFromOdoo = require('../odoo').fetchProductsFromOdoo;
		swapProducts          = require('../db').swapProducts;

		({ runSync, getSyncStatus } = require('../sync'));
	});

	afterEach(clearSyncEnv);

	// ---- initial state ----

	it('getSyncStatus returns all-null fields before any sync', () => {
		expect(getSyncStatus()).toEqual({
			lastSyncAt:       null,
			lastSyncRowCount: null,
			lastSyncError:    null,
		});
	});

	// ---- happy path ----

	it('calls swapProducts with fetched rows when count >= MIN_VALID_ROWS', async () => {
		process.env.MIN_VALID_ROWS = '100';
		fetchProductsFromOdoo.mockResolvedValue(ENOUGH_ROWS);
		swapProducts.mockResolvedValue(undefined);

		await runSync();

		expect(swapProducts).toHaveBeenCalledWith(ENOUGH_ROWS);
	});

	it('sets lastSyncAt, lastSyncRowCount, and clears lastSyncError on success', async () => {
		process.env.MIN_VALID_ROWS = '100';
		fetchProductsFromOdoo.mockResolvedValue(ENOUGH_ROWS);
		swapProducts.mockResolvedValue(undefined);

		const before = Date.now();
		await runSync();
		const after = Date.now();

		const status = getSyncStatus();
		expect(status.lastSyncError).toBeNull();
		expect(status.lastSyncRowCount).toBe(ENOUGH_ROWS.length);
		expect(typeof status.lastSyncAt).toBe('string');
		const ts = new Date(status.lastSyncAt).getTime();
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
	});

	it('getSyncStatus returns an immutable snapshot (not shared state)', async () => {
		process.env.MIN_VALID_ROWS = '100';
		fetchProductsFromOdoo.mockResolvedValue(ENOUGH_ROWS);
		swapProducts.mockResolvedValue(undefined);
		await runSync();

		const snap = getSyncStatus();
		snap.lastSyncRowCount = 9999;

		expect(getSyncStatus().lastSyncRowCount).toBe(ENOUGH_ROWS.length);
	});

	// ---- fetch failure ----

	it('does NOT call swapProducts when fetchProductsFromOdoo rejects', async () => {
		fetchProductsFromOdoo.mockRejectedValue(new Error('ECONNREFUSED'));

		await runSync();

		expect(swapProducts).not.toHaveBeenCalled();
	});

	it('stores the error message in lastSyncError when fetch fails', async () => {
		fetchProductsFromOdoo.mockRejectedValue(new Error('Network timeout'));

		await runSync();

		const status = getSyncStatus();
		expect(status.lastSyncError).toMatch(/Network timeout/);
		expect(status.lastSyncAt).toBeNull();
	});

	// ---- undersized response ----

	it('refuses response with fewer rows than MIN_VALID_ROWS', async () => {
		process.env.MIN_VALID_ROWS = '100';
		const tooFew = Array.from({ length: 50 }, (_, i) => ({ name: `P${i}`, price: 1, stock: 1 }));
		fetchProductsFromOdoo.mockResolvedValue(tooFew);

		await runSync();

		expect(swapProducts).not.toHaveBeenCalled();
		expect(getSyncStatus().lastSyncError).toMatch(/50|100|min/i);
	});

	it('accepts response with exactly MIN_VALID_ROWS rows', async () => {
		process.env.MIN_VALID_ROWS = '100';
		const exact = Array.from({ length: 100 }, (_, i) => ({ name: `P${i}`, price: 1, stock: 1 }));
		fetchProductsFromOdoo.mockResolvedValue(exact);
		swapProducts.mockResolvedValue(undefined);

		await runSync();

		expect(swapProducts).toHaveBeenCalled();
		expect(getSyncStatus().lastSyncError).toBeNull();
	});

	it('defaults MIN_VALID_ROWS to 100 when env var is not set', async () => {
		const tooFew = Array.from({ length: 99 }, (_, i) => ({ name: `P${i}`, price: 1, stock: 1 }));
		fetchProductsFromOdoo.mockResolvedValue(tooFew);

		await runSync();

		expect(swapProducts).not.toHaveBeenCalled();
		expect(getSyncStatus().lastSyncError).toBeTruthy();
	});

	// ---- overlap guard ----

	it('skips a concurrent runSync call while one is already in progress', async () => {
		process.env.MIN_VALID_ROWS = '100';
		let resolveFirst;
		fetchProductsFromOdoo.mockImplementationOnce(
			() => new Promise(res => { resolveFirst = res; })
		);

		const first = runSync(); // starts; suspends at fetchProductsFromOdoo
		await runSync();         // _syncing is true — should skip immediately

		resolveFirst(ENOUGH_ROWS);
		swapProducts.mockResolvedValue(undefined);
		await first;

		// fetchProductsFromOdoo called only once — second runSync bailed out
		expect(fetchProductsFromOdoo).toHaveBeenCalledTimes(1);
	});

	// ---- never throws upward ----

	it('never rejects even when fetchProductsFromOdoo throws', async () => {
		fetchProductsFromOdoo.mockRejectedValue(new Error('Catastrophic'));
		await expect(runSync()).resolves.toBeUndefined();
	});

	it('never rejects even when swapProducts throws', async () => {
		process.env.MIN_VALID_ROWS = '100';
		fetchProductsFromOdoo.mockResolvedValue(ENOUGH_ROWS);
		swapProducts.mockRejectedValue(new Error('DB blew up'));

		await expect(runSync()).resolves.toBeUndefined();
		expect(getSyncStatus().lastSyncError).toMatch(/DB blew up/);
	});
});

// ── scheduler.js ──────────────────────────────────────────────────────────────

describe('scheduler — startScheduler', () => {
	let startScheduler;
	let cron;
	let syncMod;

	beforeEach(() => {
		jest.resetModules();
		clearSyncEnv();

		cron    = require('node-cron');
		// Load sync before scheduler so they share the same module instance,
		// then spy so scheduler's closure calls the spy when cron fires.
		syncMod = require('../sync');
		jest.spyOn(syncMod, 'runSync').mockResolvedValue(undefined);

		({ startScheduler } = require('../scheduler'));
	});

	afterEach(clearSyncEnv);

	it('registers a cron task using SYNC_CRON env var', () => {
		process.env.SYNC_CRON = '0 3 * * *';
		startScheduler();
		expect(cron.schedule).toHaveBeenCalledWith('0 3 * * *', expect.any(Function));
	});

	it('uses a default schedule when SYNC_CRON is not set', () => {
		startScheduler();
		expect(cron.schedule).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
	});

	it('calls runSync when the cron fires', () => {
		process.env.SYNC_CRON = '0 3 * * *';
		startScheduler();
		const callback = cron.schedule.mock.calls[0][1];
		callback();
		expect(syncMod.runSync).toHaveBeenCalled();
	});
});
