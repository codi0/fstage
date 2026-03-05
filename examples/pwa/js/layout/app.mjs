export default {

	tag: 'pwa-app',

	shadow: false,
	
	state: {
		theme: { $src: 'store', key: 'settings.theme', default: 'auto' }
	},

	style: (ctx) => ctx.css`
		pwa-app {
			display: flex; flex-direction: column;
			width: 100%; height: 100%; min-height: 100dvh;
			background: var(--bg-secondary); color: var(--text-primary);
			position: relative; overflow: hidden;
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

		pwa-overlay > * {
			pointer-events: auto;
		}
	`,

	connected: function(ctx) {
		ctx.state.$watch('theme', function(newVal) {
			if (typeof newVal === 'string') {
				ctx.host.setAttribute('data-theme', newVal);
			}
		}, { immediate: true });
	},

	render: function(ctx) {
		return ctx.html`
			<pwa-header></pwa-header>
			<pwa-main></pwa-main>
			<pwa-overlay></pwa-overlay>
			<pwa-tab-bar></pwa-tab-bar>
		`;
	}

};
