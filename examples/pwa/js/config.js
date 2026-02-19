globalThis.FSCONFIG = {

	debug: true,
	name: 'Tasks',
	
	importMap: {
		'@capacitor/': 'https://cdn.jsdelivr.net/npm/@capacitor/'
	},

	loadAssets: {
		preload: [
			'@fstage/env',
			'@fstage/registry',
		],
		libs: [
			'@fstage/store',
			'@fstage/sync',
			'@fstage/component',
			'@fstage/history',
			'@fstage/router',
			'@fstage/animator',
			'@fstage/gestures',
			'@fstage/interactions',
			'@fstage/transitions',
			//capacitor
			//'@capacitor/core@7/+esm',
			//'@capacitor/camera@7/+esm',
			//'@capacitor/splash-screen@7/+esm',
		],
		app: [
			// store
			'js/store/tasks.mjs',
			// layout
			'js/layout/app.mjs',
			'js/layout/tab-bar.mjs',
			'js/layout/bottom-sheet.mjs',
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
		]
	},

	router: {
		urlScheme: 'hash',
		basePath: '/',
		defHome: '/',
		def404: '/',
		routes: [
			{
				id: '/',
				path: '/',
				meta: {
					component: 'pwa-tasks',
					title: 'Tasks',
					tab: 'tasks',
					menu: 1,
				}
			},
			{
				id: '/today',
				path: '/today',
				meta: {
					component: 'pwa-today',
					title: 'Today',
					tab: 'today',
					menu: 1,
				}
			},
			{
				id: '/tasks/:id',
				path: '/tasks/:id',
				meta: {
					component: 'pwa-task-detail',
					title: 'Task',
					tab: null,
					menu: 0,
				}
			},
			{
				id: '/settings',
				path: '/settings',
				meta: {
					component: 'pwa-settings',
					title: 'Settings',
					tab: 'settings',
					menu: 1,
				}
			},
		]
	},

	swPreCache: [
		'./'
	],

	swCachePolicies: {
		'https://cdn.jsdelivr.net': 'cors'
	},

	beforeLoad: function(e) {
		const env = e.get('env');
		if (e.path.startsWith('@capacitor/') && env && env.getFact('platform.hybrid')) {
			e.path = '';
		}
	},

	afterLoad: function(e) {
		// no-op
	},

	afterLoadLibs: function(e) {
		const registry = e.get('registry.defaultRegistry', []);
		const env      = e.get('env');

		const store       = e.get('store.createStore', []);
		const syncManager = e.get('sync.createSyncManager', []);

		const routerOpts     = e.get('config.router');
		routerOpts.history   = e.get('history.createBrowserHistory', [routerOpts]);
		const router         = e.get('router.createRouter', [routerOpts]);

		const envPolicy = env.getPolicy();

		// Create animator with platform-appropriate motion policy
		const animator = e.get('animator.createAnimator', [{
			policy: envPolicy.motion
		}]);

		// Create gesture manager (start() called later in afterLoadApp once DOM is ready)
		const gestureManager = e.get('gestures.createGestureManager', [{
			policy: envPolicy.gestures
		}]);

		// Create interactions manager — wires static interactions declarations on all components
		const interactionsManager = e.get('interactions.createInteractionsManager', [{
			animator,
			gestureManager,
		}]);

		registry.set('env',                 env);
		registry.set('store',               store);
		registry.set('syncManager',         syncManager);
		registry.set('router',              router);
		registry.set('animator',            animator);
		registry.set('gestureManager',      gestureManager);
		registry.set('interactionsManager', interactionsManager);

		// Inject into every FsComponent automatically
		e.get('component.bindComponentDefaults', [{
			store:                store,
			registry:             registry,
			animator:             animator,
			gestureManager:       gestureManager,
			interactionsManager:  interactionsManager,
		}]);
	},

	afterLoadApp: function(e) {
		const registry = e.get('registry.defaultRegistry', []);

		const env            = registry.get('env');
		const store          = registry.get('store');
		const router         = registry.get('router');
		const animator       = registry.get('animator');
		const gestureManager = registry.get('gestureManager');

		const envPolicy  = env.getPolicy();
		const appName    = e.get('config.name');
		const rootEl     = document.querySelector('pwa-main');

		const screenHost = e.get('transitions.createScreenHost', [{
			el:   rootEl,
			name: appName,
		}]);

		const transitions = e.get('transitions.createTransitionEngine', [{
			animator:   animator,
			screenHost: screenHost,
		}]);

		// Page-level edge-pan (back gesture) — iOS/Android native feel
		gestureManager.on('edgePan', {
			el:   rootEl,
			edge: 'left',
			onStart: async function(e) {
				const prev = router.peek(-1);
				if (!prev) return false;

				e.ctl = await transitions.run({
					screen:   prev.match,
					location: { direction: 'back', state: prev.state }
				}, { interactive: true });

				if (!e.ctl) return false;
			},
			onProgress: function(e) { e.ctl.progress(e.progress); },
			onCommit:   async function(e) {
				await e.ctl.commit();
				// Let router.go fire normally so onAfter updates the store.
				// Set a flag so the transition engine skips the redundant run.
				transitions._skipNext = true;
				router.go(-1);
			},
			onCancel: function(e) { e.ctl.cancel(); }
		});

		router.onAfter(function(match, location) {
			store.set('route', { match, location });
			// Skip if a gesture already completed the transition visually
			if (transitions._skipNext) {
				transitions._skipNext = false;
				return;
			}
			transitions.run({ screen: match, location });
		});

		// Bind gesture manager to the main content area
		gestureManager.start(rootEl);
		router.start(rootEl);
	},

};