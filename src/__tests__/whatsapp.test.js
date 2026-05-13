'use strict';

// TDD: whatsapp.js must not log sensitive response data (phone numbers, message content).

const axios = require('axios');
jest.mock('axios');

const { sendMessage } = require('../whatsapp');

describe('sendMessage', () => {
	let errorSpy;

	beforeEach(() => {
		process.env.WHATSAPP_TOKEN = 'test-token';
		process.env.WHATSAPP_PHONE_ID = '123456';
		errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		jest.clearAllMocks();
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('sends the message payload to the Meta API', async () => {
		axios.post.mockResolvedValue({ data: {} });

		await sendMessage('355688000000', 'Hello');

		expect(axios.post).toHaveBeenCalledWith(
			expect.stringContaining('graph.facebook.com'),
			expect.objectContaining({ to: '355688000000' }),
			expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) })
		);
	});

	it('logs only status + error code on HTTP error — no full data or sensitive fields', async () => {
		axios.post.mockRejectedValue({
			response: {
				status: 400,
				data: {
					error: { code: 131030, message: 'Recipient phone number not in allowed list' },
					to: '355688000000',        // sensitive — must NOT appear in logs
					message_id: 'wamid.abc123' // sensitive — must NOT appear in logs
				}
			}
		});

		await sendMessage('355688000000', 'Hello');

		expect(errorSpy).toHaveBeenCalled();
		const logged = JSON.stringify(errorSpy.mock.calls);
		expect(logged).not.toContain('wamid.abc123');
		expect(logged).not.toContain('"to"');
		expect(logged).toContain('400'); // status code must be present for debugging
	});

	it('logs a plain message for network errors (no response object)', async () => {
		axios.post.mockRejectedValue(new Error('ECONNREFUSED'));

		await sendMessage('355688000000', 'Hello');

		expect(errorSpy).toHaveBeenCalled();
		const logged = JSON.stringify(errorSpy.mock.calls);
		expect(logged).toContain('ECONNREFUSED');
	});

	it('logs a warning and skips the API call when credentials are missing', async () => {
		delete process.env.WHATSAPP_TOKEN;

		await sendMessage('355688000000', 'Hello');

		expect(axios.post).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalled();
	});
});
