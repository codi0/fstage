export default {

	tag: 'pwa-tab-bar',

	inject: ['store'],

	style: (ctx) => ctx.css`
		:host {
			display: flex; flex-direction: row; align-items: stretch;
			flex: 0 0 auto;
			height: calc(var(--tab-height) + var(--safe-bottom));
			padding-bottom: var(--safe-bottom);
			background: var(--bg-blur);
			border-top: 1px solid var(--separator);
			-webkit-backdrop-filter: saturate(180%) blur(20px);
			backdrop-filter: saturate(180%) blur(20px);
			will-change: transform;
		}
		:host([hidden]) { display: none !important; }

		.tab {
			flex: 1; display: flex; flex-direction: column;
			align-items: center; justify-content: center; gap: 3px;
			padding: 0; border: none; background: none;
			cursor: pointer; -webkit-tap-highlight-color: transparent;
			color: var(--text-tertiary); font-size: 10px; font-weight: 500;
			letter-spacing: 0.01em; min-height: 44px;
			transition: color 0.15s ease; font-family: inherit;
		}
		.tab[aria-selected="true"] { color: var(--color-primary); }

		.tab svg {
			width: 24px; height: 24px; fill: none;
			stroke: currentColor; stroke-width: 1.8;
			stroke-linecap: round; stroke-linejoin: round;
		}
		.tab-label { font-size: 10px; line-height: 1; }
	`,

	render: function(ctx) {
		var route  = ctx.store.get('route');
		var active = route && route.match && route.match.meta && route.match.meta.tab;
		if (!active) return ctx.html``;

		return ctx.html`
			<button class="tab" aria-selected=${active === 'tasks'} data-href="/">
				<svg viewBox="0 0 24 24">
					<path d="M9 11l3 3L22 4"/>
					<path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
				</svg>
				<span class="tab-label">Tasks</span>
			</button>

			<button class="tab" aria-selected=${active === 'today'} data-href="/today">
				<svg viewBox="0 0 24 24">
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
					<line x1="16" y1="2" x2="16" y2="6"/>
					<line x1="8"  y1="2" x2="8"  y2="6"/>
					<line x1="3"  y1="10" x2="21" y2="10"/>
				</svg>
				<span class="tab-label">Today</span>
			</button>

			<button class="tab" aria-selected=${active === 'settings'} data-href="/settings">
				<svg viewBox="0 0 24 24">
					<circle cx="12" cy="12" r="3"/>
					<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
				</svg>
				<span class="tab-label">Settings</span>
			</button>
		`;
	},

	rendered: function(ctx) {
		var route = ctx.store.get('route');
		ctx.host.hidden = !(route && route.match && route.match.meta && route.match.meta.tab);
	}

};
