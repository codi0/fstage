import { getFocusable, focusElement as focusEl, setBodyScrollLocked } from '../../utils/dom.mjs';

var stateByHost = new WeakMap();

function ensureState(host) {
	var existing = stateByHost.get(host);
	if (existing) return existing;
	var state = {
		entries:     new Map(),
		modalStack:  [],
		inerted:     new Map(),
		onDocKeydown: null,
		scrollLocked: false,
	};
	stateByHost.set(host, state);
	return state;
}

function focusEntry(entry) {
	if (!entry || !entry.layer || !entry.layer.isConnected) return;
	if (entry.focusTid) {
		clearTimeout(entry.focusTid);
		entry.focusTid = null;
	}
	entry.focusTid = setTimeout(function() {
		entry.focusTid = null;
		if (!entry.layer || !entry.layer.isConnected) return;
		var initial = (typeof entry.initialFocus === 'function') ? entry.initialFocus() : entry.initialFocus;
		if (!initial || !entry.layer.contains(initial)) {
			var focusable = getFocusable(entry.layer);
			initial = focusable[0] || null;
		}
		focusEl(initial);
	}, 0);
}

function getActiveEntry(host) {
	var state = ensureState(host);
	return state.modalStack.length ? state.modalStack[state.modalStack.length - 1] : null;
}

function restoreSiblings(host) {
	var state = ensureState(host);
	state.inerted.forEach(function(prev, el) {
		if (!el) return;
		el.inert = !!prev.inert;
		if (prev.ariaHidden == null) el.removeAttribute('aria-hidden');
		else el.setAttribute('aria-hidden', prev.ariaHidden);
	});
	state.inerted.clear();
}

function applyModalState(host, focusActive) {
	var state = ensureState(host);
	var active = getActiveEntry(host);
	var parent = host.parentElement;

	if (parent) {
		if (active) {
			Array.from(parent.children).forEach(function(el) {
				if (el === host) return;
				if (!state.inerted.has(el)) {
					state.inerted.set(el, {
						inert: !!el.inert,
						ariaHidden: el.getAttribute('aria-hidden')
					});
				}
				el.inert = true;
				el.setAttribute('aria-hidden', 'true');
			});
		} else {
			restoreSiblings(host);
		}
	}

	if (active) {
		if (!state.onDocKeydown) {
			state.onDocKeydown = function(e) {
				var current = getActiveEntry(host);
				if (!current) return;

				if (e.key === 'Escape') {
					if (current.closeOnEscape === false) return;
					e.preventDefault();
					host.close(current.key);
					return;
				}

				if (e.key !== 'Tab') return;
				var focusable = getFocusable(current.layer);
				if (!focusable.length) { e.preventDefault(); return; }

				var first = focusable[0];
				var last  = focusable[focusable.length - 1];
				var activeEl = document.activeElement;
				var inside   = current.layer.contains(activeEl);

				if (e.shiftKey) {
					if (!inside || activeEl === first) { e.preventDefault(); focusEl(last); }
				} else {
					if (!inside || activeEl === last)  { e.preventDefault(); focusEl(first); }
				}
			};
			document.addEventListener('keydown', state.onDocKeydown, true);
		}
		if (!state.scrollLocked) {
			setBodyScrollLocked(true);
			state.scrollLocked = true;
		}
		if (focusActive) focusEntry(active);
	} else {
		if (state.onDocKeydown) {
			document.removeEventListener('keydown', state.onDocKeydown, true);
			state.onDocKeydown = null;
		}
		if (state.scrollLocked) {
			setBodyScrollLocked(false);
			state.scrollLocked = false;
		}
	}
}

export default {

	tag: 'pwa-overlay',

	shadow: false,

	host: {
	  methods: {
		open: function(key, opts) {
			opts = opts || {};
			this.close(key);

			var state = ensureState(this);
			var layer = document.createElement('div');
			layer.className = 'pwa-overlay-layer';

			var nodes = Array.isArray(opts.nodes) ? opts.nodes : [opts.nodes];
			nodes.filter(Boolean).forEach(function(node) { layer.appendChild(node); });
			this.appendChild(layer);

			var entry = {
				key:            key,
				layer:          layer,
				modal:          !!opts.modal,
				closeOnEscape:  opts.closeOnEscape !== false,
				initialFocus:   opts.initialFocus || null,
				restoreFocusEl: (opts.modal && document.activeElement && typeof document.activeElement.focus === 'function')
				                  ? document.activeElement : null,
				onClose:        typeof opts.onClose === 'function' ? opts.onClose : null,
				focusTid:       null,
			};

			state.entries.set(key, entry);
			if (entry.modal) {
				state.modalStack.push(entry);
				applyModalState(this, true);
			}

			return this.close.bind(this, key);
		},

		close: function(key) {
			var state = ensureState(this);
			var entry = state.entries.get(key);
			if (!entry) return;

			state.entries.delete(key);

			if (entry.focusTid) { clearTimeout(entry.focusTid); entry.focusTid = null; }

			if (entry.modal) {
				var idx = state.modalStack.indexOf(entry);
				if (idx !== -1) state.modalStack.splice(idx, 1);
			}

			if (entry.layer && entry.layer.parentNode === this) entry.layer.remove();

			if (entry.modal) {
				applyModalState(this, true);
				var hasActive = !!getActiveEntry(this);
				if (!hasActive && entry.restoreFocusEl && document.contains(entry.restoreFocusEl)) {
					focusEl(entry.restoreFocusEl);
				}
			}

			if (entry.onClose) { try { entry.onClose(); } catch (err) {} }
		}
	  }
	},

	style: (styleCtx) => styleCtx.css`
		pwa-overlay {
			position: absolute;
			inset: 0;
			z-index: 200;
			pointer-events: none;
		}
		.pwa-overlay-layer {
			position: absolute;
			inset: 0;
			pointer-events: none;
		}
		pwa-overlay > *,
		.pwa-overlay-layer > * {
			pointer-events: auto;
		}
	`,

	render: function(ctx) { return ctx.html``; },

	disconnected: function(ctx) {
		var host  = ctx.host;
		var state = ensureState(host);

		// Close all entries without side effects — clean up in one pass at the end.
		state.entries.forEach(function(entry) {
			if (entry.focusTid) { clearTimeout(entry.focusTid); entry.focusTid = null; }
			if (entry.layer && entry.layer.parentNode === host) entry.layer.remove();
			if (entry.onClose) { try { entry.onClose(); } catch (err) {} }
		});
		state.entries.clear();
		state.modalStack.length = 0;

		restoreSiblings(host);

		if (state.onDocKeydown) {
			document.removeEventListener('keydown', state.onDocKeydown, true);
			state.onDocKeydown = null;
		}
		if (state.scrollLocked) {
			setBodyScrollLocked(false);
			state.scrollLocked = false;
		}

		stateByHost.delete(host);
	},

};

