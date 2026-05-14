'use strict';

const { fetchProductsFromOdoo } = require('./odoo');
const { swapProducts }          = require('./db');

let _status = { lastSyncAt: null, lastSyncRowCount: null, lastSyncError: null };
let _syncing = false;

function getSyncStatus() {
	return { ..._status };
}

async function runSync() {
	if (_syncing) {
		console.warn('runSync: sync already in progress — skipping');
		return;
	}
	_syncing = true;

	const minValidRows = parseInt(process.env.MIN_VALID_ROWS || '100', 10);

	try {
		const rows = await fetchProductsFromOdoo();

		if (rows.length < minValidRows) {
			throw new Error(
				`Sync aborted: got ${rows.length} rows, minimum is ${minValidRows}`
			);
		}

		await swapProducts(rows);

		_status = {
			lastSyncAt:       new Date().toISOString(),
			lastSyncRowCount: rows.length,
			lastSyncError:    null,
		};
		console.log(`runSync: catalogue updated — ${rows.length} products`);
	} catch (err) {
		console.error(`runSync error: ${err.message}`);
		_status = { ..._status, lastSyncError: err.message };
	} finally {
		_syncing = false;
	}
}

module.exports = { runSync, getSyncStatus };
