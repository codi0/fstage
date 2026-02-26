globalThis.FSCONFIG = {

	debug: true,
	name: 'Tasks',

	importMap: {
		'lit': 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm',
		'uhtml': 'https://cdn.jsdelivr.net/npm/uhtml@5/dist/prod/dom.js',
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
			'@fstage/store/signals.mjs',
			'@fstage/sync',
			'@fstage/history',
			'@fstage/router',
			'@fstage/animator',
			'@fstage/gestures',
			'@fstage/transitions',
			'@fstage/interactions',
		],
		app: [
			// store
			'js/store/tasks.mjs',
			// views
			'js/views/task-row.mjs',
			'js/views/tasks.mjs',
			'js/views/today.mjs',
			'js/views/task-detail.mjs',
			'js/views/settings.mjs',
			// assets
			'css/style.css',
			'manifest.json',
			'favicon.png',
			// layout (app last — depends on all other components)
			'js/layout/overlay.mjs',
			'js/layout/header.mjs',
			'js/layout/tab-bar.mjs',
			'js/layout/bottom-sheet.mjs',
			'js/layout/app.mjs',
		],
	},

	router: {
		urlScheme: 'hash',
		basePath:  '/',
		defHome:   '/',
		def404:    '/',
		routes: [
			{
				id:   '/',
				path: '/',
				meta: { component: 'pwa-tasks',      title: 'Tasks',    tab: 'tasks',    menu: 1 },
			},
			{
				id:   '/today',
				path: '/today',
				meta: { component: 'pwa-today',      title: 'Today',    tab: 'today',    menu: 1 },
			},
			{
				id:   '/tasks/:id',
				path: '/tasks/:id',
				meta: { component: 'pwa-task-detail', title: 'Task',    tab: null,       menu: 0 },
			},
			{
				id:   '/settings',
				path: '/settings',
				meta: { component: 'pwa-settings',   title: 'Settings', tab: 'settings', menu: 1 },
			},
		],
	},

	swPreCache: ['./'],

	swCachePolicies: {
		'https://cdn.jsdelivr.net': 'cors',
	},

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

		// Auto-register component?
		if (def && def.tag) {
			var registry = e.get('registry.defaultRegistry', []);
			var runtime = registry.get('componentRuntime');
			if (runtime) runtime.define(def);
		}
	},

	afterLoadPreload: function(e) {
		var registry = e.get('registry.defaultRegistry', []);
		var debug = e.get('config.debug');
		var urlParams = new URLSearchParams(window.location.search);

		var env = e.get('env.getEnv', [{
			preset: debug ? urlParams.get('preset') : null,
		}]);
		
		registry.set('env', env);
	},

	afterLoadLibs: function(e) {
		var registry = e.get('registry.defaultRegistry', []);
		var env      = registry.get('env');

		var routerOpts   = e.get('config.router');
		routerOpts.history = e.get('history.createBrowserHistory', [routerOpts]);
		var router       = e.get('router.createRouter', [routerOpts]);

		var envPolicy = env.getPolicy();
		var lit = Object.assign({}, e.get('lit'));

		var store = e.get('store/signals.createStore', []);
		var syncManager = e.get('sync.createSyncManager',   []);

		var animator = e.get('animator.createAnimator', [{
			policy: envPolicy.motion,
		}]);

		var gestureManager = e.get('gestures.createGestureManager', [{
			policy: envPolicy.gestures,
		}]);

		var interactionsManager = e.get('interactions.createInteractionsManager', [{
			animator,
			gestureManager,
		}]);

		var componentRuntime =  e.get('component.createRuntime', [{
			ctx: { html: lit.html, css: lit.css, svg: lit.svg },
			baseClass: lit.LitElement,
			registry,
			animator,
			gestureManager,
			interactionsManager
		}]);
		
		componentRuntime.extendCtx('watch', function(ctx, cleanupFns) {
			if (!ctx.store) return;

			return function(key, cb) {
				cleanupFns.push(ctx.store.onChange(key, cb));
			};
		});

		registry.set('env', env);
		registry.set('store', store);
		registry.set('syncManager', syncManager);
		registry.set('router', router);
		registry.set('animator', animator);
		registry.set('gestureManager', gestureManager);
		registry.set('interactionsManager', interactionsManager);
		registry.set('componentRuntime', componentRuntime);
	},

	afterLoadApp: function(e) {
		var registry = e.get('registry.defaultRegistry', []);

		var env              = registry.get('env');
		var store            = registry.get('store');
		var router           = registry.get('router');
		var animator         = registry.get('animator');
		var gestureManager   = registry.get('gestureManager');
		var componentRuntime = registry.get('componentRuntime');

		var envPolicy  = env.getPolicy();
		var appName    = e.get('config.name');
		var rootEl     = document.querySelector('pwa-main');

		var screenHost = e.get('transitions.createScreenHost', [{
			el:   rootEl,
			name: appName,
		}]);

		var transitions = e.get('transitions.createTransitionEngine', [{
			animator,
			screenHost,
		}]);

		// Edge-pan back gesture
		gestureManager.on('edgePan', {
			target: rootEl,
			edge:   'left',
			onStart: async function(e) {
				var prev = router.peek(-1);
				if (!prev) return false;
				e.ctl = await transitions.run({
					screen:   prev.match,
					location: { direction: 'back', state: prev.state },
				}, { interactive: true });
				if (!e.ctl) return false;
			},
			onProgress: function(e) { e.ctl.progress(e.progress); },
			onCommit: async function(e) {
				await e.ctl.commit();
				transitions._skipNext = true;
				router.go(-1);
			},
			onCancel: function(e) { e.ctl.cancel(); },
		});

		router.onAfter(function(match, location) {
			store.set('route', { match, location });
			if (transitions._skipNext) {
				transitions._skipNext = false;
				return;
			}
			transitions.run({ screen: match, location });
		});

		router.start(rootEl);
		gestureManager.start(rootEl);
	},

};