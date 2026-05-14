'use strict';

require('dotenv').config();
const xmlrpc = require('xmlrpc');

const FIELDS = ['name', 'list_price', 'qty_available'];
const REQUIRED_VARS = ['ODOO_URL', 'ODOO_DB', 'ODOO_USERNAME', 'ODOO_API_KEY'];

function getConfig() {
	for (const key of REQUIRED_VARS) {
		if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
	}
	return {
		url:        process.env.ODOO_URL,
		db:         process.env.ODOO_DB,
		username:   process.env.ODOO_USERNAME,
		apiKey:     process.env.ODOO_API_KEY,
		fetchLimit: parseInt(process.env.ODOO_FETCH_LIMIT || '5000', 10),
	};
}

function createClient(baseUrl, path) {
	const parsed = new URL(baseUrl);
	const isHttps = parsed.protocol === 'https:';
	const defaultPort = isHttps ? 443 : 80;
	const port = parsed.port ? parseInt(parsed.port, 10) : defaultPort;
	const opts = { host: parsed.hostname, port, path };
	return isHttps ? xmlrpc.createSecureClient(opts) : xmlrpc.createClient(opts);
}

function call(client, method, params) {
	return new Promise((resolve, reject) => {
		client.methodCall(method, params, (err, val) => {
			if (err) reject(err);
			else resolve(val);
		});
	});
}

async function fetchProductsFromOdoo() {
	const { url, db, username, apiKey, fetchLimit } = getConfig();

	const commonClient = createClient(url, '/xmlrpc/2/common');
	const objectClient = createClient(url, '/xmlrpc/2/object');

	const uid = await call(commonClient, 'authenticate', [db, username, apiKey, {}]);
	if (!uid) throw new Error('Odoo authentication failed — check ODOO_USERNAME and ODOO_API_KEY');

	const rows = await call(objectClient, 'execute_kw', [
		db, uid, apiKey,
		'product.template', 'search_read',
		[[['active', '=', true]]],
		{ fields: FIELDS, limit: fetchLimit },
	]);

	return rows
		.filter(r => r.name && typeof r.name === 'string' && r.name.trim())
		.map(r => ({
			name:  r.name.trim(),
			price: Number(r.list_price) || 0,
			stock: Number(r.qty_available) || 0,
		}));
}

module.exports = { fetchProductsFromOdoo };
