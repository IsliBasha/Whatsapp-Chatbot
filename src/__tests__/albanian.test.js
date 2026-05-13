'use strict';

// TDD: Albanian language support — keywords and response messages

const crypto = require('crypto');
const request = require('supertest');
const { parseIntent } = require('../intentParser');

// ─── Intent parser — Albanian keywords ────────────────────────────────────────

describe('parseIntent — Albanian price keywords', () => {
	it('detects price intent from "sa kushton"', () => {
		expect(parseIntent('Sa kushton Luna?').intent).toBe('price');
	});

	it('detects price intent from "çmimi"', () => {
		expect(parseIntent('Çmimi i Luna?').intent).toBe('price');
	});

	it('detects price intent from "çmim"', () => {
		expect(parseIntent('Çmim për ABC Qafore').intent).toBe('price');
	});

	it('detects price intent from "sa bën"', () => {
		expect(parseIntent('Sa bën Gadget Pro?').intent).toBe('price');
	});
});

describe('parseIntent — Albanian availability keywords', () => {
	it('detects availability from "keni"', () => {
		expect(parseIntent('Keni Luna në magazinë?').intent).toBe('availability');
	});

	it('detects availability from "a keni"', () => {
		expect(parseIntent('A keni ABC Qafore?').intent).toBe('availability');
	});

	it('detects availability from "gjendje"', () => {
		expect(parseIntent('Gjendje e Luna?').intent).toBe('availability');
	});

	it('detects availability from "magazinë"', () => {
		expect(parseIntent('Ka në magazinë ABC?').intent).toBe('availability');
	});

	it('detects availability from "stok"', () => {
		expect(parseIntent('Stoku i Gadget Pro?').intent).toBe('availability');
	});
});

// ─── Response messages — Albanian ─────────────────────────────────────────────

const mockFindProduct = jest.fn();
jest.mock('../db', () => ({
	findProduct: (...args) => mockFindProduct(...args),
	loadProducts: jest.fn(),
	isReady: jest.fn().mockReturnValue(true),
	productCount: jest.fn().mockReturnValue(10)
}));

const mockSendMessage = jest.fn().mockResolvedValue(undefined);
jest.mock('../whatsapp', () => ({
	sendMessage: (...args) => mockSendMessage(...args)
}));

const mockParseIntentAI = jest.fn();
const mockGenerateResponse = jest.fn();
jest.mock('../ai', () => ({
	parseIntentAI: (...args) => mockParseIntentAI(...args),
	generateResponse: (...args) => mockGenerateResponse(...args)
}));

const APP_SECRET = 'test-secret';

function sign(body) {
	const raw = JSON.stringify(body);
	return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');
}

function makeWebhookBody(text, from = '355688217399') {
	return {
		entry: [{ changes: [{ value: { messages: [{ type: 'text', from, text: { body: text } }] } }] }]
	};
}

describe('Bot responses — Albanian language', () => {
	let app;

	beforeEach(() => {
		jest.resetModules();
		process.env.WHATSAPP_APP_SECRET = APP_SECRET;
		process.env.RATE_LIMIT_MAX = '100';
		mockFindProduct.mockReset();
		mockSendMessage.mockClear();
		mockParseIntentAI.mockReset();
		mockGenerateResponse.mockReset();
		app = require('../app');
	});

	async function post(body) {
		return request(app)
			.post('/webhook')
			.send(body)
			.set('Content-Type', 'application/json')
			.set('X-Hub-Signature-256', sign(body));
	}

	it('sends price reply in Albanian', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'Luna' });
		mockFindProduct.mockResolvedValue({ name: 'B-Luna', price: 100, stock: 1000 });
		await post(makeWebhookBody('Sa kushton Luna?'));

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/kushton/i);
		expect(reply).toContain('B-Luna');
	});

	it('sends in-stock reply in Albanian', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'availability', product: 'Luna' });
		mockFindProduct.mockResolvedValue({ name: 'B-Luna', price: 100, stock: 1000 });
		await post(makeWebhookBody('Keni Luna në magazinë?'));

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/magazinë|gjendje|disponib/i);
	});

	it('sends out-of-stock reply in Albanian', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'availability', product: 'Widget B' });
		mockFindProduct.mockResolvedValue({ name: 'Widget B', price: 50, stock: 0 });
		await post(makeWebhookBody('Keni Widget B?'));

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/stok|magazinë|disponib/i);
	});

	it('sends not-found reply in Albanian', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'Produkti XYZ' });
		mockFindProduct.mockResolvedValue(null);
		await post(makeWebhookBody('Sa kushton Produkti XYZ?'));

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/nuk|nuku/i);
	});

	it('sends AI-generated Albanian reply for greetings', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'other', product: null });
		mockGenerateResponse.mockResolvedValue('Mirë se vini! Mund t\'ju ndihmoj me çmimet dhe disponibilitetin.');
		await post(makeWebhookBody('pershendetje'));

		const [, reply] = mockSendMessage.mock.calls[0];
		expect(reply).toMatch(/ndihmoj|ndihmë|çmim/i);
	});
});
