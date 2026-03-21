/**
 * @fstage/ssr
 *
 * Server-side rendering for fstage components via Declarative Shadow DOM (DSD).
 * Renders component definitions to self-contained HTML strings on the server,
 * enabling server-rendered shells that hydrate on the client with no build step.
 *
 * Designed for Node.js. Requires `@lit-labs/ssr` as a peer dependency when
 * components use lit-html templates (the common case):
 *   npm install @lit-labs/ssr
 *
 * Usage:
 *   import { createSsrRuntime }    from '@fstage/ssr';
 *   import { html, css }           from 'lit';
 *   import { repeat, classMap }    from 'lit/directives/...';
 *   import { render }              from '@lit-labs/ssr';
 *   import { collectResultSync }   from '@lit-labs/ssr/lib/render-result.js';
 *   import MyComponent             from './my-component.mjs';
 *
 *   const ssr = createSsrRuntime({
 *     ctx:       { html, css, repeat, classMap },
 *     serialize: (r) => collectResultSync(render(r)),
 *   });
 *
 *   const fragment = ssr.renderToString(MyComponent, { tasks: [] });
 *   // → '<my-component><template shadowrootmode="open"><style>…</style>…</template></my-component>'
 *
 * Limitations (server ctx is intentionally minimal):
 *   - def.constructed / connected / rendered / disconnected are not called.
 *   - inject services are not available (ctx has no injected keys).
 *   - Reactive watchers, bind, interactions, animations are not wired.
 *   - Components that access the DOM (document, window) inside render will throw;
 *     guard with typeof document !== 'undefined' for isomorphic components.
 *   - ctx.emit, ctx.cleanup, ctx.animate, ctx.host, ctx.root are not present.
 */

// =============================================================================
// State helpers
// =============================================================================

/**
 * Extract declared default values from a raw state descriptor map.
 * Handles all shorthand forms: bare value, `$ext`, `$prop`, and full `$src` descriptor.
 * Only called with plain (non-getter) descriptor entries.
 *
 * @param {Object} descriptors - Result of Object.getOwnPropertyDescriptors on def.state,
 *   filtered to non-getter entries only.
 * @param {Object} stateDef    - Original def.state (used to read the actual values).
 * @returns {Object} Map of key → default value.
 */
function extractStateDefaults(descriptors, stateDef) {
	const defaults = {};
	for (const key of Object.keys(descriptors)) {
		const s = stateDef[key];
		if (s && typeof s === 'object' && '$ext' in s) {
			defaults[key] = s.default;
		} else if (s && typeof s === 'object' && '$prop' in s) {
			const isTypeConstructor = typeof s.$prop === 'function';
			defaults[key] = isTypeConstructor ? s.default : s.$prop;
		} else if (s && typeof s === 'object' && '$src' in s) {
			defaults[key] = s.default;
		} else {
			// Bare value shorthand
			defaults[key] = s;
		}
	}
	return defaults;
}

/**
 * Build a minimal server-side state object for use in def.render(ctx).
 *
 * The returned state exposes:
 * - Plain values initialised from defaults merged with `initialState`.
 * - Reactive getters wired to call with `ctx` as `this` (via `getterCtxRef`).
 * - No-op implementations of all store methods ($set, $watch, etc.) so render
 *   functions that defensively call them do not throw.
 *
 * Getters are extracted via `Object.getOwnPropertyDescriptors` — never invoked
 * early — so `this.state.*` references inside getters are safe at extraction time.
 *
 * @param {Object} stateDef     - Raw def.state object (may have getter descriptors).
 * @param {Object} initialState - Caller-supplied initial state overrides.
 * @returns {{ state: Object, getterCtxRef: { ctx: Object|null } }}
 */
function buildSsrState(stateDef, initialState) {
	stateDef     = stateDef     || {};
	initialState = initialState || {};

	const getterCtxRef = { ctx: null };

	// Separate getter descriptors from plain value descriptors without invoking
	// any getters. Object.assign must NOT be used here — it invokes getters with
	// the wrong `this` context, causing TypeErrors and silently discarding them.
	const allDescriptors    = Object.getOwnPropertyDescriptors(stateDef);
	const getterDescriptors = {};
	const plainDescriptors  = {};

	for (const key of Object.keys(allDescriptors)) {
		if (typeof allDescriptors[key].get === 'function') {
			getterDescriptors[key] = allDescriptors[key];
		} else {
			plainDescriptors[key] = allDescriptors[key];
		}
	}

	// Extract default values from the plain (non-getter) declarations.
	const defaults = extractStateDefaults(plainDescriptors, stateDef);

	// Merge: declared defaults < initialState overrides.
	const values = Object.assign({}, defaults, initialState);

	// Build state object.
	const state = {};

	// Plain values — skip any keys that are covered by a getter.
	for (const key of Object.keys(values)) {
		if (!(key in getterDescriptors)) {
			state[key] = values[key];
		}
	}

	// Getters — 'this' is ctx, resolved via the ref after ctx is constructed.
	// Defined lazily on state so they are evaluated at render time, not build time.
	for (const key of Object.keys(getterDescriptors)) {
		(function(k, fn) {
			Object.defineProperty(state, k, {
				get()         { return fn.call(getterCtxRef.ctx); },
				enumerable:   true,
				configurable: true,
			});
		})(key, getterDescriptors[key].get);
	}

	// No-op store methods — prevent throws in render functions that call them.
	state.$set   = function() {};
	state.$del   = function() {};
	state.$merge = function() {};
	state.$reset = function() {};
	state.$watch = function() { return function() {}; };
	state.$get   = function(key) { return state[key]; };
	state.$has   = function(key) { return key in values || key in getterDescriptors; };
	state.$raw   = function(key) { return state[key]; };
	state.$query = function()    { return Promise.resolve([]); };

	return { state, getterCtxRef };
}

// =============================================================================
// Style helpers
// =============================================================================

/**
 * Resolve def.style to a plain CSS string.
 * Handles: function, CSSResult, array of CSSResults, and plain string fallback.
 *
 * @param {*} style     - def.style value.
 * @param {Object} ctx  - Style context ({ css, unsafeCSS }).
 * @returns {string}
 */
function resolveStyle(style, ctx) {
	if (!style) return '';
	let result;
	try {
		result = typeof style === 'function' ? style(ctx) : style;
	} catch (_) {
		return '';
	}
	if (!result) return '';
	if (Array.isArray(result)) {
		return result.map(function(r) { return (r && r.cssText) || ''; }).filter(Boolean).join('\n');
	}
	return (result && result.cssText) || String(result);
}

// =============================================================================
// DSD wrapper
// =============================================================================

/**
 * Escape a value for safe use in a double-quoted HTML attribute.
 *
 * @param {string} str
 * @returns {string}
 */
function escAttr(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Wrap rendered shadow content in a Declarative Shadow DOM shell.
 * For `shadow: false` components, renders content directly inside the host tag.
 *
 * @param {string} tag        - Custom element tag name.
 * @param {boolean} shadow    - Whether the component uses a shadow root.
 * @param {string} styleStr   - Resolved CSS string (empty if no style).
 * @param {string} content    - Serialised shadow DOM content.
 * @param {Object} [attrs={}] - Host element attributes to stamp on the outer tag.
 * @returns {string}
 */
function wrapDSD(tag, shadow, styleStr, content, attrs) {
	attrs = attrs || {};

	const attrStr = Object.keys(attrs).map(function(k) {
		const v = attrs[k];
		return v === '' || v === true ? k : k + '="' + escAttr(String(v)) + '"';
	}).join(' ');

	const openTag  = '<' + tag + (attrStr ? ' ' + attrStr : '') + '>';
	const closeTag = '</' + tag + '>';

	if (!shadow) {
		return openTag + content + closeTag;
	}

	const styleTag = styleStr ? '<style>' + styleStr + '</style>' : '';

	return (
		openTag +
		'<template shadowrootmode="open">' +
		styleTag +
		content +
		'</template>' +
		closeTag
	);
}

// =============================================================================
// createSsrRuntime
// =============================================================================

/**
 * Create an SSR runtime for rendering fstage component definitions to HTML strings.
 *
 * @param {Object} [config]
 * @param {Object}   [config.ctx]            - Render helpers: `{ html, css, svg, repeat, classMap, … }`.
 *   Should match what is passed to `createRuntime` on the client. lit-html's `html`
 *   and directive helpers must be the same versions used in component definitions.
 * @param {Function} [config.serialize]      - Serialiser that converts a lit-html
 *   `TemplateResult` to a string. Required when components have a `render` function.
 *   Recommended: `(r) => collectResultSync(render(r))` from `@lit-labs/ssr`.
 *   For testing or simple components without lit-html directives, any function that
 *   accepts the result of `def.render(ctx)` and returns a string is valid.
 * @param {Object}   [config.config]         - App config object, exposed as `ctx.config`.
 * @param {Function} [config.onError]        - Runtime-level error handler:
 *   `(err, ctx, location) => void`. Called when `render` or `serialize` throws
 *   and the component does not supply `opts.onError`. `location` is `'render'` or
 *   `'serialize'`. Falls back to `console.error`.
 *
 * @returns {{ renderToString: Function }}
 */
export function createSsrRuntime(config) {
	config = config || {};

	const renderCtx = config.ctx    || {};
	const serialize = config.serialize || null;
	const appConfig = config.config || {};

	// Style context — css/unsafeCSS only (no html/svg needed for styles).
	const styleCtx = {};
	['css', 'unsafeCSS'].forEach(function(k) {
		if (renderCtx[k]) styleCtx[k] = renderCtx[k];
	});

	// -------------------------------------------------------------------------
	// renderToString(def, initialState?, opts?)
	// -------------------------------------------------------------------------

	/**
	 * Render a component definition to an HTML string with Declarative Shadow DOM.
	 *
	 * @param {Object} def             - Component definition object (same format as define()).
	 * @param {Object} [initialState]  - Initial state values merged over declared defaults.
	 *   External state (declared with `$ext`) defaults to its declared `default`; pass
	 *   the actual value here so the server render reflects real data.
	 * @param {Object} [opts]
	 * @param {Function} [opts.onError] - Per-call error handler (overrides config.onError).
	 * @param {Object}  [opts.attrs]    - Host element attributes to stamp on the outer tag.
	 *   Attribute value `''` or `true` renders as a boolean attribute.
	 * @returns {string} HTML string — a custom element tag wrapping a DSD `<template>`
	 *   (or plain inner HTML for `shadow: false` components).
	 */
	function renderToString(def, initialState, opts) {
		initialState = initialState || {};
		opts         = opts         || {};

		const tag = def && def.tag;
		if (!tag) throw new Error('[fstage/ssr] def.tag is required');

		// Fail fast if serialize is missing and the component has a render function.
		// Checked here rather than after render() runs so the error is immediate.
		if (def.render && !serialize) {
			throw new Error(
				'[fstage/ssr] config.serialize is required to serialise lit-html templates.\n' +
				'Install @lit-labs/ssr and pass a serialiser:\n\n' +
				'  import { render }            from \'@lit-labs/ssr\';\n' +
				'  import { collectResultSync } from \'@lit-labs/ssr/lib/render-result.js\';\n' +
				'  createSsrRuntime({ serialize: (r) => collectResultSync(render(r)), ... })'
			);
		}

		const shadow = def.shadow !== false;

		const handleError = function(err, ctx, location) {
			const handler = opts.onError || config.onError;
			if (handler) return handler(err, ctx, location);
			console.error('[fstage/ssr] ' + location + ' error in ' + tag + ':', err);
		};

		// Build state — getters are extracted via property descriptors, never invoked early.
		const { state, getterCtxRef } = buildSsrState(def.state, initialState);

		// Minimal server ctx — no host, root, cleanup, emit, animate, forms.
		const ctx = { state, config: appConfig, _: {} };
		['html', 'css', 'svg', 'repeat', 'classMap'].forEach(function(k) {
			if (renderCtx[k]) ctx[k] = renderCtx[k];
		});

		// Wire getter 'this' now that ctx is complete.
		getterCtxRef.ctx = ctx;

		// Resolve styles.
		const styleStr = resolveStyle(def.style, styleCtx);

		// Components with no render function produce an empty shell.
		if (!def.render) {
			return wrapDSD(tag, shadow, styleStr, '', opts.attrs);
		}

		// Call render.
		let templateResult;
		try {
			templateResult = def.render(ctx);
		} catch (err) {
			handleError(err, ctx, 'render');
			return wrapDSD(tag, shadow, styleStr, '', opts.attrs);
		}

		// Serialize the lit-html TemplateResult (or any value render returned).
		let content;
		try {
			content = serialize(templateResult);
		} catch (err) {
			handleError(err, ctx, 'serialize');
			return wrapDSD(tag, shadow, styleStr, '', opts.attrs);
		}

		return wrapDSD(tag, shadow, styleStr, content, opts.attrs);
	}

	return { renderToString };
}
