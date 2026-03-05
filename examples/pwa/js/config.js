globalThis.FSCONFIG = {

	debug: true,
	name: 'Tasks',

	importMap: {
		'lit': 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm',
		'@capacitor/': 'https://cdn.jsdelivr.net/npm/@capacitor/'
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
		],
		app: [
			//store
			'js/store/tasks.mjs',
			//partial views
			'js/views/parts/task-detail.mjs',
			'js/views/parts/task-row.mjs',
			//views
			'js/views/tasks.mjs',
			'js/views/completed.mjs',
			'js/views/settings.mjs',
			//layouts
			'js/layout/overlay.mjs',
			'js/layout/header.mjs',
			'js/layout/tab-bar.mjs',
			'js/layout/bottom-sheet.mjs',
			'js/layout/app.mjs',
			//styling
			'css/style.css',
			'manifest.json',
			'favicon.png',
		],
	},

	router: {
		urlScheme: 'hash',
		basePath:  '/',
		defHome:   '/',
		def404:    '/',
		routes: [
			{ id: '/',           path: '/',           meta: { component: 'pwa-tasks',       title: 'Active',    tab: 'tasks',     menu: 1 } },
			{ id: '/completed',  path: '/completed',  meta: { component: 'pwa-completed',   title: 'Completed', tab: 'completed', menu: 1 } },
			{ id: '/tasks/:id',  path: '/tasks/:id',  meta: { component: 'pwa-task-detail', title: 'Task',      tab: null,        menu: 0 } },
			{ id: '/settings',   path: '/settings',   meta: { component: 'pwa-settings',    title: 'Settings',  tab: 'settings',  menu: 1 } },
		],
	},

	swPreCache: [
		'./',
		'./css/style.css',
		'./manifest.json',
		'./favicon.png',
		'./icons/icon-192.webp',
		'./icons/icon-512.webp',
	],

	swCachePolicies: {
		'https://cdn.jsdelivr.net': 'cors',
	},

	installPrompt: null,

	beforeLoad: function(e) {
		var registry = e.get('registry.defaultRegistry', []);
		if (!registry) return;
		var env = registry.get('env');
		if (e.path.startsWith('@capacitor/') && env && env.getFact('platform.hybrid')) {
			e.path = '';
		}
	},

	afterLoad: function(e) {
		var def = e.exports && e.exports.default;
		if (def && def.tag) {
			var registry = e.get('registry.defaultRegistry', []);
			var runtime = registry.get('componentRuntime');
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

		// ── Global platform data attributes ─────────────────────────────────
		// Set once on documentElement so all CSS can use :root[data-platform="ios"],
		// [data-platform="android"], [data-hybrid], [data-standalone].
		var os       = env.getFact('platform.os');
		var hybrid   = env.getFact('platform.hybrid');
		var standalone = window.matchMedia('(display-mode: standalone)').matches
			|| navigator.standalone === true;

		document.documentElement.setAttribute('data-platform', os || 'web');
		if (hybrid)     document.documentElement.setAttribute('data-hybrid',     '');
		if (standalone) document.documentElement.setAttribute('data-standalone', '');

		registry.set('env', env);
	},

	afterLoadLibs: function(e) {
		var registry = e.get('registry.defaultRegistry', []);
		var env      = registry.get('env');

		var appName   		 = e.get('config.name');
		var routerOpts     = e.get('config.router');
		routerOpts.history = e.get('history.createBrowserHistory', [routerOpts]);
		var router         = e.get('router.createRouter', [routerOpts]);

		var envPolicy = env.getPolicy();
		var lit       = Object.assign({}, e.get('lit'));

		var store       = e.get('store.createStore', []);
		var syncManager = e.get('sync.createSyncManager', []);

		var animator = e.get('animator.createAnimator', [{
			policy: envPolicy.motion,
		}]);

		var screenHost = e.get('transitions.createScreenHost', [{
			name: appName,
		}]);

		var transitions = e.get('transitions.createTransitionEngine', [{
			animator,
			screenHost,
		}]);

		var gestureManager = e.get('gestures.createGestureManager', [{
			policy: envPolicy.gestures,
		}]);

		var interactionsManager = e.get('interactions.createInteractionsManager', [{
			animator,
			gestureManager,
		}]);

		var componentRuntime = e.get('component.createRuntime', [{
			registry,
			animator,
			screenHost,
			gestureManager,
			interactionsManager,
			ctx: { html: lit.html, css: lit.css, svg: lit.svg },
			baseClass: lit.LitElement,
			stores: { default: store }
		}]);

		registry.set('env',                  env);
		registry.set('store',                store);
		registry.set('syncManager',          syncManager);
		registry.set('router',               router);
		registry.set('animator',             animator);
		registry.set('screenHost',           screenHost);
		registry.set('transitions',      		 transitions);
		registry.set('gestureManager',       gestureManager);
		registry.set('interactionsManager',  interactionsManager);
		registry.set('componentRuntime',     componentRuntime);
	},

	afterLoadApp: function(e) {
		var registry = e.get('registry.defaultRegistry', []);

		var env              = registry.get('env');
		var store            = registry.get('store');
		var router           = registry.get('router');
		var animator         = registry.get('animator');
		var screenHost       = registry.get('screenHost');
		var transitions      = registry.get('transitions');
		var gestureManager   = registry.get('gestureManager');

		var rootEl     = document.querySelector('pwa-main');

		// Edge-pan back gesture. Force direction to 'back-slide' so the animator
		// always uses a horizontal slide-out regardless of platform defaults.
		gestureManager.on('edgePan', {
			target: rootEl,
			edge:   'left',
			onStart: async function(ev) {
				var prev = router.peek(-1);
				if (!prev) return false;
				ev.ctl = await transitions.run({
					screen:   prev.match,
					location: { direction: 'back', state: prev.state },
					policy: {
						keyframes: {
							back: {
								from: [
									{ transform: 'translate3d(0,0,0)',    opacity: 1 },
									{ transform: 'translate3d(100%,0,0)', opacity: 1 }
								],
								to: [
									{ transform: 'translate3d(-20%,0,0)', opacity: 0.98 },
									{ transform: 'translate3d(0,0,0)',    opacity: 1    }
								]
							}
						}
					}
				}, { interactive: true });
				if (!ev.ctl) return false;
			},
			onProgress: function(ev) { ev.ctl.progress(ev.progress); },
			onCommit: async function(ev) {
				await ev.ctl.commit();
				transitions._skipNext = true;
				router.go(-1);
			},
			onCancel: function(ev) { ev.ctl.cancel(); },
		});

		// Route change → transition
		router.onAfter(function(match, location) {
			var existing = store.get('route');
			var prev = (existing && existing.match) ? existing.match : {};
			store.set('route', { match, location, prev });
			if (transitions._skipNext) {
				transitions._skipNext = false;
				return;
			}
			transitions.run({ screen: match, location });
		});

		screenHost.on('mount', function(e) {
			store.set('screen', e.target);
		});

		gestureManager.start(rootEl);
		screenHost.start(rootEl);
		router.start(rootEl);

		// ── Phase 7: Keyboard avoidance ──────────────────────────────────────
		// Tracks the software-keyboard height via visualViewport and exposes it
		// as --keyboard-height so sheets can slide above the IME.
		if (window.visualViewport) {
			function _syncKb() {
				var kh = Math.max(0,
					window.innerHeight
					- window.visualViewport.offsetTop
					- window.visualViewport.height
				);
				document.documentElement.style.setProperty(
					'--keyboard-height', Math.round(kh) + 'px'
				);
			}
			window.visualViewport.addEventListener('resize', _syncKb);
			window.visualViewport.addEventListener('scroll', _syncKb);
		}

		// Capture install prompt for later use
		window.addEventListener('beforeinstallprompt', function(ev) {
			ev.preventDefault();
			FSCONFIG.installPrompt = ev;
			window.dispatchEvent(new CustomEvent('pwa.installable'));
		});
	},

};