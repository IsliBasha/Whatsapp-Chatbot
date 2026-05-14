'use strict';

const Fuse = require('fuse.js');

/**
 * searchProducts
 * Two-pass search:
 *   1. Fast case-insensitive substring match (exact enough, zero cost)
 *   2. Fuse.js fuzzy match (handles typos, word reordering, partial specs)
 *
 * @param {Array<{name:string, price:number, stock:number}>} products
 * @param {string} query
 * @returns {object|null}
 */
function searchProducts(products, query) {
	if (!query || !products.length) return null;

	const q = query.trim().toLowerCase();

	// Pass 1 — substring (fast, deterministic)
	const exact = products.find(p => p.name.toLowerCase().includes(q));
	if (exact) return exact;

	// Shared Fuse.js instance used in passes 2 and 3
	const fuse = new Fuse(products, {
		keys: ['name'],
		threshold: 0.35,
		ignoreLocation: true,
		minMatchCharLength: 2,
		includeScore: true,
	});

	// Pass 2 — word-by-word scoring for multi-word queries; Fuse.js breaks ties
	const words = q.split(/\s+/).filter(w => w.length >= 2);
	if (words.length > 1) {
		let bestScore = 0;
		const scored = products.map(p => {
			const name = p.name.toLowerCase();
			const matched = words.filter(w => name.includes(w)).length;
			const score = matched / words.length;
			if (score > bestScore) bestScore = score;
			return { p, score };
		});

		if (bestScore >= 0.5) {
			// Among tied top candidates, use Fuse.js to pick the closest match
			const candidates = scored.filter(s => s.score === bestScore).map(s => s.p);
			if (candidates.length === 1) return candidates[0];
			const fuseTie = new Fuse(candidates, { keys: ['name'], threshold: 1, ignoreLocation: true, includeScore: true });
			const ranked = fuseTie.search(q);
			return ranked.length > 0 ? ranked[0].item : candidates[0];
		}
	}

	// Pass 3 — Fuse.js fuzzy for single-word typos (e.g. "llambe" → "Llampe")
	const results = fuse.search(q);
	return results.length > 0 ? results[0].item : null;
}

// Fuse.js score: 0 = perfect, 1 = no match. Lower threshold = stricter.
const CONFIDENT_THRESHOLD = 0.2;  // high-confidence fuzzy → treat as real match
const SUGGEST_THRESHOLD   = 0.42; // medium-confidence fuzzy → show as suggestion

/**
 * searchCandidates
 * Returns { candidates, suggestions } where:
 *   candidates — substring matches or high-confidence fuzzy (score ≤ CONFIDENT_THRESHOLD)
 *   suggestions — only populated when candidates is empty; lower-confidence fuzzy matches
 *                 to show as "did you mean?" (score ≤ SUGGEST_THRESHOLD), capped at 3
 *
 * @param {Array<{name:string, price:number, stock:number}>} products
 * @param {string} query
 * @param {number} maxResults   cap for candidates list
 * @returns {{ candidates: Product[], suggestions: Product[] }}
 */
function searchCandidates(products, query, maxResults = 15) {
	if (!query || !products.length) return { candidates: [], suggestions: [] };

	const q = query.trim().toLowerCase();

	// Pass 1 — all substring matches (high confidence)
	const exact = products.filter(p => p.name.toLowerCase().includes(q));
	if (exact.length > 0) return { candidates: exact.slice(0, maxResults), suggestions: [] };

	// Pass 2 — tight Fuse.js (high-confidence fuzzy)
	const fuseConfident = new Fuse(products, {
		keys: ['name'],
		threshold: CONFIDENT_THRESHOLD,
		ignoreLocation: true,
		minMatchCharLength: 2,
		includeScore: true,
	});
	const confident = fuseConfident.search(q);
	if (confident.length > 0) {
		return { candidates: confident.slice(0, maxResults).map(r => r.item), suggestions: [] };
	}

	// Pass 3 — loose Fuse.js (suggestion zone only)
	const fuseSuggest = new Fuse(products, {
		keys: ['name'],
		threshold: SUGGEST_THRESHOLD,
		ignoreLocation: true,
		minMatchCharLength: 2,
		includeScore: true,
	});
	const suggestions = fuseSuggest.search(q).slice(0, 3).map(r => r.item);
	return { candidates: [], suggestions };
}

module.exports = { searchProducts, searchCandidates };
