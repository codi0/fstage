function _getSubtitle(tab, tasks) {
	if (tab === 'tasks') {
		var n = tasks.filter(function(t) { return !t.completed; }).length;
		return n === 1 ? '1 remaining' : n + ' remaining';
	}
	if (tab === 'today') {
		var today = new Date().toISOString().split('T')[0];
		var n = tasks.filter(function(t) { return t.dueDate === today && !t.completed; }).length;
		return n === 1 ? '1 remaining' : n + ' remaining';
	}
	return '';
}

export default {

	tag: 'pwa-header',

	inject: {
		store: 'store'
	},

	style: (ctx) => ctx.css`
		:host {
			display: flex;
			align-items: flex-end;
			flex-shrink: 0;
			padding-top: var(--safe-top);
			background: var(--bg-blur);
			border-bottom: 1px solid var(--separator);
			-webkit-backdrop-filter: saturate(180%) blur(20px);
			backdrop-filter: saturate(180%) blur(20px);
			position: relative;
			z-index: 20;
		}

		.header-inner {
			display: flex;
			align-items: center;
			width: 100%;
			height: 44px;
			padding: 0 16px;
		}

		.back-btn {
			display: flex; align-items: center;
			background: none; border: none; color: var(--color-primary);
			cursor: pointer; padding: 0; width: 36px; height: 36px; flex-shrink: 0;
			-webkit-tap-highlight-color: transparent;
		}
		.back-btn svg { width: 22px; height: 22px; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; fill: none; }

		.header-title {
			font-size: 17px; font-weight: 600; color: var(--text-primary);
			white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
		}

		.header-subtitle { font-size: 13px; color: var(--text-secondary); white-space: nowrap; flex-shrink: 0; }
	`,

	render: function(ctx) {
		var route    = ctx.store.get('route');
		var meta     = (route && route.match && route.match.meta) || {};
		var hasTab   = !!meta.tab;
		var title    = meta.title || '';
		var tasks    = ctx.store.get('tasks') || [];
		var subtitle = _getSubtitle(meta.tab, tasks);

		return ctx.html`
			<div class="header-inner">
				${!hasTab ? ctx.html`
					<button class="back-btn" data-back aria-label="Back">
						<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
				` : ''}
				<span class="header-title">${title}</span>
				${subtitle ? ctx.html`<span class="header-subtitle">${subtitle}</span>` : ''}
			</div>
		`;
	}

};
