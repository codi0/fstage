// home.mjs — placeholder home view
//
// This is a route view component. The router renders it when the path matches
// '/' (declared in config.mjs under router.routes).
//
// COMPONENT ANATOMY:
//   tag        — custom element name, must match meta.component in the route
//   inject     — services pulled from the registry onto ctx.*
//   state      — reactive state declaration:
//                  bare value        → local state
//                  { $ext: 'key' }   → external store key (shared state)
//                  { $prop: default} → attribute/property from parent
//   watch      — reactive subscriptions wired on connect, torn down on disconnect
//   interactions — declarative DOM event handlers
//   render     — returns a lit-html template
//
// See docs/components.md for the full component definition reference.

export default {

	tag: 'app-home',

	inject: {
		store:  'store',
		router: 'router',
	},

	state: {
		// Local state — scoped to this component instance.
		// Reading ctx.state.count in render() automatically tracks it;
		// the component re-renders whenever it changes.
		count: 0,
	},

	interactions: {
		// 'click(.btn-increment)' — delegated click listener on .btn-increment
		// inside this component's root. 'e' is the DOM event, 'ctx' is this
		// component's context object.
		'click(.btn-increment)': function(e, ctx) {
			ctx.state.$set('count', function(n) { return (n || 0) + 1; });
		},

		'click(.btn-reset)': function(e, ctx) {
			ctx.state.$set('count', 0);
		},
	},

	style: ({ css }) => css`
		:host {
			display: block;
			padding: 48px 24px;
			max-width: 480px;
			margin: 0 auto;
		}

		h1 {
			font-size: 28px;
			font-weight: 500;
			margin: 0 0 8px;
			color: var(--text-primary, #1a1a1a);
		}

		p {
			color: var(--text-secondary, #555);
			line-height: 1.6;
			margin: 0 0 32px;
		}

		.counter {
			display: flex;
			align-items: center;
			gap: 16px;
			margin-bottom: 48px;
		}

		.count {
			font-size: 48px;
			font-weight: 300;
			min-width: 64px;
			text-align: center;
			color: var(--color-primary, #2d7a52);
		}

		button {
			padding: 10px 20px;
			border: none;
			border-radius: 8px;
			font-size: 15px;
			cursor: pointer;
			transition: opacity 150ms;
		}

		button:active { opacity: 0.7; }

		.btn-increment {
			background: var(--color-primary, #2d7a52);
			color: #fff;
		}

		.btn-reset {
			background: var(--bg-tertiary, #eee);
			color: var(--text-secondary, #555);
		}

		.next-steps {
			border-top: 1px solid var(--separator, rgba(0,0,0,0.08));
			padding-top: 32px;
		}

		.next-steps h2 {
			font-size: 13px;
			font-weight: 500;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: var(--text-tertiary, #888);
			margin: 0 0 16px;
		}

		.next-steps ul {
			padding: 0;
			margin: 0;
			list-style: none;
			display: flex;
			flex-direction: column;
			gap: 10px;
		}

		.next-steps li {
			font-size: 14px;
			color: var(--text-secondary, #555);
			padding-left: 18px;
			position: relative;
		}

		.next-steps li::before {
			content: '→';
			position: absolute;
			left: 0;
			color: var(--color-primary, #2d7a52);
		}

		code {
			background: var(--bg-tertiary, #eee);
			padding: 1px 5px;
			border-radius: 4px;
			font-size: 13px;
		}
	`,

	render({ html, state }) {
		return html`
			<h1>My App</h1>
			<p>Your fstage app is running. Edit this component to get started.</p>

			<div class="counter">
				<button class="btn-increment">Increment</button>
				<span class="count">${state.count}</span>
				<button class="btn-reset">Reset</button>
			</div>

			<div class="next-steps">
				<h2>Next steps</h2>
				<ul>
					<li>Rename this component and its tag in <code>config.mjs</code></li>
					<li>Add routes and views under <code>js/components/views/</code></li>
					<li>Define a storage schema in <code>config.mjs</code> for local data</li>
					<li>Open the devtools panel with <code>Ctrl+&#96;</code> / <code>Cmd+&#96;</code> (debug mode)</li>
				</ul>
			</div>
		`;
	},

};
