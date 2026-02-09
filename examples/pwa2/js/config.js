globalThis.FSCONFIG = {

	debug: true,
	routerHash: true,
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
			'@fstage/lit',
			'@fstage/router',
			//'@fstage/animator',
			//'@fstage/interaction',
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

	routes: {
		'/': {
			component: 'pwa-home',
			title: 'Home',
			menu: 1
		},

		'/items': {
			component: 'pwa-items',
			title: 'Items',
			menu: 1
		},

		'/items/:id': {
			component: 'pwa-item-detail',
			title: 'Item',
			menu: 0
		},

		'/settings': {
			component: 'pwa-settings',
			title: 'Settings',
			menu: 1
		},

		'/about': {
			component: 'pwa-about',
			title: 'About',
			menu: 1
		}
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
		const router = get('router.createRouter', [ { defHome: '/', routes: get('config.routes') } ]);
				
		registry.set('env', env);
		registry.set('store', store);
		registry.set('router', router);
		registry.set('syncManager', syncManager);
	},
	
	afterLoadApp: function(e) {
		const { get } = this;
	
		const registry = get('registry.defaultRegistry', []);
		const rootEl = document.querySelector('#main-content');
		const storeKey = 'route';
			
		const env = registry.get('env');
		const store = registry.get('store');
		const router = registry.get('router');

		/*
		const animator = get('animator.createAnimator', [ rootEl ]);
		const createInteraction = get('interaction.createInteraction');
		const createExecutor = get('interaction.createExecutor');
		const createGestureHandler = get('gesture.createGestureHandler');

		if(createInteraction) {
			createInteraction(storeKey, {
				store: store,
				env: env,
				animator: animator,
				executor: createExecutor(rootEl)
			});
		}

		if(createGestureHandler) {
			createGestureHandler(storeKey, {
				container: rootEl,
				store: store,
				env: env,
				animator: animator
			});
		}
		*/

		get('lit.FsLitElement.bindDefaults', [
			{
				store: store,
				registry: registry
			}
		]);

		router.on(':after', function(route) {
			//get route config
			const component = get('config.routes.' + route.name + '.component');
			//render component
			const el = document.createElement(component);
			el && rootEl.appendChild(el);
			//update state
			store.set(storeKey, route);
		});

		router.start();
	}

};