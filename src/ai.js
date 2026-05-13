'use strict';

const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function getClient() {
	if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
	return _client;
}

const INTENT_SYSTEM = `You are a product assistant for an Albanian shop on WhatsApp.
Extract the customer's intent from their message (Albanian or English).

Reply ONLY with valid JSON on a single line:
{"intent":"price"|"availability"|"other","product":"exact product name or null"}

intent values:
- "price": customer is asking how much a product costs. ALSO use "price" when the customer sends just a product name or code with no explicit question (e.g. "tel 1.5", "llamp led 10w", "kabel 2.5") — assume they want the price.
- "availability": customer is asking if a product is in stock or available
- "other": greetings, general questions, or anything that is clearly NOT about a specific product

product: the exact product name or code they mentioned. Always extract it when a product is identifiable, even if no explicit question was asked. Return null only when intent is "other" and no product is mentioned.`;

async function parseIntentAI(text) {
	const msg = await getClient().messages.create({
		model: 'claude-haiku-4-5-20251001',
		max_tokens: 100,
		system: INTENT_SYSTEM,
		messages: [{ role: 'user', content: text }]
	});
	// Strip markdown code fences the model sometimes adds around JSON
	const raw = msg.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
	const parsed = JSON.parse(raw);
	return {
		intent: parsed.intent || null,
		product: parsed.product || null
	};
}

const CHAT_SYSTEM_FIRST = `You are a helpful WhatsApp product assistant for an Albanian shop.
Always reply in Albanian. Be brief and friendly — maximum 2 sentences.
Greet the user once and explain you can help with product prices and stock levels.
You can only help with product prices and availability.`;

const CHAT_SYSTEM_RETURNING = `You are a helpful WhatsApp product assistant for an Albanian shop.
Always reply in Albanian. Be brief — maximum 2 sentences. Do NOT greet or re-introduce yourself.
You can only help with product prices and availability.
For anything outside that scope, politely explain your limitations in Albanian.`;

async function generateResponse(userText, isFirstTime = false) {
	const msg = await getClient().messages.create({
		model: 'claude-haiku-4-5-20251001',
		max_tokens: 200,
		system: isFirstTime ? CHAT_SYSTEM_FIRST : CHAT_SYSTEM_RETURNING,
		messages: [{ role: 'user', content: userText }]
	});
	return msg.content[0].text.trim();
}

module.exports = { parseIntentAI, generateResponse };
