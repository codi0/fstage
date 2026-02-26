export default {

	tag: 'pwa-bottom-sheet',

	inject: ['animator'],

	props: {
		open:  { default: false, attr: false },
		title: { default: '',    attr: false },
	},

	style: (ctx) => ctx.css`
		:host { display: contents; }

		.sheet-backdrop {
			position: fixed; inset: 0;
			background: rgba(0,0,0,0);
			z-index: 100;
			transition: background 0.28s ease;
			pointer-events: none;
		}
		.sheet-backdrop.visible {
			background: rgba(0,0,0,0.45);
			pointer-events: auto;
		}

		.sheet-panel {
			position: fixed; left: 0; right: 0; bottom: 0;
			z-index: 101;
			background: var(--bg-base);
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
			padding-bottom: calc(var(--tab-height) + var(--safe-bottom));
			max-height: 92dvh;
			display: flex; flex-direction: column;
			transform: translateY(100%);
			will-change: transform;
			box-shadow: 0 -2px 20px rgba(0,0,0,0.12);
		}
		.sheet-panel.is-open { transform: translateY(0); }

		.sheet-handle-row {
			display: flex; align-items: center; justify-content: center;
			padding: 10px 0 4px; flex-shrink: 0; cursor: grab;
		}
		.sheet-handle {
			width: 36px; height: 4px; border-radius: 2px;
			background: var(--text-tertiary); opacity: 0.5;
		}

		.sheet-header {
			display: flex; align-items: center; justify-content: space-between;
			padding: 4px 16px 12px; flex-shrink: 0;
		}
		.sheet-title { font-size: 17px; font-weight: 600; color: var(--text-primary); }

		.sheet-close {
			width: 30px; height: 30px; border-radius: 50%;
			background: var(--bg-tertiary); border: none; cursor: pointer;
			display: flex; align-items: center; justify-content: center;
			color: var(--text-secondary); -webkit-tap-highlight-color: transparent; padding: 0;
		}
		.sheet-close svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; fill: none; }

		.sheet-body {
			flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 16px 16px;
		}
	`,

	interactions: {
		'click(.sheet-backdrop)': function(e, ctx) { ctx.emit('bottomSheetClosed'); },
		'click(.sheet-close)':    function(e, ctx) { ctx.emit('bottomSheetClosed'); },

		'gesture.swipe(.sheet-panel)': {
			trigger:    '.sheet-handle-row',
			directions: ['down'],
			onCommit:   function(e, ctx) { ctx.emit('bottomSheetClosed'); },
		},
	},

	render: function(ctx) {
		return ctx.html`
			<div class="sheet-backdrop"></div>

			<div class="sheet-panel" role="dialog" aria-modal="true" aria-label=${ctx.props.title}>

				<div class="sheet-handle-row">
					<div class="sheet-handle"></div>
				</div>

				<div class="sheet-header">
					<span class="sheet-title">${ctx.props.title}</span>
					<button class="sheet-close" aria-label="Close">
						<svg viewBox="0 0 24 24">
							<line x1="18" y1="6"  x2="6"  y2="18"/>
							<line x1="6"  y1="6"  x2="18" y2="18"/>
						</svg>
					</button>
				</div>

				<div class="sheet-body">
					<slot></slot>
				</div>

			</div>
		`;
	},

	rendered: function(ctx, changed) {
		if (!('open' in changed)) return;

		var open     = ctx.props.open;
		var panel    = ctx.root.querySelector('.sheet-panel');
		var backdrop = ctx.root.querySelector('.sheet-backdrop');
		if (!panel || !backdrop) return;

		if (open) {
			panel.classList.remove('is-open');
			backdrop.classList.add('visible');
			var anim = ctx.animator.animate(panel, 'slideUpSheet', { duration: 320 });
			anim.finished.then(function() {
				panel.classList.add('is-open');
				panel.style.transform = '';
				anim.cancel();
			});
			var slot  = ctx.root.querySelector('slot');
			var first = slot && slot.assignedElements({ flatten: true }).reduce(function(found, el) { return found || el.querySelector('input, textarea, [autofocus]'); }, null);
			if (first) first.focus();
		} else {
			var anim = ctx.animator.animate(panel, 'slideDownSheet', { duration: 260 });
			anim.finished.then(function() {
				panel.classList.remove('is-open');
				backdrop.classList.remove('visible');
			});
		}
	}

};
