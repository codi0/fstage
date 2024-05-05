//exports
globalThis.__appConfig = {

	//general
	debug: true,
	name: 'Fstage',
	urlScheme: 'hash', //Options: path, query, hash, null

	//app modules
	modules: [
		'utils/helpers',
		'services/user',
		'middleware/user',
		'views/root',
		'views/parts/header',
		'views/parts/footer',
		'views/notfound',
		'views/home',
		'views/list',
		'webc/fs-welcome'
	],

	//app routes
	routes: {
		HOME: 'home',
		LIST: 'list',
		NOTFOUND: 'notfound'
	},

	//service worker pre-cache
	swPreCache: [
		'./'
	],

	//service worker cache policies
	swCachePolicies: {
		'https://cdn.jsdelivr.net': 'cors'
	}

};