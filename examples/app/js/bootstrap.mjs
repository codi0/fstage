//imports
import './config.js';
import app from 'fstage/app';
import dom from 'fstage/dom';
import { importr } from 'fstage/core';

//load ionic assets
await importr('https://cdn.jsdelivr.net/npm/@ionic/core@8.0.1/css/ionic.bundle.min.css');
await importr('https://cdn.jsdelivr.net/npm/@ionic/core@8.0.1/dist/ionic/ionic.esm.min.js', { import: false });

//create app
await app(globalThis.__appConfig).mount('#root', function(app) {

	//Router: before screen change
	app.router.on(':before', function(route) {
		return route;
	});

	//Router: after screen change
	app.router.on(':after', function(route) {
		//debugging?
		if(app.config.debug) {
			console.log('Route', route);
		}
		//is refresh?
		if(route.name === route.last) {
			return false;
		}
		//set body marker
		document.documentElement.setAttribute('data-page', route.name);
		//track view?
		app.logger.track('screen_view', {
			screen_name: route.name,
			direction: route.isBack ? 'back' : 'fwd'
		});
	});

	//Event: analytics handler
	app.on.track(function(data) {
		//firebase.analytics().logEvent(data.name, data.params);
	});

	//Event: update handler
	app.on.update(function(e) {
		location.reload();
	});

});