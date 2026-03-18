import { accompanySettle } from '@fstage/transitions';

export default {

	tag: 'pwa-tab-bar',

	state: {
		route: { $src: 'external', key: 'route', default: {} }
	},

	computed: {
		activeId: function(ctx) {
			var path = ctx.state.route.path || '';
			var tabs = ctx.config.ui?.tabs || [];
			var match = tabs.find(function(t) { return t.route === path; });
			return match ? match.id : '';
		},
		tabs: function(ctx) { return ctx.config.ui?.tabs || []; },
		hasTab: function(ctx) { return !!ctx.computed.activeId; },
	},

	watch: {
		route: {
			afterRender: true,
			handler: function(e, ctx) {
				// Only act when the path changes, not on other route object updates.
				if ((e.val?.path || '') === (e.oldVal?.path || '')) return;
				var visible = ctx.computed.hasTab;
				var host    = ctx.host;

				if (visible !== !!ctx._tabVisible && !document.documentElement.hasAttribute('data-transitioning')) {
					ctx._tabVisible = visible;
					accompanySettle(host, visible);
				}

				if (visible) {
					var icon = ctx.root.querySelector('.tab[aria-selected="true"] .tab-icon');
					if (icon) ctx.animate(icon, 'tabBounce', { durationFactor: 2 });
				}
			}
		}
	},

	interactions: {
		'transition.accompany': function(ctx, e) {
			if (e) {
				var tabs = ctx.config.ui?.tabs || [];
				return tabs.some(function(t) { return t.route === e.path; });
			}
			return ctx.computed.hasTab;
		},
	},

	host: {
		attrs: {
			'role':       function(ctx) { return 'tablist'; },
			'aria-label': function(ctx) { return 'Main navigation'; },
		},
	},

	style: (styleCtx) => styleCtx.css`
		:host {
			display: flex; flex-direction: row; align-items: flex-start;
			flex: 0 0 auto; position: relative;
			height: calc(var(--tab-height) + var(--safe-bottom));
			padding-top: 8px;
			padding-bottom: var(--safe-bottom);
			background: var(--bg-blur);
			border-top: 1px solid var(--separator);
			-webkit-backdrop-filter: saturate(180%) blur(24px);
			backdrop-filter: saturate(180%) blur(24px);
			will-change: transform, height;
			overflow: hidden;
			transition:
				transform calc(var(--motion-duration-normal) * 1.3) var(--motion-easing, ease),
				height calc(var(--motion-duration-normal) * 1.3) var(--motion-easing, ease),
				padding-top calc(var(--motion-duration-normal) * 1.3) var(--motion-easing, ease),
				padding-bottom calc(var(--motion-duration-normal) * 1.3) var(--motion-easing, ease),
				opacity var(--motion-duration-normal) ease,
				border-top-color var(--motion-duration-normal) ease;
		}

		:host([data-accompany-hidden]) {
			transform: translateY(100%);
			height: 0; padding-top: 0; padding-bottom: 0;
			opacity: 0; border-top-color: transparent;
			pointer-events: none; transition: none;
		}
		:host([data-accompany-hiding]) {
			transform: translateY(100%);
			height: 0; padding-top: 0; padding-bottom: 0;
			opacity: 0; border-top-color: transparent;
			background: transparent;
			-webkit-backdrop-filter: none; backdrop-filter: none;
			pointer-events: none;
		}
		:host([data-accompany-entering]) {
			transform: translateY(100%);
			opacity: 0; border-top-color: transparent; pointer-events: none;
		}
		:host([data-accompany-showing]) {
			transition:
				transform calc(var(--motion-duration-normal) * 1.3) var(--motion-easing, ease),
				opacity var(--motion-duration-normal) ease,
				border-top-color var(--motion-duration-normal) ease;
		}

		.tab {
			flex: 1; display: flex; flex-direction: column;
			align-items: center; gap: 3px;
			padding: 2px 0 0; border: none; background: none;
			cursor: pointer; -webkit-tap-highlight-color: transparent;
			color: var(--text-quaternary); font-size: 10px; font-weight: 500;
			letter-spacing: 0.01em; min-height: 44px;
			transition: color 0.15s ease; font-family: inherit;
			position: relative; z-index: 1;
		}
		.tab[aria-selected="true"] { color: var(--color-primary); }

		.tab-icon {
			position: relative;
			display: block;
			width: 24px; height: 24px;
			flex-shrink: 0;
		}

		.tab-icon::before {
			content: '';
			position: absolute; inset: 0;
			background-color: currentColor;
			-webkit-mask-size: contain; mask-size: contain;
			-webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
			-webkit-mask-position: center; mask-position: center;
		}

		.tab-icon--tasks::before     { -webkit-mask-image: var(--icon-tasks-inactive);     mask-image: var(--icon-tasks-inactive); }
		.tab-icon--completed::before { -webkit-mask-image: var(--icon-completed-inactive); mask-image: var(--icon-completed-inactive); }
		.tab-icon--settings::before  { -webkit-mask-image: var(--icon-settings-inactive);  mask-image: var(--icon-settings-inactive); }

		.tab[aria-selected="true"] .tab-icon--tasks::before     { -webkit-mask-image: var(--icon-tasks-active);     mask-image: var(--icon-tasks-active); }
		.tab[aria-selected="true"] .tab-icon--completed::before { -webkit-mask-image: var(--icon-completed-active); mask-image: var(--icon-completed-active); }
		.tab[aria-selected="true"] .tab-icon--settings::before  { -webkit-mask-image: var(--icon-settings-active);  mask-image: var(--icon-settings-active); }

		.tab[aria-selected="true"] .tab-icon--tasks::after,
		.tab[aria-selected="true"] .tab-icon--completed::after {
			content: '';
			position: absolute; inset: 0;
			background-color: var(--bg-base);
			-webkit-mask-size: contain; mask-size: contain;
			-webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
			-webkit-mask-position: center; mask-position: center;
		}
		.tab[aria-selected="true"] .tab-icon--tasks::after     { -webkit-mask-image: var(--icon-tasks-tick);     mask-image: var(--icon-tasks-tick); }
		.tab[aria-selected="true"] .tab-icon--completed::after { -webkit-mask-image: var(--icon-completed-tick); mask-image: var(--icon-completed-tick); }

		.tab-label { font-size: 10px; line-height: 1; font-family: var(--font-body); }
	`,

	render: function(ctx) {
		var activeId = ctx.computed.activeId;
		var tabs     = ctx.computed.tabs;

		return ctx.html`${tabs.map(function(t) {
			var isActive = activeId === t.id;
			return ctx.html`
				<button class="tab" role="tab" aria-selected=${isActive} data-href=${t.route}>
					<span class=${'tab-icon tab-icon--' + t.icon} aria-hidden="true"></span>
					<span class="tab-label">${t.label}</span>
				</button>
			`;
		})}`;
	},

	connected: function(ctx) {
		var visible = ctx.computed.hasTab;
		ctx._tabVisible = visible;
		if (!visible) ctx.host.setAttribute('data-accompany-hidden', '');
	},

};
