'use strict';

const { parseIntent } = require('../intentParser');

describe('parseIntent', () => {
	it('returns null intent and null product for empty string', () => {
		expect(parseIntent('')).toEqual({ intent: null, product: null });
	});

	it('returns null intent and null product for non-string input', () => {
		expect(parseIntent(null)).toEqual({ intent: null, product: null });
		expect(parseIntent(42)).toEqual({ intent: null, product: null });
	});

	it('detects price intent from "price" keyword', () => {
		const { intent } = parseIntent('What is the price of Widget A?');
		expect(intent).toBe('price');
	});

	it('detects price intent from "how much" keyword', () => {
		const { intent } = parseIntent('How much does Gadget Pro cost?');
		expect(intent).toBe('price');
	});

	it('detects availability intent from "in stock" keyword', () => {
		const { intent } = parseIntent('Is Widget A in stock?');
		expect(intent).toBe('availability');
	});

	it('detects availability intent from "do you have" keyword', () => {
		const { intent } = parseIntent('Do you have Gadget Pro?');
		expect(intent).toBe('availability');
	});

	it('extracts product name after stripping intent keywords and stop words', () => {
		const { product } = parseIntent('What is the price of Widget A?');
		expect(product).toBeTruthy();
		expect(product.toLowerCase()).toContain('widget');
	});

	it('returns null product when only keywords remain after stripping', () => {
		const { product } = parseIntent('price');
		expect(product).toBeNull();
	});

	it('is case-insensitive for intent detection', () => {
		const { intent } = parseIntent('PRICE of Widget A');
		expect(intent).toBe('price');
	});

	it('returns null intent and null product when text contains no known keywords', () => {
		const result = parseIntent('hello there how are you today');
		expect(result.intent).toBeNull();
	});

	it('prefers price when both price and availability keywords appear', () => {
		// "What is the price of Widget A? Is it in stock?" — user is asking about price primarily
		const { intent } = parseIntent('What is the price of Widget A? Is it in stock?');
		expect(intent).toBe('price');
	});

	it('still returns availability when only availability keywords appear', () => {
		const { intent } = parseIntent('Do you have Widget B available?');
		expect(intent).toBe('availability');
	});
});
