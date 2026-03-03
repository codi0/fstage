// Attaches a scroll listener to the active screen's [data-scroller].
// Re-attaches on every navigation via ctx.state.$watch('screen').
// Calls callback immediately on attach so state syncs without waiting for a scroll event.
function _onScroll(ctx, callback) {
	function attach(screenEl) {
		if (attach.cleanup) {
			attach.cleanup();
			attach.cleanup = null;
		}
		if (screenEl) {
			var scroller = screenEl && screenEl.querySelector('[data-scroller]');
			if (!scroller) return;
			var handler = function() { callback(scroller.scrollTop); };
			scroller.addEventListener('scroll', handler, { passive: true });
			attach.cleanup = function() { scroller.removeEventListener('scroll', handler); };
			handler();
		}
	}

	ctx.state.$watch('screen', function(newVal) {
		attach(newVal);
	});

	attach(ctx.state.screen);
	ctx.cleanup(attach);
}


export default {

	tag: 'pwa-header',

	state: {
		scrolled:  { $src: 'local', default: false },
		screen:    { $src: 'store' },
		tasks:     { $src: 'store', default: [] },
		routeMeta: { $src: 'store', key: 'route.match.meta', default: {} }
	},
	
	inject: {
		store: 'store'
	},

	style: (ctx) => ctx.css`
		:host {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			flex-shrink: 0;
			overflow: hidden;
			padding-top: var(--safe-top);
			background: var(--bg-blur);
			border-bottom: 1px solid var(--separator);
			-webkit-backdrop-filter: saturate(180%) blur(20px);
			backdrop-filter: saturate(180%) blur(20px);
			position: relative;
			z-index: 20;
		}

		/* -- Nav bar row ----------------------------------------- */

		.header-inner {
			display: flex;
			align-items: center;
			width: 100%;
			height: 44px;
			padding: 0 16px;
			position: relative;
			overflow: hidden;
			transition: height 0.28s cubic-bezier(0.4, 0, 0.2, 1);
		}

		/* Collapse nav bar on tab pages until scrolled */
		:host([data-has-tab]:not([data-scrolled])) .header-inner {
			height: 0;
		}

		.back-btn {
			display: flex; align-items: center;
			background: none; border: none; color: var(--color-primary);
			cursor: pointer; padding: 0; width: 36px; height: 36px; flex-shrink: 0;
			-webkit-tap-highlight-color: transparent;
		}
		.back-btn svg {
			width: 22px; height: 22px; stroke: currentColor;
			stroke-width: 2.2; stroke-linecap: round; fill: none;
		}

		/* Nav-bar title: hidden by default, shown on detail pages or when scrolled */
		.header-title {
			font-size: 17px; font-weight: 600; color: var(--text-primary);
			white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
			opacity: 0;
			transition: opacity 0.2s ease;
		}

		:host(:not([data-has-tab])) .header-title {
			opacity: 1;
		}

		:host([data-scrolled]) .header-title {
			opacity: 1;
		}

		.header-subtitle {
			font-size: 13px; color: var(--text-secondary);
			white-space: nowrap; flex-shrink: 0;
		}

		/* -- Large title area (tab pages only) ------------------- */

		.large-title-wrap {
			overflow: hidden;
			height: 56px;
			transition: height 0.28s cubic-bezier(0.4, 0, 0.2, 1);
		}

		:host([data-scrolled]) .large-title-wrap {
			height: 0;
		}

		.large-title-area {
			display: flex;
			align-items: baseline;
			gap: 10px;
			padding: 8px 16px 12px;
			opacity: 1;
			transform: translateY(0);
			transition: opacity 0.18s ease, transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
		}

		:host([data-scrolled]) .large-title-area {
			opacity: 0;
			transform: translateY(-6px);
		}

		.large-title {
			font-size: 34px;
			font-weight: 700;
			letter-spacing: -0.4px;
			color: var(--text-primary);
			line-height: 1;
		}

		.large-subtitle {
			font-size: 13px;
			color: var(--text-secondary);
			font-weight: 400;
			margin-bottom: 3px;
		}
	`,

	connected: function(ctx) {
		// Set data-has-tab before first render to avoid flash
		ctx.state.$watch('routeMeta', function(meta) {
			ctx.host[(meta && meta.tab) ? 'setAttribute' : 'removeAttribute']('data-has-tab', '');
		}, { immediate: true });

		// Keep data-scrolled in sync with local state
		ctx.state.$watch('scrolled', function(val) {
			ctx.host[val ? 'setAttribute' : 'removeAttribute']('data-scrolled', '');
		}, { immediate: true });

		_onScroll(ctx, function(scrollTop) {
			var nowScrolled = scrollTop > 30;
			if (nowScrolled === ctx.state.scrolled) return;
			ctx.state.$set('scrolled', nowScrolled);
		});
	},

	render: function(ctx) {
		var routeMeta = ctx.state.routeMeta;
		var hasTab    = !!routeMeta.tab;
		var title     = routeMeta.title || '';
		var subtitle  = ctx.store.model('tasks').remaining(routeMeta.tab);

		return ctx.html`
			<div class="header-inner">
				${!hasTab ? ctx.html`
					<button class="back-btn" data-back aria-label="Back">
						<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
				` : ''}
				<span class="header-title">${title}</span>
				${subtitle && !hasTab ? ctx.html`
					<span class="header-subtitle">${subtitle}</span>
				` : ''}
			</div>

			${hasTab ? ctx.html`
				<div class="large-title-wrap">
					<div class="large-title-area">
						<span class="large-title">${title}</span>
						${subtitle ? ctx.html`
							<span class="large-subtitle">${subtitle}</span>
						` : ''}
					</div>
				</div>
			` : ''}
		`;
	}

};
