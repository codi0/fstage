export const list = function({ target, html, props, state, store, context }) {

	//render scoped or global css
	target.addEventListener('componentCss', function(e) {

	});

	//render html using template literals
	target.addEventListener('componentHtml', function(e) {
		return html`
			<ion-header data-component="header"></ion-header>
			<ion-page data-loader>
				<ion-content>
					<ion-list>
						${html(1000, function() {
							return html`
								<ion-item>
									<ion-checkbox></ion-checkbox>
									<ion-label>
										<h1>Create Idea</h1>
										<ion-note>
											Run Idea by Brandy
										</ion-note>
									</ion-label>
									<ion-badge color="success">
										5 Days
									</ion-badge>
								</ion-item>
							`;
						})}
					</ion-list>
				</ion-content>
			</ion-page>
		`;
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