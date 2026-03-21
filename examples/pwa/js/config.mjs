export default {

	name: 'Fstage Tasks',
	version: '1.0',

	debug: [ '', 'localhost', '127.0.0.1' ].includes(location.hostname),
	mockRemote: true, // set false to use real API

	api: {
		// In production this should be an absolute URL so it works in both
		// PWA and native (Capacitor) contexts. The mock path below is
		// relative and only used when debug + mockRemote are both true.
		tasks: 'api/tasks.json',
	},

	importMap: {
		'lit':         'https://cdn.jsdelivr.net/npm/lit-element@4/+esm',
		'lit/':        'https://cdn.jsdelivr.net/npm/lit-html/',
		'@capacitor/': 'https://cdn.jsdelivr.net/npm/@capacitor/',
	},

	loadAssets: {
		preload: [
			'@fstage/env',
			'@fstage/registry',
		],
		libs: [
			'lit',
			'@fstage/component',
			'@fstage/store',
			'@fstage/sync',
			'@fstage/history',
			'@fstage/router',
			'@fstage/animator',
			'@fstage/gestures',
			'@fstage/transitions',
			'@fstage/interactions',
			'@fstage/form',
		],
		app: [
			//data: sync
			'js/data/sync/tasks.mjs',
			'js/data/sync/settings.mjs',
			//data: models
			'js/data/models/tasks.mjs',
			'js/data/models/settings.mjs',
			//components: controls
			'js/components/controls/due-date-picker.mjs',
			'js/components/controls/priority-picker.mjs',
			'@fstage/ui/action-sheet.mjs',
			'@fstage/ui/bottom-sheet.mjs',
			//components: parts
			'js/components/parts/task-row.mjs',
			//components: views
			'js/components/views/tasks.mjs',
			'js/components/views/completed.mjs',
			'js/components/views/settings.mjs',
			'js/components/views/task-detail.mjs',
			//components: layout
			'js/components/layout/header.mjs',
			'js/components/layout/tab-bar.mjs',
			'js/components/layout/app.mjs',
			//styling
			'css/style.css',
			'manifest.json',
			'favicon.png',
		]
	},

	router: {
		urlScheme: 'hash',
		basePath:  '/',
		defHome:   '/',
		def404:    '/',
		routes: [
			{ path: '/',          meta: { component: 'pwa-tasks',       title: 'Active'    } },
			{ path: '/completed', meta: { component: 'pwa-completed',   title: 'Completed' } },
			{ path: '/tasks/:id', meta: { component: 'pwa-task-detail', title: 'Task'      } },
			{ path: '/settings',  meta: { component: 'pwa-settings',    title: 'Settings'  } },
		],
	},

	ui: {
		tabs: [
			{ route: '/',          id: 'tasks',     label: 'Active',    icon: 'tasks'     },
			{ route: '/completed', id: 'completed', label: 'Completed', icon: 'completed' },
			{ route: '/settings',  id: 'settings',  label: 'Settings',  icon: 'settings'  },
		]
	},

	policy: function(facts, config) {
		var enableEdgePan = !!(facts.isNative || facts.isStandalone || (config.debug && !!facts.preset));
		return {
			gestures: {
				edgePan: { enabled: enableEdgePan }
			}
		};
	},

	beforeLoad: function(e) {
		// Skip loading @capacitor/* plugins in web/PWA mode — they only work
		// inside a native Capacitor WebView. In native mode the import map
		// already resolves them from the CDN; Capacitor.isNativePlatform()
		// is true so we let them load normally.
		var registry = e.get('registry.defaultRegistry', []);
		if (!registry) return;
		var env = registry.get('env');
		var facts = env && env.getFacts ? env.getFacts() : {};
		if (e.path.startsWith('@capacitor/') && !facts.isNative) {
			e.path = '';
		}
	},

	afterLoad: function(e) {
		var def = e.exports && e.exports.default;
		if (def && def.tag) {
			var registry = e.get('registry.defaultRegistry', []);
			var runtime  = registry.get('componentRuntime');
			if (runtime) runtime.define(def);
		}
	},

	afterLoadPreload: function(e) {
		var registry  = e.get('registry.defaultRegistry', []);
		var debug     = e.get('config.debug');
		var urlParams = new URLSearchParams(window.location.search);

		var env = e.get('env.getEnv', [{
			preset: debug ? urlParams.get('preset') : null,
		}]);

		registry.set('env', env);
	},

	afterLoadLibs: function(e) {
		var registry = e.get('registry.defaultRegistry', []);

		var config = e.get('config') || {};
		var env    = registry.get('env');
		var facts  = env.getFacts();

		if (config.policy) {
			if (typeof config.policy === 'function') {
				config.policy = config.policy(facts, config);
			}
			env.registerPolicy(config.policy, 100);
		}

		var policy = env.getPolicy();
		env.applyToDoc();

		config = Object.assign({}, config, {
			env:    facts,
			policy: policy,
			// Convenience flag for components that need to behave differently
			// in a native Capacitor app vs web/PWA.
			// Usage in any component: ctx.config.native
			native: facts.isNative,
		});

		var routerOpts = e.get('config.router');
		routerOpts.history = e.get('history.createBrowserHistory', [routerOpts]);
		var router = e.get('router.createRouter', [routerOpts]);

		var lit = e.get('lit');

		var store       = e.get('store.createStore', []);
		var models      = e.get('registry.createRegistry', []);
		var formManager = e.get('form.createFormManager', []);

		var storage = e.get('sync.createStorage', [{
			name: 'fstage-tasks',
			schemas: {
				tasks: {
					keyPath: 'id',
					indexes: {
						dueDate:   { keyPath: 'dueDate' },
						completed: { keyPath: 'completed' },
						priority:  { keyPath: 'priority' },
					},
				},
			},
		}]);

		var remoteHandler = null;
		if (config.debug && config.mockRemote) {
			var createHandler  = e.get('sync.createHandler');
			var createStorage2 = e.get('sync.createStorage');
			var mockStorage    = createStorage2({
				name: 'fstage-mock-remote',
				schemas: { tasks: { keyPath: 'id', indexes: { createdAt: { keyPath: 'createdAt' } } } },
			});
			remoteHandler = createHandler(mockStorage, {
				namespace: 'tasks',
				seedUrl:   config.api.tasks,
				latency:   80,
				read:  { keyPath: 'id' },
				write: { idPath: 'data.id' },
			});
		}

		var syncManager = e.get('sync.createSyncManager', [{
			localHandler:  storage,
			remoteHandler: remoteHandler || undefined,
		}]);

		var animator = e.get('animator.createAnimator', [{
			motion: config.policy.motion,
		}]);

		var screenHost = e.get('transitions.createScreenHost', [{
			name: config.name,
		}]);

		var transitions = e.get('transitions.createTransitionEngine', [{
			animator,
			screenHost,
		}]);

		var gestureManager = e.get('gestures.createGestureManager', [{
			policy: config.policy.gestures,
		}]);

		var gestureInteraction    = e.get('gestures.gestureInteraction');
		var screenHostInteraction = e.get('transitions.screenHostInteraction');
		var accompanyInteraction  = e.get('transitions.accompanyInteraction');

		var interactionsManager = e.get('interactions.createInteractionsManager', []);
		interactionsManager.extend('gesture',    gestureInteraction(gestureManager));
		interactionsManager.extend('screen',     screenHostInteraction(screenHost));
		interactionsManager.extend('transition', accompanyInteraction(screenHost));

		var componentRuntime = e.get('component.createRuntime', [{
			store,
			config,
			registry,
			animator,
			screenHost,
			formManager,
			gestureManager,
			interactionsManager,
			baseClass: lit.LitElement,
			ctx: { html: lit.html, css: lit.css, svg: lit.svg },
		}]);

		registry.set('config',              config);
		registry.set('store',               store);
		registry.set('models',              models);
		registry.set('storage',             storage);
		registry.set('syncManager',         syncManager);
		registry.set('router',              router);
		registry.set('animator',            animator);
		registry.set('screenHost',          screenHost);
		registry.set('transitions',         transitions);
		registry.set('gestureManager',      gestureManager);
		registry.set('interactionsManager', interactionsManager);
		registry.set('formManager',         formManager);
		registry.set('componentRuntime',    componentRuntime);

		// Devtools — debug only. Toggle panel with Ctrl+`.
		if (config.debug) {
			Promise.all([
				import('@fstage/devtools'),
				import('@fstage/devtools/panel.mjs'),
			]).then(function(mods) {
				var devtools = mods[0].createDevtools({ maxEvents: 500 });
				devtools.connectStore(registry.get('store'));
				devtools.connectSync(registry.get('syncManager'));
				devtools.connectStorage(registry.get('storage'));
				registry.set('devtools', devtools);
				if (globalThis.fstage) globalThis.fstage.devtools = devtools;
				mods[1].mountDevtoolsPanel(devtools, { position: 'bottom' });
			});
		}
	},

	afterLoadApp: function(e) {
		var registry       = e.get('registry.defaultRegistry', []);
		var config         = registry.get('config');
		var store          = registry.get('store');
		var router         = registry.get('router');
		var screenHost     = registry.get('screenHost');
		var transitions    = registry.get('transitions');
		var gestureManager = registry.get('gestureManager');

		var rootEl = document.querySelector('pwa-main');
		var appEl  = document.querySelector('pwa-app') || rootEl;

		gestureManager.on('edgePan', {
			target: appEl,
			edge:   'left',
			shouldStart: function(ev) {
				if (document.documentElement.hasAttribute('data-transitioning')) return false;
				if (document.querySelector('.sheet-panel.is-open, .sheet-panel.is-dragging')) return false;
				if (document.querySelector('[aria-modal="true"], [role="dialog"], .action-sheet-backdrop, .as-backdrop')) return false;
				return true;
			},
			onStart: async function(e) {
				var prev = router.peek(-1);
				if (!prev) return false;
				e.ctl = await transitions.run(prev, {
					transition:  config.policy.transitions?.edgePan,
					interactive: true,
				});
				if (!e.ctl) return false;
			},
			onProgress: function(e) { e.ctl.progress(e.progress); },
			onCommit:   async function(e) {
				await e.ctl.commit();
				transitions.__suppress = true;
				router.go(-1);
			},
			onCancel: function(e) { e.ctl.cancel(); },
		});

		router.onAfter(function(route) {
			if (transitions.__suppress) {
				delete transitions.__suppress;
			} else {
				transitions.run(route, {
					transition: config.policy.transitions?.pageNavigation,
				});
			}
			// Update store after transition starts, or components may re-render prematurely.
			var prev = store.$get('route') || {};
			delete prev.prev;
			route.prev = prev;
			store.$set('route', route);
		});

		var models = registry.get('models');
		models.seal();
		gestureManager.start(appEl);
		screenHost.start(rootEl);
		router.start(rootEl);
	}

};
