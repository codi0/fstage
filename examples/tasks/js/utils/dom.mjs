// DOM utilities shared across components.
import { createRefCountedToggle, clearSelection, focusElement } from '@fstage/utils';
import { readCss, collapseElement } from '@fstage/animator';

export { createRefCountedToggle, clearSelection, focusElement, readCss, collapseElement };

// --- Focus management --------------------------------------------------------

export var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusable(root) {
	if (!root) return [];
	return Array.from(root.querySelectorAll(FOCUSABLE)).filter(function(el) {
		return !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true';
	});
}

// --- Body scroll lock (ref-counted) -----------------------------------------

var bodyOverflowPrev = '';
export var setBodyScrollLocked = createRefCountedToggle(
	function() {
		var el = document.body || document.documentElement;
		if (!el) return;
		bodyOverflowPrev = el.style.overflow || '';
		el.style.overflow = 'hidden';
	},
	function() {
		var el = document.body || document.documentElement;
		if (!el) return;
		el.style.overflow = bodyOverflowPrev || '';
		bodyOverflowPrev = '';
	}
);

// --- Modal manager ----------------------------------------------------------
// Manages imperatively-injected modal overlays (action-sheet, toast etc).
// Uses the shared primitives above — getFocusable, focusElement, setBodyScrollLocked.
// trapFocus is not used here because the keydown handler needs to dynamically
// read the top of the modal stack rather than capturing a fixed element.

function createModalManager() {
	var entries    = new Map();
	var modalStack = [];
	var inerted    = new Map();
	var onDocKeydown = null;
	var root = null;

	function ensureRoot() {
		if (root && root.isConnected) return root;
		root = document.createElement('div');
		root.setAttribute('data-modal-manager', '');
		root.style.cssText = 'position:fixed;inset:0;z-index:200;pointer-events:none;';
		document.body.appendChild(root);
		return root;
	}

	function getActive() {
		return modalStack.length ? modalStack[modalStack.length - 1] : null;
	}

	function restoreSiblings() {
		inerted.forEach(function(prev, el) {
			if (!el) return;
			el.inert = !!prev.inert;
			if (prev.ariaHidden == null) el.removeAttribute('aria-hidden');
			else el.setAttribute('aria-hidden', prev.ariaHidden);
		});
		inerted.clear();
	}

	function applyModalState(focusActive) {
		var active = getActive();

		if (active) {
			Array.from(document.body.children).forEach(function(el) {
				if (el === root) return;
				if (!inerted.has(el)) {
					inerted.set(el, { inert: !!el.inert, ariaHidden: el.getAttribute('aria-hidden') });
				}
				el.inert = true;
				el.setAttribute('aria-hidden', 'true');
			});
		} else {
			restoreSiblings();
		}

		if (active) {
			if (!onDocKeydown) {
				onDocKeydown = function(e) {
					var current = getActive();
					if (!current) return;
					if (e.key === 'Escape') {
						if (current.closeOnEscape === false) return;
						e.preventDefault();
						manager.close(current.key);
						return;
					}
					if (e.key !== 'Tab') return;
					var focusable = getFocusable(current.layer);
					if (!focusable.length) { e.preventDefault(); return; }
					var first = focusable[0], last = focusable[focusable.length - 1];
					var activeEl = document.activeElement;
					var inside = current.layer.contains(activeEl);
					if (e.shiftKey) {
						if (!inside || activeEl === first) { e.preventDefault(); focusElement(last); }
					} else {
						if (!inside || activeEl === last)  { e.preventDefault(); focusElement(first); }
					}
				};
				document.addEventListener('keydown', onDocKeydown, true);
			}
			setBodyScrollLocked(true);
			if (focusActive) {
				var a = active;
				if (a.focusTid) { clearTimeout(a.focusTid); a.focusTid = null; }
				a.focusTid = setTimeout(function() {
					a.focusTid = null;
					if (!a.layer || !a.layer.isConnected) return;
					var initial = (typeof a.initialFocus === 'function') ? a.initialFocus() : a.initialFocus;
					if (!initial || !a.layer.contains(initial)) initial = getFocusable(a.layer)[0] || null;
					focusElement(initial);
				}, 0);
			}
		} else {
			if (onDocKeydown) {
				document.removeEventListener('keydown', onDocKeydown, true);
				onDocKeydown = null;
			}
			setBodyScrollLocked(false);
		}
	}

	var manager = {
		open: function(key, opts) {
			opts = opts || {};
			this.close(key);

			var nodes = Array.isArray(opts.nodes) ? opts.nodes : [opts.nodes];
			nodes = nodes.filter(Boolean);

			var layer = null;
			if (nodes.length) {
				var r = ensureRoot();
				layer = document.createElement('div');
				layer.style.cssText = 'position:absolute;inset:0;pointer-events:auto;';
				nodes.forEach(function(node) { layer.appendChild(node); });
				r.appendChild(layer);
			}

			var entry = {
				key:           key,
				layer:         layer,
				modal:         !!opts.modal,
				closeOnEscape: opts.closeOnEscape !== false,
				initialFocus:  opts.initialFocus || null,
				restoreFocusEl: (opts.modal && document.activeElement && typeof document.activeElement.focus === 'function')
				                  ? document.activeElement : null,
				onClose:       typeof opts.onClose === 'function' ? opts.onClose : null,
				focusTid:      null,
			};

			entries.set(key, entry);
			if (entry.modal) { modalStack.push(entry); applyModalState(true); }

			return this.close.bind(this, key);
		},

		close: function(key) {
			var entry = entries.get(key);
			if (!entry) return;

			entries.delete(key);
			if (entry.focusTid) { clearTimeout(entry.focusTid); entry.focusTid = null; }

			if (entry.modal) {
				var idx = modalStack.indexOf(entry);
				if (idx !== -1) modalStack.splice(idx, 1);
			}

			if (entry.layer && entry.layer.parentNode) {
				entry.layer.remove();
				if (root && !root.children.length) { root.remove(); root = null; }
			}

			if (entry.modal) {
				applyModalState(false);
				if (!getActive() && entry.restoreFocusEl && document.contains(entry.restoreFocusEl)) {
					focusElement(entry.restoreFocusEl);
				}
			}

			if (entry.onClose) { try { entry.onClose(); } catch (err) {} }
		}
	};

	return manager;
}

export var modalManager = createModalManager();
