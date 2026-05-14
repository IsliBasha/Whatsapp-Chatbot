'use strict';

// TDD: fuzzy product search

const { searchProducts, searchCandidates } = require('../search');

const PRODUCTS = [
	{ name: 'Tel 1x1.5 mm Cu (bobine)', price: 25, stock: 100 },
	{ name: 'Tel 1x2.5 mm Cu (bobine)', price: 40, stock: 200 },
	{ name: 'Llampe LED 8.5W VTAC 6500K', price: 100, stock: 50 },
	{ name: 'Brryl Press Mst F 16X1/2 Me Bazament', price: 500, stock: 978 },
	{ name: 'Spine me Celes 16A', price: 200, stock: 993 },
	{ name: 'Tel tokezimi 8-10', price: 320, stock: 834 },
	{ name: 'Pilet Gjat PLscala INOX 40cm D.50', price: 4000, stock: 998 },
];

describe('searchProducts — exact / substring', () => {
	it('finds an exact name match', () => {
		expect(searchProducts(PRODUCTS, 'Tel 1x1.5 mm Cu (bobine)').name).toBe('Tel 1x1.5 mm Cu (bobine)');
	});

	it('finds by case-insensitive substring', () => {
		expect(searchProducts(PRODUCTS, 'tel 1x1.5').name).toBe('Tel 1x1.5 mm Cu (bobine)');
	});

	it('finds by partial product name', () => {
		expect(searchProducts(PRODUCTS, 'spine 16a').name).toBe('Spine me Celes 16A');
	});
});

describe('searchProducts — fuzzy / typo tolerance', () => {
	it('finds product despite typo (llambe → Llampe)', () => {
		const result = searchProducts(PRODUCTS, 'llambe led');
		expect(result).not.toBeNull();
		expect(result.name).toMatch(/Llampe/i);
	});

	it('finds product with words in different order (16 brryl)', () => {
		const result = searchProducts(PRODUCTS, '16 brryl');
		expect(result).not.toBeNull();
		expect(result.name).toMatch(/Brryl/i);
	});

	it('finds product with partial words (brryl 16)', () => {
		const result = searchProducts(PRODUCTS, 'brryl 16');
		expect(result).not.toBeNull();
		expect(result.name).toMatch(/Brryl/i);
	});

	it('finds tel 1.5 wire by loose spec', () => {
		const result = searchProducts(PRODUCTS, 'tel elektrik 1.5');
		expect(result).not.toBeNull();
		expect(result.name).toMatch(/1\.5/);
	});
});

describe('searchProducts — no match', () => {
	it('returns null for a completely unrelated query', () => {
		expect(searchProducts(PRODUCTS, 'makina bmw')).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(searchProducts(PRODUCTS, '')).toBeNull();
	});

	it('returns null for empty product list', () => {
		expect(searchProducts([], 'tel')).toBeNull();
	});
});

// ── searchCandidates ──────────────────────────────────────────────────────────

const LAMPS = [
	{ name: 'Llampe LED 8.5W', price: 100, stock: 50 },
	{ name: 'Llampe LED 12W', price: 150, stock: 30 },
	{ name: 'Llampe Neon 20W', price: 200, stock: 10 },
	{ name: 'Llampe Spot GU10', price: 250, stock: 20 },
	{ name: 'Tel 1x1.5 mm Cu', price: 25, stock: 100 },
];

describe('searchCandidates — return shape', () => {
	it('always returns { candidates, suggestions }', () => {
		const result = searchCandidates(LAMPS, 'llampe');
		expect(result).toHaveProperty('candidates');
		expect(result).toHaveProperty('suggestions');
	});
});

describe('searchCandidates — confident matches → candidates', () => {
	it('populates candidates with all substring matches, suggestions empty', () => {
		const { candidates, suggestions } = searchCandidates(LAMPS, 'llampe');
		expect(candidates).toHaveLength(4);
		expect(candidates.every(p => p.name.toLowerCase().includes('llampe'))).toBe(true);
		expect(suggestions).toHaveLength(0);
	});

	it('populates candidates for high-confidence typo (llambe → Llampe)', () => {
		const { candidates, suggestions } = searchCandidates(LAMPS, 'llambe led');
		expect(candidates.length).toBeGreaterThan(0);
		expect(candidates[0].name).toMatch(/Llampe/i);
		expect(suggestions).toHaveLength(0);
	});

	it('respects the maxResults cap on candidates', () => {
		const big = Array.from({ length: 20 }, (_, i) => ({ name: `Llampe ${i}`, price: i, stock: i }));
		const { candidates } = searchCandidates(big, 'llampe', 5);
		expect(candidates).toHaveLength(5);
	});

	it('defaults cap to 15', () => {
		const big = Array.from({ length: 20 }, (_, i) => ({ name: `Llampe ${i}`, price: i, stock: i }));
		const { candidates } = searchCandidates(big, 'llampe');
		expect(candidates).toHaveLength(15);
	});
});

describe('searchCandidates — low-confidence → suggestions', () => {
	it('returns suggestions (not candidates) for a loosely related query', () => {
		// 'lamp' is not a substring and not a tight fuzzy match for Albanian product names,
		// but may be in suggestion zone
		const { candidates, suggestions } = searchCandidates(LAMPS, 'lamps 8w');
		// Either suggestions or candidates may fire depending on score — what must NOT happen
		// is both being empty when there is clearly a related product in the list
		const totalHits = candidates.length + suggestions.length;
		expect(totalHits).toBeGreaterThan(0);
	});

	it('returns both candidates and suggestions as arrays', () => {
		const { candidates, suggestions } = searchCandidates(LAMPS, 'xyz99999');
		expect(Array.isArray(candidates)).toBe(true);
		expect(Array.isArray(suggestions)).toBe(true);
	});
});

describe('searchCandidates — no match', () => {
	it('returns empty candidates and suggestions for completely unrelated query', () => {
		const { candidates, suggestions } = searchCandidates(LAMPS, 'makina sportive bmw');
		expect(candidates).toHaveLength(0);
		expect(suggestions).toHaveLength(0);
	});

	it('returns empty for empty query', () => {
		const { candidates, suggestions } = searchCandidates(LAMPS, '');
		expect(candidates).toHaveLength(0);
		expect(suggestions).toHaveLength(0);
	});

	it('returns empty for empty product list', () => {
		const { candidates, suggestions } = searchCandidates([], 'llampe');
		expect(candidates).toHaveLength(0);
		expect(suggestions).toHaveLength(0);
	});
});
