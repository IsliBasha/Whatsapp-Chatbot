'use strict';

// Parse raw user message text to extract intent (price/availability) and product name.
// Supports both Albanian and English queries.

const PRICE_KEYWORDS = [
	// Albanian
	'sa kushton', 'sa bën', 'sa është', 'çmimi', 'çmim',
	// English
	'price', 'cost', 'how much', 'rate'
];

const AVAIL_KEYWORDS = [
	// Albanian
	'ka në magazinë', 'a keni', 'keni', 'gjendje', 'magazinë', 'disponibël', 'stok',
	// English
	'available', 'availability', 'in stock', 'do you have', 'stock'
];

const STOP_WORDS = [
	// Albanian
	'sa', 'a', 'për', 'dhe', 'në', 'i', 'e', 'të', 'me', 'ka', 'nga', 'është',
	// English
	'what', 'is', 'the', 'of', 'your', 'for', 'please', 'kindly', 'do', 'you', 'have', 'an', 'this', 'that'
];

// Compile once at module load — longer keywords first to avoid partial overlaps
const STRIP_REGEXES = [...PRICE_KEYWORDS, ...AVAIL_KEYWORDS, ...STOP_WORDS]
	.sort((a, b) => b.length - a.length)
	.map(k => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'));

/**
 * parseIntent
 * Detects whether the text is asking for price or availability and extracts a product name.
 * Price takes precedence when both intents appear in the same message.
 * Supports Albanian and English.
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
		re.lastIndex = 0;
		stripped = stripped.replace(re, ' ');
	}

	// Keep letters from Albanian alphabet (ë, ç, etc.) alongside a-z and digits
	stripped = stripped.replace(/[^a-zëçäöüàáâãèéêìíîòóôùúû0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
	const product = stripped.length > 0 ? stripped : null;

	if (!intent || !product) {
		return { intent: intent || null, product: product || null };
	}
	return { intent, product };
}

module.exports = { parseIntent };
