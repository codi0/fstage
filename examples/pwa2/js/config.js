globalThis.FSCONFIG = {

	debug: true,
	routerHash: true,
	name: 'Fstage Tasks',
	
	importMap: {
		'@capacitor/core': 'https://cdn.jsdelivr.net/npm/@capacitor/core@7/+esm',
		'@capacitor/camera': 'https://cdn.jsdelivr.net/npm/@capacitor/camera@7/+esm',
		'@capacitor/splash-screen': 'https://cdn.jsdelivr.net/npm/@capacitor/splash-screen@7/+esm'
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
			'@fstage/animator',
			'@fstage/interaction',
			//shoelace
			'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/themes/light.css',
			'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/shoelace-autoloader.js?esm',
			//capacitor
			//'@capacitor/core',
			//'@capacitor/splash-screen',
			//'@capacitor/camera',
		],
		app: [
			//store
			'js/store/tasks.mjs',
			//theme
			'js/theme/layout.mjs',
			'js/theme/header.mjs',
			//pages
			'js/pages/home.mjs',
			'js/pages/about.mjs',
			//misc
			'css/style.css',
			'manifest.json',
			'favicon.png'
		]
	},

	beforeLoad: function(e) {
		//console.log('beforeLoad', e);

		const env = this.get('env');
	
		//skip loading web capacitor packages when running in native hybrid environment
		if(e.path.startsWith('@capacitor/') && env && env.getFact('platform.hybrid')) {
			e.path = '';
		}
	},
	
	afterLoad: function(e) {
		//console.log('afterLoad', e);
	},

	afterLoadLibs: function(e) {
		console.log('afterLoadLibs', this);

		const registry = this.get('registry.defaultRegistry', []);
		const env = this.get('env');
		
		const store = this.get('store.createStore', []);
		const syncManager = this.get('sync.createSyncManager', []);
		const router = this.get('router.createRouter', [ { defHome: '/', routes: this.get('config.routes') } ]);
				
		registry.set('env', env);
		registry.set('store', store);
		registry.set('syncManager', syncManager);
		registry.set('router', router);
	},
	
	afterLoadApp: function(e) {
		console.log('afterLoadApp', this);
		
		const registry = this.get('registry.defaultRegistry', []);
		const rootEl = document.querySelector('#main-content');
		const storeKey = 'route';
			
		const env = registry.get('env');
		const store = registry.get('store');
		const router = registry.get('router');
		const animator = this.get('animator.createAnimator', [ rootEl ]);

		const createInteraction = this.get('interaction.createInteraction');
		const createExecutor = this.get('interaction.createExecutor');
		const createGestureHandler = this.get('gesture.createGestureHandler');
			
		this.get('lit.FsLitElement.bindDefaults', [
			{
				store: store,
				registry: registry,
				createInteraction: createInteraction
			}
		]);

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

		router.on(':after', function(route) {
			//render component
			const el = document.createElement(route.action.component);
			el && rootEl.appendChild(el);
			//update state
			store.set(storeKey, route);
		});

		router.start();
	},

	routes: {
		'/': { component: 'pwa-home', title: 'Home', menu: 1 },
		'/about': { component: 'pwa-about', title: 'About', menu: 1 }
	},

	swPreCache: [
		'./'
	],

	swCachePolicies: {
		'https://cdn.jsdelivr.net': 'cors'
	}

};