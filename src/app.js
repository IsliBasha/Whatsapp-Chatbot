'use strict';

// Express app factory — separated from server startup so tests can import it.

require('dotenv').config();
const express = require('express');
const { parseIntent } = require('./intentParser');
const { findProduct } = require('./db');
const { sendMessage } = require('./whatsapp');

const app = express();
app.use(express.json({ limit: '1mb' }));

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

// POST /webhook - Handle incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
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
			const msg = found.stock > 0
				? `${found.name} is in stock with ${found.stock} units available.`
				: `${found.name} is currently out of stock.`;
			await sendMessage(from, msg);
			return;
		}
	} catch (err) {
		console.error('Error handling webhook message:', err.message);
	}
});

module.exports = app;
