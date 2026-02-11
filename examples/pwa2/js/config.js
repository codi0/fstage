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
		const history = get('history.createBrowserHistory', [ get('config.router') ]);
		
		const routerOpts = get('config.router');
		routerOpts.history = history;
		const router = get('router.createRouter', [ routerOpts ]);

		registry.set('env', env);
		registry.set('store', store);
		registry.set('syncManager', syncManager);
		registry.set('history', history);
		registry.set('router', router);
	},
	
	afterLoadApp: function(e) {
		const { get } = this;
	
		const registry = get('registry.defaultRegistry', []);
		const rootEl = document.querySelector('#main-content');
		const storeKey = 'route';
			
		const env = registry.get('env');
		const store = registry.get('store');
		const router = registry.get('router');

		get('lit.FsLitElement.bindDefaults', [
			{
				store: store,
				registry: registry
			}
		]);

		//const interaction = get('interaction.createInteraction', []);
		//console.log(interaction);
		
		let currentView = null;

		router.after(function(match, location) {
			const routeConf = match.meta;
			const appName = get('config.name');

			const nextView = document.createElement(routeConf.component);

			if (currentView) {
				currentView.remove();
			}

			rootEl.appendChild(nextView);
			currentView = nextView;

			if (routeConf.title) {
				document.title = routeConf.title + (appName ? ' | ' + appName : '');
			}

			requestAnimationFrame(function() {
				rootEl.scrollTop = location.state.scroll || 0;
			});
		});

		router.start(rootEl);
	}

};