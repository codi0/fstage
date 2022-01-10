//imports
import { app } from 'fstage/app';
import { dom } from 'fstage/dom';

//create app
app().mount('#root', function(app) {

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

	//Components: page transition
	app.components.onBeforeUpdateNode(function(from, to, rootEl) {
		//config vars
		var defTransition = 'bump-from-bottom';
		var customEffects = {};
		//set vars
		var route = app.router.current();
		var isPage = from.classList.contains('page');
		var transition = from.getAttribute('data-transition');
		var inReverse = isPage ? route.isBack : from.hasAttribute('data-reverse');
		//can transition?
		if(from === rootEl || (from.id && from.id === to.id) || (isPage && route.init) || (!isPage && !transition)) {
			return;
		}
		//set vars
		var fromEffect = 'none';
		var toEffect = transition || defTransition;
		//check for custom effects
		for(var i in customEffects) {
			//effect found?
			if((inReverse ? from : to).getAttribute('data-component') === i) {
				toEffect = customEffects[i];
				break;
			}
		}
		//append node
		from.parentNode.insertBefore(to, from.nextSibling);
		//hide to node
		to.classList.add('hidden');
		//run page transition
		dom.transition(to, toEffect, from, fromEffect, {
			reverse: inReverse,
			onEnd: function(e) {
				//remove old node?
				if(from.parentNode) {
					from.parentNode.removeChild(from);
				}
			}
		});
		//break
		return false;
	});

	//Components: element animation
	app.components.onAfterUpdateNode(function(from, to, rootEl) {
		//set vars
		var effect = null;
		var animate = to.getAttribute('data-animate');
		//can animate?
		if(!animate || from === rootEl) {
			return;
		}
		//animate in?
		if(from.classList.contains('hidden') && !to.classList.contains('hidden')) {
			to.classList.add('hidden');
			effect = animate.replace(/ in|out/, '') + ' in';
		}
		//animate out?
		if(!from.classList.contains('hidden') && to.classList.contains('hidden')) {
			to.classList.remove('hidden');
			effect = animate.replace(/ in|out/, '') + ' out';
		}
		//can animate?
		if(effect) {
			dom(to).animate(effect);
		}
	});

	//Event: analytics handler
	app.on.track(function(data) {
		//firebase.analytics().logEvent(data.name, data.params);
	});

	//Event: update handler
	app.on.update(function() {
		//auto refresh?
		if(!app.config.skipRefresh) {
			//return location.reload();
		}
	});
	
	//Init: hide splash page
	setTimeout(function() {
		dom('#splash').animate('fade out');
	}, 700 - performance.now());

});