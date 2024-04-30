export const notfound = function({ target, html, props, state, store, context }) {

	//render scoped or global css
	target.addEventListener('componentCss', function(e) {

	});

	//render html using template literals
	target.addEventListener('componentHtml', function(e) {
		return html`
			<ion-header data-component="header"></ion-header>
			<ion-page>
				<ion-content>
					<p>Oops, page not found.</p>
					<p><a data-route="${context.routes.HOME}">Back home &raquo;</a></p>
				</ion-content>
			</div>
		`;
	});

	//do things when component added to DOM
	target.addEventListener('componentMounted', function(e) {
		//register click handler after mounting
		this.addEventListener('click', function(ee) {
			state.hello = true;
		});
	});

	//do things when component updated in DOM
	target.addEventListener('componentUpdated', function(e) {

	});

	//do things when component removed from DOM
	target.addEventListener('componentUnmounted', function(e) {

	});

};