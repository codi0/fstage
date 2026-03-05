export default {

	tag: 'pwa-tab-bar',

	state: {
		routeMeta: { $src: 'store', key: 'route.match.meta', default: {} }
	},

	style: (ctx) => ctx.css`
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
			will-change: transform;
			/* CSS approach: smoothly slide out without ever changing layout height.
			   transform never triggers a reflow, so pwa-main stays stable and the
			   scroll container keeps its size throughout the navigation transition. */
			transition: transform 260ms cubic-bezier(0.4, 0, 0.2, 1);
		}

		/* Triggered by the data-nav-hidden attribute set in rendered().
		   visibility:hidden / display:none are intentionally avoided � they change
		   the flex layout and resize pwa-main, which jumps the scroll position. */
		:host([data-nav-hidden]) {
			transform: translateY(100%);
			pointer-events: none;
		}

		:host([hidden]) {
			display: none !important;
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

		.tab svg {
			width: 24px; height: 24px; fill: none;
			stroke: currentColor; stroke-width: 1.8;
			stroke-linecap: round; stroke-linejoin: round;
			display: block; transform-origin: 50% 50%;
		}

		.tab[aria-selected="true"] svg.icon-filled {
			fill: var(--color-primary);
			stroke: var(--color-primary);
		}

		.tab svg.icon-filled {
			fill: var(--text-quaternary);
			stroke: var(--text-quaternary);
		}

		.tab-label { font-size: 10px; line-height: 1; font-family: var(--font-body); }
	`,

	render: function(ctx) {
		var active = ctx.state.routeMeta.tab || 'tasks';

		var _icon = function(tab) {
			var isActive = active === tab;
			if (tab === 'tasks') {
				return isActive
					? ctx.html`<svg class="icon-filled" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7.6 11.7L7.7 11l1.4-1.4 2.3 2.3 4.6-4.6 1.4 1.4-6 6z"/></svg>`
					: ctx.html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`;
			}
			if (tab === 'completed') {
				return isActive
					? ctx.html`<svg class="icon-filled" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5l-4-4 1.41-1.41L10 13.67l6.59-6.59L18 8.5l-8 8z"/></svg>`
					: ctx.html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`;
			}
			if (tab === 'settings') {
				return isActive
					? ctx.html`<svg class="icon-filled" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>`
					: ctx.html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;
			}
		};

		return ctx.html`
			<button class="tab" role="tab" aria-selected=${active === 'tasks'} data-href="/">
				${_icon('tasks')}
				<span class="tab-label">Active</span>
			</button>

			<button class="tab" role="tab" aria-selected=${active === 'completed'} data-href="/completed">
				${_icon('completed')}
				<span class="tab-label">Completed</span>
			</button>

			<button class="tab" role="tab" aria-selected=${active === 'settings'} data-href="/settings">
				${_icon('settings')}
				<span class="tab-label">Settings</span>
			</button>
		`;
	},

	rendered: function(ctx, isFirst) {
		var platform = document.documentElement.getAttribute('data-platform');
		if (platform) ctx.host.setAttribute('data-platform', platform);

		ctx.host.setAttribute('role', 'tablist');
		ctx.host.setAttribute('aria-label', 'Main navigation');
		ctx.host[!!ctx.state.routeMeta.tab ? 'removeAttribute' : 'setAttribute']('data-nav-hidden', '');

		var icon = ctx.root.querySelector('.icon-filled');
		if (icon) ctx.animate(icon, 'tabBounce', { duration: 400, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', onMount: true });
	}

};