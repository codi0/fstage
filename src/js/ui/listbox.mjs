/**
 * @fstage/ui — listbox
 *
 * An accessible listbox with full keyboard navigation and typeahead.
 * Implements the ARIA Listbox pattern (role="listbox" / role="option").
 *
 * Usage (single select):
 *   <fs-listbox
 *     .options=${[{ value: 'a', label: 'Option A' }, ...]}
 *     .value=${'a'}
 *     @change=${e => state.$set('val', e.detail.value)}>
 *   </fs-listbox>
 *
 * Usage (multi select):
 *   <fs-listbox
 *     multiple
 *     .options=${options}
 *     .value=${'a,b'}
 *     @change=${e => state.$set('vals', e.detail.value)}>
 *   </fs-listbox>
 *
 * Option object shape:
 *   { value: string, label: string, disabled?: boolean }
 *
 * Events:
 *   change   detail: { value: string }         — single select
 *            detail: { value: string[] }        — multi select
 *
 * Keyboard:
 *   ArrowDown / ArrowUp    Move focus (single: also selects)
 *   Home / End             Jump to first / last enabled option
 *   Enter / Space          Select focused option (multi: toggle)
 *   Printable chars        Typeahead — jump to first matching label
 */

// --- Helpers -----------------------------------------------------------------

/**
 * Parse the `value` prop into the internal selection type.
 * Single: returns a string. Multi: returns a string[].
 *
 * @param {string|string[]|*} val
 * @param {boolean} multiple
 * @returns {string|string[]}
 */
function parseValue(val, multiple) {
	if (!val && val !== 0) return multiple ? [] : '';
	if (multiple) {
		if (Array.isArray(val)) return val.map(String);
		return String(val).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
	}
	return String(val);
}

/**
 * Return true if `optValue` is currently selected.
 *
 * @param {string} optValue
 * @param {string|string[]} selected
 * @param {boolean} multiple
 * @returns {boolean}
 */
function isSelected(optValue, selected, multiple) {
	if (multiple) return selected.indexOf(optValue) !== -1;
	return optValue === selected;
}

/**
 * Return the index of the next enabled option in direction `dir` (+1 or -1),
 * wrapping around. Returns -1 if no enabled option exists.
 *
 * @param {Object[]} options
 * @param {number} from   Starting index (exclusive).
 * @param {number} dir    +1 for forward, -1 for backward.
 * @returns {number}
 */
function nextEnabledIdx(options, from, dir) {
	var len = options.length;
	if (!len) return -1;
	var i = from + dir;
	var checked = 0;
	while (checked < len) {
		if (i < 0) i = len - 1;
		if (i >= len) i = 0;
		if (!options[i].disabled) return i;
		i += dir;
		checked++;
	}
	return -1;
}

/**
 * Return the index of the first enabled option, or -1.
 *
 * @param {Object[]} options
 * @returns {number}
 */
function firstEnabledIdx(options) {
	for (var i = 0; i < options.length; i++) {
		if (!options[i].disabled) return i;
	}
	return -1;
}

/**
 * Return the index of the last enabled option, or -1.
 *
 * @param {Object[]} options
 * @returns {number}
 */
function lastEnabledIdx(options) {
	for (var i = options.length - 1; i >= 0; i--) {
		if (!options[i].disabled) return i;
	}
	return -1;
}

/**
 * Return the index to activate on first keyboard focus.
 * Prefers the first currently-selected option; falls back to first enabled.
 *
 * @param {Object[]} options
 * @param {string|string[]} selected
 * @param {boolean} multiple
 * @returns {number}
 */
function initialActiveIdx(options, selected, multiple) {
	// Start at first selected option, or first enabled
	var first = Array.isArray(selected) ? (selected.length ? selected[0] : null) : (selected || null);
	if (first != null) {
		for (var i = 0; i < options.length; i++) {
			if (!options[i].disabled && String(options[i].value) === String(first)) return i;
		}
	}
	return firstEnabledIdx(options);
}

/**
 * Toggle `value` in the multi-select array. Returns a new array.
 *
 * @param {string[]} selected
 * @param {string} value
 * @returns {string[]}
 */
function toggleMulti(selected, value) {
	var idx = selected.indexOf(value);
	if (idx === -1) return selected.concat([value]);
	var next = selected.slice();
	next.splice(idx, 1);
	return next;
}

/**
 * Scroll the `.fs-lb-option.active` element into view within the listbox
 * container if it is outside the visible bounds.
 *
 * @param {Element|ShadowRoot} root
 */
function scrollActiveIntoView(root) {
	var listbox = root && root.querySelector('.fs-lb');
	var active  = listbox && listbox.querySelector('.fs-lb-option.active');
	if (!active || !listbox) return;
	var lb = listbox.getBoundingClientRect();
	var op = active.getBoundingClientRect();
	if (op.top < lb.top)         listbox.scrollTop -= lb.top - op.top + 4;
	else if (op.bottom > lb.bottom) listbox.scrollTop += op.bottom - lb.bottom + 4;
}

// --- Handlers ----------------------------------------------------------------

/**
 * Select (or toggle) the option at `idx`. Updates `ctx._.selected`,
 * emits `change`, and forces a re-render via `_tick`.
 *
 * @param {number} idx
 * @param {Object} ctx
 */
function selectIdx(idx, ctx) {
	var opts     = ctx.state.options || [];
	var multiple = ctx.state.multiple;
	var opt      = opts[idx];
	if (!opt || opt.disabled) return;

	if (multiple) {
		var next = toggleMulti(ctx._.selected, String(opt.value));
		ctx._.selected = next;
		ctx.emit('change', { value: next });
	} else {
		ctx._.selected = String(opt.value);
		ctx.emit('change', { value: String(opt.value) });
	}
	// Force re-render so aria-selected reflects new state
	ctx.state.$set('_tick', (ctx.state._tick || 0) + 1);
}

/**
 * Handle keyboard navigation and selection for the listbox.
 *
 * @param {KeyboardEvent} e
 * @param {Object} ctx
 */
function handleKeydown(e, ctx) {
	var opts     = ctx.state.options || [];
	var multiple = ctx.state.multiple;
	var active   = ctx.state.activeIdx;

	// Ignore modifier-key combos (browser shortcuts)
	if (e.ctrlKey || e.metaKey || e.altKey) return;

	var next = active;

	switch (e.key) {
		case 'ArrowDown':
			e.preventDefault();
			next = nextEnabledIdx(opts, active < 0 ? -1 : active, 1);
			break;
		case 'ArrowUp':
			e.preventDefault();
			next = nextEnabledIdx(opts, active < 0 ? opts.length : active, -1);
			break;
		case 'Home':
			e.preventDefault();
			next = firstEnabledIdx(opts);
			break;
		case 'End':
			e.preventDefault();
			next = lastEnabledIdx(opts);
			break;
		case 'Enter':
		case ' ':
			e.preventDefault();
			if (active >= 0) selectIdx(active, ctx);
			return;
		default:
			// Typeahead — printable single chars
			if (e.key.length === 1) {
				e.preventDefault();
				handleTypeahead(e.key, ctx);
			}
			return;
	}

	if (next !== active && next >= 0) {
		ctx.state.$set('activeIdx', next);
		// Single select: arrow movement also selects
		if (!multiple) selectIdx(next, ctx);
		requestAnimationFrame(function() { scrollActiveIntoView(ctx.root); });
	}
}

/**
 * Jump to the first option whose label starts with the accumulated
 * typeahead string. Resets after 600ms of inactivity.
 *
 * @param {string} char  A single printable character.
 * @param {Object} ctx
 */
function handleTypeahead(char, ctx) {
	var opts = ctx.state.options || [];
	var _    = ctx._;
	if (!opts.length) return;

	_.typeaheadStr += char.toLowerCase();
	clearTimeout(_.typeaheadTid);
	_.typeaheadTid = setTimeout(function() { _.typeaheadStr = ''; }, 600);

	var str = _.typeaheadStr;
	var start = (ctx.state.activeIdx < 0 ? 0 : ctx.state.activeIdx + 1) % opts.length;

	// Search from current position, wrap around
	for (var i = 0; i < opts.length; i++) {
		var idx = (start + i) % opts.length;
		var opt = opts[idx];
		if (!opt.disabled && String(opt.label).toLowerCase().indexOf(str) === 0) {
			ctx.state.$set('activeIdx', idx);
			if (!ctx.state.multiple) selectIdx(idx, ctx);
			requestAnimationFrame(function() { scrollActiveIntoView(ctx.root); });
			return;
		}
	}
}

// --- Component ---------------------------------------------------------------

export default {

	tag: 'fs-listbox',

	state: {
		options:   { $prop: [] },
		value:     { $prop: '' },
		multiple:  { $prop: false },
		activeIdx: -1,
		_tick:     0,  // force re-render on selection change
	},

	constructed({ _ }) {
		_.selected     = '';   // string (single) or string[] (multi)
		_.typeaheadStr = '';
		_.typeaheadTid = null;
	},

	watch: {
		value: {
			handler: function(e, ctx) {
				ctx._.selected = parseValue(e.val, ctx.state.multiple);
			},
			immediate: true,
		},
		options: {
			handler: function(e, ctx) {
				// Re-clamp activeIdx if options changed
				var opts = e.val || [];
				var idx  = ctx.state.activeIdx;
				if (idx >= opts.length) {
					ctx.state.$set('activeIdx', lastEnabledIdx(opts));
				}
			},
		},
	},

	style: (styleCtx) => styleCtx.css`
		:host { display: block; }

		.fs-lb {
			display: flex; flex-direction: column;
			outline: none;
			overflow-y: auto;
		}
		.fs-lb:focus-visible {
			box-shadow: inset 0 0 0 2px var(--color-primary-subtle, rgba(0,122,255,0.2));
			border-radius: var(--radius-sm, 8px);
		}

		.fs-lb-option {
			display: flex; align-items: center; justify-content: space-between;
			padding: 12px 14px;
			cursor: pointer;
			color: var(--text-primary, #111);
			font-size: 16px;
			border-radius: var(--radius-sm, 8px);
			-webkit-tap-highlight-color: transparent;
			transition: background var(--motion-fast, 160ms) ease;
			gap: 10px;
		}
		.fs-lb-option:hover,
		.fs-lb-option.active {
			background: var(--bg-secondary, rgba(0,0,0,0.04));
		}
		.fs-lb-option.selected {
			color: var(--color-primary, #007aff);
			font-weight: 500;
		}
		.fs-lb-option.disabled {
			color: var(--text-quaternary, #bbb);
			cursor: not-allowed;
			pointer-events: none;
		}

		.fs-lb-option-label { flex: 1; min-width: 0; }

		/* Checkmark indicator (visible when selected) */
		.fs-lb-check {
			flex-shrink: 0;
			width: 18px; height: 18px;
			color: var(--color-primary, #007aff);
			opacity: 0;
		}
		.fs-lb-option.selected .fs-lb-check { opacity: 1; }

		@media (prefers-reduced-motion: reduce) {
			.fs-lb-option { transition: none; }
		}
	`,

	interactions: {
		'click(.fs-lb-option)': function(e, ctx) {
			var idx = parseInt(e.matched.dataset.index, 10);
			if (isNaN(idx)) return;
			ctx.state.$set('activeIdx', idx);
			selectIdx(idx, ctx);
		},
		'keydown(.fs-lb)': function(e, ctx) {
			handleKeydown(e, ctx);
		},
		'focus(.fs-lb)': function(e, ctx) {
			// Initialise activeIdx on first focus if not yet set.
			if (ctx.state.activeIdx < 0) {
				var opts = ctx.state.options || [];
				ctx.state.$set('activeIdx', initialActiveIdx(opts, ctx._.selected, ctx.state.multiple));
			}
		},
	},

	render: function(ctx) {
		var opts      = ctx.state.options || [];
		var multiple  = ctx.state.multiple;
		var activeIdx = ctx.state.activeIdx;
		var selected  = ctx._.selected;
		var activeId  = activeIdx >= 0 ? 'fs-lb-opt-' + activeIdx : '';

		return ctx.html`
			<div class="fs-lb"
			     role="listbox"
			     tabindex="0"
			     aria-multiselectable=${multiple}
			     aria-activedescendant=${activeId}>
				${opts.map(function(opt, i) {
					var sel  = isSelected(String(opt.value), selected, multiple);
					var isActive = i === activeIdx;
					var cls  = 'fs-lb-option'
						+ (sel      ? ' selected' : '')
						+ (isActive ? ' active'   : '')
						+ (opt.disabled ? ' disabled' : '');
					return ctx.html`
						<div id=${'fs-lb-opt-' + i}
						     class=${cls}
						     role="option"
						     aria-selected=${sel}
						     aria-disabled=${!!opt.disabled}
						     data-index=${i}
						     data-value=${opt.value}>
							<span class="fs-lb-option-label">${opt.label}</span>
							<svg class="fs-lb-check"
							     viewBox="0 0 24 24" aria-hidden="true"
							     fill="none" stroke="currentColor" stroke-width="2.5"
							     stroke-linecap="round" stroke-linejoin="round">
								<polyline points="20 6 9 17 4 12"/>
							</svg>
						</div>
					`;
				})}
			</div>
		`;
	},

	disconnected: function(ctx) {
		clearTimeout(ctx._.typeaheadTid);
	},

};
