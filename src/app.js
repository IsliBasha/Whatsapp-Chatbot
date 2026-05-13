'use strict';

// Express app — separated from server startup so tests can import it.

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { parseIntent } = require('./intentParser');
const { parseIntentAI, generateResponse } = require('./ai');
const { hasBeenGreeted, markGreeted } = require('./session');
const { findProduct, isReady, productCount } = require('./db');
const { sendMessage } = require('./whatsapp');

const app = express();

// Trust the first proxy hop (ngrok / reverse proxy) so express-rate-limit
// reads the real client IP from X-Forwarded-For instead of rejecting the header.
app.set('trust proxy', 1);

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

/**
 * verifyToken
 * Timing-safe comparison for the Meta webhook verify token.
 */
function verifyToken(provided, expected) {
	if (!provided || !expected) return false;
	if (provided.length !== expected.length) return false;
	return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

// GET /health - Readiness probe
app.get('/health', (_req, res) => {
	if (!isReady()) {
		return res.status(503).json({ status: 'unavailable', message: 'Product catalogue not loaded' });
	}
	res.json({ status: 'ok', products: productCount() });
});

// GET /webhook - Meta verification endpoint
app.get('/webhook', (req, res) => {
	try {
		const mode = req.query['hub.mode'];
		const token = req.query['hub.verify_token'];
		const challenge = req.query['hub.challenge'];
		if (mode === 'subscribe' && verifyToken(token, process.env.VERIFY_TOKEN)) {
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

		// AI parses intent from any phrasing; keyword parser is the error fallback
		let intent, product;
		try {
			({ intent, product } = await parseIntentAI(body));
		} catch (_aiErr) {
			console.error('AI parse failed:', _aiErr.message || _aiErr);
			({ intent, product } = parseIntent(body));
		}

		// If AI returned 'other' but still extracted a product name, treat as price query
		if (intent === 'other' && product) intent = 'price';

		// Greetings, general questions, or anything non-product → AI replies freely
		if (intent === 'other' || !intent || !product) {
			const firstTime = !hasBeenGreeted(from);
			markGreeted(from);
			let reply;
			try {
				reply = await generateResponse(body, firstTime);
			} catch (_err) {
				reply = firstTime
					? 'Përshëndetje! Mund t\'ju ndihmoj me çmimet dhe disponibilitetin e produkteve.\nProboni: Sa kushton Luna?'
					: 'Mund t\'ju ndihmoj me çmimet dhe disponibilitetin e produkteve.';
			}
			await sendMessage(from, reply);
			return;
		}
		markGreeted(from);

		const found = await findProduct(product);
		if (!found) {
			const MAX_DISPLAY = 100;
			const display = product.length > MAX_DISPLAY ? product.slice(0, MAX_DISPLAY) + '…' : product;
			await sendMessage(from, `Na vjen keq, nuk gjeta asnjë produkt që përputhet me "${display}".`);
			return;
		}

		if (intent === 'price') {
			const price = new Intl.NumberFormat('sq-AL', { style: 'currency', currency: 'ALL' }).format(found.price);
			await sendMessage(from, `${found.name} kushton ${price}.`);
			return;
		}

		if (intent === 'availability') {
			const statusMsg = found.stock > 0
				? `${found.name} është në magazinë me ${found.stock} njësi të disponueshme.`
				: `${found.name} aktualisht nuk është në stok.`;
			await sendMessage(from, statusMsg);
			return;
		}
	} catch (err) {
		console.error('Error handling webhook message:', err.message);
	}
});

module.exports = app;
