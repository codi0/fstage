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
			'@fstage/store',
			'@fstage/sync',
			'@fstage/lit',
			//ionic
			'https://cdn.jsdelivr.net/npm/@ionic/core@8/css/ionic.bundle.min.css',
			'https://cdn.jsdelivr.net/npm/@ionic/core@8/dist/ionic/ionic.esm.min.js',
			'https://cdn.jsdelivr.net/npm/@ionic/pwa-elements@3/dist/ionicpwaelements/ionicpwaelements.esm.min.js',
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
		//skip capacitor on non-web platform?
		if(/@capacitor/.test(e.path) && fstage.env && fstage.env.isHybrid) {
			e.path = '';
		}
	},

	exportFilters: function(e, fstage) {

	},

	readyCb: function(fstage) {

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