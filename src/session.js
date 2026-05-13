'use strict';

const _greeted = new Set();

function hasBeenGreeted(phone) {
	return _greeted.has(phone);
}

function markGreeted(phone) {
	_greeted.add(phone);
}

module.exports = { hasBeenGreeted, markGreeted };
