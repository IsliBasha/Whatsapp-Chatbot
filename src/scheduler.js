'use strict';

const cron = require('node-cron');
const sync = require('./sync'); // module ref so spies work in tests

const DEFAULT_CRON = '0 3 * * *';

function startScheduler() {
	const schedule = process.env.SYNC_CRON || DEFAULT_CRON;
	console.log(`Scheduler: registering daily sync — ${schedule}`);
	cron.schedule(schedule, () => { sync.runSync(); });
}

module.exports = { startScheduler };
