'use strict';

// Tests for Excel product loader — covers both .xlsx (exceljs) and .xls (xlsx) paths.
// Also covers swapProducts / getLastReloadedAt (Ticket 1).

const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs');
const os = require('os');

describe('db — loadProducts + findProduct', () => {
	let tmpFile;

	afterEach(() => {
		if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		jest.resetModules();
		delete process.env.PRODUCTS_FILE;
	});

	async function writeXlsx(rows) {
		const wb = new ExcelJS.Workbook();
		const ws = wb.addWorksheet('Products');
		ws.columns = [
			{ header: 'name', key: 'name' },
			{ header: 'price', key: 'price' },
			{ header: 'stock', key: 'stock' }
		];
		rows.forEach(r => ws.addRow(r));
		tmpFile = path.join(os.tmpdir(), `test-products-${Date.now()}.xlsx`);
		await wb.xlsx.writeFile(tmpFile);
		return tmpFile;
	}

	it('loads products from an .xlsx file and finds by name', async () => {
		const file = await writeXlsx([
			{ name: 'Widget A', price: 29.99, stock: 150 },
			{ name: 'Gadget Pro', price: 99.99, stock: 0 }
		]);
		process.env.PRODUCTS_FILE = file;
		const { loadProducts, findProduct } = require('../db');
		await loadProducts();

		const result = await findProduct('Widget A');
		expect(result).toEqual({ name: 'Widget A', price: 29.99, stock: 150 });
	});

	it('performs case-insensitive substring search', async () => {
		const file = await writeXlsx([{ name: 'Gadget Pro', price: 99.99, stock: 30 }]);
		process.env.PRODUCTS_FILE = file;
		const { loadProducts, findProduct } = require('../db');
		await loadProducts();

		expect(await findProduct('gadget')).not.toBeNull();
		expect(await findProduct('GADGET')).not.toBeNull();
	});

	it('returns null when product is not found', async () => {
		const file = await writeXlsx([{ name: 'Widget A', price: 10, stock: 5 }]);
		process.env.PRODUCTS_FILE = file;
		const { loadProducts, findProduct } = require('../db');
		await loadProducts();

		expect(await findProduct('Nonexistent')).toBeNull();
	});

	it('returns null for invalid input', async () => {
		const file = await writeXlsx([{ name: 'Widget A', price: 10, stock: 5 }]);
		process.env.PRODUCTS_FILE = file;
		const { loadProducts, findProduct } = require('../db');
		await loadProducts();

		expect(await findProduct(null)).toBeNull();
		expect(await findProduct('')).toBeNull();
		expect(await findProduct(42)).toBeNull();
	});

	it('logs an error and loads empty list when file does not exist', async () => {
		process.env.PRODUCTS_FILE = '/nonexistent/path/products.xlsx';
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		const { loadProducts, findProduct } = require('../db');
		await loadProducts();

		expect(spy).toHaveBeenCalled();
		expect(await findProduct('anything')).toBeNull();
		spy.mockRestore();
	});

	it('logs an error when required columns are missing', async () => {
		// Write a file with wrong column headers
		const wb = new ExcelJS.Workbook();
		const ws = wb.addWorksheet('Products');
		ws.columns = [{ header: 'wrong', key: 'wrong' }];
		ws.addRow({ wrong: 'value' });
		tmpFile = path.join(os.tmpdir(), `test-bad-${Date.now()}.xlsx`);
		await wb.xlsx.writeFile(tmpFile);
		process.env.PRODUCTS_FILE = tmpFile;

		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		const { loadProducts, findProduct } = require('../db');
		await loadProducts();

		const logged = spy.mock.calls.some(args =>
			typeof args[0] === 'string' && args[0].toLowerCase().includes('required columns')
		);
		expect(logged).toBe(true);
		expect(await findProduct('anything')).toBeNull();
		spy.mockRestore();
	});

	it('isReady returns false before loadProducts is called', () => {
		jest.resetModules();
		delete process.env.PRODUCTS_FILE;
		const { isReady } = require('../db');
		expect(isReady()).toBe(false);
	});

	it('isReady returns true after successful loadProducts', async () => {
		const file = await writeXlsx([{ name: 'Widget A', price: 10, stock: 5 }]);
		process.env.PRODUCTS_FILE = file;
		jest.resetModules();
		const { loadProducts, isReady } = require('../db');

		expect(isReady()).toBe(false);
		await loadProducts();
		expect(isReady()).toBe(true);
	});

	it('productCount returns number of loaded products', async () => {
		const file = await writeXlsx([
			{ name: 'Widget A', price: 10, stock: 5 },
			{ name: 'Widget B', price: 20, stock: 0 }
		]);
		process.env.PRODUCTS_FILE = file;
		jest.resetModules();
		const { loadProducts, productCount } = require('../db');

		await loadProducts();
		expect(productCount()).toBe(2);
	});
});

describe('db — swapProducts + getLastReloadedAt (Ticket 1)', () => {
	beforeEach(() => {
		jest.resetModules();
		delete process.env.PRODUCTS_FILE;
	});

	const VALID_LIST = [
		{ name: 'Widget A', price: 10, stock: 5 },
		{ name: 'Widget B', price: 20, stock: 0 },
	];

	it('swapProducts replaces catalogue; findProduct reflects new data', async () => {
		const { swapProducts, findProduct } = require('../db');
		await swapProducts(VALID_LIST);
		const result = await findProduct('Widget A');
		expect(result).toEqual({ name: 'Widget A', price: 10, stock: 5 });
	});

	it('swapProducts sets isReady to true and updates productCount', async () => {
		const { swapProducts, isReady, productCount } = require('../db');
		await swapProducts(VALID_LIST);
		expect(isReady()).toBe(true);
		expect(productCount()).toBe(2);
	});

	it('swapProducts rejects empty array; existing catalogue preserved', async () => {
		const { swapProducts, findProduct, productCount } = require('../db');
		await swapProducts(VALID_LIST);

		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		await swapProducts([]);
		spy.mockRestore();

		expect(productCount()).toBe(2);
		expect(await findProduct('Widget A')).not.toBeNull();
	});

	it('swapProducts logs an error when called with empty array', async () => {
		const { swapProducts } = require('../db');
		await swapProducts(VALID_LIST);

		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		await swapProducts([]);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it('swapProducts filters out entries with missing name', async () => {
		const { swapProducts, productCount } = require('../db');
		const mixed = [
			{ name: 'Good', price: 5, stock: 1 },
			{ price: 10, stock: 3 },          // no name
			{ name: '', price: 10, stock: 3 }, // empty name
		];
		const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
		await swapProducts(mixed);
		spy.mockRestore();
		expect(productCount()).toBe(1);
	});

	it('swapProducts filters out entries with non-numeric price or stock', async () => {
		const { swapProducts, productCount } = require('../db');
		const mixed = [
			{ name: 'Good', price: 5, stock: 1 },
			{ name: 'Bad price', price: 'free', stock: 1 },
			{ name: 'Bad stock', price: 5, stock: null },
		];
		const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
		await swapProducts(mixed);
		spy.mockRestore();
		expect(productCount()).toBe(1);
	});

	it('getLastReloadedAt returns null before any swap', () => {
		const { getLastReloadedAt } = require('../db');
		expect(getLastReloadedAt()).toBeNull();
	});

	it('getLastReloadedAt returns an ISO timestamp after a successful swap', async () => {
		const { swapProducts, getLastReloadedAt } = require('../db');
		const before = Date.now();
		await swapProducts(VALID_LIST);
		const after = Date.now();
		const ts = getLastReloadedAt();
		expect(typeof ts).toBe('string');
		const parsed = new Date(ts).getTime();
		expect(parsed).toBeGreaterThanOrEqual(before);
		expect(parsed).toBeLessThanOrEqual(after);
	});

	it('getLastReloadedAt does NOT update when swap is rejected', async () => {
		const { swapProducts, getLastReloadedAt } = require('../db');
		await swapProducts(VALID_LIST);
		const tsFirst = getLastReloadedAt();

		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		await swapProducts([]);
		spy.mockRestore();

		expect(getLastReloadedAt()).toBe(tsFirst);
	});

	it('loadProducts delegates to swapProducts and updates getLastReloadedAt', async () => {
		const ExcelJS = require('exceljs');
		const path = require('path');
		const os = require('os');
		const wb = new ExcelJS.Workbook();
		const ws = wb.addWorksheet('P');
		ws.columns = [{ header: 'name', key: 'name' }, { header: 'price', key: 'price' }, { header: 'stock', key: 'stock' }];
		ws.addRow({ name: 'Cable', price: 3, stock: 10 });
		const tmpFile = path.join(os.tmpdir(), `ticket1-${Date.now()}.xlsx`);
		await wb.xlsx.writeFile(tmpFile);

		process.env.PRODUCTS_FILE = tmpFile;
		const { loadProducts, getLastReloadedAt, findProduct } = require('../db');
		await loadProducts();

		expect(getLastReloadedAt()).not.toBeNull();
		expect(await findProduct('Cable')).not.toBeNull();

		const fs = require('fs');
		if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
	});
});
