export default {

	tag: 'pwa-header',

	state: {
		route:        { $src: 'external', key: 'route',        default: {} },
		headerAction: { $src: 'external', key: 'headerAction', default: {} },
	},

	computed: {
		hasTab:    function(ctx) {
			var path = ctx.state.route.path || '';
			var tabs = ctx.config.ui?.tabs || [];
			return tabs.some(function(t) { return t.route === path; });
		},
		title:     function(ctx) { return ctx.state.route.meta?.title || ''; },
		action:    function(ctx) { return ctx.state.headerAction || {}; },
		backLabel: function(ctx) {
			if (ctx.computed.hasTab) return '';
			return ctx.config.env.os === 'ios'
				? (ctx.state.route.prev?.meta?.title || 'Back')
				: '';
		},
	},

	interactions: {
		'click(.header-btn)': function(e, ctx) {
			var action = ctx.computed.action;
			if (action && action.event) ctx.emit(action.event);
		},
	},

	style: (styleCtx) => styleCtx.css`
		:host {
			display: flex; flex-direction: row; align-items: center; flex-shrink: 0;
			height: calc(44px + var(--safe-top));
			padding: var(--safe-top) 4px 0;
			background: var(--bg-blur);
			border-bottom: 1px solid var(--separator);
			-webkit-backdrop-filter: saturate(180%) blur(20px);
			backdrop-filter: saturate(180%) blur(20px);
			position: relative; z-index: 20;
		}

		.back-btn {
			display: flex; align-items: center; justify-content: flex-start;
			background: none; border: none; color: var(--color-primary);
			cursor: pointer; padding: 0 4px; height: 44px; flex-shrink: 0;
			min-width: 44px;
			-webkit-tap-highlight-color: transparent; border-radius: 22px;
			transition: background 0.12s ease; gap: 2px; position: relative; z-index: 1;
		}

		.back-btn:active {
			background: var(--color-primary-subtle);
		}

		.back-btn svg {
			width: 22px; height: 22px; stroke: currentColor;
			stroke-width: 2.2; stroke-linecap: round; fill: none; flex-shrink: 0;
		}

		.back-label {
			font-size: 17px;
			color: var(--color-primary);
			white-space: nowrap;
			padding-right: 6px;
			display: var(--pwa-back-label-display, none);
		}

		.header-title {
			position: absolute; left: 0; right: 0;
			font-size: 17px; font-weight: 600; color: var(--text-primary);
			white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
			letter-spacing: -0.02em;
			padding: 0 16px;
			pointer-events: none;
			text-align: var(--pwa-header-title-align, left);
		}

		.back-btn + .header-title {
			margin-left: var(--pwa-header-back-title-offset, 24px);
		}

		.header-btn {
			display: flex; align-items: center; justify-content: center;
			background: none; border: none; cursor: pointer;
			width: 44px; height: 44px; flex-shrink: 0;
			-webkit-tap-highlight-color: transparent;
			color: var(--color-primary);
			transition: opacity 0.12s ease;
			position: relative; z-index: 1;
			margin-left: auto;
		}

		.header-btn:active {
			opacity: 0.45;
		}

		.header-btn svg {
			width: 22px; height: 22px;
			stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; fill: none;
		}
	`,

	render: function(ctx) {
		var hasTab    = ctx.computed.hasTab;
		var title     = ctx.computed.title;
		var action    = ctx.computed.action;
		var backLabel = ctx.computed.backLabel;

		return ctx.html`
			${!hasTab ? ctx.html`
				<button data-back class="back-btn" aria-label=${backLabel ? 'Back to ' + backLabel : 'Back'}>
					<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
					${backLabel ? ctx.html`<span class="back-label">${backLabel}</span>` : ''}
				</button>` : ''
			}

			<span class="header-title">${title}</span>

			${action.event ? ctx.html`
				<button class="header-btn" aria-label=${action.label}>
					<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
				</button>` : ''
			}
		`;
	}

};
