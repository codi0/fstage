// DOM utilities shared across components.
import { createRefCountedToggle, clearSelection } from '@fstage/utils';
import { readCss, collapseElement } from '@fstage/animator';

export { createRefCountedToggle, clearSelection, readCss, collapseElement };

// --- Focus management --------------------------------------------------------

export var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusable(root) {
	if (!root) return [];
	return Array.from(root.querySelectorAll(FOCUSABLE)).filter(function(el) {
		return !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true';
	});
}

export function focusElement(el) {
	if (!el || typeof el.focus !== 'function') return false;
	try { el.focus({ preventScroll: true }); return true; }
	catch (err) {
		try { el.focus(); return true; } catch (err2) {}
	}
	return false;
}

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

export function trapFocus(root, onEscape) {
	function getFocusableInRoot() {
		var els = Array.from(root.querySelectorAll(FOCUSABLE));
		var slot = root.querySelector('slot');
		if (slot) {
			slot.assignedElements({ flatten: true }).forEach(function(el) {
				if (el.matches(FOCUSABLE)) els.push(el);
				els = els.concat(Array.from(el.querySelectorAll(FOCUSABLE)));
			});
		}
		return els;
	}

	function onKeydown(e) {
		if (e.key === 'Escape') { if (onEscape) onEscape(); return; }
		if (e.key !== 'Tab') return;
		var els = getFocusableInRoot();
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

// --- Sheet behaviour --------------------------------------------------------
// Reusable open/close modal behaviour for component-owned panels (bottom-sheet
// etc). Manages scroll lock, focus trap, focus restore — leaving animation to
// the component. Returns { open(panel, opts), close() }.
// opts: { initialFocus, onEscape }

export function createSheetBehavior() {
	var _trapCleanup   = null;
	var _restoreFocusEl = null;
	var _focusTid      = null;
	var _locked        = false;

	function cleanup() {
		if (_focusTid) { clearTimeout(_focusTid); _focusTid = null; }
		if (_trapCleanup) { _trapCleanup(); _trapCleanup = null; }
		if (_locked) { setBodyScrollLocked(false); _locked = false; }
	}

	return {
		open: function(panel, opts) {
			opts = opts || {};
			cleanup();

			_restoreFocusEl = (document.activeElement && typeof document.activeElement.focus === 'function')
				? document.activeElement : null;

			setBodyScrollLocked(true);
			_locked = true;

			_trapCleanup = trapFocus(panel, opts.onEscape || null);

			if (opts.initialFocus) {
				_focusTid = setTimeout(function() {
					_focusTid = null;
					if (!panel.isConnected) return;
					var el = (typeof opts.initialFocus === 'function') ? opts.initialFocus() : opts.initialFocus;
					if (el) focusElement(el);
				}, 60);
			}
		},

		close: function() {
			var restore = _restoreFocusEl;
			_restoreFocusEl = null;
			cleanup();
			if (restore && document.contains(restore)) focusElement(restore);
		},

		toggle: function(open, panel, opts) {
			if (open) this.open(panel, opts);
			else this.close();
		},

		destroy: cleanup
	};
}
