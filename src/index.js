'use strict';

// Server entrypoint — loads products then starts listening.
// Products are fully loaded before the first request can arrive.

const app = require('./app');
const { loadProducts } = require('./db');

async function start() {
	await loadProducts();
	const port = Number(process.env.PORT || 3000);
	app.listen(port, () => {
		console.log(`WhatsApp bot listening on port ${port}`);
	});
}

start().catch(err => {
	console.error('Failed to start server:', err.message);
	process.exit(1);
});
