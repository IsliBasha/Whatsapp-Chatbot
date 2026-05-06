'use strict';

// Parse raw user message text to extract intent (price/availability) and product name.

const PRICE_KEYWORDS = ['price', 'cost', 'how much', 'rate'];
const AVAIL_KEYWORDS = ['available', 'availability', 'in stock', 'do you have', 'stock'];
const STOP_WORDS = ['what', 'is', 'the', 'of', 'your', 'for', 'please', 'kindly', 'do', 'you', 'have', 'a', 'an', 'this', 'that'];

// Compile once at module load — longer keywords first to avoid partial overlaps
const STRIP_REGEXES = [...PRICE_KEYWORDS, ...AVAIL_KEYWORDS, ...STOP_WORDS]
	.sort((a, b) => b.length - a.length)
	.map(k => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'));

/**
 * parseIntent
 * Detects whether the text is asking for price or availability and extracts a product name.
 * Price takes precedence when both intents appear in the same message.
 *
 * @param {string} text
 * @returns {{ intent: 'price' | 'availability' | null, product: string | null }}
 */
function parseIntent(text) {
	if (!text || typeof text !== 'string') {
		return { intent: null, product: null };
	}
	const lower = text.toLowerCase().trim();

	let intent = null;
	if (PRICE_KEYWORDS.some(k => lower.includes(k))) {
		intent = 'price';
	}
	// Only set availability when no price intent was already detected
	if (intent === null && AVAIL_KEYWORDS.some(k => lower.includes(k))) {
		intent = 'availability';
	}

	let stripped = lower;
	for (const re of STRIP_REGEXES) {
		re.lastIndex = 0; // reset stateful 'g' flag
		stripped = stripped.replace(re, ' ');
	}

	stripped = stripped.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
	const product = stripped.length > 0 ? stripped : null;

	if (!intent || !product) {
		return { intent: intent || null, product: product || null };
	}
	return { intent, product };
}

module.exports = { parseIntent };
