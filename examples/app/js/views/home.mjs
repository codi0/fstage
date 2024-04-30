export const home = function({ target, html, props, state, store, context }) {

	//render scoped or global css
	target.addEventListener('componentCss', function(e) {
		return html`
			scoped .content {
				display: flex;
				justify-content: center;
				align-items: center;
				height: 100%;
			}
			scoped button {
				position: absolute;
				width: calc(100% - 20px);
				left: 10px;
				bottom: 10px;
			}
		`;
	});

	//render html using template literals
	target.addEventListener('componentHtml', function(e) {
		return html`
			<ion-header data-component="header"></ion-header>
			<ion-page>
				<div class="content">
					<fs-welcome name="${store.user ? store.user.name : ''}" count="${store.counters.welcome}"></fs-welcome>
				</div>
				<button data-route="${context.routes.ABOUT}">
					Page transition
				</button>
			</ion-page>
		`;
	});

	//do things when component added to DOM
	target.addEventListener('componentMounted', function(e) {
		//set page title
		document.title = 'Welcome to Fstage';
	});

	//do things when component updated in DOM
	target.addEventListener('componentUpdated', function(e) {

	});

	//do things when component removed from DOM
	target.addEventListener('componentUnmounted', function(e) {

	});

};