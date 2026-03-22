/**
 * @fstage/stack
 *
 * Default service wiring for a standard fstage app. Removes the ~80-line
 * boilerplate from `afterLoadLibs` / `afterLoadApp` while keeping the full
 * explicit-wiring path available for apps that need it.
 *
 * Because @fstage/stack loads in the `preload` phase, its exports are
 * available via `e.get()` in all subsequent hooks — no imports needed in
 * config.mjs:
 *
 *   loadAssets: {
 *     preload: [ '@fstage/env', '@fstage/registry', '@fstage/stack' ],
 *     libs:    [ 'lit', '@fstage/component', '@fstage/store', '@fstage/sync',
 *                '@fstage/history', '@fstage/router', '@fstage/animator',
 *                '@fstage/gestures', '@fstage/transitions',
 *                '@fstage/interactions', '@fstage/form' ],
 *     app:     [ ...componentFiles, 'css/style.css' ],
 *   },
 *
 *   router: {
 *     urlScheme: 'hash',
 *     routes: [ { path: '/', meta: { component: 'my-home', title: 'Home' } } ],
 *   },
 *   storage: { name: 'myapp', schemas: { items: { keyPath: 'id' } } },
 *
 *   afterLoadPreload(e) { e.get('stack.wirePreload', [ e ]); },
 *   afterLoadLibs(e)    { e.get('stack.wireStack',   [ e ]); },
 *   afterLoadApp(e)     { e.get('stack.startStack',  [ e ]); },
 *
 * All services are accessible after wiring via:
 *   fstage.get('registry.defaultRegistry', []).get('store')
 *
 * @module @fstage/stack
 */


// =============================================================================
// wirePreload
// =============================================================================

/**
 * Wire the preload phase — env detection and registry initialisation.
 * Call from `afterLoadPreload(e)` in your config.
 *
 * Registers `'env'` in the default registry. Safe to skip if your app wires
 * env manually.
 *
 * @param {Object} e       - Hook event object (provides `e.get`).
 * @param {Object} [opts]
 * @param {string}  [opts.preset] - Force an OS preset for env detection
 *   (`'ios'`, `'android'`, `'windows'`, `'mac'`). Useful for dev testing.
 *   Reads `?preset=` from the URL when `debug` is truthy and no explicit
 *   preset is supplied.
 * @param {boolean} [opts.debug]  - Enable debug mode (exposes URL preset param).
 *   Defaults to `config.debug`.
 * @returns {Object} The default registry instance.
 */
export function wirePreload(e, opts) {
	opts = opts || {};

	var registry = e.get('registry.defaultRegistry', []);
	var debug    = opts.debug !== undefined ? opts.debug : e.get('config.debug');

	var preset = opts.preset || null;
	if (!preset && debug) {
		try {
			preset = new URLSearchParams(globalThis.location.search).get('preset') || null;
		} catch (_) {}
	}

	var env = e.get('env.getEnv', [{ preset: preset || undefined }]);
	registry.set('env', env);

	return registry;
}


// =============================================================================
// wireStack
// =============================================================================

/**
 * @typedef {Object} WireStackOpts
 *
 * @property {string}   [name]            - App name shown in page titles.
 * @property {boolean}  [debug]           - Enable debug mode (devtools, mock remote).
 *   Defaults to `config.debug` when omitted.
 *
 * @property {Object|false} [router]      - Router options merged over `config.router`.
 *   Pass `false` to skip router creation entirely.
 * @property {Object|false} [storage]     - Storage options merged over `config.storage`.
 *   Shape: `{ name, schemas }`. Pass `false` to skip storage + sync.
 * @property {Object|null}  [remoteHandler] - Pre-built remote handler instance.
 *   When omitted and `debug && config.mockRemote` is truthy, a mock storage
 *   handler is created automatically using `config.api` for seed URLs.
 *   Note: auto mock only seeds when `config.storage.schemas` has exactly one
 *   namespace; pass an explicit `remoteHandler` for multi-namespace setups.
 * @property {Function|Object|null} [policy] - App policy merged over the platform
 *   default. May be a plain object or `(facts, config) => object`.
 *   Defaults to `config.policy` when omitted.
 *
 * @property {Object|null}   [ctx]       - Render helpers for the component runtime
 *   (e.g. `{ html, css, svg }` from lit-html). When omitted the stack attempts
 *   `e.get('lit')` automatically.
 * @property {Function|null} [baseClass] - Component base class (e.g. LitElement).
 *   Defaults to `e.get('lit.LitElement')`.
 *
 * @property {Object} [services]         - Per-service overrides. Each key matches
 *   a registry name; the value is either `false` (skip) or a factory function
 *   `() => instance` that replaces the built-in wiring.
 *   Recognised keys: `store`, `sync`, `storage`, `animator`, `screenHost`,
 *   `transitions`, `gestureManager`, `interactionsManager`, `componentRuntime`,
 *   `formManager`.
 */

/**
 * Wire all standard services and register them in the default registry.
 * Call from `afterLoadLibs(e)` in your config.
 *
 * The full explicit-wiring path remains available — call `wireStack` for the
 * common case and reach into individual modules only where you need to override.
 *
 * @param {Object}        e       - Hook event object.
 * @param {WireStackOpts} [opts]  - Optional overrides (see typedef above).
 * @returns {Object} The default registry instance.
 */
export function wireStack(e, opts) {
	opts = opts || {};

	var config   = e.get('config') || {};
	var registry = e.get('registry.defaultRegistry', []);

	// -------------------------------------------------------------------------
	// Resolved options — config values are the defaults, opts values win
	// -------------------------------------------------------------------------

	var name     = opts.name  !== undefined ? opts.name  : (config.name  || '');
	var debug    = opts.debug !== undefined ? opts.debug : (config.debug || false);
	var services = opts.services || {};

	var routerConf  = opts.router  !== undefined ? opts.router  : (config.router  || {});
	var storageConf = opts.storage !== undefined ? opts.storage : (config.storage || null);

	var policyOpt = opts.policy !== undefined ? opts.policy : (config.policy || null);

	// -------------------------------------------------------------------------
	// Env + policy
	// -------------------------------------------------------------------------

	var env   = registry.get('env');
	var facts = env ? env.getFacts() : {};

	if (policyOpt && env) {
		var resolved = (typeof policyOpt === 'function')
			? policyOpt(facts, config)
			: policyOpt;
		if (resolved) env.registerPolicy(resolved, 100);
	}

	var policy = env ? env.getPolicy() : {};
	if (env) env.applyToDoc();

	// Merge env facts + resolved policy back into config so components can
	// read ctx.config.env / ctx.config.policy / ctx.config.native
	var fullConfig = Object.assign({}, config, {
		name:   name,
		env:    facts,
		policy: policy,
		native: !!facts.isNative,
	});

	// -------------------------------------------------------------------------
	// Render context (lit or custom)
	// -------------------------------------------------------------------------

	var lit       = opts.ctx       || e.get('lit')          || {};
	var baseClass = opts.baseClass || e.get('lit.LitElement') || null;

	// -------------------------------------------------------------------------
	// Core reactive services
	// -------------------------------------------------------------------------

	var store = _service(services, 'store', function() {
		return e.get('store.createStore', []);
	});

	var models = e.get('registry.createRegistry', []);

	var formManager = _service(services, 'formManager', function() {
		return e.get('form.createFormManager', []);
	});

	// -------------------------------------------------------------------------
	// Storage + sync
	// -------------------------------------------------------------------------

	var storage     = null;
	var syncManager = null;

	if (storageConf !== false) {
		storage = _service(services, 'storage', function() {
			return e.get('sync.createStorage', [ storageConf || {} ]);
		});

		var remoteHandler = opts.remoteHandler !== undefined
			? opts.remoteHandler
			: _buildMockRemote(e, config, debug, storageConf);

		syncManager = _service(services, 'sync', function() {
			return e.get('sync.createSyncManager', [{
				localHandler:  storage,
				remoteHandler: remoteHandler || undefined,
			}]);
		});
	}

	// -------------------------------------------------------------------------
	// Router
	// -------------------------------------------------------------------------

	var router = null;

	if (routerConf !== false) {
		var historyOpts    = Object.assign({}, routerConf);
		historyOpts.history = e.get('history.createBrowserHistory', [ routerConf ]);
		router = e.get('router.createRouter', [ historyOpts ]);
	}

	// -------------------------------------------------------------------------
	// Platform — animator, screen host, transition engine
	// -------------------------------------------------------------------------

	var animator = _service(services, 'animator', function() {
		return e.get('animator.createAnimator', [{ motion: policy.motion }]);
	});

	var screenHost = _service(services, 'screenHost', function() {
		return e.get('transitions.createScreenHost', [{ name: name }]);
	});

	var transitions = _service(services, 'transitions', function() {
		return e.get('transitions.createTransitionEngine', [{ animator: animator, screenHost: screenHost }]);
	});

	// -------------------------------------------------------------------------
	// Gestures + interactions
	// -------------------------------------------------------------------------

	var gestureManager = _service(services, 'gestureManager', function() {
		return e.get('gestures.createGestureManager', [{ policy: policy.gestures }]);
	});

	var interactionsManager = _service(services, 'interactionsManager', function() {
		return e.get('interactions.createInteractionsManager', []);
	});

	// Wire interaction extensions — guarded so skipped services don't throw
	if (interactionsManager) {
		var gestureInteraction    = gestureManager    ? e.get('gestures.gestureInteraction')         : null;
		var screenHostInteraction = screenHost        ? e.get('transitions.screenHostInteraction')   : null;
		var accompanyInteraction  = screenHost        ? e.get('transitions.accompanyInteraction')    : null;

		if (gestureInteraction)    interactionsManager.extend('gesture',    gestureInteraction(gestureManager));
		if (screenHostInteraction) interactionsManager.extend('screen',     screenHostInteraction(screenHost));
		if (accompanyInteraction)  interactionsManager.extend('transition', accompanyInteraction(screenHost));
	}

	// -------------------------------------------------------------------------
	// Component runtime
	// -------------------------------------------------------------------------

	var componentRuntime = _service(services, 'componentRuntime', function() {
		return e.get('component.createRuntime', [{
			store:               store,
			config:              fullConfig,
			registry:            registry,
			animator:            animator,
			screenHost:          screenHost,
			formManager:         formManager,
			gestureManager:      gestureManager,
			interactionsManager: interactionsManager,
			baseClass:           baseClass,
			ctx:                 { html: lit.html, css: lit.css, svg: lit.svg },
		}]);
	});

	// -------------------------------------------------------------------------
	// Register everything
	// -------------------------------------------------------------------------

	registry.set('config',              fullConfig);
	registry.set('store',               store);
	registry.set('models',              models);
	registry.set('formManager',         formManager);
	registry.set('animator',            animator);
	registry.set('screenHost',          screenHost);
	registry.set('transitions',         transitions);
	registry.set('gestureManager',      gestureManager);
	registry.set('interactionsManager', interactionsManager);
	registry.set('componentRuntime',    componentRuntime);

	if (storage)     registry.set('storage',     storage);
	if (syncManager) registry.set('syncManager', syncManager);
	if (router)      registry.set('router',      router);

	// -------------------------------------------------------------------------
	// Auto-define components loaded after this point
	// Patch fstage's internal config.afterLoad so component definitions that
	// export a `tag` are automatically registered with the component runtime.
	// Any existing afterLoad in the app config is preserved and called after.
	// -------------------------------------------------------------------------

	var origAfterLoad = config.afterLoad;
	config.afterLoad = function(ev) {
		var def = ev.exports && ev.exports.default;
		if (def && def.tag) {
			var runtime = registry.get('componentRuntime');
			if (runtime) runtime.define(def);
		}
		if (typeof origAfterLoad === 'function') origAfterLoad(ev);
	};

	// -------------------------------------------------------------------------
	// Devtools (debug only)
	// -------------------------------------------------------------------------

	if (debug) {
		Promise.all([
			import('@fstage/devtools'),
			import('@fstage/devtools/panel.mjs'),
		]).then(function(mods) {
			var devtools = mods[0].createDevtools({ maxEvents: 500 });
			devtools.connectStore(registry.get('store'));
			if (registry.get('syncManager')) devtools.connectSync(registry.get('syncManager'));
			if (registry.get('storage'))     devtools.connectStorage(registry.get('storage'));
			registry.set('devtools', devtools);
			if (globalThis.fstage) globalThis.fstage.devtools = devtools;
			mods[1].mountDevtoolsPanel(devtools, { position: 'bottom' });
		}).catch(function() {});
	}

	return registry;
}


// =============================================================================
// startStack
// =============================================================================

/**
 * @typedef {Object} StartStackOpts
 *
 * @property {Element|string|null} [rootEl]
 *   Root element (or selector) passed to `screenHost.start()` and `router.start()`.
 *   Defaults to `config.rootEl`, then `'body'`.
 *
 * @property {Element|string|null} [appEl]
 *   Element (or selector) passed to `gestureManager.start()`. Defaults to
 *   a `[data-app]` or `pwa-app` child of `rootEl`, then `rootEl` itself.
 *
 * @property {Object|false} [edgePan]
 *   Edge-pan back gesture options. Pass `false` to disable entirely.
 *   All `gestureManager.on('edgePan', ...)` options are supported.
 *   Defaults applied when not overridden:
 *   - `edge` — `'left'`
 *   - `shouldStart` — blocks during active transitions, open sheet panels,
 *     and open modals/dialogs (checks `[data-transitioning]`,
 *     `.sheet-panel.is-open`, `[aria-modal]`, `[role="dialog"]`)
 *   - `onStart/onProgress/onCommit/onCancel` — interactive transition wired
 *     to the previous router entry
 *   Supply any of these to extend or replace the defaults.
 *
 * @property {boolean} [sealModels]
 *   Seal the models registry after startup (default: `true`).
 */

/**
 * Start all wired services: gesture manager, screen host, and router.
 * Wires the router's `onAfter` hook to drive transitions and update the
 * route in the store. Call from `afterLoadApp(e)` in your config.
 *
 * @param {Object}         e       - Hook event object.
 * @param {StartStackOpts} [opts]  - Optional overrides (see typedef above).
 * @returns {Object} The default registry instance.
 */
export function startStack(e, opts) {
	opts = opts || {};

	var registry        = e.get('registry.defaultRegistry', []);
	var config          = registry.get('config') || {};
	var store           = registry.get('store');
	var router          = registry.get('router');
	var screenHost      = registry.get('screenHost');
	var transitions     = registry.get('transitions');
	var gestureManager  = registry.get('gestureManager');
	var models          = registry.get('models');

	// -------------------------------------------------------------------------
	// Resolve root elements
	// -------------------------------------------------------------------------

	var rootSel = opts.rootEl || config.rootEl || 'body';
	var rootEl  = _resolveEl(rootSel);

	var appEl = _resolveEl(opts.appEl || null);
	if (!appEl && rootEl) {
		appEl = rootEl.querySelector('[data-app], pwa-app') || rootEl;
	}
	if (!appEl) appEl = rootEl;

	// -------------------------------------------------------------------------
	// Edge pan
	// -------------------------------------------------------------------------

	if (gestureManager && appEl && opts.edgePan !== false) {
		var edgePanOpts = Object.assign({ edge: 'left' }, opts.edgePan || {});

		// Default shouldStart — blocks during transitions, open sheets, modals.
		if (!edgePanOpts.shouldStart) {
			edgePanOpts.shouldStart = function() {
				if (document.documentElement.hasAttribute('data-transitioning')) return false;
				if (document.querySelector('.sheet-panel.is-open, .sheet-panel.is-dragging')) return false;
				if (document.querySelector('[aria-modal="true"], [role="dialog"], .action-sheet-backdrop')) return false;
				return true;
			};
		}

		edgePanOpts.target = appEl;

		// onStart: kick off an interactive back transition.
		if (!edgePanOpts.onStart) {
			edgePanOpts.onStart = async function(ev) {
				if (!router || !transitions) return false;
				var prev = router.peek(-1);
				if (!prev) return false;
				ev.ctl = await transitions.run(prev, {
					transition:  config.policy && config.policy.transitions && config.policy.transitions.edgePan,
					interactive: true,
				});
				if (!ev.ctl) return false;
			};
		}

		if (!edgePanOpts.onProgress) {
			edgePanOpts.onProgress = function(ev) {
				if (ev.ctl) ev.ctl.progress(ev.progress);
			};
		}

		if (!edgePanOpts.onCommit) {
			edgePanOpts.onCommit = async function(ev) {
				if (!ev.ctl) return;
				await ev.ctl.commit();
				if (transitions) transitions.__suppress = true;
				if (router) router.go(-1);
			};
		}

		if (!edgePanOpts.onCancel) {
			edgePanOpts.onCancel = function(ev) {
				if (ev.ctl) ev.ctl.cancel();
			};
		}

		gestureManager.on('edgePan', edgePanOpts);
	}

	// -------------------------------------------------------------------------
	// Router → transitions + store
	// -------------------------------------------------------------------------

	if (router) {
		router.onAfter(function(route) {
			// Suppress transition when the gesture already committed it
			if (transitions && transitions.__suppress) {
				delete transitions.__suppress;
			} else if (transitions) {
				transitions.run(route, {
					transition: config.policy && config.policy.transitions && config.policy.transitions.pageNavigation,
				});
			}

			// Carry previous route forward for components that need it
			if (store) {
				var prev = store.$get('route') || {};
				delete prev.prev;
				route.prev = prev;
				store.$set('route', route);
			}
		});
	}

	// -------------------------------------------------------------------------
	// Start
	// -------------------------------------------------------------------------

	var sealModels = opts.sealModels !== false;
	if (sealModels && models && typeof models.seal === 'function') models.seal();

	if (gestureManager && appEl) gestureManager.start(appEl);
	if (screenHost && rootEl)    screenHost.start(rootEl);
	if (router && rootEl)        router.start(rootEl);

	return registry;
}


// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Invoke a service factory override if one is registered, otherwise call
 * the built-in factory.
 *
 * @param {Object}   services - The `opts.services` map.
 * @param {string}   key      - Service name.
 * @param {Function} builtIn  - Built-in factory (called with no args).
 * @returns {*}
 */
function _service(services, key, builtIn) {
	var override = services && services[key];
	if (override === false) return null;
	if (typeof override === 'function') return override();
	return builtIn();
}

/**
 * Build a mock remote handler when `debug && config.mockRemote` is truthy.
 * Returns `null` when conditions are not met.
 *
 * Auto-seeding from `config.api` only works when `config.storage.schemas` has
 * exactly one namespace — the namespace name is used to look up `config.api[namespace]`
 * for the seed URL. For multi-namespace schemas, pass an explicit `remoteHandler`
 * via `wireStack` opts instead.
 *
 * @param {Object}  e
 * @param {Object}  config
 * @param {boolean} debug
 * @param {Object}  storageConf
 * @returns {Object|null}
 */
function _buildMockRemote(e, config, debug, storageConf) {
	if (!debug || !config.mockRemote) return null;

	var createHandler  = e.get('sync.createHandler');
	var createStorage2 = e.get('sync.createStorage');

	if (!createHandler || !createStorage2) return null;

	// Mirror the app schema in a separate IDB database
	var mockSchemas = {};
	if (storageConf && storageConf.schemas) {
		for (var ns in storageConf.schemas) {
			mockSchemas[ns] = Object.assign({}, storageConf.schemas[ns]);
		}
	}

	var mockStorage = createStorage2({
		name:    (storageConf && storageConf.name ? storageConf.name : 'fstage') + '-mock-remote',
		schemas: mockSchemas,
	});

	// Seed URL + namespace — only resolvable for single-namespace schemas
	var api        = config.api || {};
	var namespaces = Object.keys(mockSchemas);
	var namespace  = namespaces.length === 1 ? namespaces[0] : null;
	var seedUrl    = namespace && api[namespace] ? api[namespace] : null;

	return createHandler(mockStorage, {
		namespace: namespace || undefined,
		seedUrl:   seedUrl   || undefined,
		latency:   config.mockLatency || 80,
		read:  { keyPath: 'id' },
		write: { idPath: 'data.id' },
	});
}

/**
 * Resolve an element reference from a string selector, Element, or null.
 *
 * @param {Element|string|null} el
 * @returns {Element|null}
 */
function _resolveEl(el) {
	if (!el) return null;
	if (typeof el === 'string') return document.querySelector(el);
	return el;
}
