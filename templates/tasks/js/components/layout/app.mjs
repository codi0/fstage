export default {

	tag: 'pwa-app',

	shadow: false,

	state: {
		theme: { $ext: 'settings.theme', default: 'auto' },
	},

	watch: {
		theme: {
			handler: function(e) {
				// Set data-theme on <html> so all elements in the document inherit
				// the correct tokens, including those appended outside pwa-app.
				var val = e.val || 'auto';
				if (val === 'auto') document.documentElement.removeAttribute('data-theme');
				else document.documentElement.setAttribute('data-theme', val);
			},
			immediate: true,
		},
	},

	style: ({ css }) => css`
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
	`,

	render({ html }) {
		return html`
			<pwa-header></pwa-header>
			<pwa-main></pwa-main>
			<pwa-tab-bar></pwa-tab-bar>
		`;
	}

};
