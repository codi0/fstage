/**
 * @fstage/ui — internal DOM utilities
 *
 * Focus management, body scroll locking, and safeBlur.
 * Used by _modal-manager.mjs and _sheet-behavior.mjs.
 * Not part of the public package surface.
 */

import { createRefCountedToggle, focusElement, safeBlur } from '../utils/index.mjs';
export { focusElement, safeBlur };  // re-export so ui internals can import from one place

// --- Focus management --------------------------------------------------------

/** CSS selector matching all natively focusable elements. */
export var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Return all focusable elements inside `root`, excluding disabled/aria-hidden.
 * Walks slot-assigned elements one level deep.
 *
 * @param {Element|ShadowRoot} root
 * @returns {Element[]}
 */
export function getFocusable(root) {
	if (!root) return [];
	var els = Array.from(root.querySelectorAll(FOCUSABLE)).filter(function(el) {
		return !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true';
	});
	var slot = root.querySelector('slot');
	if (slot) {
		slot.assignedElements({ flatten: true }).forEach(function(el) {
			if (el.matches && el.matches(FOCUSABLE)) els.push(el);
			Array.from(el.querySelectorAll ? el.querySelectorAll(FOCUSABLE) : []).forEach(function(child) {
				if (!child.hasAttribute('disabled') && child.getAttribute('aria-hidden') !== 'true') els.push(child);
			});
		});
	}
	return els;
}

/**
 * Return `true` if `el` is inside `root`, including slot-assigned content.
 *
 * @param {Element|ShadowRoot} root
 * @param {Element} el
 * @returns {boolean}
 */
export function isInsideRoot(root, el) {
	if (!root || !el) return false;
	if (root.contains(el)) return true;
	var slots = root.querySelectorAll('slot');
	for (var i = 0; i < slots.length; i++) {
		var assigned = slots[i].assignedElements({ flatten: true });
		for (var j = 0; j < assigned.length; j++) {
			var node = assigned[j];
			if (node === el) return true;
			if (typeof node.contains === 'function' && node.contains(el)) return true;
		}
	}
	return false;
}

/**
 * Trap keyboard focus inside `root`. Handles Tab/Shift-Tab cycling and Escape.
 * Returns a cleanup function that removes the listener.
 *
 * @param {Element|ShadowRoot} root
 * @param {Function|null} onEscape
 * @returns {Function} Cleanup.
 */
export function trapFocus(root, onEscape) {
	function onKeydown(e) {
		if (e.key === 'Escape') { if (onEscape) onEscape(); return; }
		if (e.key !== 'Tab') return;
		var els = getFocusable(root);
		if (!els.length) return;
		var first = els[0], last = els[els.length - 1];
		if (e.shiftKey) {
			if (document.activeElement === first || !isInsideRoot(root, document.activeElement)) {
				e.preventDefault(); last.focus();
			}
		} else {
			if (document.activeElement === last || !isInsideRoot(root, document.activeElement)) {
				e.preventDefault(); first.focus();
			}
		}
	}
	document.addEventListener('keydown', onKeydown);
	return function() { document.removeEventListener('keydown', onKeydown); };
}

// --- Body scroll lock (ref-counted) -----------------------------------------

var _bodyOverflowPrev = '';

/**
 * Ref-counted body scroll lock.
 * Call with `true` to increment (lock), `false` to decrement (unlock).
 * The body `overflow` is only toggled when the count crosses 0↔1.
 *
 * @type {function(boolean): void}
 */
export var setBodyScrollLocked = createRefCountedToggle(
	function() {
		var el = document.body || document.documentElement;
		if (!el) return;
		_bodyOverflowPrev = el.style.overflow || '';
		el.style.overflow = 'hidden';
	},
	function() {
		var el = document.body || document.documentElement;
		if (!el) return;
		el.style.overflow = _bodyOverflowPrev || '';
		_bodyOverflowPrev = '';
	}
);

// safeBlur lives in @fstage/utils — re-exported above.
