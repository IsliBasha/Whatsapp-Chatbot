'use strict';

// Tests for the multi-result clarification flow (logic calibration).
//
// Flow:
//   1. User sends ambiguous query ("llamp") → bot finds multiple candidates
//      → sends list → stores pending { candidates, intent } in session
//   2. User replies with a product name → bot matches against stored candidates
//      → sends price/availability for the match → clears pending
//   3. If reply doesn't match any candidate → clear pending, treat as fresh query

const crypto = require('crypto');
const request = require('supertest');

const APP_SECRET = 'test-secret-clar';

const CANDIDATES = [
	{ name: 'Llampe LED 8.5W VTAC',  price: 100, stock: 50 },
	{ name: 'Llampe LED 12W VTAC',   price: 150, stock: 30 },
	{ name: 'Llampe Neon 20W',        price: 200, stock: 0  },
];

// ── db mock ───────────────────────────────────────────────────────────────────

const mockFindCandidates = jest.fn();
jest.mock('../db', () => ({
	findCandidates:  (...args) => mockFindCandidates(...args),
	isReady:         jest.fn().mockReturnValue(true),
	productCount:    jest.fn().mockReturnValue(3000),
	loadProducts:    jest.fn(),
}));

// ── whatsapp mock ─────────────────────────────────────────────────────────────

const mockSendMessage = jest.fn().mockResolvedValue(undefined);
jest.mock('../whatsapp', () => ({ sendMessage: (...args) => mockSendMessage(...args) }));

// ── AI mock ───────────────────────────────────────────────────────────────────

const mockParseIntentAI = jest.fn();
const mockGenerateResponse = jest.fn().mockResolvedValue('OK');
jest.mock('../ai', () => ({
	parseIntentAI:    (...args) => mockParseIntentAI(...args),
	generateResponse: (...args) => mockGenerateResponse(...args),
}));

// ── sync mock ─────────────────────────────────────────────────────────────────

jest.mock('../sync', () => ({
	runSync:       jest.fn(),
	getSyncStatus: jest.fn().mockReturnValue({ lastSyncAt: null, lastSyncRowCount: null, lastSyncError: null }),
}));

// ── session mock — stateful within each test ──────────────────────────────────

jest.mock('../session', () => {
	const greeted = new Set();
	const pending = new Map();
	return {
		hasBeenGreeted:           (p) => greeted.has(p),
		markGreeted:              (p) => greeted.add(p),
		getPendingClarification:  (p) => pending.get(p) || null,
		setPendingClarification:  (p, d) => pending.set(p, d),
		clearPendingClarification:(p) => pending.delete(p),
	};
});

// ── helpers ───────────────────────────────────────────────────────────────────

function sign(body) {
	const raw = typeof body === 'string' ? body : JSON.stringify(body);
	return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');
}

function makeWebhookBody(text, from = '355688000100') {
	return {
		entry: [{
			changes: [{
				value: {
					messages: [{ type: 'text', from, text: { body: text } }]
				}
			}]
		}]
	};
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('clarification flow', () => {
	let app;

	beforeEach(() => {
		jest.resetModules();
		process.env.WHATSAPP_APP_SECRET = APP_SECRET;
		mockFindCandidates.mockReset();
		mockSendMessage.mockClear();
		mockParseIntentAI.mockReset();
		app = require('../app');
	});

	async function post(text, from = '355688000100') {
		const b = makeWebhookBody(text, from);
		return request(app)
			.post('/webhook')
			.send(b)
			.set('Content-Type', 'application/json')
			.set('X-Hub-Signature-256', sign(b));
	}

	// ── multiple candidates → list shown ─────────────────────────────────────

	it('sends a list of product names when multiple candidates found', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'llampe' });
		mockFindCandidates.mockResolvedValue(CANDIDATES);

		await post('sa kushton llampe');

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/Llampe LED 8\.5W/);
		expect(reply).toMatch(/Llampe LED 12W/);
		expect(reply).toMatch(/Llampe Neon/);
	});

	it('reply contains clarification prompt when multiple candidates', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'llampe' });
		mockFindCandidates.mockResolvedValue(CANDIDATES);

		await post('sa kushton llampe');

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/[Cc]ili/);
	});

	// ── user selects from list (price) ────────────────────────────────────────

	it('returns price when user picks a product by name after clarification', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'llampe' });
		mockFindCandidates.mockResolvedValue(CANDIDATES);
		await post('sa kushton llampe');

		mockSendMessage.mockClear();
		mockParseIntentAI.mockReset();

		await post('Llampe LED 12W VTAC');

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/Llampe LED 12W VTAC/);
		expect(reply).toMatch(/kushton/);
	});

	// ── user selects from list (availability) ─────────────────────────────────

	it('returns availability when intent was availability and user picks', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'availability', product: 'llampe' });
		mockFindCandidates.mockResolvedValue(CANDIDATES);
		await post('a keni llampe');

		mockSendMessage.mockClear();
		mockParseIntentAI.mockReset();

		await post('Llampe Neon 20W');

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/Llampe Neon/);
		expect(reply).toMatch(/stok/);
	});

	// ── reply clears pending after match ──────────────────────────────────────

	it('clears pending after successful selection so next message is a fresh query', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'llampe' });
		mockFindCandidates.mockResolvedValue(CANDIDATES);
		await post('sa kushton llampe');
		mockSendMessage.mockClear();

		await post('Llampe LED 8.5W VTAC');
		mockSendMessage.mockClear();

		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'tel' });
		mockFindCandidates.mockResolvedValue([{ name: 'Tel 1x1.5', price: 25, stock: 100 }]);
		await post('sa kushton tel');

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/Tel 1x1\.5/);
		expect(reply).toMatch(/kushton/);
	});

	// ── unmatched reply → fresh query ─────────────────────────────────────────

	it('treats unmatched reply as fresh query and clears pending', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'llampe' });
		mockFindCandidates.mockResolvedValue(CANDIDATES);
		await post('sa kushton llampe');

		mockSendMessage.mockClear();
		mockParseIntentAI.mockResolvedValue({ intent: 'other', product: null });
		mockFindCandidates.mockResolvedValue([]);

		await post('makina bmw');

		expect(mockSendMessage).toHaveBeenCalled();
		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).not.toMatch(/Llampe/);
	});

	// ── single result → no clarification ─────────────────────────────────────

	it('answers directly when only one candidate found', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'Tel 1x1.5' });
		mockFindCandidates.mockResolvedValue([{ name: 'Tel 1x1.5 mm Cu', price: 25, stock: 100 }]);

		await post('sa kushton tel 1.5');

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/Tel 1x1\.5 mm Cu/);
		expect(reply).toMatch(/kushton/);
		expect(reply).not.toMatch(/[Cc]ili/);
	});

	// ── zero results → not-found ──────────────────────────────────────────────

	it('sends not-found message when no candidates match', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'gjëra imagjinare' });
		mockFindCandidates.mockResolvedValue([]);

		await post('sa kushton gjëra imagjinare');

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/nuk gjeta/i);
	});
});
