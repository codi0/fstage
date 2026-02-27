export default {

	tag: 'pwa-app',

	shadow: false,

	inject: {
		store: 'store'
	},

	style: (ctx) => ctx.css`
		pwa-app {
			display: flex; flex-direction: column;
			width: 100%; height: 100%; min-height: 100dvh;
			background: var(--bg-secondary); color: var(--text-primary);
			position: relative;
		}

		pwa-main {
			flex: 1 1 auto; position: relative;
			overflow: hidden; width: 100%;
			background: inherit; padding: 0; margin: 0;
		}

		pwa-overlay {
			position: absolute;
			top: 0; left: 0; right: 0; bottom: 0;
			z-index: 200; pointer-events: none;
		}
		pwa-overlay > * { pointer-events: auto; }
	`,

	render: function(ctx) {
		var theme = ctx.store.get('settings.theme') || 'auto';
		ctx.host.setAttribute('data-theme', theme);

		return ctx.html`
			<pwa-header></pwa-header>
			<pwa-main></pwa-main>
			<pwa-overlay></pwa-overlay>
			<pwa-tab-bar></pwa-tab-bar>
		`;
	}

};
