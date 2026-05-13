'use strict';

// Send messages via Meta WhatsApp Cloud API (v19.0).

const axios = require('axios');

/**
 * sendMessage
 * Sends a plain-text message to a WhatsApp number via Meta's Cloud API.
 *
 * @param {string} to - Recipient phone number in international format.
 * @param {string} text - Message body.
 * @returns {Promise<void>}
 */
async function sendMessage(to, text) {
	const token = process.env.WHATSAPP_TOKEN;
	const phoneId = process.env.WHATSAPP_PHONE_ID;

	if (!token || !phoneId) {
		console.error('sendMessage: WHATSAPP_TOKEN or WHATSAPP_PHONE_ID is not set.');
		return;
	}

	const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

	try {
		await axios.post(url, {
			messaging_product: 'whatsapp',
			to,
			type: 'text',
			text: { body: text }
		}, {
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			timeout: 10000
		});
	} catch (err) {
		if (err.response) {
			// Log only status + API error fields — never log the full response body
			// (it may contain recipient phone numbers or message content).
			const apiErr = err.response.data && err.response.data.error;
			console.error('WhatsApp API error:', {
				status: err.response.status,
				code: apiErr && apiErr.code,
				message: apiErr && apiErr.message
			});
		} else {
			console.error('WhatsApp API request failed:', err.message);
		}
	}
}

module.exports = { sendMessage };
