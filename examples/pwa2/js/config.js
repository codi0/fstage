globalThis.FSCONFIG = {

	debug: true,
	routerHash: true,
	name: 'Fstage Tasks',
	
	importMap: {
		'@capacitor/core': 'https://cdn.jsdelivr.net/npm/@capacitor/core@7/+esm',
		'@capacitor/camera': 'https://cdn.jsdelivr.net/npm/@capacitor/camera@7/+esm',
		'@capacitor/splash-screen': 'https://cdn.jsdelivr.net/npm/@capacitor/splash-screen@7/+esm'
	},

	loadAssets: [
		[
			//preload
			'@fstage/env'
		],
		[
			//fstage
			'@fstage/router',
			'@fstage/interaction',
			'@fstage/store',
			'@fstage/sync',
			'@fstage/lit',
			//shoelace
			'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/themes/light.css',
			'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/shoelace-autoloader.js?esm',
			//capacitor
			//'@capacitor/core',
			//'@capacitor/splash-screen',
			//'@capacitor/camera',
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
	],

	loadFilters: function(e, fstage) {
		//skip loading web capacitor packages when running in native hybrid environment
		if(e.path.startsWith('@capacitor/') && fstage.env.getFact('platform.hybrid')) {
			e.path = '';
		}
	},

	exportFilters: function(e, fstage) {

	},

	readyCb: function(fstage) {
		console.log('readyCb', fstage);
		
		const storeKey = 'route';
		const store = fstage.store.createStore();
		const container = document.querySelector('#main-content');
		const router = fstage.router.createRouter({ defHome: '/', routes: fstage.config.routes });

		fstage.interaction.createInteraction({
			key: storeKey,
			store: store,
			env: fstage.env,
			executor: fstage.interaction.createExecutor(container)
		});

		router.on(':after', function(route) {
			//render component
			const el = document.createElement(route.action.component);
			el && container.appendChild(el);
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