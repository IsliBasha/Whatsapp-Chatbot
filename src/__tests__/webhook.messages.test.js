'use strict';

// Tests for webhook message handling paths (price, availability, help, not-found)

const crypto = require('crypto');
const request = require('supertest');

const APP_SECRET = 'test-secret';
const MOCK_PRODUCT = { name: 'Widget A', price: 29.99, stock: 150 };

const mockFindProduct = jest.fn();
jest.mock('../db', () => ({
	findProduct: (...args) => mockFindProduct(...args),
	loadProducts: jest.fn()
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

jest.mock('../session', () => {
	const greeted = new Set();
	return {
		hasBeenGreeted: (p) => greeted.has(p),
		markGreeted: (p) => greeted.add(p)
	};
});

function sign(body, secret = APP_SECRET) {
	const raw = typeof body === 'string' ? body : JSON.stringify(body);
	return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

function makeWebhookBody(messageText, from = '355688000000') {
	return {
		entry: [{
			changes: [{
				value: {
					messages: [{
						type: 'text',
						from,
						text: { body: messageText }
					}]
				}
			}]
		}]
	};
}

describe('POST /webhook — message handling', () => {
	let app;

	beforeEach(() => {
		jest.resetModules();
		process.env.WHATSAPP_APP_SECRET = APP_SECRET;
		mockFindProduct.mockReset();
		mockSendMessage.mockClear();
		mockParseIntentAI.mockReset();
		mockGenerateResponse.mockReset();
		app = require('../app');
	});

	async function post(body) {
		const sig = sign(body);
		return request(app)
			.post('/webhook')
			.send(body)
			.set('Content-Type', 'application/json')
			.set('X-Hub-Signature-256', sig);
	}

	it('returns 200 and sends price when product found and intent is price', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'Widget A' });
		mockFindProduct.mockResolvedValue(MOCK_PRODUCT);
		const body = makeWebhookBody('Sa kushton Widget A?');

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('Widget A')
		);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('kushton')
		);
	});

	it('returns 200 and sends in-stock message when product available', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'availability', product: 'Widget A' });
		mockFindProduct.mockResolvedValue(MOCK_PRODUCT);
		const body = makeWebhookBody('Keni Widget A?');

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('150')
		);
	});

	it('returns 200 and sends out-of-stock message when stock is 0', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'availability', product: 'Widget B' });
		mockFindProduct.mockResolvedValue({ name: 'Widget B', price: 49.99, stock: 0 });
		const body = makeWebhookBody('A keni Widget B?');

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('stok')
		);
	});

	it('returns 200 and sends not-found message when product does not exist', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: 'Nonexistent Thing' });
		mockFindProduct.mockResolvedValue(null);
		const body = makeWebhookBody('Sa kushton Nonexistent Thing?');

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('nuk gjeta')
		);
	});

	it('sends AI-generated reply when intent is other', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'other', product: null });
		mockGenerateResponse.mockResolvedValue('Mirë se vini! Mund t\'ju ndihmoj me çmimet.');
		const body = makeWebhookBody('Përshëndetje!');

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('ndihmoj')
		);
	});

	it('passes isFirstTime=true on first contact, false on subsequent', async () => {
		mockParseIntentAI.mockResolvedValue({ intent: 'other', product: null });
		mockGenerateResponse.mockResolvedValue('Ok');
		const FROM = '355688111111';

		await post(makeWebhookBody('Përshëndetje!', FROM));
		expect(mockGenerateResponse).toHaveBeenLastCalledWith('Përshëndetje!', true);

		mockGenerateResponse.mockClear();
		await post(makeWebhookBody('Çfarë bëni?', FROM));
		expect(mockGenerateResponse).toHaveBeenLastCalledWith('Çfarë bëni?', false);
	});

	it('falls back to keyword parser when AI throws', async () => {
		mockParseIntentAI.mockRejectedValue(new Error('API down'));
		mockGenerateResponse.mockResolvedValue('Ndihmë');
		const body = makeWebhookBody('hello');

		const res = await post(body);

		expect(res.status).toBe(200);
		// keyword parser returns null intent for 'hello' → AI generates response
		expect(mockSendMessage).toHaveBeenCalled();
	});

	it('truncates reflected product name at 100 chars to prevent oversized replies', async () => {
		const longName = 'A'.repeat(200);
		mockParseIntentAI.mockResolvedValue({ intent: 'price', product: longName });
		mockFindProduct.mockResolvedValue(null);
		const body = makeWebhookBody(`price of ${longName}`);

		await post(body);

		const [, replyText] = mockSendMessage.mock.calls[0];
		expect(replyText.length).toBeLessThan(250);
	});

	it('ignores non-text message types silently', async () => {
		const body = {
			entry: [{
				changes: [{
					value: {
						messages: [{ type: 'image', from: '355688000000' }]
					}
				}]
			}]
		};

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it('returns 200 with empty entry and sends no message', async () => {
		const body = { entry: [] };
		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).not.toHaveBeenCalled();
	});
});
