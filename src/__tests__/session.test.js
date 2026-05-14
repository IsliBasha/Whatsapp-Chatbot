'use strict';

// TDD: per-sender session tracking — greeting + pending clarification state

describe('session — greeting', () => {
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

describe('session — pending clarification', () => {
	let session;
	const PHONE = '355688999001';
	const CANDIDATES = [
		{ name: 'Llampe LED 8.5W', price: 100, stock: 50 },
		{ name: 'Llampe LED 12W',  price: 150, stock: 30 },
	];

	beforeEach(() => {
		jest.resetModules();
		session = require('../session');
	});

	it('returns null when no pending clarification exists', () => {
		expect(session.getPendingClarification(PHONE)).toBeNull();
	});

	it('stores and retrieves pending clarification', () => {
		session.setPendingClarification(PHONE, { candidates: CANDIDATES, intent: 'price' });
		const pending = session.getPendingClarification(PHONE);
		expect(pending).not.toBeNull();
		expect(pending.intent).toBe('price');
		expect(pending.candidates).toHaveLength(2);
	});

	it('clears pending clarification', () => {
		session.setPendingClarification(PHONE, { candidates: CANDIDATES, intent: 'price' });
		session.clearPendingClarification(PHONE);
		expect(session.getPendingClarification(PHONE)).toBeNull();
	});

	it('tracks pending independently per phone number', () => {
		const PHONE2 = '355688999002';
		session.setPendingClarification(PHONE, { candidates: CANDIDATES, intent: 'price' });
		expect(session.getPendingClarification(PHONE2)).toBeNull();
	});

	it('overwrites existing pending with new one', () => {
		session.setPendingClarification(PHONE, { candidates: CANDIDATES, intent: 'price' });
		session.setPendingClarification(PHONE, { candidates: CANDIDATES, intent: 'availability' });
		expect(session.getPendingClarification(PHONE).intent).toBe('availability');
	});
});
