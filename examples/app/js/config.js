(function(glob) {

	//set vars
	var host = '';
	var basePath = '';

	//check platform
	if(typeof __filename !== 'undefined') {
		glob = global;
		basePath = __filename.replace(/js\/config\.js(.*)/, '');
	} else if(typeof WorkerGlobalScope !== 'undefined') {
		glob = self;
		host = location.protocol + '//' + location.hostname;
		basePath = location.href.replace(/sw\.js(.*)/, '');
	} else if(typeof window !== 'undefined') {
		glob = window;
		host = location.protocol + '//' + location.hostname;
		basePath = document.currentScript.src.replace(/js\/config\.js(.*)/, '');
	}

	//export config
	glob.__APPCONFIG = {

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