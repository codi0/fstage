import { get } from '@fstage/core';
import { FsComponent, html, css } from '@fstage/component';

export class PwaLayout extends FsComponent {

	static shadowDom = false;
	
	static styles = css`
		.can-go-back ion-header ion-back-button {
			display: block;
		}
	`;

	render() {
		return html`
		<ion-app>
			<ion-router>
			${Object.entries(get('config.routes')).map(([key, val]) => {
				if(val.component) {
					return html`
						<ion-route url="${key}" component="${val.component}"></ion-route>
					`;
				}
			})}
			</ion-router>
			<ion-menu content-id="main-content">
				<ion-header>
					<ion-toolbar>
						<ion-title>${get('config.name')}</ion-title>
					</ion-toolbar>
				</ion-header>
				<ion-content>
					<ion-list>
					${Object.entries(get('config.routes')).map(([key, val]) => {
						if(val.title && val.menu) {
							return html`
								<ion-item @click=${this.menuClick} data-href="${key}" style="cursor:pointer;">${val.title}</ion-item>
							`;
						}
					})}
					</ion-list>
				</ion-content>
			</ion-menu>
			<ion-nav id="main-content"></ion-nav>
		</ion-app>
		`;
	}

	firstUpdated() {
		//set vars
		var router = this.renderRoot.querySelector('ion-router');
		router.useHash = get('config.routerHash');
		//listen for router change
		router.addEventListener('ionRouteDidChange', function(e) {
			//set current route
			router.current = get('config.routes.' + e.detail.to);
			//update doc title
			if(router.current.title) {
				document.title = router.current.title + ' | ' + get('config.name');
			} else {
				document.title = get('config.name');
			}
		});
	}

	menuClick(e) {
		//set vars
		var menu = e.target.closest('ion-menu');
		var router = this.renderRoot.querySelector('ion-router');
		var uri = e.target.getAttribute('data-href');
		//route handler
		var routeHandler = function(e) {
			router.push(uri);
			menu.removeEventListener('ionDidClose', routeHandler);
		};
		//listen for close?
		if(typeof uri === 'string') {
			menu.addEventListener('ionDidClose', routeHandler);
		}
		//close menu
		menu.close();
	}

}

customElements.define('pwa-layout', PwaLayout);