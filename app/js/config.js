(function(root, undefined) {

	//create app?
	if(root.Fstage) {
		root.App = new Fstage.app;
	}

	//private vars
	var host = location.protocol + '://' + location.hostname;

	//routes
	App.routes = {

		WELCOME: 'welcome',
		ABOUT: 'about'

	};

	//config
	App.config = {

		//general
		debug: true,
		name: 'Fstage',
		host: host,

		//sw pre-cache
		swPreCache: [
			host,
			host + '/img/logo.png',
			host + '/img/icon.png'
		],

		//sw hosts to cache
		swCacheHosts: {
			'https://cdn.jsdelivr.net': 'cors'
		}

	};

})(self || window || this);