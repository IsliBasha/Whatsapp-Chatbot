'use strict';

// TDD: fuzzy product search

const { searchProducts } = require('../search');

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
