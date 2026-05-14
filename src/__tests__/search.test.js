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

describe('searchCandidates — all matches', () => {
	it('returns all products containing the substring', () => {
		const results = searchCandidates(LAMPS, 'llampe');
		expect(results).toHaveLength(4);
		expect(results.every(p => p.name.toLowerCase().includes('llampe'))).toBe(true);
	});

	it('returns empty array when nothing matches', () => {
		expect(searchCandidates(LAMPS, 'makina')).toEqual([]);
	});

	it('returns empty array for empty query', () => {
		expect(searchCandidates(LAMPS, '')).toEqual([]);
	});

	it('returns empty array for empty product list', () => {
		expect(searchCandidates([], 'llampe')).toEqual([]);
	});

	it('respects the maxResults cap', () => {
		const big = Array.from({ length: 20 }, (_, i) => ({ name: `Llampe ${i}`, price: i, stock: i }));
		const results = searchCandidates(big, 'llampe', 5);
		expect(results).toHaveLength(5);
	});

	it('defaults cap to 15', () => {
		const big = Array.from({ length: 20 }, (_, i) => ({ name: `Llampe ${i}`, price: i, stock: i }));
		const results = searchCandidates(big, 'llampe');
		expect(results).toHaveLength(15);
	});

	it('falls back to Fuse.js for typo queries', () => {
		const results = searchCandidates(LAMPS, 'llambe');
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].name).toMatch(/Llampe/i);
	});
});
