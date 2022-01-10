(function(globalThis) {

	//set vars
	var host, basePath;
	
	//use location?
	if(globalThis.location) {
		basePath = location.href.replace('sw.js', '');
		host = location.protocol + '//' + location.hostname;
	}

	//is node?
	if(globalThis.__filename) {
		basePath = __filename.replace('js/config.js', '');
	} else if(globalThis.document) {
		basePath = document.currentScript.src.replace('js/config.js', '');
	}

	//export config
	this.__APPCONFIG = {

		//general
		debug: true,
		name: 'Fstage',
		host: host,
		basePath: basePath,
		urlScheme: 'hash', //Options: path, query, hash, null

		//app modules
		modules: [
			'utils/helpers',
			'services/user',
			'middleware/user',
			'components/root',
			'components/home',
			'components/notfound',
			'components/about',
		],

		//app routes
		routes: {
			HOME: 'home', //home page
			NOTFOUND: 'notfound', //404 page
			ABOUT: 'about'
		},

		//service worker pre-cache
		swPreCache: [
			basePath,
			basePath + 'img/logo.png',
			basePath + 'img/icon.png'
		],

		//service worker cache policies
		swCachePolicies: {
			'https://cdn.jsdelivr.net': 'cors'
		}

	};

})(this);