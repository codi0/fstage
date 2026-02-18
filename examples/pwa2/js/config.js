globalThis.FSCONFIG = {

	debug: true,
	name: 'Fstage Tasks',
	
	importMap: {
		'@shoelace-style/': 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2/cdn/',
		'@capacitor/': 'https://cdn.jsdelivr.net/npm/@capacitor/'
	},

	loadAssets: {
		preload: [
			'@fstage/env',
			'@fstage/registry',
		],
		libs: [
			//fstage
			'@fstage/store',
			'@fstage/sync',
			'@fstage/component',
			'@fstage/history',
			'@fstage/router',
			'@fstage/animator',
			'@fstage/gestures',
			'@fstage/transitions',
			//shoelace
			'@shoelace-style/themes/light.css',
			'@shoelace-style/components/alert/alert.js?esm',
			'@shoelace-style/components/badge/badge.js?esm',
			'@shoelace-style/components/button/button.js?esm',
			'@shoelace-style/components/card/card.js?esm',
			'@shoelace-style/components/checkbox/checkbox.js?esm',
			'@shoelace-style/components/input/input.js?esm',
			'@shoelace-style/components/option/option.js?esm',
			'@shoelace-style/components/switch/switch.js?esm'
			//capacitor
			//'@capacitor/core@7/+esm',
			//'@capacitor/camera@7/+esm',
			//'@capacitor/splash-screen@7/+esm'
		],
		app: [
			//layout
			'js/layout/app.mjs',
			'js/layout/header.mjs',
			//views
			'js/views/home.mjs',
			'js/views/about.mjs',
			'js/views/settings.mjs',
			'js/views/items.mjs',
			'js/views/item-detail.mjs',
			//misc
			'css/style.css',
			'manifest.json',
			'favicon.png'
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
					component: 'pwa-home',
					title: 'Home',
					menu: 1
				}
			},
			{
				id: '/items',
				path: '/items',
				meta: {
					component: 'pwa-items',
					title: 'Items',
					menu: 1
				}
			},
			{
				id: '/items/:id',
				path: '/items/:id',
				meta: {
					component: 'pwa-item-detail',
					title: 'Item',
					menu: 0
				}
			},
			{
				id: '/settings',
				path: '/settings',
				meta: {
					component: 'pwa-settings',
					title: 'Settings',
					menu: 1
				}
			},
			{
				id: '/about',
				path: '/about',
				meta: {
					component: 'pwa-about',
					title: 'About',
					menu: 1
				}
			}
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
	
		//skip loading web capacitor packages when running in native hybrid environment
		if(e.path.startsWith('@capacitor/') && env && env.getFact('platform.hybrid')) {
			e.path = '';
		}
	},
	
	afterLoad: function(e) {
		//no-op
	},

	afterLoadLibs: function(e) {
		const registry = e.get('registry.defaultRegistry', []);
		const env = e.get('env');

		const store = e.get('store.createStore', []);
		const syncManager = e.get('sync.createSyncManager', []);

		const routerOpts = e.get('config.router');
		routerOpts.history = e.get('history.createBrowserHistory', [ routerOpts ]);
		const router = e.get('router.createRouter', [ routerOpts ]);

		registry.set('env', env);
		registry.set('store', store);
		registry.set('syncManager', syncManager);
		registry.set('router', router);

		e.get('component.bindComponentDefaults', [{
			store: store,
			registry: registry
		}]);
	},
	
	afterLoadApp: function(e) {
		const registry = e.get('registry.defaultRegistry', []);

		const env = registry.get('env');
		const router = registry.get('router');

		const envPolicy = env.getPolicy();
		const appName = e.get('config.name');
		const rootEl = document.querySelector('pwa-main');

		const animator = e.get('animator.createAnimator', [{
			policy: envPolicy.motion
		}]);

		const screenHost = e.get('transitions.createScreenHost', [{
			el: rootEl,
			name: appName
		}]);

		const transitions = e.get('transitions.createTransitionEngine', [{
			animator: animator,
			screenHost: screenHost
		}]);

		const gestures = e.get('gestures.createGestureManager', [{
			policy: envPolicy.gestures
		}]);
		
		gestures.on('edgePan', {
			edge: 'left',
			onStart: async function(e) {
				var prev = router.peek(-1);
				if (!prev) return false;

				e.ctl = await transitions.run({
					screen: prev.match,
					location: {
						direction: 'back',
						state: prev.state
					}
				}, { interactive: true });

				if (!e.ctl) return false;
			},
			onProgress: function(e) {
				e.ctl.progress(e.progress);
			},
			onCommit: async function(e) {
				await e.ctl.commit()
				router.go(-1, { silent: true });
			},
			onCancel: function(e) {
				e.ctl.cancel();
			}
		});	
		
		router.onAfter(function(match, location) {
			transitions.run({
				screen: match,
				location: location
			});
		});

		gestures.start(rootEl);
		router.start(rootEl);
	}

};