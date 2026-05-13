'use strict';

// TDD: AI intent parsing and response generation via Anthropic SDK

let mockCreate;

jest.mock('@anthropic-ai/sdk', () => {
	mockCreate = jest.fn();
	return jest.fn().mockImplementation(() => ({
		messages: { create: mockCreate }
	}));
});

const { parseIntentAI, generateResponse } = require('../ai');

function claudeReply(text) {
	return { content: [{ text }] };
}

describe('parseIntentAI', () => {
	beforeEach(() => mockCreate.mockReset());

	it('returns price intent for a price question', async () => {
		mockCreate.mockResolvedValue(claudeReply('{"intent":"price","product":"Luna"}'));
		const result = await parseIntentAI('Sa kushton Luna?');
		expect(result).toEqual({ intent: 'price', product: 'Luna' });
	});

	it('returns availability intent for a stock question', async () => {
		mockCreate.mockResolvedValue(claudeReply('{"intent":"availability","product":"ABC Qafore"}'));
		const result = await parseIntentAI('A keni ABC Qafore?');
		expect(result).toEqual({ intent: 'availability', product: 'ABC Qafore' });
	});

	it('returns other intent with null product for a greeting', async () => {
		mockCreate.mockResolvedValue(claudeReply('{"intent":"other","product":null}'));
		const result = await parseIntentAI('Përshëndetje!');
		expect(result).toEqual({ intent: 'other', product: null });
	});

	it('calls claude-haiku model with the user text', async () => {
		mockCreate.mockResolvedValue(claudeReply('{"intent":"other","product":null}'));
		await parseIntentAI('some message');
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: 'claude-haiku-4-5-20251001',
				messages: [{ role: 'user', content: 'some message' }]
			})
		);
	});

	it('throws when Claude returns invalid JSON', async () => {
		mockCreate.mockResolvedValue(claudeReply('not json at all'));
		await expect(parseIntentAI('test')).rejects.toThrow();
	});

	it('propagates API errors', async () => {
		mockCreate.mockRejectedValue(new Error('API error'));
		await expect(parseIntentAI('test')).rejects.toThrow('API error');
	});
});

describe('generateResponse', () => {
	beforeEach(() => mockCreate.mockReset());

	it('returns the text Claude produces', async () => {
		mockCreate.mockResolvedValue(claudeReply('Mirë se vini! Mund t\'ju ndihmoj me çmimet.'));
		const result = await generateResponse('Përshëndetje');
		expect(result).toBe('Mirë se vini! Mund t\'ju ndihmoj me çmimet.');
	});

	it('uses first-time system prompt when isFirstTime is true', async () => {
		mockCreate.mockResolvedValue(claudeReply('Mirë se vini!'));
		await generateResponse('Përshëndetje', true);
		const call = mockCreate.mock.calls[0][0];
		expect(call.system).toMatch(/greet/i);
	});

	it('uses returning system prompt when isFirstTime is false', async () => {
		mockCreate.mockResolvedValue(claudeReply('Si mund t\'ju ndihmoj?'));
		await generateResponse('Çfarë bëni?', false);
		const call = mockCreate.mock.calls[0][0];
		expect(call.system).toMatch(/do not greet/i);
	});

	it('defaults to returning (non-greeting) system prompt', async () => {
		mockCreate.mockResolvedValue(claudeReply('Ok'));
		await generateResponse('random question');
		const call = mockCreate.mock.calls[0][0];
		expect(call.system).toMatch(/do not greet/i);
	});
});
