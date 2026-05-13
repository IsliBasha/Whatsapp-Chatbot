'use strict';

// Load product data from an Excel file (.xls or .xlsx) and expose query helpers.
// .xlsx files are read with exceljs (no known CVEs).
// .xls binary files fall back to xlsx with { header: 1 } (array-of-arrays), which
// avoids the prototype-pollution path present in xlsx's sheet_to_json with named keys.

require('dotenv').config();
const path = require('path');
const ExcelJS = require('exceljs');
const { searchProducts } = require('./search');

const PRODUCTS_FILE = process.env.PRODUCTS_FILE
	? path.resolve(process.env.PRODUCTS_FILE)
	: path.join(__dirname, '..', 'products.xlsx');

// Albanian → English column aliases (Odoo export format)
const COLUMN_ALIASES = {
	'emërtim': 'name',
	'çmime shitje': 'price',
	'sasia gjendje': 'stock',
	'kosto': 'cost'
};

/** @type {{ name: string, price: number, stock: number }[]} */
let products = [];
let _ready = false;
let _lastReloadedAt = null;

function isReady() { return _ready; }
function productCount() { return products.length; }
function getLastReloadedAt() { return _lastReloadedAt; }

/**
 * swapProducts
 * Atomically replaces the in-memory catalogue.
 * Rejects empty input and filters out invalid-shaped rows.
 *
 * @param {{ name: string, price: number, stock: number }[]} newList
 */
async function swapProducts(newList) {
	if (!newList || newList.length === 0) {
		console.error('swapProducts: rejected empty list — existing catalogue preserved');
		return;
	}

	const valid = [];
	for (const item of newList) {
		const name = typeof item.name === 'string' ? item.name.trim() : '';
		const price = Number(item.price);
		const stock = Number(item.stock);
		if (!name || item.price == null || item.stock == null || !isFinite(price) || !isFinite(stock)) {
			console.warn(`swapProducts: skipping invalid row — ${JSON.stringify(item)}`);
			continue;
		}
		valid.push({ name, price, stock });
	}

	products = valid;
	_ready = true;
	_lastReloadedAt = new Date().toISOString();
	console.log(`swapProducts: catalogue updated — ${products.length} products`);
}

function normalizeHeader(h) {
	const lower = String(h || '').toLowerCase().trim();
	return COLUMN_ALIASES[lower] || lower;
}

async function readRowsXlsx(filePath) {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(filePath);
	const sheet = workbook.worksheets[0];
	if (!sheet) return null;

	const headers = [];
	sheet.getRow(1).eachCell((cell, col) => { headers[col - 1] = normalizeHeader(cell.value); });

	const rows = [];
	sheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return;
		const cells = [];
		row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cell.value; });
		rows.push(cells);
	});
	return { headers, rows };
}

async function readRowsXls(filePath) {
	// xlsx (SheetJS) is used only for old binary .xls which exceljs cannot read.
	// { header: 1 } returns array-of-arrays, bypassing the prototype-pollution path
	// present in sheet_to_json with named-key mode.
	const XLSX = require('xlsx');
	const workbook = XLSX.readFile(filePath);
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 });
	if (!raw || raw.length === 0) return null;
	const headers = raw[0].map(normalizeHeader);
	const rows = raw.slice(1);
	return { headers, rows };
}

async function loadProducts() {
	_ready = false;
	const ext = path.extname(PRODUCTS_FILE).toLowerCase();

	let parsed;
	try {
		parsed = ext === '.xls' ? await readRowsXls(PRODUCTS_FILE) : await readRowsXlsx(PRODUCTS_FILE);
	} catch (err) {
		console.error(`Failed to load products file (${PRODUCTS_FILE}): ${err.message}`);
		return;
	}

	if (!parsed) {
		console.error('Products file has no worksheets.');
		return;
	}

	const { headers, rows } = parsed;
	const nameIdx = headers.indexOf('name');
	const priceIdx = headers.indexOf('price');
	const stockIdx = headers.indexOf('stock');

	if (nameIdx === -1 || priceIdx === -1 || stockIdx === -1) {
		console.error(
			`Could not find required columns (name, price, stock). ` +
			`Expected Albanian headers: Emërtim, Çmime Shitje, Sasia Gjendje. Found: ${headers.join(', ')}`
		);
		return;
	}

	const loaded = [];
	for (const row of rows) {
		const name = String(row[nameIdx] || '').trim();
		const price = Number(row[priceIdx] || 0);
		const stock = Number(row[stockIdx] || 0);
		if (name) loaded.push({ name, price, stock });
	}

	await swapProducts(loaded);
}

/**
 * findProduct
 * Three-pass search: exact substring → Fuse.js fuzzy → word-by-word scoring.
 *
 * @param {string} name
 * @returns {Promise<{ name: string, price: number, stock: number } | null>}
 */
async function findProduct(name) {
	if (!name || typeof name !== 'string') return null;
	return searchProducts(products, name);
}

// NOTE: loadProducts() is intentionally NOT called here.
// Call it explicitly from the server entrypoint (index.js) before app.listen(),
// so the server never accepts traffic before the product catalogue is ready.

module.exports = { findProduct, loadProducts, swapProducts, isReady, productCount, getLastReloadedAt };
