'use strict';

const _greeted = new Set();
const _pending  = new Map(); // phone → { candidates, intent }

function hasBeenGreeted(phone) { return _greeted.has(phone); }
function markGreeted(phone)    { _greeted.add(phone); }

function getPendingClarification(phone)        { return _pending.get(phone) || null; }
function setPendingClarification(phone, data)  { _pending.set(phone, data); }
function clearPendingClarification(phone)      { _pending.delete(phone); }

module.exports = {
	hasBeenGreeted,
	markGreeted,
	getPendingClarification,
	setPendingClarification,
	clearPendingClarification,
};
