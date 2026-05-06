'use strict';

// Express app — separated from server startup so tests can import it.

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { parseIntent } = require('./intentParser');
const { findProduct } = require('./db');
const { sendMessage } = require('./whatsapp');

const app = express();

// Capture raw body buffer for HMAC verification before JSON parsing
app.use(express.json({
	limit: '1mb',
	verify: (req, _res, buf) => { req.rawBody = buf; }
}));

/**
 * verifyMetaSignature
 * Returns true only if X-Hub-Signature-256 matches HMAC-SHA256(rawBody, APP_SECRET).
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifyMetaSignature(req) {
	const secret = process.env.WHATSAPP_APP_SECRET;
	if (!secret) return false;

	const sig = req.headers['x-hub-signature-256'];
	if (!sig || !sig.startsWith('sha256=')) return false;

	const expected = 'sha256=' + crypto
		.createHmac('sha256', secret)
		.update(req.rawBody)
		.digest('hex');

	if (sig.length !== expected.length) return false;

	return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// GET /webhook - Meta verification endpoint
app.get('/webhook', (req, res) => {
	try {
		const mode = req.query['hub.mode'];
		const token = req.query['hub.verify_token'];
		const challenge = req.query['hub.challenge'];
		if (mode === 'subscribe' && token && token === process.env.VERIFY_TOKEN) {
			return res.status(200).send(challenge);
		}
		return res.sendStatus(403);
	} catch (_err) {
		return res.sendStatus(403);
	}
});

const webhookLimiter = rateLimit({
	windowMs: 60_000,
	max: Number(process.env.RATE_LIMIT_MAX || 60),
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many requests, please try again later.' }
});

// POST /webhook - Handle incoming WhatsApp messages
app.post('/webhook', webhookLimiter, async (req, res) => {
	if (!verifyMetaSignature(req)) {
		return res.sendStatus(403);
	}

	// Acknowledge receipt immediately to comply with Meta's 5s rule
	res.sendStatus(200);

	try {
		const entry = req.body && req.body.entry && req.body.entry[0];
		const changes = entry && entry.changes && entry.changes[0];
		const value = changes && changes.value;
		const messages = value && value.messages;
		if (!messages || !Array.isArray(messages) || messages.length === 0) return;

		const msg = messages[0];
		if (!msg || msg.type !== 'text') return;

		const from = msg.from;
		const body = msg.text && msg.text.body ? String(msg.text.body) : '';
		if (!from || !body) return;

		const { intent, product } = parseIntent(body);
		if (!intent || !product) {
			const help = [
				'Hi! I can help with product prices and availability.',
				'Try asking:',
				'- What is the price of Widget A?',
				'- Do you have Gadget Pro in stock?'
			].join('\n');
			await sendMessage(from, help);
			return;
		}

		const found = await findProduct(product);
		if (!found) {
			const MAX_DISPLAY = 100;
			const display = product.length > MAX_DISPLAY ? product.slice(0, MAX_DISPLAY) + '…' : product;
			await sendMessage(from, `Sorry, I couldn't find any product matching "${display}".`);
			return;
		}

		if (intent === 'price') {
			const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(found.price);
			await sendMessage(from, `${found.name} costs ${price}.`);
			return;
		}

		if (intent === 'availability') {
			const statusMsg = found.stock > 0
				? `${found.name} is in stock with ${found.stock} units available.`
				: `${found.name} is currently out of stock.`;
			await sendMessage(from, statusMsg);
			return;
		}
	} catch (err) {
		console.error('Error handling webhook message:', err.message);
	}
});

module.exports = app;
