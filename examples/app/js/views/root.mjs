export const root = function({ target, html, props, state, store, context }) {

	//do things when component created
	state.counter = 0;
	store.counters = { welcome: 0 };

	//render scoped or global css
	target.addEventListener('componentCss', function(e) {

	});

	//render html using template literals
	target.addEventListener('componentHtml', function(e) {
		return html`
			<app-root>
				<ion-app>
					<ion-nav data-component="${store.route.name}" data-counter="${state.counter}">Hello!</ion-nav>
				</ion-app>
			</app-root>
		`;
	});

	//do things when component added to DOM
	target.addEventListener('componentMounted', function(e) {
		//register click handler after mounting
		this.addEventListener('click', function(ee) {
			state.counter++;
			store.counters.welcome++;
		});
	});

	//do things when component updated in DOM
	target.addEventListener('componentUpdated', function(e) {

	});

	//do things when component removed from DOM
	target.addEventListener('componentUnmounted', function(e) {

	});

};