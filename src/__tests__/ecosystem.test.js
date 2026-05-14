'use strict';

// Structural tests for PM2 ecosystem config (Ticket 5).
// Validates required fields before the bot is deployed with PM2.

describe('ecosystem.config.js — PM2 config structure', () => {
	let cfg;
	let app;

	beforeAll(() => {
		cfg = require('../../ecosystem.config');
		app = cfg.apps[0];
	});

	it('exports an apps array with exactly one entry', () => {
		expect(Array.isArray(cfg.apps)).toBe(true);
		expect(cfg.apps).toHaveLength(1);
	});

	it('has a non-empty name', () => {
		expect(typeof app.name).toBe('string');
		expect(app.name.length).toBeGreaterThan(0);
	});

	it('points script at src/index.js', () => {
		expect(app.script).toBe('src/index.js');
	});

	// Single instance required — in-memory catalogue would desync in cluster mode
	it('uses fork exec_mode (not cluster)', () => {
		expect(app.exec_mode).toBe('fork');
	});

	it('sets instances to 1', () => {
		expect(app.instances).toBe(1);
	});

	it('enables autorestart', () => {
		expect(app.autorestart).toBe(true);
	});

	it('disables watch mode', () => {
		expect(app.watch).toBe(false);
	});

	it('sets max_memory_restart to 512M', () => {
		expect(app.max_memory_restart).toBe('512M');
	});

	it('writes stdout logs under ./logs/', () => {
		expect(app.out_file).toMatch(/^\.\/logs\//);
	});

	it('writes stderr logs under ./logs/', () => {
		expect(app.error_file).toMatch(/^\.\/logs\//);
	});

	it('exposes a production env block', () => {
		expect(app.env_production).toBeDefined();
		expect(app.env_production.NODE_ENV).toBe('production');
	});
});
