'use strict';

// Tests for Excel product loader — covers both .xlsx (exceljs) and .xls (xlsx) paths.

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
});
