// app.mjs — root layout component
//
// This is the outermost custom element, declared in index.html as <my-app>.
// Its job is purely structural: it acts as the screen host container — the
// element inside which the transition engine mounts and unmounts route views.
//
// The router calls screenHost.start(rootEl), which sets this element as the
// container. Each navigation creates a <div data-screen> wrapper inside it,
// appends the route's component, animates in, and removes the previous screen.
//
// For most apps you won't need to change much here. Add global UI (a tab bar,
// a persistent header, a toast system) by rendering it alongside <slot> or
// positioning it as a sibling to the screen host container.

export default {

	tag: 'my-app',

	// shadow: false so the screen host's positioned wrappers are direct children
	// of the host element, and CSS on the host applies naturally.
	shadow: false,

	// inject pulls services out of the registry by name.
	// These become available as ctx.store, ctx.router etc. in all lifecycle hooks.
	inject: {
		store:  'store',
		router: 'router',
	},

	state: {
		// The current route — written by startStack's router.onAfter hook.
		// Components can read ctx.state.route to know where they are.
		route: { $ext: 'route', default: null },
	},

	style: ({ css }) => css`
		:host {
			display: block;
			width: 100%;
			height: 100%;
			position: relative;
			overflow: hidden;
			background: var(--bg-secondary, #f5f5f5);
		}
	`,

	render({ html, state }) {
		// The host element itself is the screen host container — no inner wrapper
		// needed. Route views are mounted directly inside this element by the
		// transition engine.
		return html``;
	},

};
