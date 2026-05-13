'use strict';

// TDD: per-sender session tracking for first-time greeting suppression

describe('session', () => {
	let session;

	beforeEach(() => {
		jest.resetModules();
		session = require('../session');
	});

	it('returns false for a number that has never messaged', () => {
		expect(session.hasBeenGreeted('355688000001')).toBe(false);
	});

	it('returns true after markGreeted is called', () => {
		session.markGreeted('355688000002');
		expect(session.hasBeenGreeted('355688000002')).toBe(true);
	});

	it('tracks each number independently', () => {
		session.markGreeted('355688000003');
		expect(session.hasBeenGreeted('355688000003')).toBe(true);
		expect(session.hasBeenGreeted('355688000004')).toBe(false);
	});

	it('is idempotent — marking twice stays true', () => {
		session.markGreeted('355688000005');
		session.markGreeted('355688000005');
		expect(session.hasBeenGreeted('355688000005')).toBe(true);
	});
});
