export const footer = function({ target, html, props, state, store, context }) {

	//render scoped or global css
	target.addEventListener('componentCss', function(e) {

	});

	//render html using template literals
	target.addEventListener('componentHtml', function(e) {

	});

	//do things when component added to DOM
	target.addEventListener('componentMounted', function(e) {

	});

	//do things when component updated in DOM
	target.addEventListener('componentUpdated', function(e) {

	});

	//do things when component removed from DOM
	target.addEventListener('componentUnmounted', function(e) {

	});

};