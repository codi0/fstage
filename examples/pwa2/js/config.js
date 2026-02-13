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
			'@fstage/history',
			'@fstage/router',
			'@fstage/interaction',
			'@fstage/store',
			'@fstage/sync',
			'@fstage/component',
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
		const env = this.get('env');
	
		//skip loading web capacitor packages when running in native hybrid environment
		if(e.path.startsWith('@capacitor/') && env && env.getFact('platform.hybrid')) {
			e.path = '';
		}
	},
	
	afterLoad: function(e) {
		//no-op
	},

	afterLoadLibs: function(e) {
		const { get } = this;

		const registry = get('registry.defaultRegistry', []);
		const env = get('env');

		const store = get('store.createStore', []);
		const syncManager = get('sync.createSyncManager', []);

		const routerOpts = get('config.router');
		routerOpts.history = get('history.createBrowserHistory', [ routerOpts ]);
		const router = get('router.createRouter', [ routerOpts ]);

		registry.set('env', env);
		registry.set('store', store);
		registry.set('syncManager', syncManager);
		registry.set('router', router);
	},
	
	afterLoadApp: function(e) {
		const { get } = this;

		const registry = get('registry.defaultRegistry', []);
		const transition = get('interaction.createTransitionEngine', []);

		const store = registry.get('store');
		const router = registry.get('router');

		const appName = get('config.name');
		const rootEl = document.querySelector('#main-content');

		get('lit.FsLitElement.bindDefaults', [{
			store: store,
			registry: registry
		}]);

		transition.setScreenHost({

			async mount(entry) {
				if (entry._el) return;
				console.log('mount', entry);

				const meta = entry.match && entry.match.meta;
				if (!meta || !meta.component) {
					throw new Error('screenHost.mount: missing component');
				}

				const el = document.createElement(meta.component);
				entry._el = el;
				rootEl.appendChild(el);
			},

			async unmount(entry) {
				if (!entry._el) return;
				console.log('unmount', entry);

				entry._el.remove();
				entry._el = null;
			},

			async activate(entry) {
				const el = entry._el;
				if (!el) return;
				console.log('activate', entry);

				const meta = entry.match && entry.match.meta;
				if (meta && meta.title) {
					document.title = meta.title + (appName ? ' | ' + appName : '');
				}
			},

			async deactivate(entry) {
				console.log('deactivate', entry);
			},

			async snapshot(entry) {
				if (!entry._el) return null;
				console.log('snapshot', entry);

				return { scrollTop: entry._el.scrollTop || 0 };
			},

			async restore(entry, snap) {
				if (!entry._el) return;
				console.log('restore', entry, snap);

				requestAnimationFrame(() => {
					entry._el.scrollTop = snap.scrollTop || 0;
				});
			}

		});

		// engine.setAnimator(...)

		const navInteraction = get('interaction.createNavigationInteraction', [{
			router: router,
			engine: transition
		}]);

		navInteraction.start();
		router.start(rootEl);
	}

};