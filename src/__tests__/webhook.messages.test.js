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
		mockFindProduct.mockResolvedValue(MOCK_PRODUCT);
		const body = makeWebhookBody('What is the price of Widget A?');

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('Widget A')
		);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('$29.99')
		);
	});

	it('returns 200 and sends in-stock message when product available', async () => {
		mockFindProduct.mockResolvedValue(MOCK_PRODUCT);
		const body = makeWebhookBody('Do you have Widget A in stock?');

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('150')
		);
	});

	it('returns 200 and sends out-of-stock message when stock is 0', async () => {
		mockFindProduct.mockResolvedValue({ name: 'Widget B', price: 49.99, stock: 0 });
		const body = makeWebhookBody('Is Widget B available?');

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('out of stock')
		);
	});

	it('returns 200 and sends not-found message when product does not exist', async () => {
		mockFindProduct.mockResolvedValue(null);
		const body = makeWebhookBody('What is the price of Nonexistent Thing?');

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining("couldn't find")
		);
	});

	it('sends help message when text has no recognisable intent', async () => {
		const body = makeWebhookBody('hello there');

		const res = await post(body);

		expect(res.status).toBe(200);
		expect(mockSendMessage).toHaveBeenCalledWith(
			'355688000000',
			expect.stringContaining('I can help')
		);
	});

	it('truncates reflected product name at 100 chars to prevent oversized replies', async () => {
		mockFindProduct.mockResolvedValue(null);
		const longName = 'A'.repeat(200);
		const body = makeWebhookBody(`price of ${longName}`);

		await post(body);

		const [, replyText] = mockSendMessage.mock.calls[0];
		expect(replyText.length).toBeLessThan(200);
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
