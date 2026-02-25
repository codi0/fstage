export default {

	tag: 'pwa-overlay',

	shadow: false,

	style: (ctx) => ctx.css`
		pwa-overlay {
			position: absolute;
			inset: 0;
			z-index: 200;
			pointer-events: none;
		}
		pwa-overlay > * {
			pointer-events: auto;
		}
	`,

	mount(key, node) {
		this.unmount(key);
		node.__$overlayKey = key;
		this.appendChild(node);
	},

	unmount(key) {
		const existing = Array.from(this.children).find(c => c.__$overlayKey === key);
		if (existing) existing.remove();
	}

};
